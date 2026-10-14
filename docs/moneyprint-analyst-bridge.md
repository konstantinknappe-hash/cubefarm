# MoneyPrint analyst bridge

MoneyPrint can submit one queued analysis at a time to `POST /api/analysts/invoke`. CubeFarm runs it as a visible
agent session on the requested repo floor and returns the structured model output. Requests require the same
`MONEYPRINT_CUBEFARM_TOKEN` (at least 32 characters) on both services, sent as `Authorization: Bearer …`.

Set `MONEYPRINT_CUBEFARM_AGENT_IDS` to one or two agent IDs on the MoneyPrint floor, separated by commas. These seats
stay out of normal issue assignment while the bridge token is configured. Existing sessions finish normally. If no
IDs are set, the first agent on that floor is reserved. A request starts only when a matching Claude or Codex agent
and a global session slot are free; otherwise CubeFarm returns HTTP 429 and MoneyPrint retries its durable queue.
At most two bridge sessions run at once.
MoneyPrint defaults to one concurrent bridge call; set `MONEYPRINT_CUBEFARM_PARALLEL_SESSIONS=2` only when two
reserved agents are configured, ideally one Claude and one Codex so both subscriptions can work at once.

The request contains `repoId`, `cli` (`claude` or `codex`), `prompt`, and optionally `model`, `effort`, and
`timeoutMs`. The response contains `output`, `model`, and `agent`. Work runs from an empty temporary directory, has no
MoneyPrint order tools, and is shown on the agent card as market analysis. After an office restart, the interrupted
request is cleared and MoneyPrint retries it from its queue.

When the token is configured, CubeFarm opens only `127.0.0.1:4389` for this bridge. It does not add the route to the
office API. Set `MONEYPRINT_CUBEFARM_BRIDGE_PORT` to change the listener and set MoneyPrint's
`MONEYPRINT_CUBEFARM_URL` to `http://127.0.0.1:4389`. Keep the endpoint on loopback and store the shared token only
in the two services' protected systemd environments. The token is not written to CubeFarm state or logs.
