/**
 * e2e-signed-in.mjs — authenticated end-to-end against the deployed platform.
 *
 * Proves the inverse of the anonymous 401 check: with a valid `session` cookie,
 * the platform's Caddy forward_auth gate OPENS and a real upload -> analyze ->
 * extract -> download completes through the edge. chromacut carries zero auth
 * code (Topology A — auth lives at the platform edge), so this is the only way
 * to exercise the gated POST path against prod.
 *
 * Auth: a short-lived session token is minted server-side (Google OAuth leg is
 * covered separately by the platform's login-flow tests) and injected as the
 * `session` cookie here. See scripts/E2E.md for the mint + cleanup commands.
 *
 * Requirements:
 *   - Playwright + Chromium. This repo is python-only (no package.json), so the
 *     script resolves Playwright from an external install (same as capture-demo.mjs).
 *     Default: ~/.claude/skills/playwright-skill/node_modules. Override with
 *     PLAYWRIGHT_DIR or NODE_PATH.
 *
 * Run:
 *   SESSION_TOKEN='...' node scripts/e2e-signed-in.mjs
 *
 * Env overrides:
 *   SESSION_TOKEN  (required) minted platform session token
 *   BASE_URL       (default https://lucasreed.me)
 *   FIXTURE        (default tests/fixtures/gemini-grid-3x1.png — analyzes as 3 cells)
 *   OUT_DIR        (default scripts/_e2e — gitignored intermediates)
 *
 * Exit code 0 = PASS (both gated POSTs 200 + a file downloaded), 1 = FAIL.
 */
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import { createRequire } from 'node:module';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, '..');

function resolvePlaywright() {
  const candidates = [
    process.env.PLAYWRIGHT_DIR,
    ...(process.env.NODE_PATH ? process.env.NODE_PATH.split(path.delimiter) : []),
    path.join(process.env.HOME || '', '.claude/skills/playwright-skill/node_modules'),
  ].filter(Boolean);
  for (const base of candidates) {
    const req = createRequire(path.join(base, 'noop.js'));
    try { return req.resolve('playwright'); } catch { /* try next */ }
  }
  throw new Error(
    'Could not resolve "playwright". Set PLAYWRIGHT_DIR to a node_modules dir ' +
    'containing playwright, or install it. See scripts/CAPTURE.md.',
  );
}

const pw = await import(pathToFileURL(resolvePlaywright()).href);
const chromium = pw.chromium || pw.default?.chromium;
if (!chromium) throw new Error('Resolved playwright but could not find chromium export');

const BASE = process.env.BASE_URL || 'https://lucasreed.me';
const TARGET = `${BASE}/chromacut/`;
const FIXTURE = path.resolve(REPO, process.env.FIXTURE || 'tests/fixtures/gemini-grid-3x1.png');
const OUT = path.resolve(REPO, process.env.OUT_DIR || 'scripts/_e2e');
const TOKEN = process.env.SESSION_TOKEN;

if (!TOKEN) throw new Error('SESSION_TOKEN env var required — see scripts/E2E.md to mint one');
if (!fs.existsSync(FIXTURE)) throw new Error(`Fixture not found: ${FIXTURE}`);
fs.mkdirSync(OUT, { recursive: true });

const results = { gate: {}, ui: {}, download: null, errors: [] };

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1280, height: 800 },
  acceptDownloads: true,
});
// Inject the minted session cookie (httpOnly + secure, as the server sets it).
const cookieDomain = new URL(BASE).hostname;
await context.addCookies([{
  name: 'session', value: TOKEN, domain: cookieDomain, path: '/',
  httpOnly: true, secure: true, sameSite: 'Lax',
}]);

const page = await context.newPage();

// Capture the gated POST responses through the edge.
page.on('response', (resp) => {
  const u = resp.url();
  if (u.endsWith('/api/analyze')) results.gate.analyze = resp.status();
  if (u.endsWith('/api/extract')) results.gate.extract = resp.status();
});
page.on('console', (m) => { if (m.type() === 'error') results.errors.push(m.text()); });

console.log(`[e2e] navigating to ${TARGET}`);
await page.goto(TARGET, { waitUntil: 'networkidle' });

// Signed-in UI state: export gate-note should be hidden, button enabled.
const gateNote = page.locator('#export-gate-note');
results.ui.gateNoteVisible = (await gateNote.count()) ? await gateNote.isVisible() : false;

// Upload the fixture -> drives POST /api/analyze through the gate.
console.log(`[e2e] uploading ${path.basename(FIXTURE)}`);
await page.setInputFiles('#file-input', FIXTURE);
await page.waitForSelector('#workspace:not(.hidden)', { timeout: 20000 });
await page.waitForSelector('#loading-overlay', { state: 'hidden', timeout: 30000 });
await page.waitForFunction(() => {
  const c = document.querySelector('#result-canvas');
  return c && c.width > 0 && c.height > 0;
}, { timeout: 30000 });
results.ui.workspaceShown = true;

// Extract -> POST /api/extract through the gate -> file download.
const btn = page.locator('#btn-export');
results.ui.exportEnabled = await btn.isEnabled();
console.log('[e2e] clicking Export');
const dlPromise = page.waitForEvent('download', { timeout: 30000 }).catch(() => null);
await btn.click();
const dl = await dlPromise;
if (dl) {
  const dest = path.join(OUT, dl.suggestedFilename());
  await dl.saveAs(dest);
  results.download = { name: dl.suggestedFilename(), bytes: fs.statSync(dest).size };
}
await page.waitForTimeout(1200);
results.ui.exportStatus = (await page.locator('#export-status').textContent())?.trim();
await page.screenshot({ path: path.join(OUT, 'output-state.png'), fullPage: true });

await context.close();
await browser.close();

console.log('\n===== RESULT =====');
console.log(JSON.stringify(results, null, 2));

const pass = results.gate.analyze === 200 && results.gate.extract === 200 && results.download;
console.log(`\nVERDICT: ${pass ? 'PASS' : 'FAIL'}`);
process.exit(pass ? 0 : 1);
