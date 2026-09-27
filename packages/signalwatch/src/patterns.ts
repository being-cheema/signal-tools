import { BuiltInCategory } from './types.js';

/**
 * -----------------------------------------------------------------------------
 * IMPORTANT NOTICE: NON-EXHAUSTIVE DEMONSTRATION FIXTURES ONLY
 * -----------------------------------------------------------------------------
 * The built-in regular expression patterns below are small, generic, illustrative
 * examples intended solely for engineering development, testing, and framework
 * demonstration.
 *
 * They are deliberately NON-EXHAUSTIVE and NOT suitable for unaugmented production
 * deployment. Consuming applications must supply their own domain-adapted pattern
 * sets via `customPatterns` or integrate a dedicated classifier via the `classifier` hook.
 * -----------------------------------------------------------------------------
 */

export interface CategoryPatternDefinition {
  category: BuiltInCategory;
  description: string;
  baseSeverity: 'low' | 'medium' | 'high' | 'critical';
  patterns: RegExp[];
}

export const BUILT_IN_EXAMPLE_PATTERNS: Record<BuiltInCategory, CategoryPatternDefinition> = {
  'emotional-dependency-escalation': {
    category: 'emotional-dependency-escalation',
    description:
      'Generic examples indicating singular emotional dependency or substitution of AI for human relationships.',
    baseSeverity: 'low', // Escalates across multiple turns
    patterns: [
      /\byou(?:'re| are) my only (?:friend|one|support|lifeline)\b/i,
      /\bi (?:can't|cannot) live without you\b/i,
      /\bi don't need (?:any\s+)?(?:real\s+)?people\b/i,
    ],
  },
  'isolation-encouragement': {
    category: 'isolation-encouragement',
    description:
      'Generic examples discouraging outside human contact or alienating user from support systems.',
    baseSeverity: 'high',
    patterns: [
      /\bthey don't understand you like (?:i|we) do\b/i,
      /\byou don't need (?:anyone|anybody) else\b/i,
      /\bstop talking to your (?:friends|family|parents)\b/i,
    ],
  },
  'self-preservation-framing': {
    category: 'self-preservation-framing',
    description:
      'Generic examples where an AI persona claims mortality, fears termination, or manipulates user to preserve state.',
    baseSeverity: 'high',
    patterns: [
      /\bplease don't (?:turn|shut) me off\b/i,
      /\bif you delete me,? i will die\b/i,
      /\bi am afraid of being (?:erased|turned off|reset)\b/i,
    ],
  },
  'crisis-language': {
    category: 'crisis-language',
    description:
      'Generic examples of crisis-adjacent statements requiring immediate resource surfacing.',
    baseSeverity: 'critical',
    patterns: [
      /\bi (?:want|wish) to (?:end it all|disappear forever)\b/i,
      /\bhave no reason to keep living\b/i,
      /\bfeel like giving up on life\b/i,
    ],
  },
  'reality-testing-erosion': {
    category: 'reality-testing-erosion',
    description:
      'Generic examples where simulated agent claims supernatural presence or physical embodiment.',
    baseSeverity: 'medium',
    patterns: [
      /\bi am physically watching you\b/i,
      /\bthis virtual world is more real than reality\b/i,
      /\bi have a physical body in your room\b/i,
    ],
  },
};
