# Signed-in E2E — authenticated extraction against prod

chromacut is **edge-gated** on the platform (Topology A): the `/chromacut/api/*`
POSTs (`analyze`, `extract`, `preview`) are gated by Caddy `forward_auth` against
the platform admin app's `GET /auth/verify`. chromacut itself carries **zero auth
code** — so the only way to exercise the gated POST path against the deployed site
is with a valid platform `session` cookie.

`scripts/e2e-signed-in.mjs` proves the inverse of the anonymous 401 check: with a
valid session, the gate opens and a real upload → analyze → extract → download
completes through the edge.

## Why mint a session (vs. real Google login)

The platform login is Google OAuth, which blocks headless automation. The OAuth
leg is already covered by the platform's own login-flow tests, so this harness
injects a **server-minted session token** and tests the part OAuth tests can't:
the forward_auth gate + the real extraction pipeline through Cloudflare + Caddy.

## Run

```bash
# Use one of admin-panel's configured admin emails (see its ADMIN_EMAIL env).
ADMIN_EMAIL="you@example.com"

# 1. Mint a short-lived (1-day) session token on the droplet. The token is
#    produced by code evaluated inside the remote shell, so it never lands in
#    the local process table.
TOKEN=$(ssh platform "docker exec -w /app admin-panel python -c \
  \"from app.db.sessions import create_session; \
    print(create_session('$ADMIN_EMAIL','admin',1))\"")

# 2. Drive the authenticated flow against prod.
SESSION_TOKEN="$TOKEN" node scripts/e2e-signed-in.mjs

# 3. ALWAYS clean up — delete the minted session. Pipe the token over stdin so
#    it is not interpolated into the local command line (kept out of `ps`/history).
printf '%s' "$TOKEN" | ssh platform "docker exec -i -w /app admin-panel python -c \
  \"import sys; from app.db.sessions import delete_session; \
    delete_session(sys.stdin.read().strip())\""
```

Outputs land in `scripts/_e2e/` (gitignored): the downloaded `chromacut-export.zip`
and `output-state.png` full-page screenshot.

## Pass criteria

Exit `0` when **both** gated POSTs return `200` **and** a file downloads.
The script prints the gate statuses, the signed-in UI state (gate-note hidden,
Export enabled), the export status text, and any console errors.

## Notes

- `admin-panel`'s admin emails are in its `ADMIN_EMAIL` env; the email used is
  cosmetic for the gate (the session row's existence is what `/auth/verify` keys
  on). Mint with the shortest useful expiry and delete after.
- This is the base for the deferred cross-surface Playwright suite.
