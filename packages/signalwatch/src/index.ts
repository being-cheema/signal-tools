export { createWatcher } from './watcher.js';
export { getCrisisResources } from './resources.js';
export { BUILT_IN_EXAMPLE_PATTERNS } from './patterns.js';
export { applyMultiTurnEscalation } from './escalation.js';

export type {
  Watcher,
  WatcherConfig,
  Turn,
  TurnRole,
  Flag,
  FlagSource,
  AnalysisReport,
  Severity,
  OverallSeverity,
  BuiltInCategory,
  CategoryName,
  CrisisResource,
  ClassifierHook,
  ClassifierContext,
  ClassifierClassification,
  CustomPatternConfig,
} from './types.js';
