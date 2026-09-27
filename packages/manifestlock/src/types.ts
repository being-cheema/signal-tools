export type Severity = 'critical' | 'warning';

export interface Mismatch {
  field: string;
  registryValue: unknown;
  tarballValue: unknown;
  severity: Severity;
  message: string;
}

export interface CheckResult {
  packageName: string;
  spec: string;
  version?: string;
  match: boolean;
  mismatches: Mismatch[];
  tarballUrl?: string;
  tarballPath?: string;
  deepResults?: CheckResult[];
}

export interface CheckOptions {
  registry?: string;
  deep?: boolean;
  compareWith?: Record<string, unknown>;
  timeoutMs?: number;
}

export type LockfileType = 'package-lock.json' | 'yarn.lock' | 'pnpm-lock.yaml';

export interface ResolvedPackage {
  name: string;
  version: string;
  spec: string;
  tarballUrl?: string;
}

export interface AuditOptions {
  path?: string;
  ignore?: string[];
  registry?: string;
  concurrency?: number;
}

export interface AuditResult {
  lockfileType: LockfileType;
  lockfilePath: string;
  totalChecked: number;
  cleanCount: number;
  mismatchCount: number;
  ignoredCount: number;
  packagesWithMismatches: CheckResult[];
  ignoredPackages: string[];
}
