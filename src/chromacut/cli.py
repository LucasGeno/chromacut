"""CLI entry point for chromacut."""

import argparse
import sys
import webbrowser
from pathlib import Path

from chromacut.utils import sanitize_name


def main():
    parser = argparse.ArgumentParser(
        prog="chromacut",
        description="Extract clean icons from AI-generated chroma-key images",
    )
    subparsers = parser.add_subparsers(dest="command")

    # `chromacut extract` subcommand
    extract_parser = subparsers.add_parser("extract", help="Extract from CLI (no UI)")
    extract_parser.add_argument("source", help="Path to source image")
    extract_parser.add_argument("grid", nargs="?", default=None,
                                help="Grid spec: 'name1,name2;name3' (omit for single)")
    extract_parser.add_argument("--name", help="Output name (single mode)")
    extract_parser.add_argument("--output-dir", default=".", help="Output directory")
    extract_parser.add_argument("--size", type=int, default=512, help="Output canvas size")
    extract_parser.add_argument("--padding", type=float, default=0.15, help="Padding percentage")
    extract_parser.add_argument("--style", choices=["pixel", "illustrated"], default="illustrated")

    # Server options (default command)
    parser.add_argument("--port", type=int, default=6100, help="Server port")
    parser.add_argument("--host", default="127.0.0.1", help="Server host")
    parser.add_argument("--no-open", action="store_true", help="Don't open browser")

    args = parser.parse_args()

    if args.command == "extract":
        _run_extract(args)
    else:
        _run_server(args)


def _run_server(args):
    """Start the FastAPI server and open browser."""
    import uvicorn

    url = f"http://{args.host}:{args.port}"
    if not args.no_open:
        webbrowser.open(url)

    uvicorn.run("chromacut.app:app", host=args.host, port=args.port, log_level="info")


def _run_extract(args):
    """CLI extraction without the web UI."""
    from PIL import Image

    from chromacut.engine import despill_extract, pad_and_resize
    from chromacut.grid import analyze_image, detect_content_height, detect_key_color

    src = Image.open(args.source).convert("RGBA")
    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    resample = "nearest" if args.style == "pixel" else "lanczos"

    if args.grid is None:
        # Single image mode
        if not args.name:
            print("Error: --name is required for single image mode", file=sys.stderr)
            sys.exit(1)
        key_color = detect_key_color(src)
        content_h = detect_content_height(src, key_color)
        cropped = src.crop((0, 0, src.width, content_h))
        processed = despill_extract(cropped)
        result = pad_and_resize(processed, args.size, args.padding, resample)
        safe_name = sanitize_name(args.name)
        out_path = output_dir / f"{safe_name}.png"
        result.save(out_path)
        print(f"Extracted: {out_path} ({result.size[0]}x{result.size[1]})")
    else:
        # Grid mode
        analysis = analyze_image(src)
        rows = [row.split(",") for row in args.grid.split(";")]
        names = [n.strip() for row in rows for n in row if n.strip() and n.strip() != "_"]

        n_cells = len(analysis["cells"])
        if len(names) < n_cells:
            print(f"Warning: {n_cells} cells detected but only {len(names)} names provided. "
                  f"Extra cells will be skipped.", file=sys.stderr)
        elif len(names) > n_cells:
            print(f"Warning: {len(names)} names provided but only {n_cells} cells detected. "
                  f"Extra names will be ignored.", file=sys.stderr)

        count = 0
        for cell, name in zip(analysis["cells"], names):
            safe_name = sanitize_name(name)
            cropped = src.crop((cell["x"], cell["y"],
                               cell["x"] + cell["w"], cell["y"] + cell["h"]))
            processed = despill_extract(cropped)
            result = pad_and_resize(processed, args.size, args.padding, resample)
            out_path = output_dir / f"{safe_name}.png"
            result.save(out_path)
            print(f"  {safe_name}.png ({result.size[0]}x{result.size[1]})")
            count += 1

        print(f"\nDone — {count} icons extracted to {output_dir}")
