# Chromacut SaaS — Product & Architecture Design

**Date:** 2026-04-01
**Status:** Draft
**Author:** Lucas Reed

---

## 1. Product Vision

Chromacut is an AI asset generation tool. Users describe the assets they want, pick a style, and receive clean, transparent PNGs — no Photoshop, no manual cleanup, no green-screen knowledge required.

**Tagline:** "AI-generated assets, production-ready in seconds."

Two surfaces of the same product:

| Surface | What it is | Who it's for | Revenue |
|---------|-----------|--------------|---------|
| **chromacut CLI** | Open-source local extraction tool | Developers, privacy-sensitive users | Free (pip install, GitHub) |
| **chromacut.app** | Hosted web app: generate + extract | Indie devs, designers, content creators | Freemium SaaS (credits) |

The CLI stays open-source and free forever. It is the distribution engine and credibility builder. The web app is the revenue product.

---

## 2. Target Audience

**Primary ICP (launch):** Solo and indie game developers who need sprites, icons, tilesets, and UI elements. They currently generate assets with AI tools (Gemini, Midjourney, DALL-E), then manually extract them in Photoshop/GIMP. This takes 5-10 minutes per asset.

**Secondary audiences (post-validation):** Web/app designers needing UI icons, content creators needing stickers/thumbnails, marketing teams needing illustrations.

**Why indie game devs first:**
- Well-defined need (transparent PNGs for game engines)
- Proven willingness to pay for tools (Aseprite: 1M+ copies at $20, TexturePacker: $40)
- Reachable communities (itch.io: 900k+ devs, r/gamedev, r/indiedev, game jams)
- Price-insensitive at $10/mo if it saves real time

---

## 3. Competitive Positioning

| Competitor | What they do | Why chromacut wins |
|-----------|-------------|-------------------|
| remove.bg / PhotoRoom | Generic background removal for photos | Chromacut is purpose-built for AI-generated art: VFX despill, grid detection, style-aware resampling. These tools produce artifacts on pixel art and flat illustrations. |
| Scenario.gg | AI game asset generation with custom LoRA models ($39-99/mo) | Chromacut is simpler and cheaper. No model training required. Works with any AI generator's output. |
| Manual workflow (Photoshop/GIMP) | Select by Color → cleanup → export | Chromacut automates 5-10 minutes of skilled work per asset to <15 seconds. |
| TexturePacker / ShoeBox | Sprite sheet packing from existing transparent PNGs | Chromacut is upstream — it creates the clean PNGs that go into these tools. |

**Key differentiators:**
- End-to-end pipeline: prompt → generate → extract → download (no manual steps)
- VFX-quality extraction: despill + resolution-proportional erosion (not simple threshold)
- Grid-aware: auto-detects multi-icon layouts, names and exports individually
- Privacy option: CLI runs fully offline for unreleased game assets
- Style-aware output: pixel art gets NEAREST resampling, illustrations get LANCZOS

---

## 4. Pricing

One plan. No tiers. No annual discount until churn baseline is established.

| | Free (trial) | Pro ($10/mo) |
|---|-------------|-------------|
| Generations (prompt → assets) | 3 total | 200/mo |
| Extractions (upload your own image) | 5/day | Unlimited |
| Asset library | None (download only) | 1GB persistent storage |
| Output resolution | 512px max | Up to 2048px |
| Grid support | Single icon only | Full grid detection + batch |

**Unit economics (per Pro user, 200 generations/mo):**
- Revenue: $10.00
- Imagen 3 Fast API: -$4.00 (200 × $0.02)
- Stripe fee: -$0.59 (2.9% + $0.30)
- R2 storage/reads: -$0.00 (free tier)
- Infra share: -$0.50 (est. $7/mo amortized across users)
- **Contribution margin: $4.91 (49%)**
- Break-even: 2 Pro users cover all fixed costs
- Track per-cohort margin weekly once live; target >45% sustained

---

## 5. Pre-Build Validation

Before writing any SaaS code, validate demand:

1. **Landing page** at chromacut.app
   - Tagline, 3 screenshots/mockups of the generate → extract flow
   - Email capture: "Get early access"
   - Link to open-source CLI for immediate value

2. **Announce on:**
   - Hacker News (Show HN: chromacut — open-source AI asset extraction)
   - r/gamedev, r/indiedev, r/pixelart
   - itch.io community forums
   - Twitter/X gamedev community

3. **Interest gate (pre-build):** 100 email signups before writing SaaS code. If <100 after 2 weeks of active promotion, revisit the value proposition. Note: email signups validate interest, not willingness to pay. Paid-intent validation happens post-launch (see Section 10).

---

## 6. User Flow (MVP)

```
1. Land on chromacut.app
2. Try extraction free: upload a green-screen image → instant preview → download (anonymous, 5/day cap)
3. To generate assets: sign up with Google OAuth (email verified)
4. Pick style preset: pixel art / flat icon / isometric / illustrated
5. Describe assets: "medieval RPG potions, 3x3 grid"
6. Click "Generate" (costs 1 credit, 3 free credits on signup)
7. System: prompt engineering → Imagen 3 API → green-screen image → auto-extract
8. Preview: interactive cell editor (same UX as CLI tool)
9. User adjusts bounds if needed, names each icon
10. Click "Download" → ZIP of clean transparent PNGs
11. Upgrade to Pro ($10/mo) for 200 generations/mo + persistent library
```

**Two entry points:**
- **Generate tab** (requires account): describe what you want → full pipeline (prompt → generate → extract)
- **Extract tab** (anonymous OK): upload your own green-screen image → extraction only (5/day cap)

Both entry points share the same interactive preview/edit/download UX.

**Why require account for generation:** Each generation costs ~$0.02 in API fees. Anonymous cookie-based identity is trivially abusable (new browser = new cookies = unlimited free generations). Extraction is CPU-only with no variable cost, so anonymous usage is safe with a daily cap.

---

## 7. Architecture

### 7.1 System Overview

```
Browser (vanilla JS, extended from CLI frontend)
  │
  │  HTTPS
  ▼
FastAPI Application (single container on Railway or Fly.io)
  ├── Static frontend serving (HTML/CSS/JS)
  ├── Auth middleware (session cookies, Google OAuth via Authlib)
  ├── Rate limiting middleware (slowapi, per-user)
  │
  ├── POST /api/jobs/generate     → enqueue generation job
  ├── POST /api/jobs/extract      → enqueue extraction job
  ├── GET  /api/jobs/{id}         → poll job status + result
  ├── GET  /api/assets            → list user's saved assets
  ├── GET  /api/assets/{id}       → get asset detail + download URL
  ├── DELETE /api/assets/{id}     → delete asset
  ├── POST /api/billing/checkout  → create Stripe Checkout session
  ├── POST /api/billing/portal    → redirect to Stripe Customer Portal
  ├── POST /api/webhooks/stripe   → handle subscription events
  └── GET  /                      → serve SPA (index.html)
  │
  ▼
Background Worker (ARQ with Redis, or RQ — same container initially)
  ├── generate_job(prompt, style, user_id)
  │     1. Build optimized prompt from user input + style template
  │     2. Call Imagen 3 Fast API → receive green-screen image
  │     3. Run chromacut extraction pipeline (analyze → despill → resize)
  │     4. Upload result PNGs to R2
  │     5. Create asset records in DB
  │     6. Update job status to 'done'
  │
  ├── extract_job(upload_key, settings, user_id)
  │     1. Download source image from R2
  │     2. Run chromacut extraction pipeline
  │     3. Upload result PNGs to R2
  │     4. Create asset records in DB
  │     5. Update job status to 'done'
  │
  └── On failure: update job status to 'failed' with error message

Infrastructure:
  ├── Postgres (Supabase free tier) — users, jobs, assets
  ├── Redis (Upstash free tier or Railway Redis) — job queue only
  └── Cloudflare R2 — object storage (zero egress fees)
```

### 7.2 Why This Architecture

| Decision | Rationale |
|----------|-----------|
| FastAPI, not Next.js | Project convention: "no Node.js". FastAPI already serves frontend + API in chromacut. Authlib provides OAuth. Stripe has a Python SDK. No reason to introduce a JS layer. |
| Single container | Lean start. FastAPI app + ARQ worker in one process (or two processes in one container). Split when scaling demands it. |
| Async job model | Synchronous upload → process → return will timeout on serverless/cloud for large images or generation calls (Imagen API latency: 5-15s). Job queue + polling is resilient to slow operations and retryable on failure. |
| Vanilla JS frontend (extended) | The CLI frontend already has the interactive cell editor, canvas overlay, preview system. Extend it with auth UI, library view, and generation form — don't rewrite it. |
| chromacut as pip dependency | One source of truth for the extraction engine. `from chromacut.engine import despill_extract`. Improvements to OSS benefit SaaS automatically. |
| Cloudflare R2 | Zero egress fees. Asset tools have high download volume. S3 would cost $0.09/GB in egress. |

### 7.3 API Endpoints

#### Job Submission

```
POST /api/jobs/generate
Auth: required (session cookie)
Rate limit: per-user, checked against generations_remaining
Body: {
    "prompt": "medieval RPG potions",
    "style": "pixel",           // "pixel" | "flat" | "isometric" | "illustrated"
    "grid": "3x3",              // "1x1" | "2x2" | "3x3" | "4x2" etc.
    "output_size": 512,         // 256 | 512 | 1024 | 2048
    "padding": 0.15,            // 0.0 - 0.30
    "names": ["potion-red", "potion-blue", ...]  // optional, auto-named if omitted
}
Response: { "job_id": "uuid", "status": "pending" }
```

```
POST /api/jobs/extract
Auth: optional — anonymous users get IP-based rate limiting (5/day),
      authenticated users get account-based limits (unlimited for Pro).
      Anonymous extract jobs are ephemeral (download link only, no library save).
Body: multipart/form-data
  - file: source image (max 10MB)
  - settings: JSON string {
      "output_size": 512,
      "padding": 0.15,
      "art_style": "pixel",
      "names": [...]            // optional
    }
Response: { "job_id": "uuid", "status": "pending" }
```

#### Job Polling

```
GET /api/jobs/{id}
Auth: required (must own the job)
Response (pending/processing): {
    "job_id": "uuid",
    "status": "processing",
    "type": "generate"
}
Response (done): {
    "job_id": "uuid",
    "status": "done",
    "assets": [
        { "id": "uuid", "name": "potion-red", "thumbnail_url": "...", "download_url": "..." },
        ...
    ],
    "download_all_url": "..."   // presigned URL for ZIP of all assets
}
Note: thumbnail_url and download_url are generated fresh at read time from
stored R2 object keys (not cached in DB). Presigned URLs expire after 15 minutes.
The job result jsonb stores only stable object keys, never presigned URLs.
Response (failed): {
    "job_id": "uuid",
    "status": "failed",
    "error": "Generation failed: content policy violation"
}
```

#### Asset Library

```
GET /api/assets?page=1&per_page=24
Auth: required
Response: {
    "assets": [ { "id", "name", "thumbnail_url", "width", "height", "source_type", "created_at" } ],
    "total": 47,
    "page": 1,
    "pages": 2
}

DELETE /api/assets/{id}
Auth: required (must own the asset)
Response: { "deleted": true }
```

#### Billing

```
POST /api/billing/checkout
Auth: required
Body: { "plan": "pro" }
Response: { "checkout_url": "https://checkout.stripe.com/..." }

POST /api/billing/portal
Auth: required
Response: { "portal_url": "https://billing.stripe.com/..." }

POST /api/webhooks/stripe
Auth: Stripe signature verification
Idempotency: each event processed exactly once — store stripe_event_id in a
processed_events set (unique constraint). If event ID already exists, return 200
immediately without re-processing. This prevents duplicate credit grants on
webhook retries.
CRITICAL: The insert into processed_stripe_events and the user record update
(e.g., SET generations_remaining = 200) MUST happen in the same database
transaction. If one succeeds and the other fails, you either grant unlimited
credits or drop paid credits.
Events handled:
  - checkout.session.completed → activate Pro, set generations_remaining = 200
  - customer.subscription.updated → update plan/period
  - customer.subscription.deleted → downgrade to free
  - invoice.payment_failed → mark past_due, email user
  - invoice.paid (renewal) → reset generations_remaining = 200
```

### 7.4 Database Schema

Four tables plus one idempotency table. Nothing speculative.

```sql
-- Users
create table users (
    id uuid primary key default gen_random_uuid(),
    email text unique not null,
    name text,
    google_id text unique,
    stripe_customer_id text unique,
    plan text not null default 'free',
    generations_remaining int not null default 3,
    plan_period_end timestamptz,
    created_at timestamptz default now(),
    updated_at timestamptz default now()
);

-- Jobs (async processing queue state)
create table jobs (
    id uuid primary key default gen_random_uuid(),
    user_id uuid references users(id) on delete cascade,
    type text not null,                      -- 'generate' | 'extract'
    status text not null default 'pending',  -- 'pending' | 'processing' | 'done' | 'failed'
    input jsonb not null,                    -- prompt/style/grid OR upload_key + settings
    result jsonb,                            -- asset IDs + R2 object keys (never presigned URLs), or error message
    created_at timestamptz default now(),
    completed_at timestamptz
);

-- Assets (user's saved output files)
create table assets (
    id uuid primary key default gen_random_uuid(),
    user_id uuid references users(id) on delete cascade,
    job_id uuid references jobs(id) on delete set null,
    name text not null,
    file_key text not null,                  -- R2 object key: assets/{user_id}/{uuid}.png
    thumbnail_key text,                      -- R2 key: thumbnails/{user_id}/{uuid}.png
    width int,
    height int,
    file_size int,
    source_type text not null,               -- 'generated' | 'uploaded'
    art_style text,                          -- 'pixel' | 'flat' | 'isometric' | 'illustrated'
    created_at timestamptz default now()
);

-- Stripe webhook idempotency
create table processed_stripe_events (
    event_id text primary key,               -- Stripe event ID (evt_...)
    event_type text not null,
    processed_at timestamptz default now()
);

-- Indexes
create index idx_jobs_user_status on jobs(user_id, status);
create index idx_jobs_status on jobs(status) where status in ('pending', 'processing');
create index idx_assets_user_id on assets(user_id);
create index idx_assets_created on assets(user_id, created_at desc);
```

### 7.5 Object Storage Layout (Cloudflare R2)

```
chromacut-assets/                              # Single R2 bucket
├── uploads/{user_id}/{job_id}.png             # Source images for extract jobs
├── assets/{user_id}/{asset_id}.png            # Final extracted PNGs
├── thumbnails/{user_id}/{asset_id}.png        # 128px preview thumbnails
└── zips/{user_id}/{job_id}.zip                # Pre-built ZIP downloads (TTL: 1 hour)
```

**Lifecycle rules:**
- `uploads/*` → auto-delete after 24 hours
- `zips/*` → auto-delete after 1 hour
- `assets/*` and `thumbnails/*` → persist until user deletes
- Free users: assets not stored (download-only at job completion)
- Pro users: 1GB storage cap, enforced at upload time

### 7.6 Auth

**Provider:** Google OAuth via Authlib (Python library, no Node.js dependency).

**Flow:**
1. User clicks "Sign in with Google"
2. Redirect to Google OAuth consent screen
3. Callback to `/api/auth/callback/google`
4. Server creates/updates user record, sets session cookie
5. Session cookie: HTTPOnly, Secure, SameSite=Lax, 30-day expiry
6. Session identity stored as a signed JWT in the cookie (no server-side session table)

**Anonymous usage (extraction only):**
- Anonymous users can use the Extract tab without signing in (5 extractions/day)
- Rate limited by IP address (no cookie-based identity for anonymous users)
- No asset library — download-only at job completion

**Account required for generation:**
- Sign up via Google OAuth to get 3 free generation credits
- Each generation costs 1 credit and ~$0.02 in API fees — anonymous generation is not offered
- On sign-up: create user record, issue authenticated JWT, grant 3 credits

**Why Google OAuth only (at launch):**
- Lowest friction for target audience
- Single provider simplifies implementation
- Add GitHub OAuth post-launch if devs request it
- No email/password — avoids password reset flows, credential stuffing, bcrypt costs

### 7.7 Generation Pipeline

**Prompt engineering layer:**

The user provides a short description ("medieval RPG potions") and selects a style + grid size. The system builds an optimized prompt for Imagen 3:

```python
STYLE_TEMPLATES = {
    "pixel": {
        "prefix": "Harmless 2D video game UI asset. Pixel art in SNES 16-bit style,",
        "suffix": "on solid #00FF00 green chroma-key background. NO anti-aliasing. Sharp pixel edges.",
        "colors": "Use 3-4 warm earthy colors per icon. No green in artwork (use sage #8B9B6B for green elements).",
    },
    "flat": {
        "prefix": "Harmless 2D video game UI asset. Flat geometric icon,",
        "suffix": "on solid #00FF00 green chroma-key background. Clean vector edges.",
        "colors": "Bold primary colors, minimal palette.",
    },
    "isometric": {
        "prefix": "Harmless 2D video game UI asset. Detailed isometric illustration,",
        "suffix": "on solid #00FF00 green chroma-key background. Consistent 30-degree angle.",
        "colors": "Rich color palette with subtle shading.",
    },
    "illustrated": {
        "prefix": "Harmless 2D video game UI asset. Hand-drawn illustration style,",
        "suffix": "on solid #00FF00 green chroma-key background.",
        "colors": "Natural color palette.",
    },
}

GRID_INSTRUCTIONS = {
    "1x1": "Single centered icon.",
    "2x2": "2x2 grid of 4 distinct icons, 80px gap between each, black label strip below with names.",
    "3x3": "3x3 grid of 9 distinct icons, 80px gap between each, black label strip below with names.",
    "4x2": "4x2 grid of 8 distinct icons, 80px gap between each, black label strip below with names.",
}
```

**API call:**
- Imagen 3 Fast via Google Vertex AI (or Google AI Studio free tier for development)
- Cost: ~$0.02/image (Vertex AI), free during development (AI Studio)
- Timeout: 30 seconds
- Retry: 1 retry on 5xx, no retry on 4xx (content policy)
- Output: 1024x1024 or 1408x768 (grid) PNG

**Post-generation pipeline:**
1. Receive green-screen image from Imagen 3
2. Run `analyze_image()` → detect grid cells
3. For each cell: `despill_extract()` → `pad_and_resize()`
4. Upload each result PNG to R2
5. Generate thumbnails (128px)
6. Create asset records in DB
7. Build ZIP of all PNGs, upload to R2
8. Update job `result` jsonb with asset IDs and R2 object keys (never presigned URLs — those are generated at read time by the API)
9. Set job status to `'done'`

**Worker retry and failure policy:**
- **Max retries:** 2 (total 3 attempts including initial)
- **Backoff:** exponential — 5s, then 30s
- **Retryable errors:** HTTP 5xx from Imagen API, R2 upload failures, transient DB connection errors
- **Non-retryable errors:** HTTP 4xx from Imagen API (content policy violation, bad request), image processing failures (corrupt image, dimension exceeded), credit insufficient
- **Dead letter:** after max retries exhausted, set job status to `'failed'` with error message in `result` jsonb. Failed generation jobs refund the reserved credit (atomic `UPDATE users SET generations_remaining = generations_remaining + 1`)
- **Timeout:** 90 seconds per job (covers Imagen API latency + extraction + upload). Worker kills job after timeout and marks as failed.

**Content moderation note:** Style templates should include the phrase "harmless 2D video game UI asset" to reduce false positives from AI safety filters on legitimate game art (swords, potions, skulls). A/B test Imagen 3 Fast vs Gemini Flash Image during development for grid layout adherence.

---

## 8. Frontend Architecture

The SaaS frontend extends the existing chromacut vanilla JS frontend. No framework rewrite.

### 8.1 New Pages/Views

The SPA gains these views (routed client-side via hash or simple path matching):

| View | Purpose | New? |
|------|---------|------|
| `/` | Marketing landing page | New |
| `/app` | Main workspace (generate + extract tabs) | Extended from current |
| `/app/library` | Asset library grid | New |
| `/app/settings` | Account + billing | New |
| `/login` | Google OAuth initiation | New (minimal) |

### 8.2 Changes to Existing Frontend

The current extraction workflow (drop zone → analyze → preview → edit → export) is preserved intact. Extensions:

- **Generate tab** added alongside Extract tab in the workspace
  - Style preset selector (4 buttons: pixel, flat, isometric, illustrated)
  - Text input for asset description
  - Grid size selector (1x1, 2x2, 3x3, 4x2)
  - "Generate" button → submits job → shows spinner → polls with adaptive backoff (2s → 4s → 8s) → shows results in the same preview/edit UI
- **Auth header** added to layout (sign in / user avatar / credits remaining)
- **Library view** added (CSS grid of asset thumbnails, click to view/download/delete)
- **Job status indicator** (spinner + progress text during generation)

### 8.3 Styling

Carry over the existing design system from `docs/design.md`:
- Dark theme, VFX tool aesthetic
- CSS custom properties for all tokens
- Outfit + DM Mono fonts
- Accent: chroma green for UI, magenta for overlays

New components follow the same design language. No Tailwind, no component library.

---

## 9. Security Baseline (Launch Gate)

These are hard requirements. The app does not go public without all of them passing.

| Control | Implementation |
|---------|---------------|
| **Authentication** | Session cookies (HTTPOnly, Secure, SameSite=Lax). Google OAuth via Authlib. CSRF token on all state-changing requests. |
| **Authorization** | Mutation endpoints require session (except anonymous extract). Users can only access their own jobs, assets, billing. Anonymous extract jobs are keyed by job_id (unguessable UUID) — no session needed to poll or download. |
| **Rate limiting** | slowapi middleware with two limit pools: **Mutation** (job submission, asset delete, billing): Free 5 extractions/day by IP, 3 generations total by account. Pro: 200 generations/mo by account. **Polling** (`GET /api/jobs/{id}`): soft-capped at 30 req/min per session/IP. Client uses adaptive backoff (2s→4s→8s). Polling does not count against mutation limits. |
| **Upload validation** | Enforce 10MB file size at ASGI middleware layer (reject before full spool to memory — configure uvicorn `--limit-request-body` or use Starlette middleware to check `Content-Length` header and stream bytes with a cap). Validate image header (PNG/JPEG/WebP magic bytes). Set `Image.MAX_IMAGE_PIXELS = 25_000_000` (5000x5000) to prevent decompression bombs. Reject images with decoded dimensions >5000px on either axis. Per-job processing timeout: 60 seconds. |
| **Prompt sanitization** | Strip control characters. Max 500 characters. Log prompts for abuse review (90-day retention, auto-purge after). |
| **Storage isolation** | All R2 keys include user_id. Presigned URLs for downloads (15-minute expiry). No direct bucket access. |
| **HTTPS** | Enforced by hosting platform (Railway/Fly.io). HSTS header. |
| **Content policy** | Imagen 3 has built-in safety filtering. Log and surface "content policy violation" errors to users. Do not expose raw API errors. |
| **Stripe security** | Webhook signature verification. No client-side price/plan logic — all enforced server-side. |
| **Dependency scanning** | pip-audit in CI. No known CVEs in production dependencies. |

---

## 10. Validation Gates

Metrics that must be met before investing in further features:

**Pre-build (interest validation):**

| Gate | Metric | Measured after | If not met |
|------|--------|---------------|------------|
| **A** | 100 email signups on landing page | 2 weeks of promotion | Revisit value prop before building |

Note: email signups validate interest, not willingness to pay. Gate A is a necessary-but-not-sufficient signal.

**Post-launch (paid intent validation — north star: trial-to-paid conversion):**

| Gate | Metric | Measured after | If not met |
|------|--------|---------------|------------|
| **B** | 20 users complete first asset generation + download | 2 weeks post-launch | Investigate UX friction |
| **C** | >30% of trial users complete at least 1 full job | 2 weeks post-launch | Simplify onboarding flow |
| **D** | 5 users convert to Pro | 30 days post-launch | Revisit pricing or value prop |
| **E** | Median job completion < 15s, p95 < 45s | Ongoing | Add worker capacity or optimize pipeline |
| **F** | Monthly churn < 15% | 60 days post-launch | Investigate why users leave, survey churned users |
| **G** | Contribution margin per Pro user > 45% | 60 days post-launch | Adjust pricing or reduce generation costs |

---

## 11. Infrastructure

### 11.1 Hosting

| Service | Tier | Monthly Cost | Purpose |
|---------|------|-------------|---------|
| Railway (or Fly.io) | Starter | $5-7 | FastAPI app + background worker |
| Supabase | Free | $0 | Postgres database (500MB, 50k rows) |
| Redis | Upstash free or Railway addon | $0-3 | Job queue (ARQ/RQ) |
| Cloudflare R2 | Free tier | $0 | Object storage (10GB, 10M reads/mo) |
| Stripe | Pay-as-you-go | 2.9% + $0.30/txn | Payment processing |
| Google Vertex AI | Pay-per-use | ~$0.02/generation | Imagen 3 Fast API |
| Domain | Annual | ~$12/year | chromacut.app |
| **Total fixed** | | **~$7/mo** | Before any generation API usage |

### 11.2 Scaling Triggers

| Trigger | Threshold | Action | Added Cost |
|---------|-----------|--------|-----------|
| Response time | p95 > 3s on API routes | Add Railway container | +$5/mo |
| Job queue depth | >10 pending jobs sustained | Add dedicated worker container | +$5/mo |
| Database size | >400MB / 40k rows | Upgrade to Supabase Pro | +$25/mo |
| R2 storage | >10GB | R2 paid tier kicks in | $0.015/GB/mo |
| Concurrent users | >50 simultaneous | Load balancer + 2 containers | +$15/mo |

---

## 12. Relationship to Open-Source Chromacut

The SaaS is a **separate project** that imports chromacut as a dependency:

```
chromacut/          # Open-source (this repo)
  src/chromacut/
    engine.py       # Despill, erosion, resize
    grid.py         # Grid detection
    utils.py        # Sanitization
    cli.py          # CLI interface
    app.py          # Local web UI

chromacut-app/      # SaaS (separate repo)
  pyproject.toml    # depends on chromacut
  src/
    server.py       # FastAPI app with auth, billing, jobs
    worker.py       # Background job processing
    generation.py   # Imagen 3 integration + prompt engineering
    storage.py      # R2 operations
    auth.py         # Google OAuth + sessions
    billing.py      # Stripe integration
  static/           # Extended frontend (copies + extends chromacut static/)
  templates/        # Email templates (welcome, payment failed)
  migrations/       # Alembic DB migrations
  tests/
  Dockerfile
```

**Compatibility contract:** The SaaS depends on chromacut's public API:
- `chromacut.engine.despill_extract(img) -> Image`
- `chromacut.engine.pad_and_resize(img, size, padding, resample) -> Image`
- `chromacut.engine.despill_crop(img, cell) -> Image`
- `chromacut.grid.analyze_image(img) -> dict`
- `chromacut.utils.sanitize_name(name) -> str`

These function signatures must not break without a major version bump.

---

## 13. Future Phases (Post-Validation, Not Designed Yet)

These are explicitly deferred. No schema, no architecture, no timeline until validation gates B and C are passed.

- **Collections:** group assets into projects
- **Style memory:** save and reuse prompt templates for consistent art direction
- **Sprite sheet assembly:** arrange extracted assets into engine-ready sprite sheets
- **Animation grids:** generate character sprites with multiple frames/directions
- **Team sharing:** shared asset libraries with role-based access
- **Public API:** REST API with API keys for CI/CD integration
- **Studio tier ($25/mo):** unlocks collections, teams, API, higher limits
- **Native app (Tauri):** desktop wrapper for offline + local generation (if local models become viable)

---

## 14. Decisions (Resolved)

1. **Domain:** Register `chromacut.dev` (developer-focused TLD, likely available). Fallbacks in order: `chromacut.app`, `getchromacut.com`. Check availability and register before landing page goes live.

2. **AI generation API:**
   - **Development:** Google AI Studio free tier (Imagen 3 Fast). Acceptable that Google retains training rights on dev/test prompts — these are throwaway test assets.
   - **Production:** Google Vertex AI (Imagen 3 Fast, ~$0.02/image). Copyright indemnification. No training rights.
   - **Grid adherence:** A/B test Imagen 3 Fast vs Gemini Flash Image during development. Use whichever produces more consistent grid layouts. Decision documented during dev, not deferred.

3. **SynthID watermark:** Accepted. All Imagen outputs carry invisible SynthID. This does not affect visual quality or game engine compatibility. Document transparently in FAQ: "Generated images contain an invisible Google SynthID watermark per Google's terms of service. This does not affect image quality or usage."

4. **Content moderation policy:** Chromacut generates game art. Game art includes weapons, potions, skulls, shields, armor, and fantasy creatures. These are legitimate use cases. Style templates include "harmless 2D video game UI asset" framing to reduce false positives. If Imagen's safety filter rejects a prompt, surface the error clearly: "This prompt was flagged by the AI safety system. Try rephrasing — avoid words like 'blood', 'gore', or 'realistic weapon'. Game art terms like 'sword', 'potion', 'skull' usually work fine." No custom content moderation layer beyond what the AI API provides.

5. **GDPR/privacy and data retention (decided):**
   - Cookie consent banner on landing page and app (essential cookies only — session auth. No analytics cookies at launch).
   - Prompt logs: 90-day retention, auto-purged via scheduled DB job.
   - Account deletion: user clicks "Delete Account" in settings → all DB records (user, jobs, assets) and R2 objects hard-deleted within 48 hours. Implemented as an async cleanup job triggered on account deletion.
   - Data export: on request via settings page, generate JSON export of user record + asset metadata + prompt history. Asset PNGs downloadable directly from library. Turnaround: immediate (generated on request).
   - R2 deletion is permanent (no soft-delete, no recycle bin).
   - Privacy policy page required at launch — use a standard SaaS privacy policy template, customized for image generation + storage.

## 15. Remaining Open Questions (Non-Blocking)

These do not block implementation planning but should be resolved during development:

1. **Imagen 3 Fast vs Gemini Flash Image:** Which produces better grids? Resolve during generation pipeline development with side-by-side testing.
2. **Prompt template refinement:** The initial style templates are starting points. Iterate based on real Imagen output quality during dev.
3. **Email provider for transactional emails** (payment failed, welcome): Resend, Postmark, or SendGrid? Decide when implementing billing webhooks.
