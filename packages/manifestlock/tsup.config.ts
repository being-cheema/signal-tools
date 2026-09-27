import { defineConfig } from 'tsup';
import * as fs from 'node:fs';
import * as path from 'node:path';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    cli: 'src/cli.ts',
  },
  format: ['esm', 'cjs'],
  dts: {
    entry: ['src/index.ts'],
  },
  clean: true,
  sourcemap: true,
  splitting: false,
  treeshake: true,
  onSuccess: async () => {
    // Ensure built CLI files have execution permissions
    const cliFiles = ['dist/cli.js', 'dist/cli.cjs'];
    for (const f of cliFiles) {
      const fullPath = path.resolve(__dirname, f);
      if (fs.existsSync(fullPath)) {
        try {
          fs.chmodSync(fullPath, '755');
        } catch {
          // Ignore on environments without chmod support
        }
      }
    }
  },
});
