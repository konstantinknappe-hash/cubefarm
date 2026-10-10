import type { AgentCli, EffortLevel, ModelCatalog, ModelOption } from './types.ts';

// Which model an agent's session asks for. The office's default model belongs to its default coding agent, and each
// worker can name their own; a model only goes to an agent that understands it (no Claude model for Codex).
// What a coding agent offers comes from the CLI or SDK itself (server/modelCatalog.ts); only Claude Code has a list of
// the office's own, for when its SDK can't be asked.

export const EFFORT_LEVELS: EffortLevel[] = ['low', 'medium', 'high', 'xhigh', 'max'];

/** Claude Code's model names and aliases. */
export const isClaudeModel = (model: string) => /^(claude|opus|sonnet|haiku|fable|default|best|opusplan)\b/i.test(model.trim());

/**
 * The model for a worker on `cli`: their own if it suits that agent, else the office default when `cli` is the
 * default agent, else `claudeDefault` for Claude Code, or '' to let any other agent use its own default.
 */
export function effectiveModel(own: string, cli: AgentCli, office: { defaultCli: AgentCli; defaultModel: string }, claudeDefault: string): string {
  const suits = (m: string) => m.trim() !== '' && (cli === 'claude') === isClaudeModel(m);
  if (suits(own)) return own.trim();
  if (cli === office.defaultCli && suits(office.defaultModel)) return office.defaultModel.trim();
  return cli === 'claude' ? claudeDefault : '';
}

/**
 * Claude Code's models when its SDK can't be asked: what `supportedModels()` of @anthropic-ai/claude-agent-sdk
 * 0.3.283 (Claude Code 2.1.296) listed. Check it against the SDK when bumping it.
 */
export const CLAUDE_MODELS = ['claude-opus-5-5', 'claude-opus-5', 'claude-fable-5-1', 'claude-sonnet-5', 'claude-haiku-4-5'];
const NO_EFFORT = new Set(['claude-haiku-4-5']);

/** The office's own Claude Code list, as a catalog. */
export function claudeFallbackCatalog(error: string | null, now = Date.now()): ModelCatalog {
  const models: ModelOption[] = CLAUDE_MODELS.map((id) => ({
    id,
    label: id,
    description: '',
    efforts: NO_EFFORT.has(id) ? [] : EFFORT_LEVELS,
    defaultEffort: null,
  }));
  return { source: 'list', models, error, fetchedAt: now };
}

/** Claude Code aliases that pick a model by themselves; accepted even when its list doesn't show them. */
const CLAUDE_ALIASES = new Set(['default', 'best', 'opusplan', 'opus', 'sonnet', 'haiku', 'fable']);

const bare = (cli: AgentCli, model: string) => {
  const m = model.trim().toLowerCase();
  return cli === 'claude' ? m.replace(/\[1m\]$/, '') : m; // Claude Code's 1M-context suffix
};

/** The catalog's entry for `model`: by id, by the full id an alias stands for, or (Claude) a dated snapshot of either. */
export function findModel(cli: AgentCli, model: string, catalog: ModelCatalog | null | undefined): ModelOption | null {
  const m = bare(cli, model);
  if (!m || !catalog) return null;
  const dated = (a: string, b: string) => a.startsWith(`${b}-`) && /^\d{8}$/.test(a.slice(b.length + 1));
  const same = (id: string | undefined) => {
    const x = id?.toLowerCase();
    return !!x && (x === m || (cli === 'claude' && (dated(m, x) || dated(x, m))));
  };
  return catalog.models.find((o) => same(o.id)) ?? catalog.models.find((o) => same(o.resolved)) ?? null;
}

/** The key a model the provider turned down is remembered under. */
export const rejectionKey = (cli: AgentCli, model: string) => `${cli}:${bare(cli, model)}`;

export type ModelProblem =
  | { kind: 'rejected'; cli: AgentCli; model: string; detail: string } // the provider refused it in a session
  | { kind: 'unavailable'; cli: AgentCli; model: string; valid: string[] }; // the CLI doesn't list it

/**
 * Why `model` can't run on `cli`, or null if it can (or nothing says otherwise: '' is the CLI's own default, and a CLI
 * that couldn't be asked isn't second-guessed).
 */
export function modelProblem(cli: AgentCli, model: string, catalog: ModelCatalog | null | undefined, rejected: Record<string, string> = {}): ModelProblem | null {
  if (!model.trim()) return null;
  const refused = rejected[rejectionKey(cli, model)];
  if (refused !== undefined) return { kind: 'rejected', cli, model: model.trim(), detail: refused };
  if (!catalog?.models.length || findModel(cli, model, catalog)) return null;
  if (cli === 'claude' && CLAUDE_ALIASES.has(bare(cli, model))) return null;
  return { kind: 'unavailable', cli, model: model.trim(), valid: catalog.models.filter((o) => !o.hidden).map((o) => o.id) };
}

/** Efforts each CLI takes when its catalog doesn't say: Codex goes up to xhigh, OpenCode gets none from the office. */
const EFFORT_FALLBACK: Record<AgentCli, EffortLevel[]> = { claude: EFFORT_LEVELS, codex: ['low', 'medium', 'high', 'xhigh'], opencode: [] };

/** The reasoning efforts `model` (or the CLI's default, '') takes on `cli`. */
export function effortsFor(cli: AgentCli, model: string, catalog: ModelCatalog | null | undefined): EffortLevel[] {
  const found = findModel(cli, model, catalog);
  return found ? found.efforts : EFFORT_FALLBACK[cli];
}

/** `effort` if the model takes it, else the nearest lower one it takes (the lowest if none is lower); '' if it takes none. */
export function fitEffort(effort: EffortLevel, supported: EffortLevel[]): EffortLevel | '' {
  if (!supported.length) return '';
  if (supported.includes(effort)) return effort;
  const rank = EFFORT_LEVELS.indexOf(effort);
  const lower = supported.filter((e) => EFFORT_LEVELS.indexOf(e) < rank);
  return lower.length ? lower.reduce((a, b) => (EFFORT_LEVELS.indexOf(b) > EFFORT_LEVELS.indexOf(a) ? b : a)) : supported[0];
}

/** The models to offer in a picker: the catalog's own (hidden ones only if chosen), with the current pick kept even if unknown. */
export function modelChoices(catalog: ModelCatalog | null | undefined, current: string): { id: string; label: string; known: boolean }[] {
  const listed = (catalog?.models ?? []).filter((o) => !o.hidden || o.id === current.trim());
  const out = listed.map((o) => ({ id: o.id, label: o.label && o.label !== o.id ? `${o.label} (${o.id})` : o.id, known: true }));
  if (current.trim() && !out.some((o) => o.id === current.trim())) out.unshift({ id: current.trim(), label: current.trim(), known: false });
  return out;
}

// What a provider says when it won't run a model. Codex with a ChatGPT login: "400 Bad Request … The 'x' model is not
// supported when using Codex with a ChatGPT account."; Claude Code: "There's an issue with the selected model (x). It
// may not exist or you may not have access to it."; APIs: model_not_found / "model … does not exist".
const REJECTION = [
  /model\b.{0,80}\bis not supported\b/i,
  /\bissue with the selected model\b/i,
  /\bmodel_not_found\b/i,
  /\bmodel\b.{0,80}\b(does not exist|not found|is not available|isn't available|unsupported|not supported|invalid)\b/i,
  /\b(unsupported|invalid|unknown) model\b/i,
];

/**
 * The line where a session's output says the provider refused `model`, or null. Screen text can still hold an older
 * session's error, so a line from it only counts when it names the model (`strict`).
 */
export function modelRejection(text: string, model: string, strict = false): string | null {
  const m = model.trim().toLowerCase();
  for (const line of text.split('\n')) {
    const l = line.trim();
    if (!l || !REJECTION.some((re) => re.test(l))) continue;
    if (strict && (!m || !l.toLowerCase().includes(m))) continue;
    if (!strict && m && !l.toLowerCase().includes(m) && !/\b400\b|bad request|model_not_found/i.test(l)) continue;
    return l.replace(/\s+/g, ' ').slice(0, 300);
  }
  return null;
}

/** A model problem in the manager's words; `t` is an i18n translator. */
export function describeModelProblem(p: ModelProblem, t: (key: 'models.problem.rejected' | 'models.problem.unavailable', params: Record<string, string>) => string, cliLabel: (cli: AgentCli) => string): string {
  if (p.kind === 'rejected') return t('models.problem.rejected', { cli: cliLabel(p.cli), model: p.model, detail: p.detail });
  return t('models.problem.unavailable', { cli: cliLabel(p.cli), model: p.model, valid: p.valid.join(', ') || '–' });
}
