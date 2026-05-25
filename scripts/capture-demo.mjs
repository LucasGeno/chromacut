/**
 * capture-demo.mjs — re-runnable Playwright capture of the real chromacut flow.
 *
 * Records: drop a chroma-key image -> grid auto-detected -> clean transparent
 * PNGs render on the checkerboard preview -> Export. The point of scripting this
 * (vs hand-authoring a motion graphic) is that the recording stays TRUTHFUL as
 * the UI evolves — re-run it after any frontend change to refresh the demo.
 *
 * Requirements:
 *   - chromacut running locally:  .venv/bin/python -m chromacut --no-open   (-> http://localhost:6100)
 *   - Playwright + Chromium. This repo is python-only (no package.json), so the
 *     script resolves Playwright from the user's playwright-skill install via
 *     NODE_PATH. See README in scripts/CAPTURE.md.
 *
 * Run:
 *   NODE_PATH="$HOME/.claude/skills/playwright-skill/node_modules" \
 *     node scripts/capture-demo.mjs
 *
 * Output:
 *   scripts/_capture/raw-demo.webm   (Playwright video, fed to ffmpeg next)
 *   scripts/_capture/poster-src.png  (full-page still of the OUTPUT state, for the WebP poster)
 *
 * Env overrides:
 *   TARGET_URL  (default http://localhost:6100)
 *   FIXTURE     (default tests/fixtures/gemini-grid-3x1.png)
 *   OUT_DIR     (default scripts/_capture)
 */
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import { createRequire } from 'node:module';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, '..');

// Resolve Playwright without a package.json in this repo. NODE_PATH doesn't
// apply to ESM bare specifiers, so resolve the module path explicitly. Honor
// PLAYWRIGHT_DIR / NODE_PATH if set, else fall back to the playwright-skill install.
function resolvePlaywright() {
  const candidates = [
    process.env.PLAYWRIGHT_DIR,
    ...(process.env.NODE_PATH ? process.env.NODE_PATH.split(path.delimiter) : []),
    path.join(process.env.HOME || '', '.claude/skills/playwright-skill/node_modules'),
  ].filter(Boolean);
  for (const base of candidates) {
    const req = createRequire(path.join(base, 'noop.js'));
    try {
      const entry = req.resolve('playwright');
      return entry;
    } catch { /* try next */ }
  }
  throw new Error(
    'Could not resolve "playwright". Set PLAYWRIGHT_DIR to a node_modules dir ' +
    'containing playwright, or install it. See scripts/CAPTURE.md.'
  );
}

const pwModule = await import(pathToFileURL(resolvePlaywright()).href);
const chromium = pwModule.chromium || pwModule.default?.chromium;
if (!chromium) throw new Error('Resolved playwright but could not find chromium export');

const TARGET_URL = process.env.TARGET_URL || 'http://localhost:6100';
const FIXTURE = path.resolve(REPO, process.env.FIXTURE || 'tests/fixtures/gemini-grid-3x1.png');
const OUT_DIR = path.resolve(REPO, process.env.OUT_DIR || 'scripts/_capture');

// Demo viewport: 16:9-ish, compact so the recorded MP4 stays small and the
// two-panel (source | result) layout reads on a landing-page card.
const VIEWPORT = { width: 1100, height: 660 };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  if (!fs.existsSync(FIXTURE)) throw new Error(`Fixture not found: ${FIXTURE}`);
  fs.mkdirSync(OUT_DIR, { recursive: true });
  // Clear stale recordings so we always get a single fresh .webm.
  for (const f of fs.readdirSync(OUT_DIR)) {
    if (f.endsWith('.webm')) fs.rmSync(path.join(OUT_DIR, f));
  }

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: 1,
    recordVideo: { dir: OUT_DIR, size: VIEWPORT },
    // Force motion ON for the recording itself (the page's CSS may honor
    // reduced-motion; we want the captured artifact to show motion).
    reducedMotion: 'no-preference',
  });
  const page = await context.newPage();

  console.log(`[capture] navigating to ${TARGET_URL}`);
  await page.goto(TARGET_URL, { waitUntil: 'networkidle' });

  // Beat 1 — let the empty drop-zone state register (this is the "before").
  await page.waitForSelector('#drop-zone', { state: 'visible' });
  await sleep(700);

  // Beat 2 — upload the fixture (drives the real handleFile -> /api/analyze).
  console.log(`[capture] uploading ${path.basename(FIXTURE)}`);
  await page.setInputFiles('#file-input', FIXTURE);

  // Workspace appears, then the loading overlay runs while /api/analyze works.
  await page.waitForSelector('#workspace:not(.hidden)', { timeout: 15000 });
  // Wait for analysis to finish: the loading overlay carries the .hidden class
  // (display:none) once /api/analyze resolves.
  await page.waitForSelector('#loading-overlay', { state: 'hidden', timeout: 30000 });
  await page.waitForFunction(() => {
    const c = document.querySelector('#result-canvas');
    return c && c.width > 0 && c.height > 0;
  }, { timeout: 30000 });

  // Beat 3 — HOLD on the output state: clean transparent extraction on the
  // checkerboard + detected-cell strip. This is the money shot and the poster frame.
  await sleep(1600);

  // Capture the poster source = the OUTPUT state (NOT a black/empty first frame,
  // per WCAG 2.2.2). Crop to the preview area so the poster is the result, tight.
  const previewArea = page.locator('.preview-area');
  const posterPath = path.join(OUT_DIR, 'poster-src.png');
  if (await previewArea.count()) {
    await previewArea.screenshot({ path: posterPath });
  } else {
    await page.screenshot({ path: posterPath });
  }
  console.log(`[capture] poster source -> ${posterPath}`);

  // Beat 4 — trigger Export so the loop shows the payoff action. We intercept the
  // download so nothing actually writes to disk, but the button's loading->done
  // micro-state is recorded.
  const downloadPromise = page.waitForEvent('download').catch(() => null);
  await page.click('#btn-export');
  const dl = await Promise.race([downloadPromise, sleep(6000).then(() => null)]);
  if (dl) {
    console.log(`[capture] export fired: ${dl.suggestedFilename()}`);
  } else {
    console.log('[capture] export clicked (no download event captured within timeout)');
  }
  // Let the "Exported N icon(s)" status settle on screen.
  await sleep(1400);

  // Closing the context finalizes the video file.
  await context.close();
  await browser.close();

  // Surface the produced webm path.
  const webm = fs.readdirSync(OUT_DIR).find((f) => f.endsWith('.webm'));
  if (!webm) throw new Error('No .webm produced by Playwright');
  const finalWebm = path.join(OUT_DIR, 'raw-demo.webm');
  fs.renameSync(path.join(OUT_DIR, webm), finalWebm);
  console.log(`[capture] raw video -> ${finalWebm}`);
  console.log('[capture] done. Next: scripts/encode-demo.sh');
}

main().catch((err) => {
  console.error('[capture] FAILED:', err);
  process.exit(1);
});
