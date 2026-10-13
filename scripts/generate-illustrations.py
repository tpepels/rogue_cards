#!/usr/bin/env python3
"""Generate only missing Rogue Cards artwork from the real JS catalogue.

Each Gemini prompt is the card title plus the verbatim illustration-style.txt.
The first missing card inherits the most recent existing illustration, and each
following generated card inherits the immediately preceding illustration.
Nothing is generated or billed if all canonical artwork already exists.
"""
from __future__ import annotations

import argparse
import base64
from io import BytesIO
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import time
import unicodedata

ROOT = Path(__file__).resolve().parents[1]
ART_DIR = ROOT / "assets" / "illustrations"
MAP_FILE = ROOT / "src" / "tabletop-view.js"
STYLE_FILE = ROOT / "scripts" / "illustration-style.txt"
MODEL = "gemini-3.1-flash-image"


def slug(text: str) -> str:
    text = unicodedata.normalize("NFKD", text.lower())
    text = "".join(c for c in text if not unicodedata.combining(c))
    return re.sub(r"^_+|_+$", "", re.sub(r"[^a-z0-9]+", "_", text))


def get_catalogue() -> list[dict]:
    result = subprocess.run(
        ["node", str(ROOT / "scripts" / "illustration-catalogue.mjs")],
        cwd=ROOT, check=True, text=True, capture_output=True,
    )
    cards = json.loads(result.stdout)
    keys = [c["key"] for c in cards]
    if len(keys) != len(set(keys)):
        raise ValueError("Duplicate card keys in catalogue")
    return cards


def plan_cards(cards: list[dict], art_dir: Path) -> list[dict]:
    """Keep all existing assignments stable; number additions above the maximum."""
    used_names = [c["filename"] for c in cards if c["filename"]]
    if len(set(used_names)) != len(used_names):
        raise ValueError("Duplicate artwork filenames in CARD_ART")
    used_numbers = [int(m.group(1)) for name in used_names
                    if (m := re.match(r"^(\d+)_", name))]
    next_number = max(used_numbers, default=0) + 1
    planned = []
    for card in cards:
        filename = card["filename"]
        new_mapping = filename is None
        if new_mapping:
            filename = f"{next_number:03d}_{slug(card['title'])}.png"
            next_number += 1
        elif not re.fullmatch(r"\d+_[a-z0-9_]+\.png", filename):
            raise ValueError(f"Unexpected existing filename for {card['key']}: {filename}")
        planned.append({**card, "filename": filename,
                        "new_mapping": new_mapping,
                        "missing": not (art_dir / filename).is_file()})
    return planned


def make_prompt(title: str, style: str) -> str:
    # Deliberately NO card descriptions, hooks, colours, batch titles or lists.
    return title + "\n\n" + style


def add_mapping(source: str, key: str, filename: str) -> str:
    """Append one mapping to the existing CARD_ART object without renumbering."""
    begin = source.find("export const CARD_ART=Object.freeze({")
    if begin < 0:
        raise ValueError("Cannot find CARD_ART declaration in src/tabletop-view.js")
    end = source.find("\n});", begin)
    if end < 0:
        raise ValueError("Cannot find CARD_ART closing marker")
    body = source[begin:end]
    if json.dumps(key, ensure_ascii=False) + ":" in body:
        raise ValueError(f"Refusing to duplicate CARD_ART entry {key}")
    prefix = source[:end].rstrip()
    if prefix.endswith('"'):
        prefix += ","
    entry = f"\n {json.dumps(key)}:{json.dumps(filename)}"
    return prefix + entry + source[end:]


def mime(path: Path) -> str:
    return "image/jpeg" if path.suffix.lower() in (".jpg", ".jpeg") else "image/png"


def request_image(client, title: str, style: str, reference: Path) -> bytes:
    image_input = {
        "type": "image",
        "mime_type": mime(reference),
        "data": base64.b64encode(reference.read_bytes()).decode("ascii"),
    }
    response = client.interactions.create(
        model=MODEL,
        input=[{"type": "text", "text": make_prompt(title, style)}, image_input],
        response_format={
            "type": "image", "mime_type": "image/jpeg",
            "aspect_ratio": "3:4", "image_size": "1K",
        },
    )
    image = getattr(response, "output_image", None)
    data = getattr(image, "data", None)
    if not data:
        raise RuntimeError(f"Gemini returned no image for {title!r}")
    return base64.b64decode(data)


def write_artwork(data: bytes, destination: Path) -> None:
    from PIL import Image, ImageOps
    with Image.open(BytesIO(data)) as im:
        image = ImageOps.exif_transpose(im).convert("RGB")
    # 333:451 is the existing art aspect ratio. Preserve the native 1K detail.
    ratio = 333 / 451
    width = round(image.height * ratio)
    if width <= image.width:
        image = ImageOps.fit(image, (width, image.height), Image.Resampling.LANCZOS)
    else:
        height = round(image.width / ratio)
        image = ImageOps.fit(image, (image.width, height), Image.Resampling.LANCZOS)
    destination.parent.mkdir(parents=True, exist_ok=True)
    temp = destination.with_name(destination.name + ".partial")
    try:
        image.save(temp, format="PNG", optimize=True)
        temp.replace(destination)
    finally:
        temp.unlink(missing_ok=True)


def run(args: argparse.Namespace) -> int:
    cards = plan_cards(get_catalogue(), ART_DIR)
    missing = [card for card in cards if card["missing"]]
    if args.ids:
        wanted = {part.strip() for part in args.ids.split(",")}
        missing = [card for card in missing
                   if card["key"] in wanted or str(cards.index(card) + 1) in wanted]
        if not missing:
            print("No missing illustrations matched --ids.")
            return 0
    print(f"Catalogue: {len(cards)} cards; existing: {len(cards)-sum(c['missing'] for c in cards)}; "
          f"missing: {sum(c['missing'] for c in cards)}.")
    for card in missing:
        print(f"  MISSING {card['key']}: {card['filename']}")
    if args.list or args.dry_run or not missing:
        return 0

    if args.limit is not None:
        missing = missing[:args.limit]
    if not missing:
        return 0

    style = STYLE_FILE.read_text(encoding="utf-8")
    if not style.strip():
        raise ValueError("Empty illustration-style.txt")
    key = (os.environ.get("GEMINI_API_KEY") or os.environ.get("GEMENI_API_KEY")
           or os.environ.get("GOOGLE_API_KEY"))
    if not key:
        raise ValueError("GEMINI_API_KEY / GEMENI_API_KEY must be exported in this terminal")
    from google import genai
    client = genai.Client(api_key=key)

    to_generate = {c["key"] for c in missing}
    last_art = Path(args.reference) if args.reference else None
    if last_art and not last_art.is_file():
        raise FileNotFoundError(last_art)
    generated = 0
    # Walk the canonical order, so existing artwork anchors the next new card.
    for card in cards:
        path = ART_DIR / card["filename"]
        if card["key"] not in to_generate:
            if path.is_file():
                last_art = path
            continue
        if last_art is None:
            raise RuntimeError(
                f"No previous artwork for {card['key']}; provide --reference PATH "
                "for the first generated card."
            )
        print(f"Generating {card['key']} from {last_art.name}...", flush=True)
        try:
            data = request_image(client, card["title"], style, last_art)
            write_artwork(data, path)
            if card["new_mapping"]:
                text = MAP_FILE.read_text(encoding="utf-8")
                MAP_FILE.write_text(add_mapping(text, card["key"], card["filename"]),
                                    encoding="utf-8")
        except Exception:
            # Do not silently continue the chain with a missing predecessor.
            print(f"Stopped at {card['key']}; previous completed artwork is preserved.",
                  file=sys.stderr)
            raise
        last_art = path
        generated += 1
        print(f"[{generated}/{len(missing)}] Saved {path.relative_to(ROOT)}", flush=True)
        if args.delay and generated < len(missing):
            time.sleep(args.delay)
    print(f"Generated {generated} illustration(s). Review and commit PNGs and CARD_ART updates.")
    return 0


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--list", action="store_true", help="List missing files, no API calls")
    p.add_argument("--dry-run", action="store_true", help="Same as --list")
    p.add_argument("--limit", type=int, help="Generate only the first N missing images")
    p.add_argument("--ids", help="Optional comma-separated catalogue indices or type:id keys")
    p.add_argument("--reference", help="Image to bootstrap when no earlier card has artwork")
    p.add_argument("--delay", type=float, default=1.5, help="Seconds between billable requests")
    args = p.parse_args()
    if args.limit is not None and args.limit < 0:
        p.error("--limit must be at least zero")
    if args.delay < 0:
        p.error("--delay must be non-negative")
    try:
        return run(args)
    except (OSError, ValueError, RuntimeError, subprocess.CalledProcessError) as exc:
        print(f"Artwork generator error: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
