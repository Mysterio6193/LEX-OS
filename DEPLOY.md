# lexOS — Deployment Runbook

Production deployment of the lexOS backend (Node/Express) and frontend
(Next.js). The backend is stateless; state lives in Supabase (Postgres +
pgvector) and Cloudflare R2.

## 1. Prerequisites
- Node.js ≥ 20.
- A Supabase project (Postgres) with the **pgvector** extension available.
- An S3-compatible bucket (Cloudflare R2 or AWS S3).
- At least one LLM provider key (Anthropic / Gemini / OpenAI). OpenAI or
  Gemini is also used for embeddings (RAG). Optional: Indian Kanoon token,
  a rerank key.

## 2. Database
1. In the Supabase SQL editor, enable pgvector (the schema does this:
   `create extension if not exists vector;`).
2. **Fresh DB:** run `backend/schema.sql` in full.
   **Existing DB:** run the incremental files in `backend/oss-migrations/`
   in filename (date) order. The v2 RAG/agent set is
   `20260614_document_chunks.sql`, `20260614_match_chunks.sql`,
   `20260614_agent_runs.sql`, and `20260615_vaults.sql`.
3. The backend connects with the service role and the browser never gets
   direct table access (every table is `revoke`d from anon/authenticated).

## 3. Backend
Configure `backend/.env` from `backend/.env.example` (set real secrets;
generate `DOWNLOAD_SIGNING_SECRET` with `openssl rand -hex 32`).

**Docker (recommended):**
```bash
docker build -t lexos-backend ./backend
docker run --env-file backend/.env -p 3001:3001 lexos-backend
```
**Or directly:**
```bash
cd backend && npm ci && npm run build && npm start
```
Health check: `GET /health` → `{ "ok": true }`. Point your load balancer /
container orchestrator at it. The process handles `SIGTERM`/`SIGINT` for
graceful shutdown and serverless platforms via `export default app`
(`VERCEL=1` skips `app.listen`).

## 4. Frontend (Vercel)
The frontend is a Next.js app in `frontend/` with SSR/dynamic routes, so it
must deploy with Vercel's Next.js framework integration. The backend is
hosted separately (§3) and reached via `NEXT_PUBLIC_API_BASE_URL`.

**Required setup (one-time):** In the Vercel project →
Settings → Build & Deployment → **Root Directory = `frontend`**, then
redeploy. This is mandatory for a Next app in a monorepo subdirectory — a
root-level `vercel.json` build override cannot correctly deploy the SSR
routes, which is why earlier deploys failed. With Root Directory set, Vercel
auto-detects Next.js and uses `frontend/vercel.json`.

> Do NOT put a `vercel.json` at the repo root for this app, and never use an
> `experimentalServices` key (not a real Vercel schema).

**Required env vars (Vercel project → Settings → Environment Variables):**
```
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY=...
NEXT_PUBLIC_API_BASE_URL=https://<your-backend-host>
# Optional: ship a backend-free trial build
NEXT_PUBLIC_DEMO_MODE=false
```
With no Supabase env set, the app falls back to Demo Mode (client-side,
localStorage) — useful for trials, not production.

`frontend/package.json` also carries Cloudflare (`opennextjs-cloudflare`)
scripts and an `open-next.config.ts`; those are unused by Vercel and can be
ignored (or deleted if you commit to Vercel).

**Self-host instead:** `cd frontend && npm ci && npm run build && npm start`.

## 5. Post-deploy checks
- `GET /health` returns ok.
- Backend: `npm test` (offline eval gate) passes in CI before deploy
  (`.github/workflows/ci.yml`).
- Validate the agent + RAG end-to-end with real keys:
  `cd backend && npm run smoke:agent -- <projectId>`.
- Reindex a matter to populate the RAG index: `POST /projects/:id/reindex`.

## 6. Operational notes
- **Cost/abuse:** chat and reindex endpoints are rate-limited (tune via
  `RATE_LIMIT_*` env). Reindex and agent runs consume embedding/LLM credits.
- **Secrets:** never commit `.env`; rotate `DOWNLOAD_SIGNING_SECRET` and
  `USER_API_KEYS_ENCRYPTION_SECRET` per environment.
- **Dependencies:** `npm audit` is clean except one moderate advisory that
  needs a deliberate `@anthropic-ai/sdk` major upgrade (test against a real
  Claude key before adopting).
- **Observability:** the backend emits structured JSON logs (one line per
  request with a request id; `LOG_LEVEL` controls verbosity) and captures
  5xx/crash errors (secret-scrubbed). Set `ERROR_WEBHOOK_URL` for Slack-style
  alerts; point a log shipper at stdout. Swap in Sentry later behind the
  existing `captureException` surface (`backend/src/lib/observability.ts`).
