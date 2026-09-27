#!/usr/bin/env node
import { checkManifest } from './checker.js';
import { audit } from './audit.js';
import { CheckResult, Mismatch } from './types.js';

// Simple ANSI color helpers (respects NO_COLOR or non-TTY)
const supportsColor =
  !process.env.NO_COLOR && (process.stdout.isTTY || process.env.FORCE_COLOR === '1');

const c = {
  reset: supportsColor ? '\x1b[0m' : '',
  bold: supportsColor ? '\x1b[1m' : '',
  dim: supportsColor ? '\x1b[2m' : '',
  red: supportsColor ? '\x1b[31m' : '',
  green: supportsColor ? '\x1b[32m' : '',
  yellow: supportsColor ? '\x1b[33m' : '',
  cyan: supportsColor ? '\x1b[36m' : '',
};

function printHelp() {
  console.log(`
${c.bold}manifestlock${c.reset} — Detect manifest confusion between npm registry metadata and actual tarballs

${c.bold}USAGE${c.reset}
  $ manifestlock check <package-spec-or-tarball> [options]
  $ manifestlock audit [options]

${c.bold}COMMANDS${c.reset}
  check <spec>    Inspect a registry package (e.g. lodash@4.17.21) or local .tgz file
  audit           Audit all dependencies in the local lockfile (package-lock, yarn, pnpm)

${c.bold}CHECK OPTIONS${c.reset}
  --deep          Recursively check direct dependencies (one level deep)
  --json          Output results in machine-readable JSON format
  --registry <url> Custom npm registry URL (default: https://registry.npmjs.org)

${c.bold}AUDIT OPTIONS${c.reset}
  --path <dir>    Path to project directory containing lockfile (default: current directory)
  --ignore <pkgs> Comma-separated list of packages to ignore (e.g. --ignore foo,bar@1.0.0)
  --json          Output results in machine-readable JSON format
  --registry <url> Custom npm registry URL

${c.bold}EXAMPLES${c.reset}
  $ manifestlock check lodash@4.17.21
  $ manifestlock check express --deep
  $ manifestlock check ./path/to/local-package.tgz
  $ manifestlock audit
  $ manifestlock audit --ignore known-fp-pkg
`);
}

function formatValue(val: unknown): string {
  if (val === undefined) return `${c.dim}(undefined)${c.reset}`;
  if (val === null) return `${c.dim}null${c.reset}`;
  if (typeof val === 'string') return `"${val}"`;
  return JSON.stringify(val);
}

function printCheckResult(result: CheckResult, indent = '') {
  if (result.match) {
    console.log(
      `${indent}${c.green}✔${c.reset} ${c.bold}${result.spec}${c.reset}: manifest matches tarball (clean)`,
    );
  } else {
    const criticalCount = result.mismatches.filter((m) => m.severity === 'critical').length;
    const warningCount = result.mismatches.filter((m) => m.severity === 'warning').length;

    console.log(
      `${indent}${c.red}✖${c.reset} ${c.bold}${result.spec}${c.reset}: ${c.red}Manifest confusion detected!${c.reset} (${criticalCount} critical, ${warningCount} warning)`,
    );

    for (const m of result.mismatches) {
      const tag =
        m.severity === 'critical'
          ? `${c.red}[CRITICAL]${c.reset}`
          : `${c.yellow}[WARNING]${c.reset}`;
      console.log(`${indent}  • ${tag} ${c.bold}${m.field}${c.reset}`);
      if (m.message) {
        console.log(`${indent}    ${c.dim}${m.message}${c.reset}`);
      }
      console.log(`${indent}    Registry: ${formatValue(m.registryValue)}`);
      console.log(`${indent}    Tarball:  ${formatValue(m.tarballValue)}`);
    }
  }

  if (result.deepResults && result.deepResults.length > 0) {
    console.log(
      `\n${indent}${c.cyan}${c.bold}Direct Dependencies (${result.deepResults.length}):${c.reset}`,
    );
    for (const depResult of result.deepResults) {
      printCheckResult(depResult, `${indent}  `);
    }
  }
}

async function runCli() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('-h') || args.includes('--help')) {
    printHelp();
    process.exit(0);
  }

  const isJson = args.includes('--json');
  const isDeep = args.includes('--deep');

  let registry: string | undefined;
  const regIdx = args.indexOf('--registry');
  if (regIdx !== -1 && args[regIdx + 1]) {
    registry = args[regIdx + 1];
  }

  let ignoreList: string[] = [];
  const ignoreIdx = args.indexOf('--ignore');
  if (ignoreIdx !== -1 && args[ignoreIdx + 1]) {
    ignoreList = args[ignoreIdx + 1].split(',').map((s) => s.trim());
  }

  let projectPath: string | undefined;
  const pathIdx = args.indexOf('--path');
  if (pathIdx !== -1 && args[pathIdx + 1]) {
    projectPath = args[pathIdx + 1];
  }

  const command = args[0];

  try {
    if (command === 'check') {
      const target = args[1];
      if (!target || target.startsWith('-')) {
        console.error(
          `${c.red}Error: Missing package spec or tarball path for check command.${c.reset}`,
        );
        console.error('Usage: manifestlock check <package-spec>');
        process.exit(1);
      }

      const result = await checkManifest(target, {
        registry,
        deep: isDeep,
      });

      if (isJson) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        printCheckResult(result);
      }

      // Exit code 0 if clean, 1 if any critical mismatch found
      const hasCritical =
        result.mismatches.some((m) => m.severity === 'critical') ||
        (result.deepResults &&
          result.deepResults.some((d) => d.mismatches.some((m) => m.severity === 'critical')));

      process.exit(hasCritical ? 1 : 0);
    } else if (command === 'audit') {
      const auditResult = await audit({
        path: projectPath,
        ignore: ignoreList,
        registry,
      });

      if (isJson) {
        console.log(JSON.stringify(auditResult, null, 2));
      } else {
        if (auditResult.mismatchCount === 0) {
          console.log(
            `${c.green}✔${c.reset} ${c.bold}Audit clean:${c.reset} ${auditResult.totalChecked} packages checked, 0 mismatches found (Lockfile: ${auditResult.lockfileType}).`,
          );
          if (auditResult.ignoredCount > 0) {
            console.log(
              `  ${c.dim}(${auditResult.ignoredCount} packages ignored via --ignore)${c.reset}`,
            );
          }
        } else {
          console.log(
            `${c.red}✖${c.reset} ${c.bold}Audit failed:${c.reset} ${auditResult.mismatchCount} package(s) with manifest confusion detected! (${auditResult.totalChecked} checked in ${auditResult.lockfileType})`,
          );
          console.log('');
          for (const pkg of auditResult.packagesWithMismatches) {
            printCheckResult(pkg);
            console.log('');
          }
        }
      }

      const hasCritical = auditResult.packagesWithMismatches.some((p) =>
        p.mismatches.some((m: Mismatch) => m.severity === 'critical'),
      );
      process.exit(hasCritical ? 1 : 0);
    } else {
      console.error(`${c.red}Unknown command: ${command}${c.reset}`);
      printHelp();
      process.exit(1);
    }
  } catch (error) {
    if (isJson) {
      console.log(
        JSON.stringify({
          error: (error as Error).message || String(error),
        }),
      );
    } else {
      console.error(`${c.red}Error:${c.reset} ${(error as Error).message || error}`);
    }
    process.exit(1);
  }
}

runCli();
