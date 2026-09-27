import { Mismatch, Severity } from './types.js';

/**
 * Fields considered critical for security and execution integrity.
 * Manifest confusion in these fields allows malicious script execution,
 * dependency confusion, or entry-point hijacking.
 */
const CRITICAL_FIELDS = new Set<string>([
  'scripts',
  'dependencies',
  'devDependencies',
  'optionalDependencies',
  'peerDependencies',
  'bundledDependencies',
  'bundleDependencies',
  'bin',
  'main',
  'module',
  'exports',
  'imports',
  'browser',
  'unpkg',
  'jsdelivr',
  'files',
  'type',
]);

/**
 * Normalizes 'bin' field in package.json to a key-value record.
 * package.json permits 'bin' to be either a string or a Record<string, string>.
 */
function normalizeBin(binValue: unknown, packageName?: string): Record<string, string> | undefined {
  if (!binValue) return undefined;
  if (typeof binValue === 'string') {
    // When bin is a string, npm defaults the command name to the package name (stripping scope)
    const baseName = packageName ? packageName.replace(/^@[^/]+\//, '') : 'cli';
    return { [baseName]: binValue };
  }
  if (typeof binValue === 'object' && binValue !== null && !Array.isArray(binValue)) {
    return binValue as Record<string, string>;
  }
  return undefined;
}

/**
 * Normalizes 'repository' field to comparable string if possible.
 */
function normalizeRepository(repoValue: unknown): string | unknown {
  if (typeof repoValue === 'string') return repoValue;
  if (typeof repoValue === 'object' && repoValue !== null && 'url' in repoValue) {
    return (repoValue as { url: unknown }).url;
  }
  return repoValue;
}

/**
 * Normalizes empty objects or arrays to undefined for clean comparison.
 */
function isEmpty(val: unknown): boolean {
  if (val === undefined || val === null) return true;
  if (typeof val === 'object') {
    if (Array.isArray(val)) return val.length === 0;
    return Object.keys(val).length === 0;
  }
  return false;
}

/**
 * Deep comparison of two values with JSON serialization fallback.
 */
function areValuesEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (isEmpty(a) && isEmpty(b)) return true;
  if (typeof a !== typeof b) return false;
  if (typeof a === 'object' && a !== null && b !== null) {
    try {
      return JSON.stringify(a) === JSON.stringify(b);
    } catch {
      return false;
    }
  }
  return false;
}

/**
 * Diffs registry manifest vs tarball manifest field-by-field.
 * Returns an array of detected mismatches with calculated severities.
 */
export function diffManifests(
  registryPkg: Record<string, unknown>,
  tarballPkg: Record<string, unknown>,
): Mismatch[] {
  const mismatches: Mismatch[] = [];
  const packageName = (tarballPkg.name as string) || (registryPkg.name as string) || 'unknown';

  // Union of all top-level keys
  const allKeys = new Set<string>([...Object.keys(registryPkg), ...Object.keys(tarballPkg)]);

  // Keys that are internal registry metadata and not present in tarball package.json
  const REGISTRY_INTERNAL_FIELDS = new Set([
    '_id',
    '_rev',
    '_nodeVersion',
    '_npmVersion',
    '_npmUser',
    '_hasShrinkwrap',
    '_shasum',
    '_from',
    '_integrity',
    '_resolved',
    'dist',
    'directories',
    'maintainers',
    'readme',
    'readmeFilename',
    'gitHead',
  ]);

  for (const key of allKeys) {
    if (REGISTRY_INTERNAL_FIELDS.has(key)) {
      continue;
    }

    const regVal = registryPkg[key];
    const tarVal = tarballPkg[key];

    // Check if both are empty/missing
    if (isEmpty(regVal) && isEmpty(tarVal)) {
      continue;
    }

    // Determine field severity
    const isCriticalField = CRITICAL_FIELDS.has(key);
    const severity: Severity = isCriticalField ? 'critical' : 'warning';

    // 1. Special handling for 'scripts'
    if (key === 'scripts') {
      const regScripts = (regVal && typeof regVal === 'object' ? regVal : {}) as Record<
        string,
        string
      >;
      const tarScripts = (tarVal && typeof tarVal === 'object' ? tarVal : {}) as Record<
        string,
        string
      >;
      const scriptKeys = new Set([...Object.keys(regScripts), ...Object.keys(tarScripts)]);

      for (const scriptName of scriptKeys) {
        const regScript = regScripts[scriptName];
        const tarScript = tarScripts[scriptName];

        if (regScript !== tarScript) {
          const isLifecycleHook = [
            'preinstall',
            'install',
            'postinstall',
            'prepublish',
            'prepublishOnly',
            'prepare',
            'prepack',
            'postpack',
          ].includes(scriptName);

          mismatches.push({
            field: `scripts.${scriptName}`,
            registryValue: regScript,
            tarballValue: tarScript,
            severity: 'critical',
            message: isLifecycleHook
              ? `Lifecycle hook script mismatch: 'scripts.${scriptName}' differs between registry and tarball (install-time code execution vector).`
              : `Script mismatch: 'scripts.${scriptName}' differs between registry and tarball.`,
          });
        }
      }
      continue;
    }

    // 2. Special handling for dependency fields
    if (
      [
        'dependencies',
        'devDependencies',
        'optionalDependencies',
        'peerDependencies',
        'bundledDependencies',
        'bundleDependencies',
      ].includes(key)
    ) {
      // Bundled dependencies can be an array
      if (Array.isArray(regVal) || Array.isArray(tarVal)) {
        const regArr = Array.isArray(regVal) ? [...regVal].sort() : [];
        const tarArr = Array.isArray(tarVal) ? [...tarVal].sort() : [];
        if (JSON.stringify(regArr) !== JSON.stringify(tarArr)) {
          mismatches.push({
            field: key,
            registryValue: regVal,
            tarballValue: tarVal,
            severity: 'critical',
            message: `Dependency list '${key}' differs between registry and tarball.`,
          });
        }
        continue;
      }

      const regDeps = (regVal && typeof regVal === 'object' ? regVal : {}) as Record<
        string,
        string
      >;
      const tarDeps = (tarVal && typeof tarVal === 'object' ? tarVal : {}) as Record<
        string,
        string
      >;
      const depKeys = new Set([...Object.keys(regDeps), ...Object.keys(tarDeps)]);

      for (const depName of depKeys) {
        const regVer = regDeps[depName];
        const tarVer = tarDeps[depName];

        if (regVer !== tarVer) {
          mismatches.push({
            field: `${key}.${depName}`,
            registryValue: regVer,
            tarballValue: tarVer,
            severity: 'critical',
            message: `Dependency mismatch in '${key}.${depName}': registry declares ${JSON.stringify(regVer)}, but tarball declares ${JSON.stringify(tarVer)}.`,
          });
        }
      }
      continue;
    }

    // 3. Special handling for 'bin'
    if (key === 'bin') {
      const regBin = normalizeBin(regVal, packageName);
      const tarBin = normalizeBin(tarVal, packageName);

      if (!areValuesEqual(regBin, tarBin)) {
        mismatches.push({
          field: 'bin',
          registryValue: regVal,
          tarballValue: tarVal,
          severity: 'critical',
          message: `Executable 'bin' configuration differs between registry and tarball.`,
        });
      }
      continue;
    }

    // 4. Special handling for 'repository'
    if (key === 'repository') {
      const regRepo = normalizeRepository(regVal);
      const tarRepo = normalizeRepository(tarVal);
      if (!areValuesEqual(regRepo, tarRepo)) {
        mismatches.push({
          field: 'repository',
          registryValue: regVal,
          tarballValue: tarVal,
          severity: 'warning',
          message: `Cosmetic metadata mismatch: 'repository' differs.`,
        });
      }
      continue;
    }

    // 5. Generic object / primitive comparison
    if (!areValuesEqual(regVal, tarVal)) {
      mismatches.push({
        field: key,
        registryValue: regVal,
        tarballValue: tarVal,
        severity,
        message: isCriticalField
          ? `Critical field '${key}' differs between registry manifest and tarball.`
          : `Metadata field '${key}' differs between registry manifest and tarball.`,
      });
    }
  }

  return mismatches;
}
