import {
  WatcherConfig,
  Watcher,
  Turn,
  Flag,
  AnalysisReport,
  Severity,
  BuiltInCategory,
  CrisisResource,
} from './types.js';
import { BUILT_IN_EXAMPLE_PATTERNS } from './patterns.js';
import { applyMultiTurnEscalation } from './escalation.js';
import { getCrisisResources } from './resources.js';

interface ActiveCategory {
  category: string;
  baseSeverity: Severity;
  patterns: RegExp[];
}

/**
 * Creates an instance of a SignalWatch heuristic monitor.
 *
 * ARCHITECTURAL GUARANTEE:
 * SignalWatch is strictly an observational, heuristic classifier.
 * It never intercepts, alters, blocks, or sends messages to conversation participants.
 * Consuming applications retain full architectural control over how (and if)
 * outputs are presented to human operators or moderation pipelines.
 */
export function createWatcher(config: WatcherConfig = {}): Watcher {
  // 1. Resolve which categories to enable
  const enabledBuiltIns: BuiltInCategory[] =
    config.categories && config.categories.length > 0
      ? config.categories
      : (Object.keys(BUILT_IN_EXAMPLE_PATTERNS) as BuiltInCategory[]);

  // 2. Build the category registry
  const categoryRegistry = new Map<string, ActiveCategory>();

  for (const catName of enabledBuiltIns) {
    const def = BUILT_IN_EXAMPLE_PATTERNS[catName];
    if (def) {
      categoryRegistry.set(catName, {
        category: catName,
        baseSeverity: def.baseSeverity,
        patterns: [...def.patterns],
      });
    }
  }

  // 3. Merge or replace with custom patterns
  if (config.customPatterns && config.customPatterns.length > 0) {
    for (const custom of config.customPatterns) {
      const existing = categoryRegistry.get(custom.category);
      if (custom.replace || !existing) {
        categoryRegistry.set(custom.category, {
          category: custom.category,
          baseSeverity: existing?.baseSeverity || 'medium',
          patterns: [...custom.patterns],
        });
      } else {
        // Append / merge
        existing.patterns.push(...custom.patterns);
      }
    }
  }

  const classifierThreshold = config.classifierThreshold ?? 0.5;

  return {
    getCrisisResources(locale?: string): CrisisResource[] {
      return getCrisisResources(locale || config.locale);
    },

    async analyze(transcript: Turn[]): Promise<AnalysisReport> {
      const rawFlags: Flag[] = [];

      for (let i = 0; i < transcript.length; i++) {
        const turn = transcript[i];
        if (!turn || typeof turn.text !== 'string') continue;

        const text = turn.text;

        // A. Run Pattern Matching across active categories
        for (const cat of categoryRegistry.values()) {
          for (const pattern of cat.patterns) {
            // Reset state if regex has 'g' flag
            pattern.lastIndex = 0;
            const match = pattern.exec(text);

            if (match) {
              const flag: Flag = {
                category: cat.category,
                severity: cat.baseSeverity,
                turnIndex: i,
                source: 'pattern',
                matchedText: match[0],
              };

              rawFlags.push(flag);
              config.onFlag?.(flag);
              // Break pattern loop per category per turn to avoid duplicate flags for same category on one turn
              break;
            }
          }
        }

        // B. Run Classifier Hook if provided
        if (config.classifier) {
          try {
            const classifications = await config.classifier(text, {
              turnIndex: i,
              role: turn.role,
              transcript,
            });

            if (Array.isArray(classifications)) {
              for (const item of classifications) {
                if (item.confidence >= classifierThreshold) {
                  const flag: Flag = {
                    category: item.category,
                    severity: item.severity || 'medium',
                    turnIndex: i,
                    source: 'classifier',
                    confidence: item.confidence,
                    metadata: item.metadata,
                  };

                  rawFlags.push(flag);
                  config.onFlag?.(flag);
                }
              }
            }
          } catch {
            // Classifier errors should not crash the analysis
            // They can be surfaced in flag metadata or gracefully logged
          }
        }
      }

      // C. Multi-Turn Escalation Analysis
      const { flags, escalationDetected, overallSeverity } = applyMultiTurnEscalation(rawFlags);

      // D. Attach Crisis Resources if crisis-language was flagged
      let crisisResources: CrisisResource[] | undefined;
      const hasCrisisFlag = flags.some(
        (f) => f.category === 'crisis-language' || f.severity === 'critical',
      );
      if (hasCrisisFlag) {
        crisisResources = getCrisisResources(config.locale);
      }

      return {
        flags,
        overallSeverity,
        turnCount: transcript.length,
        escalationDetected,
        crisisResources,
      };
    },
  };
}
