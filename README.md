# دست یا خالی — Production Architecture

A real client/server/database rebuild of the original single-file prototype.
This replaces the localStorage-based mock with an actual Postgres-backed API,
JWT auth with refresh-token rotation, and a Socket.io layer that makes the
server (not the browser) the source of truth for every game outcome.

## What's implemented end-to-end

- **Auth**: register/login/refresh/logout, bcrypt hashing, rotating refresh
  tokens stored server-side (revocable), rate-limited endpoints.
- **Core game loop**: real-time matchmaking queue → live "hand or empty"
  round play over WebSocket → server-generated outcome (CSPRNG, never
  client-supplied) → match completion → coin/XP/rank-point updates written
  in a DB transaction.
- **Leaderboard, profile, match history**: read endpoints backed by a
  normalized schema with indexes.
- **Chat**: persisted + broadcast over Socket.io, server-side sanitization,
  basic flood throttle.
- **Security baseline**: helmet CSP, CORS allowlist, HPP guard, input
  validation (Zod) on every mutating route, parameterized SQL everywhere,
  httpOnly refresh cookie, structured/redacted logging, health check.
- **DevOps**: Dockerfiles for client/server, docker-compose with Postgres +
  edge nginx (TLS termination, SPA fallback, WS upgrade), migration + seed
  runner.

## What's scaffolded but not fully built out

The original prototype also had clans, tournaments, a marketplace, a battle
pass, and several mini-games — all implemented as localStorage mutations
with no real rules enforcement. The database schema here already models
clans, tournaments, missions, and inventory (see
`database/migrations/001_init_schema.sql`), and the same
service → controller → route pattern used for auth/matches extends directly
to them. I deliberately did not stub those out as fake-functional UI, since
that would look done without being done. Building each one for real
(tournament bracket generation, clan permissions, marketplace transactions
with idempotency, anti-cheat on mini-games) is its own multi-day slice of
work — happy to do any of them next, following the same patterns already
in place.

## Local development

```bash
# 1. Database
docker compose up db -d

# 2. Server
cd server
cp .env.example .env        # fill in JWT secrets: openssl rand -hex 32
npm install
npm run migrate
npm run seed
npm run dev                 # http://localhost:4000

# 3. Client (any static file server works — no build step required)
cd client
npx serve .                 # or: python3 -m http.server 5173
```

## Production deployment

```bash
cp server/.env.example .env   # set real secrets at the repo root for compose
# Place TLS certs at nginx/certs/fullchain.pem and privkey.pem
docker compose up -d --build
```

`edge` (nginx) terminates TLS on 80/443 and proxies `/api` and `/socket.io`
to `server`, everything else to the static `client` service — so the
browser only ever talks to one origin in production.

## Architecture

```
client/   vanilla ES modules, no build step required (CDN font + socket.io)
  src/services   api.js (fetch + silent refresh), socket.js, authStore.js
  src/components Header, Toast, Modal — reusable, framework-free
  src/pages      LoginPage, DashboardPage, GamePage
  src/styles     tokens.css (design system) + one file per concern

server/   Node 20, Express, Socket.io, ESM throughout
  src/config     env validation, Postgres pool
  src/middleware auth (JWT), validate (Zod), errorHandler
  src/models     parameterized SQL, no ORM magic
  src/services   business logic (AuthService, MatchService)
  src/sockets    matchmaking, live round resolution, chat
  src/routes     thin — validation + controller call only

database/ versioned SQL migrations + seed data, applied via src/utils/migrate.js
```

## Scaling beyond one instance

Matchmaking and live-match state currently live in server memory
(`server/src/sockets/matchmaking.js`, `gameSocket.js`) — correct for a
single Node process. To run multiple API instances behind the load
balancer: move the queue to a Redis list, move per-match round state to
Redis (or keep it in Postgres `match_rounds`, which is already the durable
record), and add the Socket.io Redis adapter so `io.to(room)` broadcasts
reach sockets connected to other instances.
