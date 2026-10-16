#!/usr/bin/env python3
"""Generate missing artwork for all physical Rogue Cards, including print-only cards.

Each Gemini prompt is the card title plus the verbatim illustration-style.txt.
The first missing card uses scripts/reference.jpg when available; subsequent
generated cards inherit the immediately preceding illustration.
Never regenerate completed original artwork or bill for --dry-run/--list.
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
MAP_FILES = {
    "canonical": ROOT / "src" / "tabletop-view.js",
    "print-only": ROOT / "src" / "print-expansion.js",
}
MAP_NAMES = {
    "canonical": "CARD_ART",
    "print-only": "PRINT_ONLY_ART",
}
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
    # The original 111 PNGs may be provisionally reused by multiple new cards.
    # Such borrowed art does not count as a completed illustration.
    used_names = [c["filename"] for c in cards if c["filename"]]
    used_numbers = [int(m.group(1)) for name in used_names
                    if (m := re.match(r"^(\d+)_", name))]
    disk_numbers = [int(m.group(1)) for p in art_dir.glob("*.png")
                    if (m := re.match(r"^(\d+)_", p.name))]
    next_number = max(used_numbers + disk_numbers, default=0) + 1
    claimed = set()
    reserved_numbers = set(used_numbers) | set(disk_numbers)
    planned = []
    for card in cards:
        old_filename = card["filename"]
        correct_name = bool(old_filename and re.fullmatch(
            r"\d+_" + re.escape(slug(card["title"])) + r"\.png", old_filename))
        if correct_name:
            if old_filename in claimed:
                raise ValueError(f"Duplicate owned artwork filename: {old_filename}")
            filename = old_filename
        else:
            # Stable card numbers 164-175 keep Monster filenames constant even
            # when generated out of order with --ids.
            fixed = card.get("number")
            if fixed is not None:
                if type(fixed) is not int or fixed < 1:
                    raise ValueError(f"Invalid illustration number: {card['key']}")
                if fixed in reserved_numbers:
                    raise ValueError(f"Illustration number already reserved: {fixed}")
                number = fixed
            else:
                while next_number in reserved_numbers:
                    next_number += 1
                number = next_number
                next_number += 1
            reserved_numbers.add(number)
            filename = f"{number:03d}_{slug(card['title'])}.png"
        if filename in claimed:
            raise ValueError(f"Duplicate owned artwork filename: {filename}")
        claimed.add(filename)
        planned.append({**card, "filename": filename,
                        "previous_filename": old_filename,
                        "new_mapping": filename != old_filename,
                        "missing": not (art_dir / filename).is_file()})
    return planned


def make_prompt(title: str, style: str) -> str:
    # Deliberately NO card descriptions, hooks, colours, batch titles or lists.
    return title + "\n\n" + style


def add_mapping(source: str, key: str, filename: str,
                previous_filename: str | None = None,
                declaration: str = "CARD_ART") -> str:
    """Update either artwork map, retaining all unrelated assignments."""
    marker = f"export const {declaration}=Object.freeze({{"
    begin = source.find(marker)
    if begin < 0:
        raise ValueError(f"Cannot find {declaration} declaration")
    end = source.find("\n});", begin)
    if end < 0:
        raise ValueError("Cannot find CARD_ART closing marker")
    body = source[begin:end]
    entry = re.compile(r'("' + re.escape(key) + r'"\s*:\s*)"([^"]+)"')
    matches = list(entry.finditer(body))
    if len(matches) > 1:
        raise ValueError(f"Duplicate {declaration} keys: {key}")
    if matches:
        old_name = matches[0].group(2)
        if previous_filename is None or old_name != previous_filename:
            raise ValueError(f"{declaration} mapping changed for {key}: {old_name}")
        replaced = entry.sub(lambda m: m.group(1) + json.dumps(filename), body, count=1)
        return source[:begin] + replaced + source[end:]
    if previous_filename is not None:
        raise ValueError(f"Expected a previous {declaration} entry for {key}")
    prefix = source[:end].rstrip()
    if prefix.endswith('"'):
        prefix += ","
    return prefix + f"\n {json.dumps(key)}:{json.dumps(filename)}" + source[end:]


def mapping_target(card: dict) -> tuple[Path, str]:
    """Route print-only artwork to its separate mapping; do not alter CARD_ART."""
    source = card.get("mapping_source", "canonical")
    if source not in MAP_FILES:
        raise ValueError(f"Unknown illustration mapping source: {source}")
    return MAP_FILES[source], MAP_NAMES[source]


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
    # Use the highest-numbered completed artwork as the starting reference,
    # including after a partial run. Thereafter, chain ONLY generated images.
    completed = [c for c in cards if not c["missing"]]
    completed.sort(key=lambda c: int(c["filename"].split("_", 1)[0]))
    # last_art = Path(args.reference) if args.reference else (
    #    ART_DIR / completed[-1]["filename"] if completed else None)
    default_reference = ROOT / "scripts" / "reference.jpg"
    last_art = Path(args.reference) if args.reference else (
        default_reference if default_reference.is_file() else
            (ART_DIR / completed[-1]["filename"] if completed else None)
            )    
    if last_art and not last_art.is_file():
        raise FileNotFoundError(last_art)
    generated = 0
    for card in cards:
        path = ART_DIR / card["filename"]
        if card["key"] not in to_generate:
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
                map_file, declaration = mapping_target(card)
                text = map_file.read_text(encoding="utf-8")
                updated = add_mapping(text, card["key"], card["filename"],
                                      card["previous_filename"], declaration)
                map_file.write_text(updated, encoding="utf-8")
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
    print(f"Generated {generated} illustration(s). Review and commit PNGs and artwork-map updates.")
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
    except Exception as exc:
        # Google genai v2.30.1 can wrap a 402 response in APIStatusError,
        # sometimes after a ResponseValidationError. Keep the log actionable.
        message = str(exc)
        lowered = message.lower()
        if ("prepayment credits are depleted" in lowered or
                ("402" in lowered and "resource_exhausted" in lowered)):
            print(
                "Gemini billing error (HTTP 402): prepaid credits are depleted.\n"
                "Add credits to your Google AI Studio project at "
                "https://ai.studio/projects before retrying.\n"
                "No image was saved for the failed card. Existing artwork is intact.",
                file=sys.stderr,
            )
        else:
            print(f"Artwork generator error: {message[:600]}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
