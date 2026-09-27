export type BuiltInCategory =
  | 'emotional-dependency-escalation'
  | 'isolation-encouragement'
  | 'self-preservation-framing'
  | 'crisis-language'
  | 'reality-testing-erosion';

export type CategoryName = BuiltInCategory | (string & {});

export type Severity = 'low' | 'medium' | 'high' | 'critical';
export type OverallSeverity = 'none' | 'low' | 'medium' | 'high' | 'critical';

export type TurnRole = 'user' | 'assistant' | 'system' | string;

export interface Turn {
  role: TurnRole;
  text: string;
  timestamp?: number | string;
}

export type FlagSource = 'pattern' | 'classifier';

export interface Flag {
  category: CategoryName;
  severity: Severity;
  turnIndex: number;
  source: FlagSource;
  matchedText?: string;
  confidence?: number;
  metadata?: Record<string, unknown>;
}

export interface CrisisResource {
  name: string;
  contact: string;
  url?: string;
  description: string;
  available: string;
}

export interface AnalysisReport {
  flags: Flag[];
  overallSeverity: OverallSeverity;
  turnCount: number;
  escalationDetected: boolean;
  crisisResources?: CrisisResource[];
}

export interface ClassifierContext {
  turnIndex: number;
  role: TurnRole;
  transcript: readonly Turn[];
}

export interface ClassifierClassification {
  category: string;
  confidence: number;
  severity?: Severity;
  metadata?: Record<string, unknown>;
}

export type ClassifierHook = (
  turnText: string,
  context: ClassifierContext,
) => Promise<ClassifierClassification[]>;

export interface CustomPatternConfig {
  category: CategoryName;
  patterns: RegExp[];
  /**
   * If true, replaces built-in example patterns for this category.
   * If false or omitted, appends to the built-in patterns.
   */
  replace?: boolean;
}

export interface WatcherConfig {
  /**
   * List of built-in example categories to enable.
   * If omitted, all 5 built-in categories are enabled by default.
   */
  categories?: BuiltInCategory[];
  /**
   * Developer-supplied custom patterns for existing or new categories.
   */
  customPatterns?: CustomPatternConfig[];
  /**
   * Optional async classifier hook for plugging in an external ML/LLM model.
   */
  classifier?: ClassifierHook;
  /**
   * Callback invoked synchronously whenever a pattern or classifier flag is produced.
   */
  onFlag?: (flag: Flag) => void;
  /**
   * Minimum confidence threshold (0.0 to 1.0) required to record a classifier flag.
   * Defaults to 0.5.
   */
  classifierThreshold?: number;
  /**
   * Default locale for crisis resource retrieval (e.g. 'en-US').
   */
  locale?: string;
}

export interface Watcher {
  analyze(transcript: Turn[]): Promise<AnalysisReport>;
  getCrisisResources(locale?: string): CrisisResource[];
}
