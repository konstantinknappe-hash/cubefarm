import { describe, expect, it } from 'vitest';
import { createDemoBackend } from './demo.ts';
import { Swarm } from './swarm.ts';

type Internals = {
  state: { agents: { id: string; repoId: string; role: string; status: string; task: string | null; issueNumber: number | null; issueTitle: string | null }[] };
};

describe('manager work queue controls', () => {
  it('returns an active issue and prevents another agent taking it until the old session exits', async () => {
    const swarm = new Swarm(createDemoBackend());
    const repo = await swarm.connectRepo('demo-co/pixel-todo');
    await swarm.syncRepo(repo.id);
    const issue = swarm.snapshot().repos.find((r) => r.id === repo.id)?.issues[0];
    expect(issue).toBeDefined();
    const team = (swarm as unknown as Internals).state.agents.filter((a) => a.repoId === repo.id && a.role !== 'ceo');
    const original = team[0];
    const other = swarm.hireAgent(repo.id, {});
    expect(original).toBeDefined();
    Object.assign(original, { status: 'working', task: 'issue', issueNumber: issue!.number, issueTitle: issue!.title });

    swarm.returnToQueue(original.id);

    expect(original.status).toBe('stopped');
    await expect(swarm.assign(other.id, issue!.number)).rejects.toThrow(/still owns/);
  });
});
