/* ============================================================
   auth.js — umbrella chrome + gated-state UX.

   Behind the umbrella (admin present), GET /auth/me returns identity JSON;
   the generate actions (analyze/extract/preview) work for signed-in users.
   Standalone (`python -m chromacut`), /auth/me 404s. Loopback hosts use the
   local backend directly; every non-loopback host remains anonymous.

   Also owns the theme toggle (mirrors the umbrella BaseLayout handler).
   ============================================================ */

// Module-level identity state, read by the API guards in app/export/interaction.
export const auth = {
  authenticated: false,
  loginUrl: "/login",
  resolved: false,
};

/** True once we know the visitor is signed in. Until /auth/me resolves we
 *  optimistically allow nothing destructive; analyze() awaits ensureResolved. */
export function isAuthed() {
  return auth.authenticated === true;
}

let _resolvePromise = null;
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

/** Fetch identity once. Any failure (404 standalone, network, non-2xx) →
 *  anonymous. Never throws. */
export function ensureResolved() {
  if (auth.resolved) return Promise.resolve(auth);
  if (_resolvePromise) return _resolvePromise;
  _resolvePromise = (async () => {
    try {
      const r = await fetch("/auth/me", {
        credentials: "same-origin",
        headers: { Accept: "application/json" },
      });
      if (r.ok) {
        const data = await r.json();
        auth.authenticated = data && data.authenticated === true;
        if (data && data.login_url) auth.loginUrl = data.login_url;
      } else {
        auth.authenticated = LOCAL_HOSTS.has(window.location.hostname);
      }
    } catch (_) {
      auth.authenticated = LOCAL_HOSTS.has(window.location.hostname);
    }
    auth.resolved = true;
    applyGateState();
    return auth;
  })();
  return _resolvePromise;
}

/** Reflect identity into the DOM: toggle body.is-anon, point the sign-in CTAs
 *  at the resolved login URL. */
function applyGateState() {
  const anon = !auth.authenticated;
  document.body.classList.toggle("is-anon", anon);

  const next = encodeURIComponent(window.location.pathname || "/chromacut");
  const loginHref = auth.loginUrl.includes("?")
    ? auth.loginUrl
    : auth.loginUrl + "?next=" + next;

  const bannerCta = document.getElementById("gate-banner-cta");
  if (bannerCta) bannerCta.href = loginHref;

  // The export button becomes a sign-in CTA when anonymous; app.js reads
  // isAuthed() before firing the network call, so this is the visible half.
}

/** Guard a generate action. Returns true if allowed; otherwise routes the
 *  user to sign-in and returns false. Callers must check the return value. */
export function requireAuth() {
  if (auth.authenticated) return true;
  const next = encodeURIComponent(window.location.pathname || "/chromacut");
  const href = auth.loginUrl.includes("?")
    ? auth.loginUrl
    : auth.loginUrl + "?next=" + next;
  window.location.href = href;
  return false;
}

/* ---- Theme toggle (umbrella pattern) ---- */
export function initThemeToggle() {
  const reduceMotion =
    window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function flip() {
    const html = document.documentElement;
    const nextTheme = html.getAttribute("data-theme") === "dark" ? "light" : "dark";
    html.setAttribute("data-theme", nextTheme);
    try { localStorage.setItem("theme", nextTheme); } catch (_) {}
    if (!reduceMotion) {
      document.querySelectorAll(".theme-toggle").forEach((btn) => {
        btn.classList.add("spinning");
        setTimeout(() => btn.classList.remove("spinning"), 300);
      });
    }
  }

  document.addEventListener("click", (e) => {
    const t = e.target.closest('[data-action="toggle-theme"]');
    if (t) { e.preventDefault(); flip(); }
  });
}
