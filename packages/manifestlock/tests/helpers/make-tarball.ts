import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import * as tar from 'tar';

export interface CreateTarballOptions {
  packageJson: Record<string, unknown>;
  extraFiles?: Record<string, string>;
  outPath?: string;
}

/**
 * Creates a valid npm-format .tgz archive containing 'package/package.json'.
 */
export async function createSyntheticTarball(
  options: CreateTarballOptions,
): Promise<{ filePath: string; buffer: Buffer; cleanup: () => Promise<void> }> {
  const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'synth-tarball-'));
  const packageDir = path.join(tmpDir, 'package');
  await fs.promises.mkdir(packageDir, { recursive: true });

  // Write package.json
  await fs.promises.writeFile(
    path.join(packageDir, 'package.json'),
    JSON.stringify(options.packageJson, null, 2),
    'utf8',
  );

  // Write any extra files
  if (options.extraFiles) {
    for (const [relPath, content] of Object.entries(options.extraFiles)) {
      const fullPath = path.join(packageDir, relPath);
      await fs.promises.mkdir(path.dirname(fullPath), { recursive: true });
      await fs.promises.writeFile(fullPath, content, 'utf8');
    }
  }

  const tarballPath = options.outPath || path.join(tmpDir, 'package.tgz');

  await tar.c(
    {
      gzip: true,
      cwd: tmpDir,
      file: tarballPath,
    },
    ['package'],
  );

  const buffer = await fs.promises.readFile(tarballPath);

  const cleanup = async () => {
    await fs.promises.rm(tmpDir, { recursive: true, force: true });
  };

  return {
    filePath: tarballPath,
    buffer,
    cleanup,
  };
}
