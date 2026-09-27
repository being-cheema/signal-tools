import * as tar from 'tar';
import * as fs from 'node:fs';
import { Readable } from 'node:stream';

/**
 * Justification: 'tar' is npm's official streaming tar archive utility.
 * It is used here exclusively for stream-based in-memory parsing of the
 * tarball structure to locate and read 'package/package.json'. No files are
 * ever extracted to disk, no binaries are executed, and no install scripts
 * are ever triggered under any circumstances.
 */

/**
 * Extracts and parses package.json from a tarball buffer without writing to disk
 * or executing any scripts.
 */
export async function extractPackageJsonFromBuffer(
  tarballBuffer: Buffer,
): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    let found = false;
    let content = '';

    const stream = Readable.from(tarballBuffer);
    const parser = tar.t({
      onentry: (entry: tar.ReadEntry) => {
        const cleanPath = entry.path.replace(/^\.\//, '');
        // Standard npm tarballs put everything under package/
        if (
          cleanPath === 'package/package.json' ||
          cleanPath === 'package.json' ||
          cleanPath.endsWith('/package.json')
        ) {
          found = true;
          entry.on('data', (chunk: Buffer) => {
            content += chunk.toString('utf8');
          });
        } else {
          // Discard all other entries immediately - never buffer or extract them
          entry.resume();
        }
      },
    });

    parser.on('end', () => {
      if (!found || !content.trim()) {
        reject(new Error('No package.json found inside the specified tarball archive.'));
        return;
      }
      try {
        const parsed = JSON.parse(content) as Record<string, unknown>;
        resolve(parsed);
      } catch (err) {
        reject(
          new Error(`Corrupted or invalid JSON in tarball package.json: ${(err as Error).message}`),
        );
      }
    });

    parser.on('error', (err: unknown) => reject(err));
    stream.pipe(parser);
  });
}

/**
 * Extracts package.json from a local .tgz / .tar file path safely.
 */
export async function extractPackageJsonFromFile(
  filePath: string,
): Promise<Record<string, unknown>> {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Local tarball not found at path: ${filePath}`);
  }
  const buffer = await fs.promises.readFile(filePath);
  return extractPackageJsonFromBuffer(buffer);
}
