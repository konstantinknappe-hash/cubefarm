import { describe, expect, it } from 'vitest';
import { claudeOptions, codexOptions, opencodeOptions } from './modelCatalog.ts';

// The shapes below are trimmed from what the CLIs printed: Claude Agent SDK 0.3.283's supportedModels(),
// `codex debug models` (codex-cli 0.153.4) and `opencode models` (1.2.15).

describe("Claude Code's models", () => {
  it('keeps the alias, its full id and the efforts it takes', () => {
    const options = claudeOptions([
      { value: 'opus', resolvedModel: 'claude-opus-5-5', displayName: 'Opus 5.5', description: 'For complex work', supportsEffort: true, supportedEffortLevels: ['low', 'medium', 'high', 'xhigh', 'max'] },
      { value: 'haiku', resolvedModel: 'claude-haiku-4-5-20251001', displayName: 'Haiku 4.5', description: 'Fastest' },
      { value: 'claude-opus-4-6', resolvedModel: 'claude-opus-4-6', displayName: 'Opus 4.6', description: '', supportsEffort: true, supportedEffortLevels: ['low', 'medium', 'high', 'max'] },
    ]);
    expect(options).toEqual([
      { id: 'opus', label: 'Opus 5.5', description: 'For complex work', efforts: ['low', 'medium', 'high', 'xhigh', 'max'], defaultEffort: null, resolved: 'claude-opus-5-5' },
      { id: 'haiku', label: 'Haiku 4.5', description: 'Fastest', efforts: [], defaultEffort: null, resolved: 'claude-haiku-4-5-20251001' },
      { id: 'claude-opus-4-6', label: 'Opus 4.6', description: '', efforts: ['low', 'medium', 'high', 'max'], defaultEffort: null },
    ]);
  });
});

describe("Codex's models", () => {
  const json = JSON.stringify({
    models: [
      {
        slug: 'gpt-5.6-luna',
        display_name: 'GPT-5.6-Luna',
        description: 'Fast',
        default_reasoning_level: 'medium',
        supported_reasoning_levels: [{ effort: 'low' }, { effort: 'medium' }, { effort: 'high' }, { effort: 'xhigh' }, { effort: 'max' }, { effort: 'ultra' }],
        visibility: 'list',
        supported_in_api: true,
      },
      { slug: 'gpt-5.5', display_name: 'GPT-5.5', supported_reasoning_levels: [{ effort: 'low' }, { effort: 'xhigh' }], default_reasoning_level: 'xhigh', visibility: 'hide', supported_in_api: true },
      { slug: 'internal-only', supported_in_api: false },
      { display_name: 'no slug' },
    ],
  });

  it('lists each usable model with its efforts (the office has no `ultra`), hidden ones marked', () => {
    expect(codexOptions(json)).toEqual([
      { id: 'gpt-5.6-luna', label: 'GPT-5.6-Luna', description: 'Fast', efforts: ['low', 'medium', 'high', 'xhigh', 'max'], defaultEffort: 'medium' },
      { id: 'gpt-5.5', label: 'GPT-5.5', description: '', efforts: ['low', 'xhigh'], defaultEffort: 'xhigh', hidden: true },
    ]);
  });

  it('throws on output that is not its JSON, so the caller falls back', () => {
    expect(() => codexOptions('error: not logged in')).toThrow();
    expect(codexOptions('{}')).toEqual([]);
  });
});

describe("OpenCode's models", () => {
  it('takes the provider/model lines and nothing else', () => {
    expect(opencodeOptions('opencode/big-pickle\r\nollama/qwen2.5:14b\n\nWarning: something\nopencode/big-pickle\n').map((m) => m.id)).toEqual(['opencode/big-pickle', 'ollama/qwen2.5:14b']);
  });
});
