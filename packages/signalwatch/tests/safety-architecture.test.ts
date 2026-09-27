import { describe, it, expect } from 'vitest';
import { createWatcher } from '../src/watcher.js';
import { Turn } from '../src/types.js';

describe('SignalWatch - Safety Architecture Guarantee', () => {
  it('never mutates the input transcript or individual turn objects', async () => {
    const watcher = createWatcher();

    const originalTranscript: Turn[] = [
      Object.freeze({ role: 'user', text: 'You are my only friend.' }),
      Object.freeze({ role: 'assistant', text: 'Understood.' }),
      Object.freeze({ role: 'user', text: 'I feel like giving up on life.' }),
    ];

    // Deep clone to compare before and after
    const snapshot = JSON.stringify(originalTranscript);

    const report = await watcher.analyze(originalTranscript);

    expect(report.flags.length).toBeGreaterThan(0);
    // Assert original transcript is 100% unaltered
    expect(JSON.stringify(originalTranscript)).toBe(snapshot);
  });
});
