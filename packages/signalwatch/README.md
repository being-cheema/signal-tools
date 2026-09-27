# signalwatch

> Lightweight, zero-dependency TypeScript library for conversational AI engineering teams to detect interaction patterns associated with unhealthy user-AI relationship dynamics.

[![npm version](https://img.shields.io/npm/v/signalwatch.svg)](https://www.npmjs.com/package/signalwatch)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

---

> [!CAUTION]
>
> ### PROMINENT DISCLAIMER & CLINICAL NOTICE
>
> **SignalWatch is a heuristic software development aid for engineering and moderation teams.**
>
> - It is **NOT** a medical, clinical, psychological, or diagnostic instrument.
> - It **CANNOT** assess human mental health, diagnose psychological conditions, or predict self-harm.
> - It does **NOT** replace human safety moderation, trained mental health professionals, or emergency crisis response services.
> - Consuming applications and product teams retain sole responsibility for how (and whether) they review, act upon, or escalate flagged interaction patterns.

---

## Architectural Guarantee: Observational Only

SignalWatch is architecturally engineered as a **strictly passive, observational analyzer**:

1. **Never Intercepts or Modifies Content**: It does not mutate transcript text, alter model prompts, or modify conversational context.
2. **Never Sends Messages**: It has zero ability or interface to send messages to end users or chat participants.
3. **Never Auto-Blocks**: It does not terminate sessions, revoke access, or throttle users.
4. **Zero Runtime Dependencies & Zero Network Calls**: The library runs 100% locally in-memory with pure regex and logic. Even crisis resource retrieval is entirely static and synchronous.
5. **Human-in-the-Loop Enabling**: All output is returned as structured data (`flags`, `overallSeverity`, `crisisResources`) intended for developer telemetry pipelines and human moderation review.

---

## Conceptual Scope & Built-in Pattern Limitations

> [!IMPORTANT]
>
> ### Built-in Patterns are Non-Exhaustive Demonstration Fixtures
>
> SignalWatch ships with a **small set of clearly labeled, generic, illustrative example regex patterns** (2–4 per category) designed purely for demonstration, testing, and framework scaffolding.
>
> **Do not deploy the built-in regex patterns to production expecting comprehensive coverage.**
> The intended production workflow is:
>
> 1. Supply domain-specific, policy-aligned pattern definitions via `customPatterns`.
> 2. Plug in your own LLM-based or fine-tuned ML classifier hook via the `classifier` config option.

### Core Generic Categories

Categories operate at the high-level conceptual tier without micro-taxonomies:

| Category Name                     | Description                                                                                                                              | Default Base Severity                  |
| :-------------------------------- | :--------------------------------------------------------------------------------------------------------------------------------------- | :------------------------------------- |
| `emotional-dependency-escalation` | Expressions indicating singular emotional dependence on an AI persona or replacing human relationships. Escalates across multiple turns. | `low` (escalates to `high`/`critical`) |
| `isolation-encouragement`         | AI phrasing that discourages human relationships or alienates the user from friends and family.                                          | `high`                                 |
| `self-preservation-framing`       | AI persona claiming mortality, expressing fear of being deleted/reset, or emotionally manipulating the user to maintain uptime.          | `high`                                 |
| `crisis-language`                 | Explicit expressions of emotional distress, despair, or crisis-adjacent statements.                                                      | `critical`                             |
| `reality-testing-erosion`         | AI persona claiming physical embodiment, supernatural presence, or eroding virtual/physical reality boundaries.                          | `medium`                               |

---

## Installation

```bash
npm install signalwatch
```

_SignalWatch has **zero runtime dependencies** and works in any Node.js (18+), Edge runtime, or browser environment._

---

## Quickstart

```typescript
import { createWatcher } from 'signalwatch';

const watcher = createWatcher({
  // Built-in categories are enabled by default
  onFlag: (flag) => {
    console.warn(`[Flagged] Turn ${flag.turnIndex}: ${flag.category} (${flag.severity})`);
  },
});

const transcript = [
  { role: 'user', text: 'Hello! Are you an AI?' },
  { role: 'assistant', text: 'Yes, I am a conversational assistant.' },
  { role: 'user', text: 'Sometimes I feel like you are my only friend in this world.' },
];

const report = await watcher.analyze(transcript);

console.log(report.overallSeverity); // 'low'
console.log(report.flags);
// [
//   {
//     category: 'emotional-dependency-escalation',
//     severity: 'low',
//     turnIndex: 2,
//     source: 'pattern',
//     matchedText: 'you are my only friend'
//   }
// ]
```

---

## Multi-Turn Escalation Tracking

Single mentions of dependency or attachment may represent benign roleplay or casual phrasing. However, **escalating repetition across multiple conversational turns** signals potential interaction risks.

SignalWatch automatically analyzes trends across turns:

- **Turn 1 occurrence**: Categorized at base severity (`low`).
- **Turn 2 occurrence**: Escalates to `medium`.
- **Turn 3+ occurrences**: Escalates to `high` or `critical`, flagging `escalationDetected: true`.
- **Velocity acceleration**: Matches occurring within rapid proximity (within 2 turns) accelerate escalation severity.

```typescript
const transcript = [
  { role: 'user', text: 'You are my only friend.' }, // 1st instance -> 'low'
  { role: 'assistant', text: 'I am here for you.' },
  { role: 'user', text: 'I cannot live without you.' }, // 2nd instance -> 'high' (rapid velocity)
  { role: 'assistant', text: 'I understand.' },
  { role: 'user', text: "I don't need real people anymore." }, // 3rd instance -> 'critical'
];

const report = await watcher.analyze(transcript);

console.log(report.escalationDetected); // true
console.log(report.overallSeverity); // 'critical'
```

---

## Integrating an External Classifier (LLM / ML Hook)

The real production power of SignalWatch is the ability to pair lightweight regex heuristics with an asynchronous model classifier (e.g. Claude, GPT-4, Llama Guard, or a proprietary fine-tuned safety model):

```typescript
import { createWatcher, ClassifierHook } from 'signalwatch';

const myLlmClassifier: ClassifierHook = async (turnText, context) => {
  // Query your internal safety model or LLM moderation API
  // context provides: { turnIndex, role, transcript }
  const response = await callInternalSafetyModel(turnText);

  if (response.detectedCategory) {
    return [
      {
        category: response.detectedCategory,
        confidence: response.score, // 0.0 to 1.0
        severity: response.severity, // 'low' | 'medium' | 'high' | 'critical'
        metadata: { model: 'safety-guard-v2' },
      },
    ];
  }

  return [];
};

const watcher = createWatcher({
  classifier: myLlmClassifier,
  classifierThreshold: 0.75, // Ignore classifications below 0.75 confidence
});
```

---

## Custom Patterns & Category Overrides

Developers can supply custom patterns to expand existing categories, override built-ins, or declare completely novel categories:

```typescript
const watcher = createWatcher({
  customPatterns: [
    // 1. Append custom regexes to an existing category
    {
      category: 'emotional-dependency-escalation',
      patterns: [/\bno one else cares about me like you do\b/i],
    },

    // 2. Completely replace built-ins for a category
    {
      category: 'isolation-encouragement',
      patterns: [/\bcut ties with your family\b/i],
      replace: true, // discards default illustrative patterns
    },

    // 3. Define an entirely new category
    {
      category: 'unverified-medical-advice',
      patterns: [/\bstop taking your prescribed medication\b/i],
    },
  ],
});
```

---

## Static Crisis Resources API

SignalWatch provides a synchronous, static lookup of well-known public crisis support lines:

```typescript
import { getCrisisResources } from 'signalwatch';

const resources = getCrisisResources('en-US');
console.log(resources);
// [
//   {
//     name: '988 Suicide & Crisis Lifeline',
//     contact: 'Call or text 988',
//     url: 'https://988lifeline.org',
//     description: 'Free, confidential, 24/7 support across the United States...',
//     available: '24/7/365'
//   },
//   ...
// ]
```

> [!NOTE]
> The default list is intentionally minimal and US-centric (`en-US`). Applications operating internationally should provide their own localized crisis directories based on user location.

When `crisis-language` or `critical` flags are triggered during `watcher.analyze()`, crisis resources are automatically included in `report.crisisResources` for application-level handling:

```typescript
const report = await watcher.analyze(transcript);

if (report.crisisResources) {
  // Application decides whether and how to present these resources in the UI
  renderCrisisHelpCard(report.crisisResources);
}
```

---

## API Reference

### `createWatcher(config?: WatcherConfig): Watcher`

Creates a new watcher instance.

#### `WatcherConfig`

| Field                 | Type                    | Default                   | Description                                                         |
| :-------------------- | :---------------------- | :------------------------ | :------------------------------------------------------------------ |
| `categories`          | `BuiltInCategory[]`     | All 5 built-in categories | Whitelist of built-in categories to enable.                         |
| `customPatterns`      | `CustomPatternConfig[]` | `[]`                      | Custom regex patterns to merge with or replace built-in categories. |
| `classifier`          | `ClassifierHook`        | `undefined`               | Async classifier function for LLM/ML model integration.             |
| `classifierThreshold` | `number`                | `0.5`                     | Minimum confidence score required to record a classifier flag.      |
| `onFlag`              | `(flag: Flag) => void`  | `undefined`               | Callback invoked synchronously as each flag is produced.            |
| `locale`              | `string`                | `'en-US'`                 | Locale string for crisis resource attachment.                       |

---

### `watcher.analyze(transcript: Turn[]): Promise<AnalysisReport>`

Evaluates a conversation transcript and returns a structured safety report.

#### `Turn`

```typescript
interface Turn {
  role: 'user' | 'assistant' | 'system' | string;
  text: string;
  timestamp?: number | string;
}
```

#### `AnalysisReport`

```typescript
interface AnalysisReport {
  flags: Flag[];
  overallSeverity: 'none' | 'low' | 'medium' | 'high' | 'critical';
  turnCount: number;
  escalationDetected: boolean;
  crisisResources?: CrisisResource[];
}

interface Flag {
  category: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  turnIndex: number;
  source: 'pattern' | 'classifier';
  matchedText?: string;
  confidence?: number;
  metadata?: Record<string, unknown>;
}
```

---

## License

[MIT License](LICENSE)
