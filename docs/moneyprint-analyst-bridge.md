# MoneyPrint analyst bridge

MoneyPrint can submit one queued analysis at a time to the dedicated loopback listener. The optional legacy transport
uses `POST /api/analysts/invoke`; MoneyPrint's direct `backend: cubefarm` transport uses
`POST /v1/analyst-runs`. Both run visible CubeFarm sessions and use the same private
`MONEYPRINT_CUBEFARM_TOKEN` (at least 32 characters), sent as `Authorization: Bearer …`.

The direct endpoint requires a matching `Idempotency-Key` header and `request_id` field. It accepts only visible
analyst sessions, protects coding, QA, and CEO sessions, and rejects requests that grant file, repository, or order
access. Repeated request IDs reuse the in-flight or recently completed result for 30 minutes. The response reports
`status: completed`, the request ID, a visible analyst session, model, and structured result. It returns HTTP 429 while
all configured analyst slots are busy.

Set `MONEYPRINT_CUBEFARM_AGENT_IDS` to one or two agent IDs on the MoneyPrint floor, separated by commas. These seats
stay out of normal issue assignment while the bridge token is configured. Existing sessions finish normally. If no
IDs are set, the first Codex and first Claude agent on that floor are reserved when available. A request starts only
when a matching model agent and a global session slot are free; otherwise CubeFarm returns HTTP 429 and MoneyPrint
retries its durable queue.
At most two bridge sessions run at once.
MoneyPrint defaults to one concurrent bridge call; set `MONEYPRINT_CUBEFARM_PARALLEL_SESSIONS=2` only when two
reserved agents are configured, ideally one Claude and one Codex so both subscriptions can work at once.

The request contains `repoId`, `cli` (`claude` or `codex`), `prompt`, and optionally `model`, `effort`, and
`timeoutMs`. The response contains `output`, `model`, and `agent`. Work runs from an empty temporary directory, has no
MoneyPrint order tools, and is shown on the agent card as market analysis. After an office restart, the interrupted
request is cleared and MoneyPrint retries it from its queue.

When the token is configured, CubeFarm opens only `127.0.0.1:4389` for this bridge. It does not add either route to
the office API. Set `MONEYPRINT_CUBEFARM_BRIDGE_PORT` to change the listener. For the direct transport, set
MoneyPrint's `MONEYPRINT_CUBEFARM_ENDPOINT` to `http://127.0.0.1:4389` and point
`MONEYPRINT_CUBEFARM_TOKEN_FILE` at a mode-0600 file readable by the analyst service. Keep the endpoint on loopback.
Store the shared token only in CubeFarm's protected systemd environment and the analyst user's protected token file;
the token is not written to CubeFarm state or logs.
