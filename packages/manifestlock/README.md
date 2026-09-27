# manifestlock

> High-assurance detection of npm "manifest confusion" vulnerabilities by diffing registry metadata directly against actual tarball package contents.

[![npm version](https://img.shields.io/npm/v/manifestlock.svg)](https://www.npmjs.com/package/manifestlock)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

---

## What is Manifest Confusion?

Manifest confusion is a well-documented structural weakness in the npm ecosystem: when an npm package is published, its registry metadata (`package.json` stored on `registry.npmjs.org`) and its uploaded `.tgz` archive are handled and processed somewhat independently.

This architectural decoupling enables malicious actors or compromised maintainer accounts to deploy deceptive attacks:

- **Stealthy Install Scripts**: Omitting `postinstall`, `preinstall`, or `prepare` hooks from registry metadata while including them in the actual tarball, allowing arbitrary code execution during `npm install` that evades metadata-only registry scanners.
- **Hidden Dependencies**: Declaring benign dependencies in registry metadata while embedding covert malicious dependencies in the tarball.
- **Entry-Point Hijacking**: Pointing `main`, `module`, `exports`, or `bin` to different files than declared publicly.

`manifestlock` operates by fetching **both** the public registry metadata and the actual `.tgz` tarball, safely extracting the internal `package.json` in memory without ever writing executables to disk or triggering any scripts, and performing deep field-by-field verification.

---

## Security Guarantee: Zero Execution

`manifestlock` strictly guarantees **zero code execution**:

- The downloaded tarball archive is parsed in-memory using streaming tar decoders.
- No files from the tarball are ever written to disk or executed.
- No package scripts (`preinstall`, `install`, `postinstall`, etc.) are ever triggered, regardless of their contents or structure.

---

## Installation

### CLI Usage (Global or On-Demand)

```bash
# Run on-demand via npx
npx manifestlock check <package-spec>

# Or install globally
npm install -g manifestlock
```

### Library Usage

```bash
npm install manifestlock
```

---

## Quickstart

### Inspecting an npm Package

```bash
npx manifestlock check lodash@4.17.21
```

Output:

```text
✔ lodash@4.17.21: manifest matches tarball (clean)
```

If manifest confusion is detected:

```text
✖ sneaky-package@1.0.0: Manifest confusion detected! (1 critical, 0 warning)
  • [CRITICAL] scripts.postinstall
    Lifecycle hook script mismatch: 'scripts.postinstall' differs between registry and tarball (install-time code execution vector).
    Registry: (undefined)
    Tarball:  "node ./setup-backdoor.js"
```

### Checking Deep Dependencies (One Level)

```bash
npx manifestlock check express --deep
```

### Auditing an Entire Project Lockfile

Run inside any repository with a `package-lock.json`, `yarn.lock`, or `pnpm-lock.yaml`:

```bash
npx manifestlock audit
```

Clean audit output:

```text
✔ Audit complete: 142 packages checked, 0 mismatches found (Lockfile: package-lock.json).
```

---

## CLI Reference

### `manifestlock check <package-spec-or-tarball> [options]`

Inspects a registry package specification or a local `.tgz` archive file.

| Option             | Type      | Description                                                                                              |
| :----------------- | :-------- | :------------------------------------------------------------------------------------------------------- |
| `<spec>`           | `string`  | Target package specification (e.g. `lodash@4.17.21`, `@scope/pkg@1.0.0`) or local path to a `.tgz` file. |
| `--deep`           | `boolean` | Recursively checks the package's direct dependencies (one level down).                                   |
| `--json`           | `boolean` | Emits machine-readable JSON to `stdout` for CI/CD pipelines.                                             |
| `--registry <url>` | `string`  | Custom npm registry endpoint (defaults to `https://registry.npmjs.org`).                                 |

#### Exit Codes

- `0`: Clean. Tarball matches registry metadata (or only non-critical cosmetic warnings).
- `1`: Manifest confusion detected with at least one **critical** mismatch (scripts, dependencies, bin, entry-points) or execution error.

---

### `manifestlock audit [options]`

Scans every resolved package in the local project lockfile against its registry tarball.

| Option             | Type      | Description                                                                                     |
| :----------------- | :-------- | :---------------------------------------------------------------------------------------------- |
| `--path <dir>`     | `string`  | Directory containing lockfile (defaults to current working directory).                          |
| `--ignore <pkgs>`  | `string`  | Comma-separated list of package names or specs to ignore (e.g. `--ignore known-pkg,foo@1.0.0`). |
| `--json`           | `boolean` | Emits machine-readable JSON to `stdout`.                                                        |
| `--registry <url>` | `string`  | Custom npm registry endpoint.                                                                   |

Supported lockfiles:

- `package-lock.json` (npm v1, v2, and v3)
- `yarn.lock` (Yarn classic v1 and Yarn Berry v2+)
- `pnpm-lock.yaml` (pnpm v5, v6, and v9)

---

## Programmatic API Reference

Dual ESM / CommonJS support with full TypeScript declarations out of the box.

```typescript
import { checkManifest, audit, diffManifests } from 'manifestlock';
```

### `checkManifest(packageNameOrPath, options?)`

Checks whether a package's registry manifest matches its tarball `package.json`.

```typescript
import { checkManifest } from 'manifestlock';

const result = await checkManifest('lodash@4.17.21');

console.log(result.match); // true
console.log(result.mismatches); // []
```

#### Parameters

- `packageNameOrPath` (`string`): Registry package spec (`"pkg@1.0.0"`) or local path to `.tgz` file.
- `options` (`CheckOptions`, optional):
  - `registry?: string`: Custom registry URL.
  - `deep?: boolean`: Recursively verify direct dependencies.
  - `compareWith?: Record<string, unknown>`: Custom manifest object to compare against (useful for offline testing or pre-publish CI).
  - `timeoutMs?: number`: Network timeout in milliseconds (default: 25000).

#### Return Value (`Promise<CheckResult>`)

```typescript
interface CheckResult {
  packageName: string;
  spec: string;
  version?: string;
  match: boolean;
  mismatches: Mismatch[];
  tarballUrl?: string;
  tarballPath?: string;
  deepResults?: CheckResult[];
}

interface Mismatch {
  field: string;
  registryValue: unknown;
  tarballValue: unknown;
  severity: 'critical' | 'warning';
  message: string;
}
```

---

### `audit(options?)`

Audits all dependencies declared in a project lockfile.

```typescript
import { audit } from 'manifestlock';

const auditResult = await audit({
  path: process.cwd(),
  ignore: ['safe-internal-pkg'],
});

console.log(`Checked ${auditResult.totalChecked} packages.`);
if (auditResult.mismatchCount > 0) {
  console.error(`Found ${auditResult.mismatchCount} packages with mismatches!`);
}
```

---

### `diffManifests(registryPkg, tarballPkg)`

Pure in-memory diffing of two `package.json` objects.

```typescript
import { diffManifests } from 'manifestlock';

const mismatches = diffManifests(registryPkg, tarballPkg);
```

#### Field Severity Classification

- **`critical`**:
  - `scripts` (`preinstall`, `install`, `postinstall`, `prepare`, etc.)
  - `dependencies`, `devDependencies`, `optionalDependencies`, `peerDependencies`, `bundledDependencies`
  - `bin` (executable entry points)
  - `main`, `module`, `exports`, `imports`, `browser`, `unpkg`, `jsdelivr`
  - `files`, `type`
- **`warning`**:
  - `description`, `keywords`, `homepage`, `bugs`, `license`, `repository`, `author`, `contributors`, `funding`, `engines`

---

## CI / CD Integration

Enforce manifest lock checks in GitHub Actions before deploying or merging dependency bumps:

```yaml
name: Dependency Security Audit
on: [push, pull_request]

jobs:
  manifest-check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '22'
      - name: Run manifestlock audit
        run: npx manifestlock audit
```

---

## Dependencies & Architecture

- `tar`: npm's official streaming tar archive parser. Used exclusively in-memory to stream and locate `package/package.json`. No binaries or scripts are executed.
- Native `fetch`: Node.js 18+ standard built-in HTTP client for querying registry APIs and streaming tarballs, with zero external HTTP library dependencies.

---

## License

[MIT License](LICENSE)
