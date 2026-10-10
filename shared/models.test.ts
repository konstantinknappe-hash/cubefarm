import { describe, expect, it } from 'vitest';
import { claudeFallbackCatalog, describeModelProblem, effectiveModel, effortsFor, findModel, fitEffort, isClaudeModel, modelChoices, modelProblem, modelRejection, rejectionKey } from './models.ts';
import type { ModelCatalog } from './types.ts';

const claudeOffice = { defaultCli: 'claude' as const, defaultModel: 'claude-sonnet-5' };
const codexOffice = { defaultCli: 'codex' as const, defaultModel: 'gpt-5.6-luna' };

describe('effectiveModel', () => {
  it("uses the worker's own model when it suits their agent", () => {
    expect(effectiveModel('opus', 'claude', claudeOffice, 'claude-opus-5-5')).toBe('opus');
    expect(effectiveModel('gpt-5.5', 'codex', claudeOffice, 'claude-opus-5-5')).toBe('gpt-5.5');
  });

  it("falls back to the office default only for the office's default agent", () => {
    expect(effectiveModel('', 'claude', claudeOffice, 'claude-opus-5-5')).toBe('claude-sonnet-5');
    expect(effectiveModel('', 'codex', codexOffice, 'claude-opus-5-5')).toBe('gpt-5.6-luna');
    expect(effectiveModel('', 'claude', codexOffice, 'claude-opus-5-5')).toBe('claude-opus-5-5');
    expect(effectiveModel('', 'opencode', claudeOffice, 'claude-opus-5-5')).toBe('');
  });

  it('never hands a model to an agent that would not understand it', () => {
    expect(effectiveModel('claude-opus-5-5', 'codex', claudeOffice, 'claude-opus-5-5')).toBe('');
    expect(effectiveModel('gpt-5.5', 'claude', claudeOffice, 'claude-opus-5-5')).toBe('claude-sonnet-5');
    expect(effectiveModel('', 'codex', { defaultCli: 'codex', defaultModel: 'claude-opus-5-5' }, 'claude-opus-5-5')).toBe('');
  });

  it("knows Claude Code's names and aliases", () => {
    expect(['claude-fable-5-1', 'Opus', 'sonnet', 'haiku', 'opusplan'].every(isClaudeModel)).toBe(true);
    expect(['gpt-5.5', 'opencode/big-pickle', 'o3', 'opencode/claude-sonnet-5'].some(isClaudeModel)).toBe(false);
  });
});

const codex: ModelCatalog = {
  source: 'cli',
  error: null,
  fetchedAt: 0,
  models: [
    { id: 'gpt-5.6-luna', label: 'GPT-5.6-Luna', description: '', efforts: ['low', 'medium', 'high', 'xhigh', 'max'], defaultEffort: 'medium' },
    { id: 'gpt-5.5', label: 'GPT-5.5', description: '', efforts: ['low', 'medium', 'high', 'xhigh'], defaultEffort: 'xhigh', hidden: true },
  ],
};
const claude: ModelCatalog = {
  source: 'cli',
  error: null,
  fetchedAt: 0,
  models: [
    { id: 'opus', label: 'Opus 5.5', description: '', efforts: ['low', 'medium', 'high', 'xhigh', 'max'], defaultEffort: null, resolved: 'claude-opus-5-5' },
    { id: 'haiku', label: 'Haiku 4.5', description: '', efforts: [], defaultEffort: null, resolved: 'claude-haiku-4-5-20251001' },
  ],
};

describe('findModel', () => {
  it('finds a model by id, by the full id an alias stands for, or a dated Claude snapshot', () => {
    expect(findModel('codex', ' GPT-5.6-Luna ', codex)?.id).toBe('gpt-5.6-luna');
    expect(findModel('claude', 'claude-opus-5-5', claude)?.id).toBe('opus');
    expect(findModel('claude', 'claude-opus-5-5[1m]', claude)?.id).toBe('opus');
    expect(findModel('claude', 'claude-haiku-4-5', claude)?.id).toBe('haiku');
    expect(findModel('codex', 'gpt6-luna', codex)).toBeNull();
    expect(findModel('codex', 'gpt-5.6', codex)).toBeNull();
    expect(findModel('codex', 'gpt-5.6-luna', null)).toBeNull();
  });
});

describe('modelProblem', () => {
  it("refuses a model the coding agent doesn't list, naming the ones it does", () => {
    expect(modelProblem('codex', 'gpt6-luna', codex)).toEqual({ kind: 'unavailable', cli: 'codex', model: 'gpt6-luna', valid: ['gpt-5.6-luna'] });
  });

  it("accepts the CLI's default, listed models (hidden ones too) and Claude Code's aliases", () => {
    expect(modelProblem('codex', '', codex)).toBeNull();
    expect(modelProblem('codex', 'gpt-5.5', codex)).toBeNull();
    expect(modelProblem('claude', 'opusplan', claude)).toBeNull();
  });

  it("doesn't second-guess a CLI that couldn't be asked", () => {
    expect(modelProblem('codex', 'gpt6-luna', null)).toBeNull();
    expect(modelProblem('codex', 'gpt6-luna', { ...codex, models: [] })).toBeNull();
  });

  it('remembers a model the provider refused, even one the CLI lists', () => {
    const rejected = { [rejectionKey('codex', 'gpt-5.6-luna')]: '400 Bad Request' };
    expect(modelProblem('codex', 'GPT-5.6-luna', codex, rejected)).toEqual({ kind: 'rejected', cli: 'codex', model: 'GPT-5.6-luna', detail: '400 Bad Request' });
    expect(modelProblem('claude', 'gpt-5.6-luna', claude, rejected)?.kind).toBe('unavailable');
  });

  it('is put in words through the translator', () => {
    const t = (key: string, p: Record<string, string>) => `${key}|${Object.values(p).join('|')}`;
    expect(describeModelProblem({ kind: 'unavailable', cli: 'codex', model: 'x', valid: [] }, t, () => 'Codex')).toBe('models.problem.unavailable|Codex|x|–');
    expect(describeModelProblem({ kind: 'rejected', cli: 'codex', model: 'x', detail: 'no' }, t, () => 'Codex')).toBe('models.problem.rejected|Codex|x|no');
  });
});

describe('efforts', () => {
  it("offers what the model takes, or each agent's own range when its catalog doesn't say", () => {
    expect(effortsFor('codex', 'gpt-5.5', codex)).toEqual(['low', 'medium', 'high', 'xhigh']);
    expect(effortsFor('claude', 'claude-haiku-4-5', claude)).toEqual([]);
    expect(effortsFor('codex', '', codex)).toEqual(['low', 'medium', 'high', 'xhigh']);
    expect(effortsFor('claude', 'opus', null)).toContain('max');
    expect(effortsFor('opencode', 'opencode/big-pickle', null)).toEqual([]);
  });

  it('runs an effort the model lacks as the nearest lower one, and none for a model without efforts', () => {
    expect(fitEffort('max', ['low', 'medium', 'high', 'xhigh'])).toBe('xhigh');
    expect(fitEffort('medium', ['low', 'medium'])).toBe('medium');
    expect(fitEffort('low', ['medium', 'high'])).toBe('medium');
    expect(fitEffort('high', [])).toBe('');
  });
});

describe('modelChoices', () => {
  it("lists the CLI's own picks, keeping the current one (hidden or unknown) so an old setting still shows", () => {
    expect(modelChoices(codex, '').map((m) => m.id)).toEqual(['gpt-5.6-luna']);
    expect(modelChoices(codex, 'gpt-5.5').map((m) => m.id)).toEqual(['gpt-5.6-luna', 'gpt-5.5']);
    expect(modelChoices(codex, 'gpt6-luna')).toEqual([{ id: 'gpt6-luna', label: 'gpt6-luna', known: false }, { id: 'gpt-5.6-luna', label: 'GPT-5.6-Luna (gpt-5.6-luna)', known: true }]);
    expect(modelChoices(null, '')).toEqual([]);
  });

  it("has an office list for Claude Code with only its own names", () => {
    const list = claudeFallbackCatalog('offline', 0);
    expect(list.source).toBe('list');
    expect(list.models.every((m) => isClaudeModel(m.id))).toBe(true);
    expect(findModel('claude', 'claude-haiku-4-5', list)?.efforts).toEqual([]);
  });
});

describe('modelRejection', () => {
  it("recognises Codex's and Claude Code's refusals", () => {
    const codexSays = 'unexpected status 400 Bad Request: {"detail":"The \'gpt6-luna\' model is not supported when using Codex with a ChatGPT account."}';
    expect(modelRejection(`some output\n${codexSays}`, 'gpt6-luna')).toContain('not supported');
    expect(modelRejection("There's an issue with the selected model (claude-x). It may not exist or you may not have access to it.", 'claude-x')).toContain('selected model');
    expect(modelRejection('API Error: 400 {"error":{"type":"model_not_found"}}', 'gpt-y')).toContain('model_not_found');
  });

  it("ignores other failures, and screen lines that don't name the model", () => {
    expect(modelRejection('Codex exited with code 1 before finishing.', 'gpt-5.5')).toBeNull();
    expect(modelRejection('rate limit reached for model gpt-5.5', 'gpt-5.5')).toBeNull();
    expect(modelRejection("The 'gpt6-luna' model is not supported", 'gpt-5.6-luna', true)).toBeNull();
    expect(modelRejection("The 'gpt-5.6-luna' model is not supported", 'gpt-5.6-luna', true)).not.toBeNull();
  });
});
