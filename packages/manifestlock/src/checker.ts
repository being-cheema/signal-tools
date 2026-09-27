import * as fs from 'node:fs';
import * as path from 'node:path';
import { CheckOptions, CheckResult } from './types.js';
import { diffManifests } from './diff.js';
import { extractPackageJsonFromBuffer, extractPackageJsonFromFile } from './extractor.js';
import { fetchPackageManifestAndTarball, parsePackageSpec } from './fetcher.js';

/**
 * Checks whether a package's registry manifest matches what is actually packaged
 * in its tarball, detecting manifest confusion vulnerabilities.
 *
 * @param packageNameOrPath - Registry package spec ('lodash@4.17.21') or local .tgz file path.
 * @param options - Optional registry URL, deep audit flag, or mock manifest for offline testing.
 */
export async function checkManifest(
  packageNameOrPath: string,
  options?: CheckOptions,
): Promise<CheckResult> {
  const resolvedPath = path.resolve(process.cwd(), packageNameOrPath);
  const isLocalFile =
    fs.existsSync(resolvedPath) &&
    (packageNameOrPath.endsWith('.tgz') ||
      packageNameOrPath.endsWith('.tar.gz') ||
      packageNameOrPath.endsWith('.tar') ||
      fs.statSync(resolvedPath).isFile());

  let packageName = '';
  let version = '';
  let tarballPkg: Record<string, unknown>;
  let registryPkg: Record<string, unknown>;
  let tarballUrl: string | undefined;
  let tarballPath: string | undefined;

  if (isLocalFile) {
    tarballPath = resolvedPath;
    tarballPkg = await extractPackageJsonFromFile(resolvedPath);
    packageName = (tarballPkg.name as string) || path.basename(packageNameOrPath);
    version = (tarballPkg.version as string) || 'unknown';

    if (options?.compareWith) {
      registryPkg = options.compareWith;
    } else {
      // Fetch metadata from registry for the version declared in the local tarball
      const spec = version !== 'unknown' ? `${packageName}@${version}` : packageName;
      const fetched = await fetchPackageManifestAndTarball(spec, {
        registry: options?.registry,
        timeoutMs: options?.timeoutMs,
      });
      registryPkg = fetched.manifest;
      tarballUrl = fetched.tarballUrl;
    }
  } else {
    // Registry spec
    const parsed = parsePackageSpec(packageNameOrPath);
    packageName = parsed.name;

    if (options?.compareWith) {
      registryPkg = options.compareWith;
      // In offline/mock mode with compareWith, check if packageNameOrPath was buffer or mock
      tarballPkg = options.compareWith;
    } else {
      const fetched = await fetchPackageManifestAndTarball(packageNameOrPath, {
        registry: options?.registry,
        timeoutMs: options?.timeoutMs,
      });
      registryPkg = fetched.manifest;
      tarballUrl = fetched.tarballUrl;
      version = fetched.resolvedVersion;
      tarballPkg = await extractPackageJsonFromBuffer(fetched.tarballBuffer);
    }

    if (!version && tarballPkg.version) {
      version = String(tarballPkg.version);
    }
  }

  // Diff the two manifests
  const mismatches = diffManifests(registryPkg, tarballPkg);
  let isClean = mismatches.length === 0;

  const result: CheckResult = {
    packageName,
    spec: packageNameOrPath,
    version,
    match: isClean,
    mismatches,
    tarballUrl,
    tarballPath,
  };

  // If --deep is specified, recursively check direct dependencies (one level)
  if (options?.deep) {
    const rawDeps =
      (tarballPkg.dependencies as Record<string, string>) ||
      (registryPkg.dependencies as Record<string, string>) ||
      {};
    const deepResults: CheckResult[] = [];

    for (const [depName, depRange] of Object.entries(rawDeps)) {
      try {
        const depSpec = `${depName}@${depRange}`;
        const depResult = await checkManifest(depSpec, {
          registry: options.registry,
          timeoutMs: options.timeoutMs,
          deep: false, // direct dependencies only (1 level)
        });
        deepResults.push(depResult);
        if (!depResult.match) {
          isClean = false;
        }
      } catch (err) {
        deepResults.push({
          packageName: depName,
          spec: `${depName}@${depRange}`,
          match: false,
          mismatches: [
            {
              field: 'dependency',
              registryValue: null,
              tarballValue: null,
              severity: 'critical',
              message: `Failed to verify deep dependency ${depName}@${depRange}: ${(err as Error).message}`,
            },
          ],
        });
        isClean = false;
      }
    }

    result.deepResults = deepResults;
    result.match = isClean;
  }

  return result;
}
