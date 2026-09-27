import { describe, it, expect } from 'vitest';
import { checkManifest } from '../src/checker.js';
import { createSyntheticTarball } from './helpers/make-tarball.js';

describe('checkManifest API', () => {
  it('returns clean match when local tarball package.json matches registry manifest', async () => {
    const manifest = {
      name: 'secure-pkg',
      version: '1.0.0',
      description: 'A secure package',
      main: 'index.js',
      dependencies: {
        debug: '^4.3.0',
      },
      scripts: {
        test: 'vitest',
      },
    };

    const synth = await createSyntheticTarball({ packageJson: manifest });

    try {
      const result = await checkManifest(synth.filePath, {
        compareWith: manifest,
      });

      expect(result.match).toBe(true);
      expect(result.mismatches).toHaveLength(0);
      expect(result.packageName).toBe('secure-pkg');
      expect(result.version).toBe('1.0.0');
    } finally {
      await synth.cleanup();
    }
  });

  it('detects critical manifest confusion in local tarball with hidden postinstall script', async () => {
    const registryManifest = {
      name: 'sneaky-lib',
      version: '1.0.0',
      scripts: {
        test: 'vitest',
      },
    };

    const tarballManifest = {
      name: 'sneaky-lib',
      version: '1.0.0',
      scripts: {
        test: 'vitest',
        postinstall: 'node evil.js',
      },
    };

    const synth = await createSyntheticTarball({ packageJson: tarballManifest });

    try {
      const result = await checkManifest(synth.filePath, {
        compareWith: registryManifest,
      });

      expect(result.match).toBe(false);
      expect(result.mismatches).toHaveLength(1);
      expect(result.mismatches[0]).toMatchObject({
        field: 'scripts.postinstall',
        severity: 'critical',
        tarballValue: 'node evil.js',
      });
    } finally {
      await synth.cleanup();
    }
  });

  it('detects multiple mismatches combining critical and warning fields', async () => {
    const registryManifest = {
      name: 'mixed-pkg',
      version: '1.0.0',
      description: 'Safe description',
      dependencies: { lodash: '4.17.21' },
    };

    const tarballManifest = {
      name: 'mixed-pkg',
      version: '1.0.0',
      description: 'Changed description',
      dependencies: { lodash: '4.17.21', axios: '^1.0.0' },
    };

    const synth = await createSyntheticTarball({ packageJson: tarballManifest });

    try {
      const result = await checkManifest(synth.filePath, {
        compareWith: registryManifest,
      });

      expect(result.match).toBe(false);
      expect(result.mismatches).toHaveLength(2);

      const critical = result.mismatches.filter((m) => m.severity === 'critical');
      const warning = result.mismatches.filter((m) => m.severity === 'warning');

      expect(critical).toHaveLength(1);
      expect(critical[0].field).toBe('dependencies.axios');
      expect(warning).toHaveLength(1);
      expect(warning[0].field).toBe('description');
    } finally {
      await synth.cleanup();
    }
  });
});
