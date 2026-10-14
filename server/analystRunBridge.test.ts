import { describe, expect, it } from 'vitest';
import { AnalystRunCache, AnalystRunInputError, parseAnalystRunRequest } from './analystRunBridge.ts';

const validRequest = (overrides: Record<string, unknown> = {}) => ({
  request_id: 'run-1',
  task_id: 'task-1',
  session_class: 'analyst',
  session_visibility: 'visible',
  protected_session_classes: ['coding', 'qa', 'ceo'],
  max_parallel_analyst_sessions: 1,
  cli: 'codex_cli',
  model: 'default',
  effort: 'low',
  timeout_seconds: 240,
  response_format: 'json',
  permissions: { filesystem: 'none', repository: 'none', orders: 'none', web_tools: ['WebSearch'] },
  prompt: 'Return a structured result.',
  ...overrides,
});

describe('MoneyPrint analyst run bridge contract', () => {
  it('accepts a visible read-only run and bounds its timeout', () => {
    expect(parseAnalystRunRequest(validRequest(), 'run-1')).toEqual({
      requestId: 'run-1', cli: 'codex_cli', model: undefined, effort: 'low', maxParallel: 1,
      timeoutMs: 240_000, prompt: 'Return a structured result.',
    });
    expect(parseAnalystRunRequest(validRequest({ timeout_seconds: 9000 }), 'run-1').timeoutMs).toBe(900_000);
  });

  it('rejects mismatched idempotency keys and any order or file access', () => {
    expect(() => parseAnalystRunRequest(validRequest(), 'other')).toThrow(AnalystRunInputError);
    expect(() => parseAnalystRunRequest(validRequest({ permissions: { filesystem: 'write', repository: 'none', orders: 'none', web_tools: [] } }), 'run-1')).toThrow(AnalystRunInputError);
    expect(() => parseAnalystRunRequest(validRequest({ permissions: { filesystem: 'none', repository: 'none', orders: 'submit', web_tools: [] } }), 'run-1')).toThrow(AnalystRunInputError);
  });

  it('reuses concurrent and recently completed results for the same request ID', async () => {
    const cache = new AnalystRunCache<string>();
    let starts = 0;
    let release!: (value: string) => void;
    const start = () => {
      starts += 1;
      return new Promise<string>((resolve) => { release = resolve; });
    };
    const first = cache.run('same', start);
    const retry = cache.run('same', start);
    expect(starts).toBe(0); // starts on the next microtask
    await Promise.resolve();
    expect(starts).toBe(1);
    release('done');
    await expect(Promise.all([first, retry])).resolves.toEqual(['done', 'done']);
    await expect(cache.run('same', start)).resolves.toBe('done');
    expect(starts).toBe(1);
  });

  it('allows a failed request to be retried', async () => {
    const cache = new AnalystRunCache<string>();
    await expect(cache.run('retry', async () => { throw new Error('failed'); })).rejects.toThrow('failed');
    await expect(cache.run('retry', async () => 'ok')).resolves.toBe('ok');
  });
});
