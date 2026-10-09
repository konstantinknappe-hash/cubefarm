# CubeFarm fork guide

[konstantinknappe-hash/cubefarm](https://github.com/konstantinknappe-hash/cubefarm) is our fork of
[leonvanzyl/cubefarm](https://github.com/leonvanzyl/cubefarm) (upstream). We develop our custom collaborative
3D office here while keeping changes small enough to follow upstream's frequent updates.

## Manager's rules and production

Every change goes on its own branch and through a tested PR. Agents never push to `main`, force-push
or merge PRs; the manager merges after review and QA. Nobody modifies, restarts or deploys the production
instance, or changes its configuration, credentials or databases, without the manager's explicit approval.

The live office on this machine is installed separately, not run from this repository. Merging to `main`
is therefore not a deployment. If the manager ever runs production from a clone using `npm start`, its
**Update automatically** setting must stay off so updates happen only when the manager authorizes them.
This describes production operation, not permission for agents to run that command.

[CLAUDE.md's SAFETY section](../CLAUDE.md#safety-read-first) describes upstream's Windows machine and
`C:\Projects\office-swarm`. Here the live office uses the same default ports (4317 and 5317) and
`~/.cubefarm`, so those safety rules apply unchanged. Never use those ports or read or write that state
directly. Read all of `CLAUDE.md` before starting; [AGENTS.md](../AGENTS.md) repeats the hard rules for
Codex and OpenCode. Use only the isolated demo command below for local office checks, never
`npm run dev`, `npm run demo`, `npm start` or `npx cubefarm`.

## Rules for fork changes

- Check [upstream's open issues](https://github.com/leonvanzyl/cubefarm/issues) and
  [open PRs](https://github.com/leonvanzyl/cubefarm/pulls) first. Do not build what upstream is already building.
- Put fork-only features in new files, with the smallest possible hooks into upstream files.
- Never reformat, rename or reorder upstream code.
- Write generic fixes so they could go upstream as they are.
- Never publish, tag releases or change the package name, version or `.github/workflows/release.yml`
  for the fork. Upstream's own changes to these files are preserved during syncs.

## Syncing with upstream

1. Start a dedicated sync branch from the fork's current `main`. Fetch and merge upstream's history:

   ```bash
   git fetch https://github.com/leonvanzyl/cubefarm.git main
   git merge FETCH_HEAD
   ```

   Run the merge on the sync branch. Never rebase or squash: keep upstream's commit history intact.
2. Resolve conflicts keeping both sides' intended behavior, and verify that every fork change still
   works. Upstream's own version bumps and `.github/workflows/release.yml` changes come in as they are.
3. Run the checks, then boot an isolated demo office:

   ```bash
   npm install
   npm run typecheck
   npm test
   npm run build
   SWARM_PORT=<your reserved port> node scripts/smoke-package.mjs
   SWARM_HOME="$PWD/.swarm-home" SWARM_PORT=<your reserved port> node --import tsx server/index.ts --demo
   ```

   Replace the port placeholder with your assigned port. The package smoke check packs and installs
   locally; it does not publish. Give it your reserved port too (otherwise it defaults to 4456).
   Confirm the demo startup banner says `DEMO MODE`, its `state:` path
   is inside your `SWARM_HOME`, and `http://localhost:<your reserved port>` loads. Stop the demo when
   done and do not commit `.swarm-home`. The PowerShell equivalent is in `AGENTS.md` and `CLAUDE.md`.
4. Update the fork changes list and last-sync record below. Open the tested sync PR with the
   `swarm:merge-commit` label so the office merges it with a merge commit. A separate issue adds that
   label's merge behavior; until it is supported, the manager must preserve the merge commit when
   merging. Never squash or rebase the sync PR.

## Fork changes

Keep one line per fork-specific change: its PR, what it does, and which upstream files it hooks into.

- [PR #8](https://github.com/konstantinknappe-hash/cubefarm/pull/8): adds `AGENTS.md` and this fork guide; hooks into upstream `CLAUDE.md` only through the appended `## Fork` section.

Last synced with upstream: not yet recorded. After each sync, record the upstream commit, date and sync PR here.
