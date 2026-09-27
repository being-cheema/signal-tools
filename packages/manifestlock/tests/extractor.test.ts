import { describe, it, expect } from 'vitest';
import { extractPackageJsonFromBuffer, extractPackageJsonFromFile } from '../src/extractor.js';
import { createSyntheticTarball } from './helpers/make-tarball.js';

describe('Tarball Extractor', () => {
  it('extracts package.json from buffer correctly', async () => {
    const pkgData = {
      name: 'extracted-pkg',
      version: '1.2.3',
      scripts: { test: 'vitest' },
    };

    const synth = await createSyntheticTarball({
      packageJson: pkgData,
      extraFiles: {
        'index.js': 'console.log("hello world");',
        'evil.sh': 'rm -rf /',
      },
    });

    try {
      const extracted = await extractPackageJsonFromBuffer(synth.buffer);
      expect(extracted).toEqual(pkgData);
    } finally {
      await synth.cleanup();
    }
  });

  it('extracts package.json from file path correctly', async () => {
    const pkgData = {
      name: 'file-extracted-pkg',
      version: '2.0.0',
    };

    const synth = await createSyntheticTarball({
      packageJson: pkgData,
    });

    try {
      const extracted = await extractPackageJsonFromFile(synth.filePath);
      expect(extracted).toEqual(pkgData);
    } finally {
      await synth.cleanup();
    }
  });

  it('throws error when archive does not contain package.json', async () => {
    // Empty tarball or tarball with only readme
    const synth = await createSyntheticTarball({
      packageJson: {},
    });
    // Create archive without package.json by using empty buffer
    const badBuffer = Buffer.from('not-a-tarball');
    await expect(extractPackageJsonFromBuffer(badBuffer)).rejects.toThrow();
    await synth.cleanup();
  });
});
