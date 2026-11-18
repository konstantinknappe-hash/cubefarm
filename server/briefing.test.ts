import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { BriefingView } from '../shared/briefing.ts';
import { BriefingService, briefingConfig } from './briefing.ts';

describe('briefingConfig', () => {
  it('derives the URL from the wallboard and refuses credentials', () => {
    expect(briefingConfig({ MONEYPRINT_WALLBOARD_URL: 'http://127.0.0.1:8765/wallboard.json?x=1' }).url).toBe('http://127.0.0.1:8765/briefing.json');
    expect(briefingConfig({ MONEYPRINT_BRIEFING_URL: 'http://u:p@host/briefing.json' }).url).toBeNull();
    expect(briefingConfig({ MONEYPRINT_BRIEFING_URL: 'file:///etc/passwd' }).url).toBeNull();
    expect(briefingConfig({ CUBEFARM_BRIEFING_POLL_MS: '1' }).pollMs).toBe(15_000);
  });
});

describe('BriefingService', () => {
  it('writes a question into the inbox and lists it until MoneyPrint does', async () => {
    const inbox = await fs.mkdtemp(path.join(os.tmpdir(), 'briefing-inbox-'));
    let body = { schema: 'moneyprint.briefing/v1', inquiries: [] as unknown[] };
    const views: BriefingView[] = [];
    const service = new BriefingService({
      config: { url: 'http://127.0.0.1:1/briefing.json', token: 'secret', inbox, pollMs: 60_000 },
      demo: false,
      changed: (v) => views.push(v),
      log: () => undefined,
      fetch: async (_url, init) => {
        expect(init.headers.authorization).toBe('Bearer secret');
        return { ok: true, status: 200, text: async () => JSON.stringify(body) };
      },
    });
    await service.poll();
    expect(service.current().state).toBe('live');
    const asked = await service.ask('  Wann könnte ich in Silber einsteigen? ');
    const files = (await fs.readdir(inbox)).filter((f) => f.endsWith('.json'));
    expect(files).toEqual([`${asked.id}.json`]);
    const written = JSON.parse(await fs.readFile(path.join(inbox, files[0]), 'utf8'));
    expect(written).toMatchObject({ id: asked.id, question: 'Wann könnte ich in Silber einsteigen?', asked_by: 'manager' });
    expect(service.current().inquiries[0].status).toBe('sent');

    body = { schema: 'moneyprint.briefing/v1', inquiries: [{ id: asked.id, question: written.question, status: 'queued', asked_at: written.asked_at }] };
    await service.poll();
    expect(service.current().inquiries.map((i) => i.status)).toEqual(['queued']);
    service.stop();
    await expect(service.ask('')).rejects.toMatchObject({ status: 400 });
    await fs.rm(inbox, { recursive: true, force: true });
  });

  it('refuses questions without an inbox and keeps the last view when a read fails', async () => {
    let fail = false;
    const service = new BriefingService({
      config: { url: 'http://127.0.0.1:1/briefing.json', token: null, inbox: null, pollMs: 60_000 },
      demo: false,
      changed: () => undefined,
      log: () => undefined,
      fetch: async () => {
        if (fail) throw new Error('fetch failed');
        return { ok: true, status: 200, text: async () => JSON.stringify({ schema: 'moneyprint.briefing/v1', briefing: { headline: 'A' } }) };
      },
    });
    await service.poll();
    fail = true;
    await service.poll();
    service.stop();
    expect(service.current().state).toBe('stale');
    expect(service.current().briefing?.headline).toBe('A');
    await expect(service.ask('Frage')).rejects.toMatchObject({ status: 503 });
  });

  it('answers in the demo by itself, marked as a mock', async () => {
    let now = 1_000_000;
    const service = new BriefingService({
      config: { url: null, token: null, inbox: null, pollMs: 60_000 },
      demo: true,
      changed: () => undefined,
      log: () => undefined,
      now: () => now,
    });
    await service.poll();
    expect(service.current().state).toBe('mock');
    await service.ask('Robotik?');
    now += 31_000;
    await service.poll();
    service.stop();
    expect(service.current().inquiries[0].answer?.answer).toMatch(/^MOCK/);
  });
});
