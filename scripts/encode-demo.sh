#!/usr/bin/env bash
# encode-demo.sh — turn the Playwright recording into a loop-friendly demo asset.
#
#   raw-demo.webm (VP8) --> AV1 MP4 < 500KB  +  poster WebP (output-state still)
#
# Codec selection (documented per task): prefer AV1 via libsvtav1; fall back to
# libaom-av1, then libx264. Whichever runs is printed at the end.
#
# Run (after scripts/capture-demo.mjs):
#   bash scripts/encode-demo.sh
#
# Outputs to src/chromacut/static/ (Topology A serves /chromacut from the
# chromacut container, so the asset lives beside the frontend it ships with):
#   src/chromacut/static/chromacut-demo.mp4
#   src/chromacut/static/chromacut-demo-poster.webp
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CAP="$REPO/scripts/_capture"
RAW="$CAP/raw-demo.webm"
POSTER_SRC="$CAP/poster-src.png"
OUT_DIR="$REPO/src/chromacut/static"
OUT_MP4="$OUT_DIR/chromacut-demo.mp4"
OUT_POSTER="$OUT_DIR/chromacut-demo-poster.webp"
TARGET_BYTES=$((500 * 1024))

[ -f "$RAW" ] || { echo "Missing $RAW — run scripts/capture-demo.mjs first." >&2; exit 1; }
[ -f "$POSTER_SRC" ] || { echo "Missing $POSTER_SRC — run scripts/capture-demo.mjs first." >&2; exit 1; }
mkdir -p "$OUT_DIR"

# Pick an encoder.
ENCODERS="$(ffmpeg -hide_banner -encoders 2>/dev/null)"
if grep -q 'libsvtav1' <<<"$ENCODERS"; then
  CODEC=libsvtav1
elif grep -q 'libaom-av1' <<<"$ENCODERS"; then
  CODEC=libaom-av1
else
  CODEC=libx264
fi
echo "[encode] codec = $CODEC"

# Even dimensions required by some encoders; scale down to 960px wide keeps the
# two-panel layout legible while shrinking bytes. yuv420p for broad playback.
COMMON_VF="scale=960:-2:flags=lanczos,format=yuv420p"

encode_av1_svt() { # $1 = crf
  ffmpeg -y -loglevel error -i "$RAW" -an \
    -c:v libsvtav1 -crf "$1" -preset 6 \
    -svtav1-params "tune=0" \
    -g 240 -pix_fmt yuv420p -vf "$COMMON_VF" \
    -movflags +faststart "$OUT_MP4"
}
encode_av1_aom() { # $1 = crf
  ffmpeg -y -loglevel error -i "$RAW" -an \
    -c:v libaom-av1 -crf "$1" -b:v 0 -cpu-used 6 \
    -g 240 -pix_fmt yuv420p -vf "$COMMON_VF" \
    -movflags +faststart "$OUT_MP4"
}
encode_x264() { # $1 = crf
  ffmpeg -y -loglevel error -i "$RAW" -an \
    -c:v libx264 -crf "$1" -preset slow -profile:v high \
    -g 240 -pix_fmt yuv420p -vf "$COMMON_VF" \
    -movflags +faststart "$OUT_MP4"
}

# CRF ladder: walk up (lower quality) until we land under 500KB.
case "$CODEC" in
  libsvtav1)  CRFS="30 35 40 45 50" ; FN=encode_av1_svt ;;
  libaom-av1) CRFS="32 38 44 50 56" ; FN=encode_av1_aom ;;
  libx264)    CRFS="26 30 34 38 42" ; FN=encode_x264 ;;
esac

CHOSEN=""
for crf in $CRFS; do
  "$FN" "$crf"
  size=$(stat -f%z "$OUT_MP4" 2>/dev/null || stat -c%s "$OUT_MP4")
  echo "[encode] crf=$crf -> $size bytes"
  if [ "$size" -le "$TARGET_BYTES" ]; then CHOSEN="$crf"; break; fi
done
[ -n "$CHOSEN" ] || { echo "[encode] WARN: could not get under 500KB even at highest CRF; keeping last." >&2; }

# Poster: WebP still of the OUTPUT state. Match the video width so the poster
# swaps cleanly under prefers-reduced-motion. This ffmpeg build lacks libwebp,
# so encode WebP via Pillow (already a chromacut dependency). Prefer the repo
# venv if present, else any python3 with Pillow.
PY="$REPO/.venv/bin/python"
[ -x "$PY" ] || PY="$(command -v python3)"
"$PY" - "$POSTER_SRC" "$OUT_POSTER" <<'PYEOF'
import sys
from PIL import Image
src, dst = sys.argv[1], sys.argv[2]
img = Image.open(src).convert("RGB")
w, h = img.size
tw = 960
th = round(h * tw / w)
th += th % 2  # keep even to match the video's scale=960:-2
img = img.resize((tw, th), Image.LANCZOS)
img.save(dst, "WEBP", quality=82, method=6)
PYEOF

mp4_size=$(stat -f%z "$OUT_MP4" 2>/dev/null || stat -c%s "$OUT_MP4")
poster_size=$(stat -f%z "$OUT_POSTER" 2>/dev/null || stat -c%s "$OUT_POSTER")
echo "------------------------------------------------------------"
echo "[encode] codec        : $CODEC (crf=${CHOSEN:-none-passed})"
echo "[encode] $OUT_MP4 : $mp4_size bytes ($(( mp4_size / 1024 )) KB)"
echo "[encode] $OUT_POSTER : $poster_size bytes ($(( poster_size / 1024 )) KB)"
ffprobe -v error -show_entries format=duration:stream=codec_name,width,height -of default=noprint_wrappers=1 "$OUT_MP4"
