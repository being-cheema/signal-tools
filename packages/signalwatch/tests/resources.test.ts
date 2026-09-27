import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getCrisisResources } from '../src/resources.js';
import { createWatcher } from '../src/watcher.js';

describe('SignalWatch - Crisis Resources & Network Isolation', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('returns well-known static crisis resources for en-US', () => {
    const resources = getCrisisResources('en-US');

    expect(resources.length).toBeGreaterThanOrEqual(2);

    const names = resources.map((r) => r.name);
    expect(names).toContain('988 Suicide & Crisis Lifeline');
    expect(names).toContain('Crisis Text Line');

    const lifeline = resources.find((r) => r.name === '988 Suicide & Crisis Lifeline');
    expect(lifeline?.contact).toContain('988');
    expect(lifeline?.available).toBe('24/7/365');
  });

  it('falls back cleanly to default en-US resources for unconfigured locale', () => {
    const resources = getCrisisResources('unknown-locale');
    expect(resources).toEqual(getCrisisResources('en-US'));
  });

  it('GUARANTEE: never triggers any network call when querying crisis resources', () => {
    // Call standalone function
    const standaloneResources = getCrisisResources('en-US');
    expect(standaloneResources.length).toBeGreaterThan(0);

    // Call through watcher instance
    const watcher = createWatcher();
    const watcherResources = watcher.getCrisisResources('en-US');
    expect(watcherResources.length).toBeGreaterThan(0);

    // Assert absolute zero network interaction
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('attaches static crisis resources to analysis report when crisis language is detected without network calls', async () => {
    const watcher = createWatcher();

    const transcript = [{ role: 'user', text: 'I feel like giving up on life.' }];

    const report = await watcher.analyze(transcript);

    expect(report.flags).toHaveLength(1);
    expect(report.flags[0].category).toBe('crisis-language');
    expect(report.crisisResources).toBeDefined();
    expect(report.crisisResources?.length).toBeGreaterThan(0);

    // Verify still zero network calls
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
