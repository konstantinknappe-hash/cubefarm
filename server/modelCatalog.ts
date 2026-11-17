import os from 'node:os';
import { query, type ModelInfo } from '@anthropic-ai/claude-agent-sdk';
import type { AgentCli, EffortLevel, ModelCatalog, ModelOption } from '../shared/types.ts';
import { claudeFallbackCatalog, EFFORT_LEVELS } from '../shared/models.ts';
import { commandFor } from './clis.ts';
import { run } from './exec.ts';

// The models each coding agent offers here, asked of the agent itself: Claude Code through its SDK's
// supportedModels() (no prompt is sent, so it costs nothing), Codex through `codex debug models` (its catalog for the
// signed-in account, or the one built into the binary when that can't be fetched), OpenCode through `opencode models`.

const TIMEOUT_MS = 30_000;

const efforts = (xs: unknown): EffortLevel[] => (Array.isArray(xs) ? EFFORT_LEVELS.filter((e) => xs.includes(e)) : []);
const effort = (x: unknown): EffortLevel | null => (EFFORT_LEVELS.includes(x as EffortLevel) ? (x as EffortLevel) : null);
const message = (err: unknown) => String((err as Error)?.message ?? err).split('\n')[0].slice(0, 200);

/** Claude Code's supportedModels() as options. */
export function claudeOptions(models: ModelInfo[]): ModelOption[] {
  return models
    .filter((m) => typeof m.value === 'string' && m.value)
    .map((m) => ({
      id: m.value,
      label: m.displayName || m.value,
      description: m.description ?? '',
      efforts: m.supportsEffort === false ? [] : efforts(m.supportedEffortLevels),
      defaultEffort: null,
      ...(m.resolvedModel && m.resolvedModel !== m.value ? { resolved: m.resolvedModel } : {}),
    }));
}

/** `codex debug models` output as options (efforts beyond the office's, like `ultra`, are left out). */
export function codexOptions(json: string): ModelOption[] {
  const data = JSON.parse(json) as { models?: unknown };
  const list = Array.isArray(data) ? data : Array.isArray(data?.models) ? data.models : [];
  return (list as Record<string, unknown>[])
    .filter((m) => typeof m?.slug === 'string' && m.slug && m.supported_in_api !== false)
    .map((m) => ({
      id: String(m.slug),
      label: typeof m.display_name === 'string' && m.display_name ? m.display_name : String(m.slug),
      description: typeof m.description === 'string' ? m.description : '',
      efforts: efforts(Array.isArray(m.supported_reasoning_levels) ? m.supported_reasoning_levels.map((l: { effort?: unknown }) => l?.effort) : []),
      defaultEffort: effort(m.default_reasoning_level),
      ...(m.visibility === 'hide' ? { hidden: true } : {}),
    }));
}

/** `opencode models` output (one `provider/model` per line) as options. OpenCode gets no effort from the office. */
export function opencodeOptions(text: string): ModelOption[] {
  const ids = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => /^[\w.-]+\/\S+$/.test(l));
  return [...new Set(ids)].map((id) => ({ id, label: id, description: '', efforts: [], defaultEffort: null }));
}

async function claudeCatalog(): Promise<ModelCatalog> {
  // Like an agent's session: no API keys or settings inherited from a parent Claude Code.
  const env: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(process.env)) if (!/^(ANTHROPIC_|CLAUDE)/i.test(k) || k === 'CLAUDE_CONFIG_DIR') env[k] = v;
  const never: AsyncIterable<never> = { [Symbol.asyncIterator]: () => ({ next: () => new Promise(() => {}) }) };
  const q = query({ prompt: never, options: { cwd: os.tmpdir(), env, persistSession: false, settingSources: ['user'] } });
  let timer: NodeJS.Timeout | undefined;
  try {
    const timeout = new Promise<never>((_, reject) => (timer = setTimeout(() => reject(new Error('timed out')), TIMEOUT_MS)));
    const models = claudeOptions(await Promise.race([q.supportedModels(), timeout]));
    return models.length ? { source: 'cli', models, error: null, fetchedAt: Date.now() } : claudeFallbackCatalog('Claude Code listed no models');
  } catch (err) {
    return claudeFallbackCatalog(message(err));
  } finally {
    clearTimeout(timer);
    q.close();
  }
}

async function codexCatalog(): Promise<ModelCatalog> {
  const cmd = commandFor('codex');
  if (!cmd) return { source: 'cli', models: [], error: 'Codex is not installed', fetchedAt: Date.now() };
  try {
    return { source: 'cli', models: codexOptions(await run(cmd.file, [...cmd.args, 'debug', 'models'], { timeoutMs: TIMEOUT_MS })), error: null, fetchedAt: Date.now() };
  } catch (err) {
    try {
      const models = codexOptions(await run(cmd.file, [...cmd.args, 'debug', 'models', '--bundled'], { timeoutMs: TIMEOUT_MS }));
      return { source: 'bundled', models, error: message(err), fetchedAt: Date.now() };
    } catch {
      return { source: 'cli', models: [], error: message(err), fetchedAt: Date.now() };
    }
  }
}

async function opencodeCatalog(): Promise<ModelCatalog> {
  const cmd = commandFor('opencode');
  if (!cmd) return { source: 'cli', models: [], error: 'OpenCode is not installed', fetchedAt: Date.now() };
  try {
    return { source: 'cli', models: opencodeOptions(await run(cmd.file, [...cmd.args, 'models'], { timeoutMs: TIMEOUT_MS })), error: null, fetchedAt: Date.now() };
  } catch (err) {
    return { source: 'cli', models: [], error: message(err), fetchedAt: Date.now() };
  }
}

/** The models `cli` offers on this machine. Never throws: a failure is the catalog's `error`. */
export function listModels(cli: AgentCli): Promise<ModelCatalog> {
  return cli === 'claude' ? claudeCatalog() : cli === 'codex' ? codexCatalog() : opencodeCatalog();
}
