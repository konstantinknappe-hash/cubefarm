# Coding agent instructions

This repository's instructions are in [CLAUDE.md](CLAUDE.md). Read it in full before starting.
The following hard rules apply even if that file is skipped:

- Never use ports **4317** or **5317**, or read or write `~/.cubefarm` directly. Never edit or run
  anything in the live office installation (`C:\Projects\office-swarm` on upstream's Windows machine).
  Keep the separately installed office here protected. Keep the former Hetzner office at
  `/opt/cubefarm-de` with state in `/home/cubefarm/.cubefarm` protected too; do not modify, restart,
  deploy or remove it as part of local work.
- Test only in demo mode, with isolated state and your reserved port:

  ```bash
  npm install
  npm run build
  SWARM_HOME="$PWD/.swarm-home" SWARM_PORT=<your reserved port> node --import tsx server/index.ts --demo
  ```

  On Windows (PowerShell):

  ```powershell
  npm install; npm run build
  $env:SWARM_HOME="$PWD\.swarm-home"; $env:SWARM_PORT="<your reserved port>"; node --import tsx server/index.ts --demo
  ```

  Replace the port placeholder with your assigned port. Verify the banner says `DEMO MODE` and its
  `state:` path is inside your `SWARM_HOME`. Open `http://localhost:<your reserved port>`, stop the
  demo when done, and never commit `.swarm-home`.
- Never run real mode for development, tests or QA. The only real-mode exception is the manager-approved
  local production instance described below. `npm run dev`, `npm run demo`, `npm start` and `npx cubefarm`
  remain prohibited in this checkout.
- Do not add hooks, permission rules or sandboxes that refuse tool calls; the office relies on agent instructions.
- Every change needs its own branch and a tested PR. Run `npm run typecheck`, `npm test` and
  `npm run build` before opening it. Never push to `main`, force-push or merge PRs yourself.
- Never publish, create release tags or releases, change the package name or version, or edit
  `.github/workflows/release.yml`. Upstream syncs preserve upstream's publishing changes as described below.

See [the fork guide](docs/fork.md) for production boundaries, compatibility rules and upstream syncs.

## Manager-approved local production instance

After this rule has been merged into the exact checkout being run, an explicit manager task may authorize
operating the manager's local CubeFarm installation on the ThinkPad. This exception applies only to that
local installation; it does not authorize access to or changes to the protected offices above.

- Set `SWARM_HOME` to the dedicated, mounted gocryptfs directory outside the repository. Never use the
  default `~/.cubefarm`, `.swarm-home`, or a path shared with another office.
- Set `SWARM_PORT` to a port the manager selected and verified as free. Never use 4317 or 5317.
- Run the built server directly with `node dist-server/index.js`; do not use an auto-updating launcher.
  Do not start a second process against the same `SWARM_HOME`.
- Do not stop or change the Hetzner office until local migration and verification succeed and the manager
  separately authorizes that action.
- Buchhaltung agents may use synthetic fixtures only. Keep production databases, bank credentials and
  real financial documents outside agent-accessible repositories, worktrees and prompts.
