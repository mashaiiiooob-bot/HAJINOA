# Review & hardening pass — changelog

This pass did **not** start from scratch. The existing codebase (auth,
matchmaking, live game loop, DB schema, Docker/nginx) was already a careful,
correctly-architected build — see the original README's own honest
"what's implemented vs. scaffolded" breakdown, which still holds. What
follows are the concrete bugs and gaps found on full review, and what was
changed to fix them. Nothing below is cosmetic — each item was either a
real functional break, a security gap, or a missing piece a nav link
already pointed at.

## Fixed

1. **CSP was silently breaking every realtime feature.**
   `script-src 'self'` blocked the `cdn.socket.io` script tag the client
   actually loads, so matchmaking, live rounds, and chat would all fail in
   production with no server-side signal — just a CSP violation in the
   browser console. Allow-listed `https://cdn.socket.io` in
   `server/src/app.js`. (Longer-term: self-host the socket.io client
   bundle under `client/vendor/` instead of trusting a third-party CDN at
   all — left as a follow-up since it needs a real download step.)

2. **Round resolution only recorded one player's move.**
   `MatchService.playRound` took a single `userId`/`guess` pair — in a
   2-player round it only persisted and judged the *first* player's
   submission to arrive, dropping the second player's move from the
   database audit trail entirely and arbitrarily crediting/blaming only
   one side. Rewrote it to take the full `picks` map for the round,
   persist every player's move, and compute correctness independently per
   player (a round can legitimately end with both players right, one
   right, or neither — `round_winner_id` now reflects that instead of
   guessing). `gameSocket.js` updated to match.

3. **JWT/DB secrets silently fell back to dev defaults in production.**
   The config loader's `required()` helper always had a fallback value, so
   it never actually enforced anything — if `JWT_ACCESS_SECRET` was unset
   in a production deploy, the app would boot fine and silently sign
   tokens with the publicly-visible dev secret. Added `requiredSecret()`,
   which throws on boot if `NODE_ENV=production` and a real secret isn't
   set.

4. **Postgres and the raw API were exposed directly to the host.**
   `docker-compose.yml` published `5432:5432` and `4000:4000`, so both
   were reachable directly from the internet, bypassing `edge` (the only
   service meant to be internet-facing — it's the one terminating TLS and
   setting security headers). Removed both host port mappings; only
   `edge` publishes 80/443 now. Also made `DB_PASSWORD` a required
   variable instead of defaulting to `postgres`, and added the
   previously-undocumented root `.env.example` compose actually needs.

5. **Malformed JSON bodies returned 500 instead of 400.**
   `express.json()` throws a `SyntaxError` on a bad body; without a
   handler for it, that fell through to the generic error handler and
   logged/returned as an unhandled 500. Added a small handler so it's a
   clean 400.

6. **`/:id` routes 500'd on non-UUID input.** `GET /api/matches/:id` and
   `GET /api/users/:id` passed the raw param straight to Postgres, so a
   malformed id surfaced as `invalid input syntax for type uuid` — a
   leaking 500 — instead of a validation error. Added a `validateUuidParam`
   middleware.

7. **The leaderboard nav link was dead.** Both the header nav and the
   dashboard's "مشاهده همه" link point at `#/leaderboard`, but no such
   route was ever registered client-side, so it silently fell through to
   the 404 handler. Built `LeaderboardPage.js` (paginated, reuses the
   existing design system) and registered the route.

## Explicitly not touched

Clans, tournaments, the marketplace, and mini-games remain schema-only, as
the original README already disclosed. Building any of those out for real
(bracket generation, clan permissions, idempotent marketplace transactions,
anti-cheat) is its own scoped slice of work, not something to bolt on as a
side effect of a review pass — happy to take any one of them on next.

## Known limitation of this review

This was a static code review — every file was read and reasoned through,
but nothing was actually executed (no `npm install`, no live DB, no
browser). Run the smoke-test steps below after pulling these changes in.
