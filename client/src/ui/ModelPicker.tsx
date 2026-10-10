import { useState } from 'react';
import { api } from '../api';
import { useStore } from '../store';
import { useT } from '../i18n';
import type { AgentCli, CliView, EffortLevel, ModelCatalog } from '../../../shared/types';
import { describeModelProblem, EFFORT_LEVELS, effortsFor, fitEffort, modelChoices, modelProblem, type ModelProblem } from '../../../shared/models';

// The model and effort pickers: the models a coding agent itself lists (server/modelCatalog.ts), the efforts the
// chosen model takes, and why a model can't run, with a way to try a refused one again. Every model field uses these.

const label = (clis: CliView[], id: AgentCli) => clis.find((c) => c.id === id)?.label ?? id;

/** A coding agent's catalog (null until the office has asked it) and the models its provider refused. */
export function useModels(cli: AgentCli): { catalog: ModelCatalog | null; rejected: Record<string, string>; clis: CliView[] } {
  const clis = useStore((s) => s.clis);
  const c = clis.find((x) => x.id === cli);
  return { catalog: c?.catalog ?? null, rejected: c?.rejected ?? {}, clis };
}

/** Why `model` can't run on `cli`, in words, or null. */
export function useModelProblem(cli: AgentCli, model: string): { problem: ModelProblem | null; text: string } {
  const t = useT();
  const { catalog, rejected, clis } = useModels(cli);
  const problem = modelProblem(cli, model, catalog, rejected);
  return { problem, text: problem ? describeModelProblem(problem, t, (id) => label(clis, id)) : '' };
}

/** The <option>s of a model picker; `current` stays listed, marked, when the agent doesn't offer it. */
export function ModelOptions({ cli, current }: { cli: AgentCli; current: string }) {
  const t = useT();
  const { catalog, rejected } = useModels(cli);
  return (
    <>
      {modelChoices(catalog, current).map((m) => {
        const problem = modelProblem(cli, m.id, catalog, rejected);
        const text = problem?.kind === 'rejected' ? t('models.rejectedOption', { model: m.label }) : problem ? t('models.unavailableOption', { model: m.label }) : m.label;
        return (
          <option key={m.id} value={m.id} disabled={!!problem && m.id !== current.trim()}>
            {text}
          </option>
        );
      })}
    </>
  );
}

/**
 * The <option>s of an effort picker for `model` on `cli`: only the efforts it takes. `current` stays listed when it
 * doesn't, saying what it runs as instead.
 */
export function EffortOptions({ cli, model, current }: { cli: AgentCli; model: string; current: EffortLevel | '' }) {
  const t = useT();
  const { catalog } = useModels(cli);
  const supported = effortsFor(cli, model, catalog);
  return (
    <>
      {EFFORT_LEVELS.filter((e) => supported.includes(e) || e === current).map((e) => {
        const fitted = fitEffort(e, supported);
        const text = fitted === e ? e : fitted ? t('models.effortUnsupported', { effort: e, fitted }) : t('models.effortNone', { effort: e });
        return (
          <option key={e} value={e}>
            {text}
          </option>
        );
      })}
    </>
  );
}

/** The model can't run: what's wrong, and for a model its provider refused, a way to try it again unchanged. */
export function ModelNotice({ cli, model }: { cli: AgentCli; model: string }) {
  const t = useT();
  const { problem, text } = useModelProblem(cli, model);
  const [busy, setBusy] = useState(false);
  if (!problem) return null;
  const retry = () => {
    setBusy(true);
    void api
      .retryModel(cli, problem.model)
      .catch(() => undefined) // api() already toasted the error
      .finally(() => setBusy(false));
  };
  return (
    <div className="model-notice small" role="alert">
      <span>⚠ {text}</span>
      {problem.kind === 'rejected' && (
        <button type="button" className="btn btn-small btn-ghost" disabled={busy} onClick={retry}>
          {t('models.retry', { model: problem.model })}
        </button>
      )}
    </div>
  );
}

/** Where a coding agent's model list came from, and a way to ask again. */
export function CatalogNote({ cli }: { cli: AgentCli }) {
  const t = useT();
  const { catalog, clis } = useModels(cli);
  const [busy, setBusy] = useState(false);
  const name = label(clis, cli);
  const installed = clis.find((c) => c.id === cli)?.installed;
  const text = !catalog
    ? installed === false
      ? ''
      : t('models.loading')
    : catalog.source === 'bundled'
      ? t('models.source.bundled', { cli: name, error: catalog.error ?? '' })
      : catalog.source === 'list'
        ? t('models.source.list', { cli: name, error: catalog.error ?? '' })
        : catalog.error
          ? t('models.source.none', { cli: name, error: catalog.error })
          : t('models.source.cli', { cli: name });
  const refresh = () => {
    setBusy(true);
    void api
      .refreshModels()
      .catch(() => undefined)
      .finally(() => setBusy(false));
  };
  return (
    <p className="muted small row wrap">
      <span>{text}</span>
      <button type="button" className="btn btn-small btn-ghost" disabled={busy} onClick={refresh}>
        {t('models.refresh')}
      </button>
    </p>
  );
}
