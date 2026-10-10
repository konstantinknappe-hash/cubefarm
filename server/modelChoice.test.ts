import fs from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { STATE_FILE } from './config.ts';
import { createDemoBackend } from './demo.ts';
import { Swarm } from './swarm.ts';
import type { SessionResult } from './agentRunner.ts';
import type { AgentCli, CliView } from '../shared/types.ts';

// Models come from what each coding agent lists: a model it doesn't offer can't be picked, an agent left on one (from
// before, or after its provider refused it) gets no work instead of starting into the same error, and nothing picks
// another model by itself.
type Agent = { id: string; model: string; cli: AgentCli | ''; role: string; status: string; endedAt: number | null };
type Internals = {
  clis: CliView[];
  state: { agents: Agent[]; rejectedModels: Record<string, string>; settings: { defaultCli: AgentCli; defaultModel: string } };
  isFree(a: Agent): boolean;
  noteRejection(a: Agent, used: { cli: AgentCli; model: string }, result: SessionResult): void;
  writeState(): Promise<void>;
  toast(level: string, text: string): void;
};

async function office() {
  const backend = createDemoBackend();
  const swarm = new Swarm(backend);
  const internals = swarm as unknown as Internals;
  internals.clis = await backend.detectClis();
  await swarm.refreshModels();
  await swarm.connectRepo('demo-co/pixel-todo', {});
  const toasts: string[] = [];
  internals.toast = (_level, text) => void toasts.push(text);
  const worker = internals.state.agents.find((a) => a.role !== 'ceo')!;
  worker.cli = 'codex';
  return { swarm, internals, worker, toasts };
}

const refused: SessionResult = {
  ok: false,
  text: '',
  costUsd: 0,
  turns: 0,
  errors: ['unexpected status 400 Bad Request: {"detail":"The \'gpt-5.6-luna\' model is not supported when using Codex with a ChatGPT account."}'],
};

describe('picking a model', () => {
  it("refuses one the coding agent doesn't offer, saying which it does", async () => {
    const { swarm, worker } = await office();
    expect(() => swarm.updateAgent(worker.id, { model: 'gpt6-luna' })).toThrow(/gpt6-luna.*gpt-5\.6-luna/s);
    expect(worker.model).toBe('');
    worker.cli = '';
    expect(() => swarm.updateAgent(worker.id, { cli: 'codex', model: 'gpt6-luna' })).toThrow();
    expect(worker.cli).toBe(''); // nothing of a refused change sticks
    swarm.updateAgent(worker.id, { cli: 'codex', model: 'gpt-5.6-sol' });
    expect(worker.model).toBe('gpt-5.6-sol');
  });

  it('checks the office default against the default coding agent', async () => {
    const { swarm, internals } = await office();
    swarm.updateSettings({ defaultCli: 'codex' });
    expect(() => swarm.updateSettings({ defaultModel: 'gpt6-luna' })).toThrow();
    expect(() => swarm.updateSettings({ defaultCli: 'claude', defaultModel: 'gpt-5.6-terra' })).toThrow();
    expect(internals.state.settings.defaultCli).toBe('codex');
    swarm.updateSettings({ defaultModel: 'gpt-5.6-terra' });
    expect(internals.state.settings.defaultModel).toBe('gpt-5.6-terra');
  });

  it('lists each coding agent with its catalog', async () => {
    const { internals } = await office();
    expect(internals.clis.find((c) => c.id === 'codex')?.catalog?.models.some((m) => m.id === 'gpt-5.6-luna')).toBe(true);
  });
});

describe('an agent on a model that cannot run', () => {
  it('keeps an old setting the CLI no longer offers, but gets no work and the manager is told once', async () => {
    const { internals, worker, toasts } = await office();
    worker.model = 'gpt6-luna'; // saved before the office checked models
    expect(internals.isFree(worker)).toBe(false);
    expect(internals.isFree(worker)).toBe(false);
    expect(toasts).toHaveLength(1);
    expect(toasts[0]).toContain('gpt6-luna');
    expect(worker.model).toBe('gpt6-luna'); // never switched to another model by itself
  });

  it('is not retried after the provider refused the model, until the manager picks it again', async () => {
    const { swarm, internals, worker } = await office();
    swarm.updateAgent(worker.id, { model: 'gpt-5.6-luna' });
    Object.assign(worker, { status: 'error', endedAt: 0 }); // long past the error cooldown
    expect(internals.isFree(worker)).toBe(true);

    internals.noteRejection(worker, { cli: 'codex', model: 'gpt-5.6-luna' }, refused);
    expect(internals.state.rejectedModels['codex:gpt-5.6-luna']).toContain('not supported');
    expect(internals.isFree(worker)).toBe(false);
    expect(swarm.snapshot().clis.find((c) => c.id === 'codex')?.rejected).toHaveProperty(['codex:gpt-5.6-luna']);

    await internals.writeState();
    expect(JSON.parse(await fs.readFile(STATE_FILE, 'utf8')).rejectedModels).toHaveProperty(['codex:gpt-5.6-luna']);

    expect(() => swarm.updateAgent(worker.id, { model: 'gpt-5.6-luna' }, 'ceo')).toThrow(/refused|abgelehnt/); // only the manager's pick retries it
    expect(internals.isFree(worker)).toBe(false);

    swarm.retryModel('codex', 'gpt-5.6-luna');
    expect(internals.isFree(worker)).toBe(true);
  });

  it("is tried again when the manager picks the refused model again", async () => {
    const { swarm, internals, worker } = await office();
    internals.noteRejection(worker, { cli: 'codex', model: 'gpt-5.6-luna' }, refused);
    swarm.updateAgent(worker.id, { model: 'gpt-5.6-luna' });
    expect(internals.state.rejectedModels).toEqual({});
  });

  it('ignores failures that are not about the model', async () => {
    const { internals, worker } = await office();
    internals.noteRejection(worker, { cli: 'codex', model: 'gpt-5.6-luna' }, { ...refused, errors: ['Codex exited with code 1 before finishing.'] });
    expect(internals.state.rejectedModels).toEqual({});
  });
});
