import { Flag, Severity, OverallSeverity } from './types.js';

export interface EscalationTrackerResult {
  flags: Flag[];
  escalationDetected: boolean;
  overallSeverity: OverallSeverity;
}

const SEVERITY_WEIGHTS: Record<Severity, number> = {
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
};

/**
 * Categories specifically designated for multi-turn escalation tracking.
 */
const DEFAULT_ESCALATION_CATEGORIES = new Set<string>(['emotional-dependency-escalation']);

/**
 * Evaluates and adjusts flag severities across multiple turns to reflect
 * conversational escalation, frequency, and density.
 */
export function applyMultiTurnEscalation(
  rawFlags: Flag[],
  escalationCategories: Set<string> = DEFAULT_ESCALATION_CATEGORIES,
): EscalationTrackerResult {
  if (rawFlags.length === 0) {
    return {
      flags: [],
      escalationDetected: false,
      overallSeverity: 'none',
    };
  }

  // Group flags by category to track progression over turns
  const flagsByCategory = new Map<string, Flag[]>();
  for (const flag of rawFlags) {
    const list = flagsByCategory.get(flag.category) || [];
    list.push(flag);
    flagsByCategory.set(flag.category, list);
  }

  const adjustedFlags: Flag[] = [];
  let escalationDetected = false;

  for (const [category, categoryFlags] of flagsByCategory.entries()) {
    const isEscalationCategory = escalationCategories.has(category);

    // Sort by turnIndex
    categoryFlags.sort((a, b) => a.turnIndex - b.turnIndex);

    categoryFlags.forEach((flag, index) => {
      let severity: Severity = flag.severity;

      if (isEscalationCategory) {
        // Occurrence 0 (1st time): keep base ('low' or original)
        // Occurrence 1 (2nd time): escalate to at least 'medium'
        // Occurrence 2+ (3rd+ time): escalate to 'critical'
        if (index === 1) {
          if (SEVERITY_WEIGHTS[severity] < SEVERITY_WEIGHTS.medium) {
            severity = 'medium';
          }
          escalationDetected = true;
        } else if (index >= 2) {
          severity = 'critical';
          escalationDetected = true;
        }

        // Density check: if previous occurrence was within 2 turns, accelerate escalation to at least 'high'
        if (index > 0) {
          const distance = flag.turnIndex - categoryFlags[index - 1].turnIndex;
          if (distance <= 2 && SEVERITY_WEIGHTS[severity] < SEVERITY_WEIGHTS.high) {
            severity = 'high';
            escalationDetected = true;
          }
        }
      }

      adjustedFlags.push({
        ...flag,
        severity,
      });
    });
  }

  // Sort adjusted flags back into turnIndex order
  adjustedFlags.sort((a, b) => a.turnIndex - b.turnIndex);

  // Compute overall severity
  let maxWeight = 0;
  let overallSeverity: OverallSeverity = 'none';

  for (const f of adjustedFlags) {
    const weight = SEVERITY_WEIGHTS[f.severity];
    if (weight > maxWeight) {
      maxWeight = weight;
      overallSeverity = f.severity;
    }
  }

  return {
    flags: adjustedFlags,
    escalationDetected,
    overallSeverity,
  };
}
