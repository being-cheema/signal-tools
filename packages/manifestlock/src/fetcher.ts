/**
 * Justification: Native fetch (standard in Node.js 18+) is used for all HTTP
 * communication with the npm registry to fetch package manifests and tarballs,
 * completely eliminating external HTTP client dependencies and reducing attack surface.
 */

export interface ParsedPackageSpec {
  name: string;
  versionOrTag: string;
  rawSpec: string;
}

/**
 * Parses package specifiers like 'lodash@4.17.21', '@scope/pkg@^1.0.0', or 'react'.
 */
export function parsePackageSpec(spec: string): ParsedPackageSpec {
  const trimmed = spec.trim();

  // Handle scoped packages: @scope/name@version or @scope/name
  if (trimmed.startsWith('@')) {
    const slashIdx = trimmed.indexOf('/');
    if (slashIdx === -1) {
      throw new Error(`Invalid scoped package specifier: ${spec}`);
    }
    const atIdx = trimmed.indexOf('@', slashIdx + 1);
    if (atIdx === -1) {
      return {
        name: trimmed,
        versionOrTag: 'latest',
        rawSpec: spec,
      };
    }
    return {
      name: trimmed.slice(0, atIdx),
      versionOrTag: trimmed.slice(atIdx + 1) || 'latest',
      rawSpec: spec,
    };
  }

  // Non-scoped package: name@version or name
  const atIdx = trimmed.indexOf('@');
  if (atIdx === -1) {
    return {
      name: trimmed,
      versionOrTag: 'latest',
      rawSpec: spec,
    };
  }

  return {
    name: trimmed.slice(0, atIdx),
    versionOrTag: trimmed.slice(atIdx + 1) || 'latest',
    rawSpec: spec,
  };
}

export interface RegistryFetchResult {
  manifest: Record<string, unknown>;
  tarballBuffer: Buffer;
  resolvedVersion: string;
  tarballUrl: string;
}

/**
 * Encodes package name for npm registry URL (e.g. @scope/pkg -> @scope%2Fpkg).
 */
export function encodePackageName(name: string): string {
  if (name.startsWith('@')) {
    return `@${encodeURIComponent(name.slice(1))}`.replace('/', '%2F');
  }
  return encodeURIComponent(name);
}

/**
 * Fetches the registry manifest and the actual tarball for a given package spec.
 */
export async function fetchPackageManifestAndTarball(
  spec: string,
  options?: { registry?: string; timeoutMs?: number },
): Promise<RegistryFetchResult> {
  const registryUrl = (options?.registry || 'https://registry.npmjs.org').replace(/\/$/, '');
  const { name, versionOrTag } = parsePackageSpec(spec);
  const encodedName = encodePackageName(name);
  const pkgUrl = `${registryUrl}/${encodedName}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), options?.timeoutMs || 25000);

  try {
    const pkgResponse = await fetch(pkgUrl, {
      signal: controller.signal,
      headers: {
        Accept: 'application/vnd.npm.install-v1+json; q=1.0, application/json; q=0.8, */*',
      },
    });

    if (!pkgResponse.ok) {
      if (pkgResponse.status === 404) {
        throw new Error(`Package '${name}' was not found on the npm registry (${pkgUrl}).`);
      }
      throw new Error(
        `Failed to fetch registry metadata for '${name}': HTTP ${pkgResponse.status} ${pkgResponse.statusText}`,
      );
    }

    const pkgDoc = (await pkgResponse.json()) as {
      versions?: Record<string, Record<string, unknown>>;
      'dist-tags'?: Record<string, string>;
    };

    if (!pkgDoc.versions || Object.keys(pkgDoc.versions).length === 0) {
      throw new Error(`No versions found in registry metadata for package '${name}'.`);
    }

    // Resolve version
    let resolvedVersion: string | undefined;

    if (pkgDoc['dist-tags'] && pkgDoc['dist-tags'][versionOrTag]) {
      resolvedVersion = pkgDoc['dist-tags'][versionOrTag];
    } else if (pkgDoc.versions[versionOrTag]) {
      resolvedVersion = versionOrTag;
    } else {
      // Find matching semver or fallback to latest
      const availableVersions = Object.keys(pkgDoc.versions);
      const cleanRange = versionOrTag.replace(/^[~^]/, '');
      if (pkgDoc.versions[cleanRange]) {
        resolvedVersion = cleanRange;
      } else if (pkgDoc['dist-tags'] && pkgDoc['dist-tags']['latest']) {
        resolvedVersion = pkgDoc['dist-tags']['latest'];
      } else {
        resolvedVersion = availableVersions[availableVersions.length - 1];
      }
    }

    if (!resolvedVersion || !pkgDoc.versions[resolvedVersion]) {
      throw new Error(`Could not resolve version '${versionOrTag}' for package '${name}'.`);
    }

    const versionManifest = pkgDoc.versions[resolvedVersion];
    const dist = versionManifest.dist as { tarball?: string } | undefined;

    if (!dist || !dist.tarball) {
      throw new Error(
        `No tarball URL provided in registry manifest for '${name}@${resolvedVersion}'.`,
      );
    }

    const tarballUrl = dist.tarball;

    // Fetch the tarball
    const tarballResponse = await fetch(tarballUrl, {
      signal: controller.signal,
      headers: {
        Accept: 'application/octet-stream',
      },
    });

    if (!tarballResponse.ok) {
      throw new Error(
        `Failed to download package tarball from '${tarballUrl}': HTTP ${tarballResponse.status}`,
      );
    }

    const arrayBuffer = await tarballResponse.arrayBuffer();
    const tarballBuffer = Buffer.from(arrayBuffer);

    return {
      manifest: versionManifest,
      tarballBuffer,
      resolvedVersion,
      tarballUrl,
    };
  } finally {
    clearTimeout(timeoutId);
  }
}
