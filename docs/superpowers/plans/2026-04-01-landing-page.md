# Chromacut Landing Page — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a landing page at chromacut.dev that captures emails to validate demand (Gate A: 100 signups) before building the SaaS product.

**Architecture:** Single-page static site served by the existing FastAPI app alongside the extraction tool. New route `/landing` serves the marketing page. Email capture stores to a JSON file on disk (no database needed — this is pre-SaaS). The landing page uses the existing chromacut design system (dark theme, Outfit + DM Mono fonts, chroma green accent).

**Tech Stack:** HTML, CSS (existing design tokens), vanilla JS, FastAPI (existing app.py)

**Spec reference:** `docs/superpowers/specs/2026-04-01-chromacut-saas-design.md` Section 5

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `src/chromacut/static/landing.html` | Create | Landing page HTML — hero, feature sections, email capture form, CLI link |
| `src/chromacut/static/landing.css` | Create | Landing page styles — extends design system tokens from style.css |
| `src/chromacut/static/landing.js` | Create | Email form submission, validation, success/error feedback |
| `src/chromacut/app.py` | Modify | Add `GET /landing` route and `POST /api/waitlist` endpoint |
| `tests/test_api.py` | Modify | Add tests for landing page route and waitlist endpoint |
| `data/waitlist.json` | Created at runtime | Email storage (gitignored) |
| `.gitignore` | Modify | Add `data/` directory |

---

### Task 1: Waitlist API Endpoint

**Files:**
- Modify: `tests/test_api.py`
- Modify: `src/chromacut/app.py`

- [ ] **Step 1: Write failing tests for the waitlist endpoint**

Add to the bottom of `tests/test_api.py`:

```python
import json
from pathlib import Path


class TestWaitlist:
    """Tests for POST /api/waitlist email capture."""

    def test_waitlist_accepts_valid_email(self, client, tmp_path, monkeypatch):
        monkeypatch.setattr("chromacut.app.WAITLIST_PATH", tmp_path / "waitlist.json")
        resp = client.post("/api/waitlist", json={"email": "dev@example.com"})
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "ok"
        # Verify email was persisted
        stored = json.loads((tmp_path / "waitlist.json").read_text())
        assert any(e["email"] == "dev@example.com" for e in stored)

    def test_waitlist_rejects_invalid_email(self, client, tmp_path, monkeypatch):
        monkeypatch.setattr("chromacut.app.WAITLIST_PATH", tmp_path / "waitlist.json")
        resp = client.post("/api/waitlist", json={"email": "not-an-email"})
        assert resp.status_code == 400
        assert "invalid" in resp.json()["error"].lower()

    def test_waitlist_rejects_empty_email(self, client, tmp_path, monkeypatch):
        monkeypatch.setattr("chromacut.app.WAITLIST_PATH", tmp_path / "waitlist.json")
        resp = client.post("/api/waitlist", json={"email": ""})
        assert resp.status_code == 400

    def test_waitlist_deduplicates_email(self, client, tmp_path, monkeypatch):
        monkeypatch.setattr("chromacut.app.WAITLIST_PATH", tmp_path / "waitlist.json")
        client.post("/api/waitlist", json={"email": "dev@example.com"})
        resp = client.post("/api/waitlist", json={"email": "dev@example.com"})
        assert resp.status_code == 200
        stored = json.loads((tmp_path / "waitlist.json").read_text())
        emails = [e["email"] for e in stored]
        assert emails.count("dev@example.com") == 1

    def test_waitlist_rejects_missing_body(self, client, tmp_path, monkeypatch):
        monkeypatch.setattr("chromacut.app.WAITLIST_PATH", tmp_path / "waitlist.json")
        resp = client.post("/api/waitlist", json={})
        assert resp.status_code == 400
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `.venv/bin/python -m pytest tests/test_api.py::TestWaitlist -v`
Expected: FAIL — `WAITLIST_PATH` not defined, `/api/waitlist` returns 404

- [ ] **Step 3: Implement the waitlist endpoint**

Add to `src/chromacut/app.py`, after the existing imports:

```python
import re
from datetime import datetime, timezone
```

Add after the `_guide_cache` declaration:

```python
WAITLIST_PATH = Path(__file__).parent.parent.parent / "data" / "waitlist.json"

_EMAIL_RE = re.compile(r"^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$")
```

Add after the `get_guide` endpoint:

```python
@app.post("/api/waitlist")
async def waitlist(body: dict = None):
    if not body or not body.get("email"):
        return JSONResponse({"error": "Email is required"}, status_code=400)

    email = body["email"].strip().lower()
    if not _EMAIL_RE.match(email):
        return JSONResponse({"error": "Invalid email address"}, status_code=400)

    # Ensure data directory exists
    WAITLIST_PATH.parent.mkdir(parents=True, exist_ok=True)

    # Load existing entries
    entries = []
    if WAITLIST_PATH.exists():
        entries = json.loads(WAITLIST_PATH.read_text())

    # Deduplicate
    if any(e["email"] == email for e in entries):
        return JSONResponse({"status": "ok"})

    entries.append({
        "email": email,
        "signed_up_at": datetime.now(timezone.utc).isoformat(),
    })
    WAITLIST_PATH.write_text(json.dumps(entries, indent=2))

    return JSONResponse({"status": "ok"})
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `.venv/bin/python -m pytest tests/test_api.py::TestWaitlist -v`
Expected: All 5 tests PASS

- [ ] **Step 5: Add data/ to .gitignore**

Append to `.gitignore`:

```
data/
```

- [ ] **Step 6: Commit**

```bash
git add tests/test_api.py src/chromacut/app.py .gitignore
git commit -m "feat(api): add waitlist email capture endpoint"
```

---

### Task 2: Landing Page Route

**Files:**
- Modify: `tests/test_api.py`
- Modify: `src/chromacut/app.py`

- [ ] **Step 1: Write failing test for landing route**

Add to `tests/test_api.py`:

```python
def test_landing_page_returns_html(client):
    resp = client.get("/landing")
    assert resp.status_code == 200
    assert "text/html" in resp.headers["content-type"]
    assert "chromacut" in resp.text.lower()
```

- [ ] **Step 2: Run test to verify it fails**

Run: `.venv/bin/python -m pytest tests/test_api.py::test_landing_page_returns_html -v`
Expected: FAIL — 404

- [ ] **Step 3: Add landing route to app.py**

Add after the `index` endpoint in `src/chromacut/app.py`:

```python
@app.get("/landing", response_class=HTMLResponse)
async def landing():
    landing_file = STATIC_DIR / "landing.html"
    if landing_file.exists():
        return HTMLResponse(landing_file.read_text())
    return HTMLResponse("<h1>chromacut</h1><p>Landing page not found.</p>")
```

- [ ] **Step 4: Create a minimal landing.html placeholder**

Create `src/chromacut/static/landing.html` with:

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>chromacut — AI-generated assets, production-ready in seconds</title>
</head>
<body>
    <h1>chromacut</h1>
</body>
</html>
```

- [ ] **Step 5: Run test to verify it passes**

Run: `.venv/bin/python -m pytest tests/test_api.py::test_landing_page_returns_html -v`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/chromacut/app.py src/chromacut/static/landing.html tests/test_api.py
git commit -m "feat(app): add landing page route"
```

---

### Task 3: Landing Page HTML

**Files:**
- Modify: `src/chromacut/static/landing.html`

This is the full landing page content. No test step — this is static markup validated visually.

- [ ] **Step 1: Write the complete landing.html**

Replace the placeholder `src/chromacut/static/landing.html` with the full landing page:

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>chromacut — AI-generated assets, production-ready in seconds</title>
    <meta name="description" content="Generate clean, transparent game assets from AI in seconds. Pixel art, icons, sprites — no Photoshop required.">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="/static/landing.css">
</head>
<body>
    <!-- Header -->
    <header class="landing-header">
        <div class="landing-header-inner">
            <span class="landing-logo">chromacut</span>
            <a href="https://github.com/LucasGeno/chromacut" class="landing-github-link" target="_blank" rel="noopener">
                GitHub
            </a>
        </div>
    </header>

    <!-- Hero -->
    <section class="landing-hero">
        <h1 class="landing-hero-title">
            AI-generated assets,<br>
            <span class="landing-hero-accent">production-ready in seconds.</span>
        </h1>
        <p class="landing-hero-subtitle">
            Describe the assets you need. Pick a style. Get clean, transparent PNGs — no Photoshop, no manual cleanup, no green-screen knowledge required.
        </p>
        <div class="landing-cta-group">
            <a href="#waitlist" class="landing-cta-primary">Get early access</a>
            <a href="https://github.com/LucasGeno/chromacut" class="landing-cta-secondary" target="_blank" rel="noopener">Try the CLI (free)</a>
        </div>
    </section>

    <!-- How it works -->
    <section class="landing-section">
        <h2 class="landing-section-title">How it works</h2>
        <div class="landing-steps">
            <div class="landing-step">
                <span class="landing-step-number">1</span>
                <h3>Describe</h3>
                <p>Type what you need: "medieval RPG potions, pixel art, 3x3 grid"</p>
            </div>
            <div class="landing-step">
                <span class="landing-step-number">2</span>
                <h3>Generate</h3>
                <p>AI creates your assets on a green screen — optimized prompts handle the details</p>
            </div>
            <div class="landing-step">
                <span class="landing-step-number">3</span>
                <h3>Extract</h3>
                <p>VFX-quality pipeline removes the background, cleans edges, and exports transparent PNGs</p>
            </div>
        </div>
    </section>

    <!-- Features -->
    <section class="landing-section landing-section-alt">
        <h2 class="landing-section-title">Built for game developers</h2>
        <div class="landing-features">
            <div class="landing-feature">
                <h3>VFX-quality extraction</h3>
                <p>Industry-standard despill algorithm removes green fringe completely. No more colored halos on dark backgrounds.</p>
            </div>
            <div class="landing-feature">
                <h3>Grid-aware</h3>
                <p>Generate 9 icons in one image. Auto-detection splits them into individual transparent PNGs, named and ready to use.</p>
            </div>
            <div class="landing-feature">
                <h3>Style-aware output</h3>
                <p>Pixel art stays pixel-perfect (nearest-neighbor). Illustrations stay smooth (Lanczos). You pick the style, we handle the rest.</p>
            </div>
            <div class="landing-feature">
                <h3>Privacy-first</h3>
                <p>Open-source CLI runs 100% offline for sensitive projects. Cloud version for convenience when you want it.</p>
            </div>
        </div>
    </section>

    <!-- Waitlist -->
    <section class="landing-section" id="waitlist">
        <h2 class="landing-section-title">Get early access</h2>
        <p class="landing-section-subtitle">We're building the cloud version. Sign up to be first in line.</p>
        <form class="landing-waitlist-form" id="waitlist-form">
            <input type="email" id="waitlist-email" placeholder="you@example.com" required autocomplete="email">
            <button type="submit" id="waitlist-submit">Join waitlist</button>
        </form>
        <p class="landing-waitlist-feedback" id="waitlist-feedback"></p>
    </section>

    <!-- Footer -->
    <footer class="landing-footer">
        <p>
            <a href="https://github.com/LucasGeno/chromacut" target="_blank" rel="noopener">GitHub</a>
            &middot;
            <span class="landing-footer-text">MIT License</span>
            &middot;
            <span class="landing-footer-text">pip install chromacut</span>
        </p>
    </footer>

    <script src="/static/landing.js"></script>
</body>
</html>
```

- [ ] **Step 2: Verify landing page renders**

Run: `.venv/bin/python -m chromacut --no-open`

Open browser to `http://localhost:6100/landing`. Verify:
- Page loads with dark background
- Hero text is visible
- Email form is present
- GitHub link works
- No console errors

- [ ] **Step 3: Commit**

```bash
git add src/chromacut/static/landing.html
git commit -m "feat(landing): add full landing page markup"
```

---

### Task 4: Landing Page CSS

**Files:**
- Create: `src/chromacut/static/landing.css`

- [ ] **Step 1: Write the landing page stylesheet**

Create `src/chromacut/static/landing.css`:

```css
/* Landing page styles — uses same design tokens as the app */

:root {
    /* Surfaces */
    --bg-deep: #08080c;
    --bg-base: #0e0e15;
    --bg-raised: #16161f;
    --bg-input: #12121a;
    --bg-hover: #1f1f2c;

    /* Text */
    --text-bright: #f0f0f4;
    --text: #d4d4dc;
    --text-dim: #8888a0;
    --text-muted: #5a5a72;

    /* Accent — Chroma Green */
    --accent: #44e044;
    --accent-dim: #2a8a2a;
    --accent-glow: #44e04422;
    --accent-text: #66ff66;

    /* Borders */
    --border: #2a2a3a;

    /* Spacing */
    --gap-xs: 4px;
    --gap-sm: 8px;
    --gap-md: 16px;
    --gap-lg: 24px;
    --gap-xl: 32px;

    /* Radii */
    --radius-sm: 4px;
    --radius-md: 6px;
    --radius-lg: 10px;
}

* {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
}

body {
    font-family: 'Outfit', system-ui, -apple-system, sans-serif;
    background: var(--bg-deep);
    color: var(--text);
    line-height: 1.6;
    -webkit-font-smoothing: antialiased;
}

/* Header */

.landing-header {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    z-index: 100;
    background: var(--bg-deep);
    border-bottom: 1px solid var(--border);
    backdrop-filter: blur(12px);
}

.landing-header-inner {
    max-width: 960px;
    margin: 0 auto;
    padding: 12px 24px;
    display: flex;
    justify-content: space-between;
    align-items: center;
}

.landing-logo {
    font-family: 'DM Mono', monospace;
    font-size: 16px;
    font-weight: 500;
    color: var(--accent-text);
    letter-spacing: -0.5px;
}

.landing-github-link {
    font-family: 'DM Mono', monospace;
    font-size: 13px;
    color: var(--text-dim);
    text-decoration: none;
    padding: 6px 12px;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    transition: border-color 0.15s, color 0.15s;
}

.landing-github-link:hover {
    border-color: var(--text-dim);
    color: var(--text);
}

/* Hero */

.landing-hero {
    max-width: 960px;
    margin: 0 auto;
    padding: 140px 24px 80px;
    text-align: center;
}

.landing-hero-title {
    font-size: clamp(28px, 5vw, 48px);
    font-weight: 700;
    color: var(--text-bright);
    line-height: 1.2;
    margin-bottom: 20px;
    letter-spacing: -1px;
}

.landing-hero-accent {
    color: var(--accent);
}

.landing-hero-subtitle {
    font-size: 18px;
    color: var(--text-dim);
    max-width: 580px;
    margin: 0 auto 32px;
    line-height: 1.6;
}

.landing-cta-group {
    display: flex;
    gap: var(--gap-md);
    justify-content: center;
    flex-wrap: wrap;
}

.landing-cta-primary {
    font-family: 'Outfit', sans-serif;
    font-size: 15px;
    font-weight: 600;
    color: var(--bg-deep);
    background: var(--accent);
    padding: 12px 28px;
    border-radius: var(--radius-md);
    text-decoration: none;
    transition: background 0.15s, transform 0.1s;
}

.landing-cta-primary:hover {
    background: var(--accent-text);
    transform: translateY(-1px);
}

.landing-cta-secondary {
    font-family: 'DM Mono', monospace;
    font-size: 14px;
    color: var(--text-dim);
    padding: 12px 28px;
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    text-decoration: none;
    transition: border-color 0.15s, color 0.15s;
}

.landing-cta-secondary:hover {
    border-color: var(--text-dim);
    color: var(--text);
}

/* Sections */

.landing-section {
    max-width: 960px;
    margin: 0 auto;
    padding: 80px 24px;
}

.landing-section-alt {
    background: var(--bg-base);
    max-width: 100%;
    padding-left: calc((100% - 960px) / 2 + 24px);
    padding-right: calc((100% - 960px) / 2 + 24px);
}

.landing-section-title {
    font-size: 24px;
    font-weight: 600;
    color: var(--text-bright);
    text-align: center;
    margin-bottom: var(--gap-xl);
    letter-spacing: -0.5px;
}

.landing-section-subtitle {
    font-size: 16px;
    color: var(--text-dim);
    text-align: center;
    margin-top: -16px;
    margin-bottom: var(--gap-xl);
}

/* Steps */

.landing-steps {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
    gap: var(--gap-xl);
}

.landing-step {
    text-align: center;
    padding: var(--gap-lg);
}

.landing-step-number {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
    border-radius: 50%;
    background: var(--accent-glow);
    color: var(--accent);
    font-family: 'DM Mono', monospace;
    font-size: 14px;
    font-weight: 500;
    margin-bottom: var(--gap-md);
}

.landing-step h3 {
    font-size: 16px;
    font-weight: 600;
    color: var(--text-bright);
    margin-bottom: var(--gap-sm);
}

.landing-step p {
    font-size: 14px;
    color: var(--text-dim);
    line-height: 1.5;
}

/* Features */

.landing-features {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
    gap: var(--gap-lg);
}

.landing-feature {
    padding: var(--gap-lg);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    background: var(--bg-raised);
}

.landing-feature h3 {
    font-size: 15px;
    font-weight: 600;
    color: var(--text-bright);
    margin-bottom: var(--gap-sm);
}

.landing-feature p {
    font-size: 14px;
    color: var(--text-dim);
    line-height: 1.5;
}

/* Waitlist form */

.landing-waitlist-form {
    display: flex;
    gap: var(--gap-sm);
    max-width: 440px;
    margin: 0 auto;
    justify-content: center;
}

.landing-waitlist-form input[type="email"] {
    flex: 1;
    font-family: 'DM Mono', monospace;
    font-size: 14px;
    padding: 12px 16px;
    background: var(--bg-input);
    color: var(--text);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    outline: none;
    transition: border-color 0.15s;
}

.landing-waitlist-form input[type="email"]:focus {
    border-color: var(--accent-dim);
}

.landing-waitlist-form input[type="email"]::placeholder {
    color: var(--text-muted);
}

.landing-waitlist-form button {
    font-family: 'Outfit', sans-serif;
    font-size: 14px;
    font-weight: 600;
    padding: 12px 24px;
    background: var(--accent-dim);
    color: var(--accent-text);
    border: none;
    border-radius: var(--radius-md);
    cursor: pointer;
    transition: background 0.15s;
    white-space: nowrap;
}

.landing-waitlist-form button:hover {
    background: var(--accent);
    color: var(--bg-deep);
}

.landing-waitlist-form button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
}

.landing-waitlist-feedback {
    text-align: center;
    margin-top: var(--gap-md);
    font-size: 14px;
    min-height: 20px;
}

.landing-waitlist-feedback.success {
    color: var(--accent);
}

.landing-waitlist-feedback.error {
    color: #e04444;
}

/* Footer */

.landing-footer {
    max-width: 960px;
    margin: 0 auto;
    padding: 40px 24px;
    text-align: center;
    border-top: 1px solid var(--border);
}

.landing-footer p {
    font-size: 13px;
    color: var(--text-muted);
}

.landing-footer a {
    color: var(--text-dim);
    text-decoration: none;
    transition: color 0.15s;
}

.landing-footer a:hover {
    color: var(--text);
}

.landing-footer-text {
    font-family: 'DM Mono', monospace;
}

/* Responsive */

@media (max-width: 600px) {
    .landing-hero {
        padding: 100px 16px 60px;
    }

    .landing-section {
        padding: 60px 16px;
    }

    .landing-section-alt {
        padding-left: 16px;
        padding-right: 16px;
    }

    .landing-waitlist-form {
        flex-direction: column;
    }

    .landing-cta-group {
        flex-direction: column;
        align-items: center;
    }
}
```

- [ ] **Step 2: Verify styling renders correctly**

Run: `.venv/bin/python -m chromacut --no-open`

Open `http://localhost:6100/landing`. Verify:
- Dark background with correct color tokens
- Outfit font on body text, DM Mono on logo and code elements
- Green accent on CTA button and hero text
- Responsive layout on mobile viewport (Chrome DevTools toggle)
- Feature cards have raised background with border
- Email input has dark background with monospace font

- [ ] **Step 3: Commit**

```bash
git add src/chromacut/static/landing.css
git commit -m "feat(landing): add landing page styles"
```

---

### Task 5: Email Form JavaScript

**Files:**
- Create: `src/chromacut/static/landing.js`

- [ ] **Step 1: Write the email form handler**

Create `src/chromacut/static/landing.js`:

```javascript
(function () {
    "use strict";

    const form = document.getElementById("waitlist-form");
    const emailInput = document.getElementById("waitlist-email");
    const submitBtn = document.getElementById("waitlist-submit");
    const feedback = document.getElementById("waitlist-feedback");

    if (!form) return;

    form.addEventListener("submit", async function (e) {
        e.preventDefault();

        const email = emailInput.value.trim();
        if (!email) return;

        submitBtn.disabled = true;
        submitBtn.textContent = "Joining...";
        feedback.textContent = "";
        feedback.className = "landing-waitlist-feedback";

        try {
            const resp = await fetch("/api/waitlist", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email }),
            });

            const data = await resp.json();

            if (resp.ok) {
                feedback.textContent = "You're on the list. We'll be in touch.";
                feedback.className = "landing-waitlist-feedback success";
                emailInput.value = "";
            } else {
                feedback.textContent = data.error || "Something went wrong. Try again.";
                feedback.className = "landing-waitlist-feedback error";
            }
        } catch {
            feedback.textContent = "Network error. Check your connection and try again.";
            feedback.className = "landing-waitlist-feedback error";
        } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = "Join waitlist";
        }
    });
})();
```

- [ ] **Step 2: Test the full flow manually**

Run: `.venv/bin/python -m chromacut --no-open`

Open `http://localhost:6100/landing`:
1. Enter a valid email → click "Join waitlist" → see green success message
2. Enter the same email again → still shows success (dedup, no error)
3. Enter "not-an-email" → see red error message
4. Submit empty → browser validation prevents submission (required attribute)
5. Check `data/waitlist.json` exists and contains the email entry

- [ ] **Step 3: Commit**

```bash
git add src/chromacut/static/landing.js
git commit -m "feat(landing): add email form submission handler"
```

---

### Task 6: Integration Test — Full Landing Page Flow

**Files:**
- Modify: `tests/test_api.py`

- [ ] **Step 1: Write an integration test for the full flow**

Add to `tests/test_api.py`:

```python
def test_landing_page_has_waitlist_form(client):
    resp = client.get("/landing")
    assert resp.status_code == 200
    assert 'id="waitlist-form"' in resp.text
    assert 'id="waitlist-email"' in resp.text


def test_landing_page_links_to_github(client):
    resp = client.get("/landing")
    assert resp.status_code == 200
    assert "github.com/LucasGeno/chromacut" in resp.text
```

- [ ] **Step 2: Run all tests**

Run: `.venv/bin/python -m pytest -v`
Expected: All tests pass (existing + new landing/waitlist tests)

- [ ] **Step 3: Commit**

```bash
git add tests/test_api.py
git commit -m "test(landing): add integration tests for landing page"
```

---

### Task 7: SEO and Meta Tags

**Files:**
- Modify: `src/chromacut/static/landing.html`

- [ ] **Step 1: Add Open Graph and Twitter meta tags**

Add inside the `<head>` of `landing.html`, after the existing meta tags:

```html
    <!-- Open Graph -->
    <meta property="og:title" content="chromacut — AI-generated assets, production-ready in seconds">
    <meta property="og:description" content="Generate clean, transparent game assets from AI in seconds. Pixel art, icons, sprites — no Photoshop required.">
    <meta property="og:type" content="website">
    <meta property="og:url" content="https://chromacut.dev">

    <!-- Twitter -->
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="chromacut — AI-generated assets, production-ready in seconds">
    <meta name="twitter:description" content="Generate clean, transparent game assets from AI in seconds. No Photoshop required.">
```

- [ ] **Step 2: Commit**

```bash
git add src/chromacut/static/landing.html
git commit -m "feat(landing): add SEO meta tags"
```

---

## Post-Completion

After all tasks are complete:

1. Deploy chromacut with the landing page to a public URL (chromacut.dev or temporary Railway/Fly.io URL)
2. Post Show HN, r/gamedev, r/indiedev, r/pixelart, itch.io forums, Twitter/X
3. Monitor `data/waitlist.json` for signups
4. **Gate A: 100 email signups within 2 weeks** → proceed to Plan 2 (SaaS MVP)
5. If <100 signups → revisit value proposition before building SaaS
