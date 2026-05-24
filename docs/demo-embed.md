# Chromacut demo loop — embed snippet (Batch #9d → hand-off to 9c)

A self-contained, looping demo of the **real** chromacut flow: drop a chroma-key
image → grid auto-detected → clean transparent PNGs render on the checkerboard →
Export. Recorded by driving the live tool with Playwright (`scripts/capture-demo.mjs`),
so it stays truthful as the UI evolves — re-run the capture to refresh it.

## Assets (shipped in `src/chromacut/static/`)

| Asset | Public URL (behind Caddy) | Size | Notes |
|-------|---------------------------|------|-------|
| `chromacut-demo.mp4` | `/chromacut/static/chromacut-demo.mp4` | ~136 KB | AV1 (libsvtav1, CRF 30), 960×576, 4.7 s, no audio, loop-friendly |
| `chromacut-demo-poster.webp` | `/chromacut/static/chromacut-demo-poster.webp` | ~37 KB | WebP still of the **output state** (clean extraction on checkerboard) — not a black/empty first frame, per WCAG 2.2.2 |

> 9c: if you place this on a page served from a different origin/base path,
> adjust the two URLs accordingly. From within the chromacut frontend itself the
> paths are `/static/…`; from the umbrella landing they resolve under `/chromacut/static/…`.

## Markup

Drop-in `<figure>`. `autoplay loop muted playsinline` is the standard recipe that
lets the clip play silently and inline on iOS/Android without user gesture. The
poster shows instantly (and is what users with reduced motion keep).

```html
<figure class="chromacut-demo" aria-label="Chromacut turning an AI chroma-key grid into clean transparent PNGs">
  <video
    class="chromacut-demo__video"
    autoplay
    loop
    muted
    playsinline
    preload="metadata"
    poster="/chromacut/static/chromacut-demo-poster.webp"
    width="960"
    height="576">
    <source src="/chromacut/static/chromacut-demo.mp4" type="video/mp4; codecs=av01" />
  </video>
  <img
    class="chromacut-demo__poster"
    src="/chromacut/static/chromacut-demo-poster.webp"
    alt="Chromacut: a green-screen grid of three AI icons on the left, the first one extracted as a clean transparent PNG on a checkerboard on the right."
    width="960"
    height="684"
    loading="lazy"
    decoding="async" />
  <figcaption class="chromacut-demo__caption">The real tool, end to end — upload, auto-detect, extract.</figcaption>
</figure>
```

## CSS

The `<img>` poster is the reduced-motion fallback: hidden by default (the video
covers it), shown when the video is suppressed. This also gives a graceful still
if the AV1 source fails to decode on an older browser — though all current
evergreen browsers decode AV1.

```css
.chromacut-demo {
  margin: 0;
  position: relative;
  border-radius: 12px;
  overflow: hidden;
  background: #0e0e12;                 /* matches the tool's dark canvas; avoids a flash before poster paints */
  box-shadow: 0 12px 40px -12px rgb(0 0 0 / 0.55);
}

.chromacut-demo__video,
.chromacut-demo__poster {
  display: block;
  width: 100%;
  height: auto;
}

/* Poster is only the fallback — hide it while the video is the active surface. */
.chromacut-demo__poster {
  display: none;
}

.chromacut-demo__caption {
  font-size: 0.8125rem;
  letter-spacing: 0.02em;
  padding: 0.55rem 0.85rem;
  opacity: 0.72;
}

/* WCAG 2.3.3 / 2.2.2 — respect prefers-reduced-motion: kill the autoplaying
   video, show the meaningful poster still instead. */
@media (prefers-reduced-motion: reduce) {
  .chromacut-demo__video {
    display: none;
  }
  .chromacut-demo__poster {
    display: block;
  }
}
```

## Notes for 9c

- The snippet is origin-agnostic except the two asset URLs — re-theme the frame
  (`border-radius`, `box-shadow`, caption type) to the umbrella tokens during the
  reskin; the structure and the reduced-motion contract should stay intact.
- If the umbrella landing wants the demo to *not* autoplay until scrolled into
  view, layer an `IntersectionObserver` that calls `video.play()`/`.pause()` —
  but keep the `prefers-reduced-motion` rule above as the hard floor.
- Do **not** swap the poster for a first-frame grab; the current poster is
  deliberately the output state so reduced-motion users still see the payoff.
