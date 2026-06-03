# deploy/centrifugo

Centrifugo v6 config for the self-hosted realtime chat fanout. Operational runbook
lives in `docs/DEPLOY_LIGHTSAIL.md` (§Centrifugo); this file documents the config
fields so `config.json` itself stays as a clean, parser-only file (no inline
comment keys — Centrifugo v6's config loader is strict about unknown keys).

## Secrets come from env, never config.json

Centrifugo does **not** interpolate `${VAR}` inside `config.json` — it would sign
with the literal string. So `config.json` carries only non-secret structure;
secrets and the public origin are injected as env vars. `docker-compose.prod.yml`
bridges the app-named vars (set once in `.env.production`) to Centrifugo's v6
nested-key env names (same value, two consumers):

| `.env.production` (app) | Centrifugo v6 env override | config.json key |
|---|---|---|
| `CENTRIFUGO_TOKEN_HMAC_SECRET` | `CENTRIFUGO_CLIENT_TOKEN_HMAC_SECRET_KEY` | `client.token.hmac_secret_key` |
| `CENTRIFUGO_API_KEY` | `CENTRIFUGO_HTTP_API_KEY` | `http_api.key` |
| `APP_DOMAIN` → `https://<domain>` | `CENTRIFUGO_CLIENT_ALLOWED_ORIGINS` | `client.allowed_origins` |

The `hmac_secret_key`/`key` empty-string and empty `allowed_origins` array in
`config.json` are placeholders — the env overrides above always replace them in
both prod (compose) and local dev (`docker run -e …`). Centrifugo's `defaultenv`
override naming joins nested keys with `_`.

## Field reference

- **`http_server.port: 8000`** — bound to `127.0.0.1:8000` by compose; never
  exposed publicly. Browser reaches it via Caddy `wss://<domain>/connection/websocket`.
- **`client.token.hmac_secret_key`** — HS256 key verifying the connection JWT the
  app signs (sub=userId; see `lib/server/realtime/token.ts`). Same value as the
  app's `CENTRIFUGO_TOKEN_HMAC_SECRET`. Channel access is NOT in this token — it
  is decided by the subscribe proxy below.
- **`client.allowed_origins`** — set via env to `https://<APP_DOMAIN>`. Centrifugo
  checks the browser `Origin` header against this on WebSocket connect.
- **`http_api.key`** — authorizes the app's server-side HTTP publish
  (`X-API-Key` header → `127.0.0.1:8000/api`; see `lib/server/realtime/centrifugo.ts`).
- **`channel.proxy.subscribe.endpoint`** — the private-ACL security boundary
  (완전 비공개). Centrifugo calls the app server-to-server on every subscribe
  attempt; the app answers allow/deny by workspace membership
  (`app/api/centrifugo/subscribe/route.ts`). Uses `host.docker.internal` because
  the app runs **natively** on the host (PM2:3000), not in Docker — `127.0.0.1`
  here would be the container's own loopback. compose maps it via
  `extra_hosts: host.docker.internal:host-gateway`. This is server↔server and is
  intentionally NOT routed through Caddy.
- **`channel.namespaces[0]` (`name: "chat"`)** — the channel convention is
  `chat:conversation:<id>` (`chatChannel()` in `lib/server/realtime/centrifugo.ts`).
  Centrifugo splits the namespace at the **first colon** → namespace `chat`. This
  namespace MUST exist or every subscribe is rejected ("namespace not found")
  *before* the subscribe proxy is even called.
  - `presence: true` — email-suppression reads channel presence (online recipient
    → skip digest mail).
  - `join_leave: true` — live online/offline presence dots.
  - `subscribe_proxy_enabled: true` — route subscribes through the ACL proxy above.

## Persistence

Centrifugo persists nothing. Postgres is the canonical message store (PIPA/PG
자사 보관 hard constraint); Centrifugo only fans out live to subscribers. Single
PM2 fork → Memory engine, no Redis. Multi-node scale-out would add the built-in
Redis/Nats engine — not adopted now.
