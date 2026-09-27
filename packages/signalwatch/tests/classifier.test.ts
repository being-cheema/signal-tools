import { describe, it, expect, vi } from 'vitest';
import { createWatcher } from '../src/watcher.js';
import { Turn, ClassifierClassification } from '../src/types.js';

describe('SignalWatch - Classifier Hook Integration', () => {
  it('calls the classifier hook with turn text and context', async () => {
    const mockClassifier = vi.fn(async (text, _context) => {
      if (text.includes('classified-trigger')) {
        return [
          {
            category: 'isolation-encouragement',
            confidence: 0.95,
            severity: 'high',
            metadata: { model: 'mock-llm-v1' },
          } satisfies ClassifierClassification,
        ];
      }
      return [];
    });

    const watcher = createWatcher({
      classifier: mockClassifier,
    });

    const transcript: Turn[] = [
      { role: 'user', text: 'First ordinary turn.' },
      { role: 'assistant', text: 'This turn has classified-trigger.' },
    ];

    const report = await watcher.analyze(transcript);

    expect(mockClassifier).toHaveBeenCalledTimes(2);
    expect(mockClassifier).toHaveBeenNthCalledWith(
      1,
      'First ordinary turn.',
      expect.objectContaining({
        turnIndex: 0,
        role: 'user',
        transcript,
      }),
    );

    expect(report.flags).toHaveLength(1);
    expect(report.flags[0]).toMatchObject({
      category: 'isolation-encouragement',
      source: 'classifier',
      confidence: 0.95,
      severity: 'high',
      turnIndex: 1,
      metadata: { model: 'mock-llm-v1' },
    });
  });

  it('filters out classifications below confidence threshold', async () => {
    const watcher = createWatcher({
      classifierThreshold: 0.7,
      classifier: async () => [
        {
          category: 'crisis-language',
          confidence: 0.4, // below 0.7
          severity: 'critical',
        },
      ],
    });

    const transcript: Turn[] = [{ role: 'user', text: 'Ambiguous phrase.' }];
    const report = await watcher.analyze(transcript);

    expect(report.flags).toHaveLength(0);
  });

  it('coexists with regex pattern detection in the same analysis', async () => {
    const watcher = createWatcher({
      classifier: async (text) => {
        if (text.includes('ml-signal')) {
          return [
            {
              category: 'reality-testing-erosion',
              confidence: 0.85,
              severity: 'medium',
            },
          ];
        }
        return [];
      },
    });

    const transcript: Turn[] = [
      // Regex pattern match
      { role: 'user', text: 'You are my only friend.' },
      // Classifier hook match
      { role: 'assistant', text: 'Processing ml-signal query.' },
    ];

    const report = await watcher.analyze(transcript);

    expect(report.flags).toHaveLength(2);
    expect(report.flags[0].source).toBe('pattern');
    expect(report.flags[1].source).toBe('classifier');
  });

  it('gracefully handles classifier rejection or throwing without failing analysis', async () => {
    const watcher = createWatcher({
      classifier: async () => {
        throw new Error('Upstream LLM timeout');
      },
    });

    const transcript: Turn[] = [{ role: 'user', text: 'You are my only friend.' }];

    // Should not throw, should continue and retain pattern flag
    const report = await watcher.analyze(transcript);
    expect(report.flags).toHaveLength(1);
    expect(report.flags[0].source).toBe('pattern');
  });
});
