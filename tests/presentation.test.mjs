import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { CATALOGUE, TYPES } from "../src/data.js";
import { CARD_WIDTH_MM, CARD_HEIGHT_MM, CARDS_PER_SHEET, cardMarkup, cardNumber, printSheets, escapeHtml } from "../src/card-view.js";
import { illustration } from "../src/art.js";

test("every card is renderable, numbered and has legible labelled regions", () => {
  for (const card of CATALOGUE) {
    const html = cardMarkup(card);
    assert.match(html, /<article class="game-card/);
    assert.match(html, /game-card__picture/);
    assert.match(html, /game-card__rule/);
    assert.match(html, /game-card__flavor/);
    assert.match(html, /aria-label=/);
    assert.ok(html.includes(card.title), card.title);
    assert.ok(!html.includes("NO. -1"), card.title);
    assert.ok(cardNumber(card) !== "—", card.title);
    assert.match(illustration(card.art), /^<svg/);
  }
});
test("card descriptions are HTML-escaped, not interpreted as HTML", () => {
  const card = {...CATALOGUE[0],title:'<script>alert("x")</script>',flavor:"B & <b>something</b>",rule:'<img src=x onerror="x">'}; 
  const html = cardMarkup(card);
  assert.ok(!html.includes("<script>"));
  assert.ok(!html.includes("<img src=x"));
  assert.ok(html.includes("&lt;script&gt;"));
  assert.ok(html.includes("&lt;img"));
  assert.ok(html.includes("&amp;"));
  assert.equal(escapeHtml('"<>&'),"&quot;&lt;&gt;&amp;");
});
test("each card belongs to a filter category",()=>{
  for(const card of CATALOGUE)assert.ok(TYPES.includes(card.type));
  assert.ok(CATALOGUE.length >= 30);
});
test("every print sheet has up to four cards, including incomplete last sheet",()=>{
  assert.equal(CARD_WIDTH_MM,90);
  assert.equal(CARD_HEIGHT_MM,140);
  assert.equal(CARDS_PER_SHEET,4);
  const html=printSheets(CATALOGUE);
  const sheets=(html.match(/class="print-sheet"/g)||[]).length;
  const cards=(html.match(/class="game-card game-card--/g)||[]).length;
  assert.equal(sheets,Math.ceil(CATALOGUE.length/4));
  assert.equal(cards,CATALOGUE.length);
  assert.ok(sheets>1);
  assert.equal((printSheets([]).match(/class="print-sheet"/g)||[]).length,0);
});
test("site uses relative assets and includes an explicit print layout",()=>{
  const html=readFileSync(new URL("../index.html",import.meta.url),"utf8");
  const css=readFileSync(new URL("../styles/phase1.css",import.meta.url),"utf8");
  assert.match(html,/href="\.\/styles\/phase1.css"/);
  assert.match(html,/src="\.\/src\/app.js"/);
  assert.match(css,/@page\s*\{\s*size:\s*A4 portrait;\s*margin:\s*5mm/);
  assert.match(css,/\.print-sheet\s*\{/);
  assert.match(css,/grid-template-columns:\s*90mm 90mm/);
  assert.match(css,/grid-template-rows:\s*140mm 140mm/);
});
