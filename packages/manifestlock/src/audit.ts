import * as fs from 'node:fs';
import { AuditOptions, AuditResult, CheckResult } from './types.js';
import { detectLockfile, parseLockfile } from './lockfile.js';
import { checkManifest } from './checker.js';

/**
 * Concurrency helper to run async tasks with a maximum pool limit.
 */
async function mapConcurrent<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let currentIndex = 0;

  async function worker() {
    while (currentIndex < items.length) {
      const idx = currentIndex++;
      results[idx] = await fn(items[idx], idx);
    }
  }

  const workers = Array.from({ length: Math.min(limit, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

/**
 * Audits all resolved dependencies in a project's lockfile for manifest confusion.
 */
export async function audit(options?: AuditOptions): Promise<AuditResult> {
  const projectDir = options?.path || process.cwd();
  const detected = detectLockfile(projectDir);

  const lockfileContent = await fs.promises.readFile(detected.filePath, 'utf8');
  const allPackages = parseLockfile(detected.type, lockfileContent);

  const ignoreSet = new Set<string>(
    (options?.ignore || []).map((name) => name.trim().toLowerCase()),
  );

  const packagesToCheck: typeof allPackages = [];
  const ignoredPackages: string[] = [];

  for (const pkg of allPackages) {
    if (ignoreSet.has(pkg.name.toLowerCase()) || ignoreSet.has(pkg.spec.toLowerCase())) {
      ignoredPackages.push(pkg.spec);
    } else {
      packagesToCheck.push(pkg);
    }
  }

  const concurrency = options?.concurrency || 5;
  const packagesWithMismatches: CheckResult[] = [];
  let cleanCount = 0;

  await mapConcurrent(packagesToCheck, concurrency, async (pkg) => {
    try {
      const res = await checkManifest(pkg.spec, {
        registry: options?.registry,
        deep: false,
      });

      if (!res.match) {
        packagesWithMismatches.push(res);
      } else {
        cleanCount++;
      }
    } catch (err) {
      // If verification failed (e.g. network failure or missing version), record as critical mismatch
      packagesWithMismatches.push({
        packageName: pkg.name,
        spec: pkg.spec,
        version: pkg.version,
        match: false,
        mismatches: [
          {
            field: 'verification',
            registryValue: null,
            tarballValue: null,
            severity: 'critical',
            message: `Audit failed for ${pkg.spec}: ${(err as Error).message}`,
          },
        ],
      });
    }
  });

  return {
    lockfileType: detected.type,
    lockfilePath: detected.filePath,
    totalChecked: packagesToCheck.length,
    cleanCount,
    mismatchCount: packagesWithMismatches.length,
    ignoredCount: ignoredPackages.length,
    packagesWithMismatches,
    ignoredPackages,
  };
}
