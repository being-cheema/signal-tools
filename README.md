# Signal Tools Monorepo

This repository is an npm workspaces monorepo containing two completely independent, unrelated open-source packages:

- **[`packages/manifestlock`](./packages/manifestlock/README.md)** (`manifestlock` on npm) — CLI and library that detects "manifest confusion" in npm packages by diffing published npm registry metadata against actual tarball contents.
- **[`packages/signalwatch`](./packages/signalwatch/README.md)** (`signalwatch` on npm) — Lightweight, embeddable TypeScript library for AI chat products to flag conversation transcripts showing patterns associated with unhealthy user-AI interaction dynamics.

These packages are built, versioned, and published independently with zero shared runtime dependencies and strict boundary isolation.

---

## Packages Overview

| Package                                             | Directory               | Description                                                         | Status           |
| :-------------------------------------------------- | :---------------------- | :------------------------------------------------------------------ | :--------------- |
| [`manifestlock`](./packages/manifestlock/README.md) | `packages/manifestlock` | npm manifest confusion detector & security audit CLI                | Production-ready |
| [`signalwatch`](./packages/signalwatch/README.md)   | `packages/signalwatch`  | Heuristic safety watcher for conversational AI interaction patterns | Production-ready |

---

## Workspace Architecture

```
.
├── packages/
│   ├── manifestlock/        # npm package "manifestlock" (CLI + API)
│   └── signalwatch/         # npm package "signalwatch" (zero-dep library)
├── .github/workflows/ci.yml # Continuous integration running tests & builds
├── eslint.config.mjs        # Shared root ESLint flat configuration
├── tsconfig.base.json       # Shared base TypeScript configuration
└── package.json             # Root workspace definitions & unified scripts
```

---

## Development & Monorepo Commands

Run all tasks from the root:

```bash
# Install dependencies across all workspaces
npm install

# Check code formatting with Prettier
npm run format:check

# Auto-format all code
npm run format

# Run ESLint across all packages
npm run lint

# Run TypeScript typechecks across all packages
npm run typecheck

# Run test suites across all packages
npm test

# Build dual ESM/CJS bundles for all packages
npm run build
```

---

## License

Each package is licensed under the [MIT License](LICENSE).
