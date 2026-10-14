/** Validate and deduplicate MoneyPrint's synchronous visible analyst-run requests. */

export type AnalystRunCli = 'codex_cli' | 'claude_cli';

export interface AnalystRunRequest {
  requestId: string;
  cli: AnalystRunCli;
  model?: string;
  effort?: 'low' | 'medium' | 'high' | 'xhigh';
  maxParallel: number;
  timeoutMs: number;
  prompt: string;
}

export class AnalystRunInputError extends Error {}

export function parseAnalystRunRequest(body: unknown, idempotencyKey: string | undefined): AnalystRunRequest {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new AnalystRunInputError('A JSON object is required.');
  const value = body as Record<string, unknown>;
  const requestId = typeof value.request_id === 'string' ? value.request_id.trim() : '';
  if (!requestId || requestId.length > 200 || requestId !== idempotencyKey) {
    throw new AnalystRunInputError('request_id must match the Idempotency-Key header.');
  }
  if (value.session_class !== 'analyst' || value.session_visibility !== 'visible') {
    throw new AnalystRunInputError('Only visible analyst sessions are supported.');
  }
  if (value.response_format !== 'json') throw new AnalystRunInputError('Only structured JSON responses are supported.');
  const protectedClasses = value.protected_session_classes;
  if (!Array.isArray(protectedClasses) || !['coding', 'qa', 'ceo'].every((name) => protectedClasses.includes(name))) {
    throw new AnalystRunInputError('Coding, QA, and CEO sessions must remain protected.');
  }
  if (value.cli !== 'codex_cli' && value.cli !== 'claude_cli') {
    throw new AnalystRunInputError('cli must be codex_cli or claude_cli.');
  }
  if (typeof value.prompt !== 'string' || !value.prompt.trim() || value.prompt.length > 50_000) {
    throw new AnalystRunInputError('prompt must contain 1–50000 characters.');
  }
  const permissions = value.permissions;
  if (!permissions || typeof permissions !== 'object' || Array.isArray(permissions)) {
    throw new AnalystRunInputError('Read-only permissions are required.');
  }
  const access = permissions as Record<string, unknown>;
  if (access.filesystem !== 'none' || access.repository !== 'none' || access.orders !== 'none') {
    throw new AnalystRunInputError('Analyst runs cannot access files, repositories, or orders.');
  }
  const webTools = access.web_tools;
  if (!Array.isArray(webTools) || webTools.some((tool) => tool !== 'WebSearch' && tool !== 'WebFetch')) {
    throw new AnalystRunInputError('Only WebSearch and WebFetch can be enabled.');
  }
  const parallel = Number(value.max_parallel_analyst_sessions);
  if (!Number.isInteger(parallel) || parallel < 1 || parallel > 2) {
    throw new AnalystRunInputError('max_parallel_analyst_sessions must be 1 or 2.');
  }
  const timeout = Number(value.timeout_seconds);
  const timeoutMs = Number.isFinite(timeout) ? Math.max(10_000, Math.min(timeout * 1_000, 900_000)) : 120_000;
  const effort = ['low', 'medium', 'high', 'xhigh'].includes(String(value.effort))
    ? value.effort as AnalystRunRequest['effort']
    : undefined;
  const model = typeof value.model === 'string' && value.model !== 'default' ? value.model.slice(0, 100) : undefined;
  return { requestId, cli: value.cli, model, effort, maxParallel: parallel, timeoutMs, prompt: value.prompt };
}

/** Keep in-flight and completed responses briefly so MoneyPrint retries cannot start duplicate sessions. */
export class AnalystRunCache<T> {
  private readonly entries = new Map<string, { promise: Promise<T>; expiresAt: number; settled: boolean }>();

  constructor(private readonly ttlMs = 15 * 60_000, private readonly maxEntries = 128) {}

  get activeCount(): number {
    return [...this.entries.values()].filter((entry) => !entry.settled).length;
  }

  has(requestId: string): boolean {
    this.prune();
    return this.entries.has(requestId);
  }

  run(requestId: string, start: () => Promise<T>): Promise<T> {
    this.prune();
    const current = this.entries.get(requestId);
    if (current) return current.promise;
    const entry = { promise: Promise.resolve().then(start), expiresAt: Date.now() + this.ttlMs, settled: false };
    this.entries.set(requestId, entry);
    void entry.promise.then(
      () => { entry.settled = true; },
      () => { if (this.entries.get(requestId) === entry) this.entries.delete(requestId); },
    );
    this.prune();
    return entry.promise;
  }

  private prune() {
    const now = Date.now();
    for (const [id, entry] of this.entries) if (entry.settled && entry.expiresAt <= now) this.entries.delete(id);
    while (this.entries.size > this.maxEntries) {
      const oldest = [...this.entries].find(([, entry]) => entry.settled);
      if (!oldest) break;
      this.entries.delete(oldest[0]);
    }
  }
}
