# Coding agent instructions

This repository's instructions are in [CLAUDE.md](CLAUDE.md). Read it in full before starting.
The following hard rules apply even if that file is skipped:

- Never use ports **4317** or **5317**, or read or write `~/.cubefarm` directly. Never edit or run
  anything in the live office installation (`C:\Projects\office-swarm` on upstream's Windows machine).
  The live office here is installed separately; do not modify, restart or deploy it.
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
- Never run real mode (without `--demo`), `npm run dev`, `npm run demo`, `npm start` or `npx cubefarm`.
- Do not add hooks, permission rules or sandboxes that refuse tool calls; the office relies on agent instructions.
- Every change needs its own branch and a tested PR. Run `npm run typecheck`, `npm test` and
  `npm run build` before opening it. Never push to `main`, force-push or merge PRs yourself.
- Never publish, create release tags or releases, change the package name or version, or edit
  `.github/workflows/release.yml`. Upstream syncs preserve upstream's publishing changes as described below.

See [the fork guide](docs/fork.md) for production boundaries, compatibility rules and upstream syncs.
