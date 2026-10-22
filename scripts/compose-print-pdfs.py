#!/usr/bin/env python3
"""Place vector PDF cards on full A4 sheets at their original 90 × 130 mm size.

Each unique card is rendered only once. PyMuPDF imports the card's vector
content and reuses it across pages instead of rasterizing its small type.
"""
import json
import math
import os
from pathlib import Path
import sys
import fitz

sources = Path(sys.argv[1])
output = Path(sys.argv[2])
manifest = json.loads((sources / "manifest.json").read_text())
MM = 72 / 25.4
PAGE = (210 * MM, 297 * MM)
CARD = (90 * MM, 130 * MM)
# Matches the existing four-up A4 CSS: 15 mm horizontal and 18 mm vertical.
LEFT = 15 * MM
TOP = 18 * MM
TILE = fitz.Rect(LEFT, TOP, LEFT + CARD[0], TOP + CARD[1])
output.mkdir(parents=True, exist_ok=True)

source_docs = {}
for n in range(1, 194):
    filename = sources / f"{n:03d}.pdf"
    if not filename.is_file():
        raise RuntimeError(f"Source illustration PDF missing: {filename}")
    doc = fitz.open(filename)
    if doc.page_count != 1:
        raise RuntimeError(f"Expected exactly one A4 page for {filename}")
    size = doc[0].rect
    if abs(size.width - PAGE[0]) > 2 or abs(size.height - PAGE[1]) > 2:
        raise RuntimeError(f"Non-A4 source size: {filename} ({size})")
    source_docs[n] = doc

for edition in manifest["editions"]:
    card_list = edition["cards"]
    pdf = fitz.open()
    for offset in range(0, len(card_list), 4):
        page = pdf.new_page(width=PAGE[0], height=PAGE[1])
        for ix, card in enumerate(card_list[offset:offset + 4]):
            n = card["sourceIndex"]
            target = fitz.Rect(
                LEFT + (ix % 2) * CARD[0],
                TOP + (ix // 2) * CARD[1],
                LEFT + ((ix % 2) + 1) * CARD[0],
                TOP + ((ix // 2) + 1) * CARD[1],
            )
            page.show_pdf_page(target, source_docs[n], 0, clip=TILE, keep_proportion=False)
    if pdf.page_count != math.ceil(len(card_list) / 4):
        raise RuntimeError("A4 page count mismatch in " + edition["file"])
    # Check first and last cards can still be text-extracted after vector import.
    for sample, card in [(pdf[0], card_list[0]), (pdf[-1], card_list[-1])]:
        extracted = sample.get_text()
        if "No." not in extracted:
            raise RuntimeError(f"Printed card text missing in {edition['file']}: {card}")
    destination = output / edition["file"]
    pdf.save(destination, garbage=4, deflate=True)
    pdf.close()
    mib = destination.stat().st_size / (1024 * 1024)
    print(f"PDF READY: {edition['file']}: {len(card_list)} cards, "
          f"{edition['pages']} A4 pages, {mib:.1f} MiB", flush=True)

for src in source_docs.values():
    src.close()
