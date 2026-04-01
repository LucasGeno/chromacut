# Chromacut Landing Page — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a landing page at chromacut.dev that captures emails to validate demand (Gate A: 100 signups) before building the SaaS product.

**Architecture:** Standalone static site deployed to Cloudflare Pages. No modifications to `src/chromacut/` or `app.py`. Email capture via Formspree paid tier ($8/mo — handles deduplication, spam filtering, rate limiting, and has no submission cap). The landing page mirrors chromacut's visual identity (dark theme, Outfit + DM Mono fonts, chroma green accent) by copying the hex values from `docs/design.md` — there is no shared CSS import mechanism, so values are duplicated. This is acceptable for a throwaway validation page.

**Tech Stack:** HTML, CSS. Hosted on Cloudflare Pages. Formspree (paid) for email capture.

**Spec reference:** `docs/superpowers/specs/2026-04-01-chromacut-saas-design.md` Section 5

**Why not inside chromacut?** This is a throwaway validation experiment. If Gate A fails, the page gets deleted. If it passes, the SaaS is a separate project (`chromacut-app/`). Either way, coupling marketing assets to the extraction tool creates tech debt that gets immediately ripped out.

---

## File Map

All files live in a new directory `landing/` at the repo root. This directory is a self-contained static site that deploys independently.

| File | Responsibility |
|------|---------------|
| `landing/index.html` | Landing page — hero, features, waitlist form, CLI link |
| `landing/style.css` | Styles — chromacut design tokens, layout, responsive |
| `landing/_headers` | Cloudflare Pages headers (cache, security) |

No JavaScript file needed — the form submits directly to Formspree via HTML `action` attribute. No client-side fetch, no IIFE, no race conditions.

---

### Task 1: Set Up Formspree

**Files:** None (external service setup)

- [ ] **Step 1: Create Formspree form**

Go to https://formspree.io and create an account. Sign up for the **paid tier ($8/mo)** — the free tier caps at 50 submissions/month which is below the 100-signup validation gate. Create a new form:
- Name: "chromacut waitlist"
- Forward to: your email address

Copy the form endpoint URL. It will look like: `https://formspree.io/f/xABcDeFg`

Formspree paid tier includes:
- 1,000 submissions/month (well above Gate A target)
- Spam filtering (reCAPTCHA, honeypot)
- Deduplication
- CSV export of submissions
- Email notifications on new submissions
- Custom redirect after submission

- [ ] **Step 2: Configure custom redirect**

In Formspree form settings, set the "Thank You" redirect URL to:
`https://chromacut.dev#thanks`

This sends users back to the landing page after submission instead of Formspree's generic white thank-you page.

- [ ] **Step 3: Note the form endpoint**

Save the endpoint URL — you'll use it in Task 2 as the form's `action` attribute.

---

### Task 2: Landing Page HTML

**Files:**
- Create: `landing/index.html`

- [ ] **Step 1: Create the landing directory**

```bash
mkdir -p landing
```

- [ ] **Step 2: Write the landing page**

Create `landing/index.html`:

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>chromacut — AI-generated assets, production-ready in seconds</title>
    <meta name="description" content="Generate clean, transparent game assets from AI in seconds. Pixel art, icons, sprites — no Photoshop required.">

    <!-- Open Graph -->
    <meta property="og:title" content="chromacut — AI-generated assets, production-ready in seconds">
    <meta property="og:description" content="Generate clean, transparent game assets from AI. Pixel art, icons, sprites — no Photoshop required.">
    <meta property="og:type" content="website">
    <meta property="og:url" content="https://chromacut.dev">

    <!-- Twitter -->
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="chromacut — AI-generated assets, production-ready in seconds">
    <meta name="twitter:description" content="Generate clean, transparent game assets from AI. No Photoshop required.">

    <!-- Fonts -->
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet">

    <link rel="stylesheet" href="/style.css">
</head>
<body>
    <header class="header">
        <div class="header-inner">
            <span class="logo">chromacut</span>
            <a href="https://github.com/LucasGeno/chromacut" class="nav-link" target="_blank" rel="noopener">GitHub</a>
        </div>
    </header>

    <section class="hero">
        <h1>AI-generated assets,<br><span class="accent">production-ready in seconds.</span></h1>
        <p class="subtitle">Describe the assets you need. Pick a style. Get clean, transparent PNGs — no Photoshop, no manual cleanup, no green-screen knowledge required.</p>
        <div class="cta-group">
            <a href="#waitlist" class="cta-primary">Get early access</a>
            <a href="https://github.com/LucasGeno/chromacut" class="cta-secondary" target="_blank" rel="noopener">Try the CLI (free)</a>
        </div>
    </section>

    <section class="section">
        <h2>How it works</h2>
        <div class="steps">
            <div class="step">
                <span class="step-num">1</span>
                <h3>Describe</h3>
                <p>Type what you need: "medieval RPG potions, pixel art, 3x3 grid"</p>
            </div>
            <div class="step">
                <span class="step-num">2</span>
                <h3>Generate</h3>
                <p>AI creates your assets on a green screen — optimized prompts handle the details</p>
            </div>
            <div class="step">
                <span class="step-num">3</span>
                <h3>Extract</h3>
                <p>VFX-quality pipeline removes the background, cleans edges, exports transparent PNGs</p>
            </div>
        </div>
    </section>

    <section class="section section-alt">
        <h2>Built for game developers</h2>
        <div class="features">
            <div class="feature">
                <h3>VFX-quality extraction</h3>
                <p>Industry-standard despill algorithm removes green fringe completely. No colored halos on dark backgrounds.</p>
            </div>
            <div class="feature">
                <h3>Grid-aware</h3>
                <p>Generate 9 icons in one image. Auto-detection splits them into individual transparent PNGs, named and ready.</p>
            </div>
            <div class="feature">
                <h3>Style-aware output</h3>
                <p>Pixel art stays pixel-perfect (nearest-neighbor). Illustrations stay smooth (Lanczos). You pick the style.</p>
            </div>
            <div class="feature">
                <h3>Privacy-first</h3>
                <p>Open-source CLI runs 100% offline. Cloud version for convenience when you want it.</p>
            </div>
        </div>
    </section>

    <section class="section" id="waitlist">
        <h2>Get early access</h2>
        <p class="section-sub">We're building the cloud version. Sign up to be first in line.</p>
        <!-- Formspree handles dedup, spam filtering, rate limiting -->
        <form class="waitlist-form" action="https://formspree.io/f/YOUR_FORM_ID" method="POST">
            <input type="email" name="email" placeholder="you@example.com" required autocomplete="email">
            <!-- Redirect back to landing page after submission -->
            <input type="hidden" name="_next" value="https://chromacut.dev#thanks">
            <!-- Formspree honeypot for spam -->
            <input type="text" name="_gotcha" style="display:none">
            <button type="submit">Join waitlist</button>
        </form>
    </section>

    <!-- Shown when redirected back after Formspree submission -->
    <section class="section" id="thanks" style="display:none">
        <h2 style="color: var(--accent);">You're on the list.</h2>
        <p class="section-sub">We'll be in touch when the cloud version is ready.</p>
    </section>
    <script>if(location.hash==="#thanks")document.getElementById("thanks").style.display="block";</script>

    <footer class="footer">
        <p>
            <a href="https://github.com/LucasGeno/chromacut" target="_blank" rel="noopener">GitHub</a>
            &middot;
            <span class="mono">MIT License</span>
            &middot;
            <span class="mono">pip install chromacut</span>
        </p>
    </footer>
</body>
</html>
```

**Note:** Replace `YOUR_FORM_ID` with the actual Formspree endpoint from Task 1.

- [ ] **Step 3: Commit**

```bash
git add landing/index.html
git commit -m "feat(landing): add landing page HTML with Formspree waitlist form"
```

---

### Task 3: Landing Page CSS

**Files:**
- Create: `landing/style.css`

- [ ] **Step 1: Write the stylesheet**

Create `landing/style.css`. Design tokens match `docs/design.md` — single source of truth.

```css
:root {
    --bg-deep: #08080c;
    --bg-base: #0e0e15;
    --bg-raised: #16161f;
    --bg-input: #12121a;
    --text-bright: #f0f0f4;
    --text: #d4d4dc;
    --text-dim: #8888a0;
    --text-muted: #5a5a72;
    --accent: #44e044;
    --accent-dim: #2a8a2a;
    --accent-glow: #44e04422;
    --accent-text: #66ff66;
    --border: #2a2a3a;
    --radius: 6px;
}

* { margin: 0; padding: 0; box-sizing: border-box; }

body {
    font-family: 'Outfit', system-ui, sans-serif;
    background: var(--bg-deep);
    color: var(--text);
    line-height: 1.6;
    -webkit-font-smoothing: antialiased;
}

.mono { font-family: 'DM Mono', monospace; }

/* Header */
.header {
    position: fixed; top: 0; left: 0; right: 0; z-index: 100;
    background: var(--bg-deep); border-bottom: 1px solid var(--border);
}
.header-inner {
    max-width: 960px; margin: 0 auto; padding: 12px 24px;
    display: flex; justify-content: space-between; align-items: center;
}
.logo {
    font-family: 'DM Mono', monospace; font-size: 16px;
    font-weight: 500; color: var(--accent-text);
}
.nav-link {
    font-family: 'DM Mono', monospace; font-size: 13px;
    color: var(--text-dim); text-decoration: none;
    padding: 6px 12px; border: 1px solid var(--border); border-radius: 4px;
}
.nav-link:hover { border-color: var(--text-dim); color: var(--text); }

/* Hero */
.hero {
    max-width: 960px; margin: 0 auto;
    padding: 140px 24px 80px; text-align: center;
}
.hero h1 {
    font-size: clamp(28px, 5vw, 48px); font-weight: 700;
    color: var(--text-bright); line-height: 1.2;
    margin-bottom: 20px; letter-spacing: -1px;
}
.accent { color: var(--accent); }
.subtitle {
    font-size: 18px; color: var(--text-dim);
    max-width: 580px; margin: 0 auto 32px;
}

/* CTAs */
.cta-group { display: flex; gap: 16px; justify-content: center; flex-wrap: wrap; }
.cta-primary {
    font-family: 'Outfit', sans-serif; font-size: 15px; font-weight: 600;
    color: var(--bg-deep); background: var(--accent);
    padding: 12px 28px; border-radius: var(--radius); text-decoration: none;
}
.cta-primary:hover { background: var(--accent-text); }
.cta-secondary {
    font-family: 'DM Mono', monospace; font-size: 14px;
    color: var(--text-dim); padding: 12px 28px;
    border: 1px solid var(--border); border-radius: var(--radius); text-decoration: none;
}
.cta-secondary:hover { border-color: var(--text-dim); color: var(--text); }

/* Sections */
.section { max-width: 960px; margin: 0 auto; padding: 80px 24px; }
.section h2 {
    font-size: 24px; font-weight: 600; color: var(--text-bright);
    text-align: center; margin-bottom: 32px;
}
.section-sub {
    font-size: 16px; color: var(--text-dim);
    text-align: center; margin: -16px 0 32px;
}
.section-alt {
    background: var(--bg-base); max-width: 100%;
    padding-left: max(24px, calc((100% - 960px) / 2 + 24px));
    padding-right: max(24px, calc((100% - 960px) / 2 + 24px));
}

/* Steps */
.steps { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 32px; }
.step { text-align: center; padding: 24px; }
.step-num {
    display: inline-flex; align-items: center; justify-content: center;
    width: 36px; height: 36px; border-radius: 50%;
    background: var(--accent-glow); color: var(--accent);
    font-family: 'DM Mono', monospace; font-size: 14px; margin-bottom: 16px;
}
.step h3 { font-size: 16px; color: var(--text-bright); margin-bottom: 8px; }
.step p { font-size: 14px; color: var(--text-dim); }

/* Features */
.features { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 24px; }
.feature {
    padding: 24px; border: 1px solid var(--border);
    border-radius: 10px; background: var(--bg-raised);
}
.feature h3 { font-size: 15px; color: var(--text-bright); margin-bottom: 8px; }
.feature p { font-size: 14px; color: var(--text-dim); }

/* Waitlist */
.waitlist-form {
    display: flex; gap: 8px; max-width: 440px;
    margin: 0 auto; justify-content: center;
}
.waitlist-form input[type="email"] {
    flex: 1; font-family: 'DM Mono', monospace; font-size: 14px;
    padding: 12px 16px; background: var(--bg-input); color: var(--text);
    border: 1px solid var(--border); border-radius: var(--radius); outline: none;
}
.waitlist-form input[type="email"]:focus { border-color: var(--accent-dim); }
.waitlist-form input[type="email"]::placeholder { color: var(--text-muted); }
.waitlist-form button {
    font-family: 'Outfit', sans-serif; font-size: 14px; font-weight: 600;
    padding: 12px 24px; background: var(--accent-dim); color: var(--accent-text);
    border: none; border-radius: var(--radius); cursor: pointer; white-space: nowrap;
}
.waitlist-form button:hover { background: var(--accent); color: var(--bg-deep); }

/* Footer */
.footer {
    max-width: 960px; margin: 0 auto; padding: 40px 24px;
    text-align: center; border-top: 1px solid var(--border);
}
.footer p { font-size: 13px; color: var(--text-muted); }
.footer a { color: var(--text-dim); text-decoration: none; }
.footer a:hover { color: var(--text); }

/* Responsive */
@media (max-width: 600px) {
    .hero { padding: 100px 16px 60px; }
    .section { padding: 60px 16px; }
    .section-alt { padding-left: 16px; padding-right: 16px; }
    .waitlist-form { flex-direction: column; }
    .cta-group { flex-direction: column; align-items: center; }
}
```

- [ ] **Step 2: Commit**

```bash
git add landing/style.css
git commit -m "feat(landing): add landing page styles using design system tokens"
```

---

### Task 4: Cloudflare Pages Headers

**Files:**
- Create: `landing/_headers`

- [ ] **Step 1: Write the headers file**

Create `landing/_headers`:

```
/*
  X-Frame-Options: DENY
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin

/style.css
  Cache-Control: public, max-age=3600
```

- [ ] **Step 2: Commit**

```bash
git add landing/_headers
git commit -m "chore(landing): add Cloudflare Pages security headers"
```

---

### Task 5: Deploy to Cloudflare Pages

**Files:** None (deployment configuration)

- [ ] **Step 1: Verify locally**

Open `landing/index.html` directly in a browser (File → Open). Verify:
- Dark background renders
- Fonts load (requires network — Google Fonts)
- Form action points to Formspree
- GitHub link works
- Mobile layout works (resize browser window)
- No console errors

- [ ] **Step 2: Deploy to Cloudflare Pages**

Option A — Via Cloudflare Dashboard:
1. Go to Cloudflare Dashboard → Pages → Create a project
2. Connect to GitHub repo `LucasGeno/chromacut`
3. Set build output directory to `landing/`
4. No build command needed (static files)
5. Set custom domain to `chromacut.dev` (after registering domain)

Option B — Via Wrangler CLI:
```bash
npx wrangler pages deploy landing/ --project-name=chromacut-landing
```

- [ ] **Step 3: Verify deployed site**

Open the Cloudflare Pages URL (e.g., `chromacut-landing.pages.dev` or `chromacut.dev`). Verify:
- Page loads correctly
- Submit a test email via the form
- Check Formspree dashboard for the submission
- Verify Formspree sends notification email

- [ ] **Step 4: Commit any deploy config changes**

```bash
git add -A landing/
git commit -m "chore(landing): configure Cloudflare Pages deployment"
```

---

## Post-Completion

1. Register `chromacut.dev` domain and point to Cloudflare Pages
2. Replace `YOUR_FORM_ID` in `index.html` with actual Formspree endpoint
3. Post on: Hacker News (Show HN), r/gamedev, r/indiedev, r/pixelart, itch.io forums, Twitter/X
4. Monitor Formspree dashboard for signups
5. **Gate A: 100 email signups within 2 weeks** → proceed to Plan 2 (SaaS MVP)
6. If <100 signups → revisit value proposition before building SaaS
