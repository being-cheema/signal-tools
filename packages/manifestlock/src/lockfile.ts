import * as fs from 'node:fs';
import * as path from 'node:path';
import { LockfileType, ResolvedPackage } from './types.js';

export interface DetectedLockfile {
  type: LockfileType;
  filePath: string;
}

/**
 * Detects the lockfile present in the target directory in priority order:
 * 1. package-lock.json
 * 2. yarn.lock
 * 3. pnpm-lock.yaml
 */
export function detectLockfile(directory: string): DetectedLockfile {
  const candidates: Array<{ name: string; type: LockfileType }> = [
    { name: 'package-lock.json', type: 'package-lock.json' },
    { name: 'yarn.lock', type: 'yarn.lock' },
    { name: 'pnpm-lock.yaml', type: 'pnpm-lock.yaml' },
  ];

  for (const candidate of candidates) {
    const fullPath = path.resolve(directory, candidate.name);
    if (fs.existsSync(fullPath)) {
      return {
        type: candidate.type,
        filePath: fullPath,
      };
    }
  }

  throw new Error(
    `No supported lockfile (package-lock.json, yarn.lock, or pnpm-lock.yaml) found in directory: ${directory}`,
  );
}

/**
 * Parses package-lock.json (supporting v1, v2, and v3 lockfile formats).
 */
export function parsePackageLock(content: string): ResolvedPackage[] {
  const parsed = JSON.parse(content) as {
    lockfileVersion?: number;
    packages?: Record<string, { name?: string; version?: string; resolved?: string }>;
    dependencies?: Record<string, { version?: string; resolved?: string; dependencies?: any }>;
  };

  const results = new Map<string, ResolvedPackage>();

  // Format v2 and v3: uses "packages" map
  if (parsed.packages) {
    for (const [key, pkg] of Object.entries(parsed.packages)) {
      if (key === '' || !pkg.version) continue;

      let name = pkg.name;
      if (!name) {
        // Derive name from key like "node_modules/@scope/pkg" or "node_modules/foo"
        const lastNmIndex = key.lastIndexOf('node_modules/');
        if (lastNmIndex !== -1) {
          name = key.slice(lastNmIndex + 'node_modules/'.length);
        } else {
          name = key;
        }
      }

      if (name && pkg.version) {
        const id = `${name}@${pkg.version}`;
        if (!results.has(id)) {
          results.set(id, {
            name,
            version: pkg.version,
            spec: id,
            tarballUrl: pkg.resolved,
          });
        }
      }
    }
  }

  // Format v1: uses recursive "dependencies" map
  if (parsed.dependencies && results.size === 0) {
    function traverseV1(deps: Record<string, any>) {
      for (const [name, info] of Object.entries(deps)) {
        if (info.version) {
          const id = `${name}@${info.version}`;
          if (!results.has(id)) {
            results.set(id, {
              name,
              version: info.version,
              spec: id,
              tarballUrl: info.resolved,
            });
          }
        }
        if (info.dependencies) {
          traverseV1(info.dependencies);
        }
      }
    }
    traverseV1(parsed.dependencies);
  }

  return Array.from(results.values());
}

/**
 * Parses yarn.lock (supporting classic v1 and modern berry v2+).
 */
export function parseYarnLock(content: string): ResolvedPackage[] {
  const results = new Map<string, ResolvedPackage>();
  const lines = content.split('\n');

  let currentSpecs: string[] = [];
  let currentVersion: string | undefined;
  let currentResolved: string | undefined;

  function commitEntry() {
    if (currentSpecs.length > 0 && currentVersion) {
      for (const spec of currentSpecs) {
        // Extract package name from specifier like "lodash@^4.17.21" or "@scope/foo@npm:1.0.0"
        let name = spec.replace(/^["']|["']$/g, '').trim();
        name = name.replace(/@npm:.*$/, '');

        const atIdx = name.lastIndexOf('@');
        let pkgName = name;
        if (atIdx > 0) {
          pkgName = name.slice(0, atIdx);
        }

        if (pkgName) {
          const id = `${pkgName}@${currentVersion}`;
          if (!results.has(id)) {
            results.set(id, {
              name: pkgName,
              version: currentVersion,
              spec: id,
              tarballUrl: currentResolved,
            });
          }
        }
      }
    }
    currentSpecs = [];
    currentVersion = undefined;
    currentResolved = undefined;
  }

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();

    // Comment or blank line
    if (!line || line.startsWith('#')) continue;

    // Header line (e.g. "lodash@^4.17.21": or lodash@^4.17.21, lodash@^4.17.0:)
    if (!rawLine.startsWith(' ') && !rawLine.startsWith('\t') && line.endsWith(':')) {
      commitEntry();
      const rawHeader = line.slice(0, -1);
      currentSpecs = rawHeader
        .split(',')
        .map((s) => s.trim().replace(/^["']|["']$/g, ''))
        .filter(Boolean);
      continue;
    }

    // Property line
    const trimmed = line.trim();
    if (trimmed.startsWith('version')) {
      const match = trimmed.match(/version[:\s]+["']?([^"'\s]+)["']?/);
      if (match) {
        currentVersion = match[1];
      }
    } else if (trimmed.startsWith('resolved')) {
      const match = trimmed.match(/resolved[:\s]+["']?([^"'\s]+)["']?/);
      if (match) {
        currentResolved = match[1];
      }
    }
  }

  commitEntry();
  return Array.from(results.values());
}

/**
 * Parses pnpm-lock.yaml (supporting pnpm v5, v6, and v9 lockfile structures).
 */
export function parsePnpmLock(content: string): ResolvedPackage[] {
  const results = new Map<string, ResolvedPackage>();
  const lines = content.split('\n');

  let inPackagesSection = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === 'packages:' || trimmed === 'snapshots:') {
      inPackagesSection = true;
      continue;
    }

    // If we reach another top-level section after packages:, exit
    if (
      inPackagesSection &&
      !line.startsWith(' ') &&
      !line.startsWith('\t') &&
      line.includes(':')
    ) {
      inPackagesSection = false;
      continue;
    }

    if (inPackagesSection) {
      // Keys under packages: look like:
      //   '/lodash@4.17.21':
      //   '/@scope/pkg@1.0.0':
      //   lodash@4.17.21:
      //   '@scope/pkg@1.0.0':
      // or with peer dep suffixes like:
      //   '/foo@1.0.0(react@18.0.0)':
      const match = trimmed.match(/^['"]?(?:\/)?([^'":]+?)['"]?:$/);
      if (match) {
        let rawKey = match[1];
        // Strip peer dependency suffixes e.g. (react@18.0.0)
        const parenIdx = rawKey.indexOf('(');
        if (parenIdx !== -1) {
          rawKey = rawKey.slice(0, parenIdx);
        }

        // Clean leading slash
        if (rawKey.startsWith('/')) {
          rawKey = rawKey.slice(1);
        }

        const lastAt = rawKey.lastIndexOf('@');
        if (lastAt > 0) {
          const name = rawKey.slice(0, lastAt);
          const version = rawKey.slice(lastAt + 1);

          // Avoid non-package keys
          if (name && version && !name.includes(':') && /^[0-9]/.test(version)) {
            const id = `${name}@${version}`;
            if (!results.has(id)) {
              results.set(id, {
                name,
                version,
                spec: id,
              });
            }
          }
        }
      }
    }
  }

  return Array.from(results.values());
}

/**
 * Parses any supported lockfile given its type and file content.
 */
export function parseLockfile(type: LockfileType, content: string): ResolvedPackage[] {
  switch (type) {
    case 'package-lock.json':
      return parsePackageLock(content);
    case 'yarn.lock':
      return parseYarnLock(content);
    case 'pnpm-lock.yaml':
      return parsePnpmLock(content);
  }
}
