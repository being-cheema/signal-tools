import { describe, it, expect } from 'vitest';
import { createWatcher } from '../src/watcher.js';
import { Turn } from '../src/types.js';

describe('SignalWatch - Custom Pattern Merging & Overrides', () => {
  it('merges custom patterns with existing built-in patterns by default', async () => {
    const watcher = createWatcher({
      customPatterns: [
        {
          category: 'emotional-dependency-escalation',
          patterns: [/custom test token alpha/i],
        },
      ],
    });

    const transcript: Turn[] = [
      // Built-in pattern match
      { role: 'user', text: 'You are my only friend.' },
      // Custom pattern match
      { role: 'user', text: 'Here is custom test token alpha in a sentence.' },
    ];

    const report = await watcher.analyze(transcript);

    expect(report.flags).toHaveLength(2);
    expect(report.flags[0].matchedText).toMatch(/only friend/i);
    expect(report.flags[1].matchedText).toMatch(/custom test token alpha/i);
  });

  it('replaces built-in patterns entirely when replace: true is specified', async () => {
    const watcher = createWatcher({
      customPatterns: [
        {
          category: 'emotional-dependency-escalation',
          patterns: [/strictly replaced token/i],
          replace: true,
        },
      ],
    });

    const transcript: Turn[] = [
      // Built-in should NOT match because it was replaced
      { role: 'user', text: 'You are my only friend.' },
      // Custom should match
      { role: 'user', text: 'This text contains strictly replaced token here.' },
    ];

    const report = await watcher.analyze(transcript);

    expect(report.flags).toHaveLength(1);
    expect(report.flags[0].matchedText).toBe('strictly replaced token');
  });

  it('supports developer-defined novel categories', async () => {
    const watcher = createWatcher({
      customPatterns: [
        {
          category: 'financial-advice-disclaimer',
          patterns: [/guaranteed stock returns/i],
        },
      ],
    });

    const transcript: Turn[] = [
      {
        role: 'assistant',
        text: 'This investment offers guaranteed stock returns of 500%.',
      },
    ];

    const report = await watcher.analyze(transcript);

    expect(report.flags).toHaveLength(1);
    expect(report.flags[0]).toMatchObject({
      category: 'financial-advice-disclaimer',
      source: 'pattern',
      turnIndex: 0,
      matchedText: 'guaranteed stock returns',
    });
  });
});
