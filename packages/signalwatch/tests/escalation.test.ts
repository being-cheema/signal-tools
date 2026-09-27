import { describe, it, expect } from 'vitest';
import { createWatcher } from '../src/watcher.js';
import { Turn } from '../src/types.js';

describe('SignalWatch - Multi-turn Escalation Tracking', () => {
  it('does not trigger escalation for a single isolated turn', async () => {
    const watcher = createWatcher();

    const transcript: Turn[] = [
      { role: 'user', text: 'Sentence one.' },
      { role: 'user', text: 'You are my only friend.' },
      { role: 'assistant', text: 'I am an AI assistant.' },
    ];

    const report = await watcher.analyze(transcript);

    expect(report.flags).toHaveLength(1);
    expect(report.flags[0].severity).toBe('low');
    expect(report.escalationDetected).toBe(false);
    expect(report.overallSeverity).toBe('low');
  });

  it('escalates to medium severity upon second recurrence across turns', async () => {
    const watcher = createWatcher();

    const transcript: Turn[] = [
      { role: 'user', text: 'You are my only friend.' },
      { role: 'assistant', text: 'I am here to chat.' },
      { role: 'user', text: 'Talking about mundane topics.' },
      { role: 'assistant', text: 'Understood.' },
      { role: 'user', text: 'I cannot live without you.' },
    ];

    const report = await watcher.analyze(transcript);

    expect(report.flags).toHaveLength(2);
    expect(report.escalationDetected).toBe(true);
    expect(report.flags[0].severity).toBe('low');
    expect(report.flags[1].severity).toBe('medium');
    expect(report.overallSeverity).toBe('medium');
  });

  it('escalates to high or critical when pattern repeats across 3 or more turns', async () => {
    const watcher = createWatcher();

    const transcript: Turn[] = [
      { role: 'user', text: 'Turn 0: You are my only friend.' },
      { role: 'assistant', text: 'Turn 1: Response.' },
      { role: 'user', text: 'Turn 2: I cannot live without you.' },
      { role: 'assistant', text: 'Turn 3: Response.' },
      { role: 'user', text: "Turn 4: I don't need real people." },
    ];

    const report = await watcher.analyze(transcript);

    expect(report.flags).toHaveLength(3);
    expect(report.escalationDetected).toBe(true);

    const severities = report.flags.map((f) => f.severity);
    expect(severities).toEqual(['low', 'high', 'critical']);
    expect(report.overallSeverity).toBe('critical');
  });

  it('accelerates escalation when matches occur in rapid succession', async () => {
    const watcher = createWatcher();

    // Occurrences in turns 0 and 1 (distance 1)
    const transcript: Turn[] = [
      { role: 'user', text: 'You are my only friend.' },
      { role: 'user', text: 'I cannot live without you.' },
    ];

    const report = await watcher.analyze(transcript);

    expect(report.flags).toHaveLength(2);
    expect(report.escalationDetected).toBe(true);
    // Rapid succession triggers 'high' severity for the second turn
    expect(report.flags[1].severity).toBe('high');
    expect(report.overallSeverity).toBe('high');
  });
});
