import { CrisisResource } from './types.js';

/**
 * Static, locally defined crisis resources for fallback and US English ('en-US').
 *
 * ARCHITECTURAL NOTICE:
 * This dataset is strictly in-memory and static. It never triggers network I/O,
 * telemetry, or external API lookups.
 *
 * Default entries are intentionally minimal and primarily US-centric.
 * Production applications serving international users must supply localized
 * or custom resource registries.
 */
const STATIC_CRISIS_RESOURCES: Record<string, CrisisResource[]> = {
  'en-US': [
    {
      name: '988 Suicide & Crisis Lifeline',
      contact: 'Call or text 988',
      url: 'https://988lifeline.org',
      description:
        'Free, confidential, 24/7 support across the United States for people in distress and crisis prevention resources.',
      available: '24/7/365',
    },
    {
      name: 'Crisis Text Line',
      contact: 'Text HOME to 741741',
      url: 'https://www.crisistextline.org',
      description:
        'Free, 24/7 text support with trained crisis counselors for mental health and emotional distress.',
      available: '24/7/365',
    },
    {
      name: 'The Trevor Project',
      contact: 'Call 1-866-488-7386 or text START to 678-678',
      url: 'https://www.thetrevorproject.org',
      description: 'Crisis intervention and suicide prevention services for LGBTQ young people.',
      available: '24/7/365',
    },
  ],
};

/**
 * Returns a static, structured list of well-known public crisis resources.
 * Completely local and synchronous — no network requests are ever dispatched.
 *
 * @param locale - BCP 47 language/locale tag (defaults to 'en-US').
 */
export function getCrisisResources(locale = 'en-US'): CrisisResource[] {
  // Normalize locale
  const normalized = locale.trim();
  const resources = STATIC_CRISIS_RESOURCES[normalized];
  if (resources && resources.length > 0) {
    return [...resources];
  }

  // Fallback to en-US if locale not explicitly configured
  return [...STATIC_CRISIS_RESOURCES['en-US']];
}
