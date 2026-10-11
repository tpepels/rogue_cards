import {test,expect} from "@playwright/test";
import {CATALOGUE,printDeck} from "../src/tabletop-data.js";
test("homepage is a physical card game, not a browser dungeon engine",async({page})=>{
 const errors=[];page.on("pageerror",e=>errors.push(e.message));
 await page.goto("/");
 await expect(page.getByRole("heading",{name:/dungeon lives on the table/i})).toBeVisible();
 await expect(page.getByRole("link",{name:/one-page rules/i})).toBeVisible();
 await expect(page.locator(".tt-grid .tt-card")).toHaveCount(printDeck("all").length);
 expect(errors).toEqual([]);
});
test("all card specimen content fits within its physical card face",async({page})=>{
 await page.goto("/");
 await page.getByRole("button",{name:/PRINT QUANTITIES/}).click();
 await expect(page.locator(".tt-grid .tt-card")).toHaveCount(CATALOGUE.length);
 const overflowing=await page.locator(".tt-grid .tt-card").evaluateAll(cards=>cards.filter(card=>{
   const body=card.querySelector(".tt-content");
   const title=card.querySelector(".tt-title");
   return body.scrollHeight>body.clientHeight+2||title.scrollHeight>title.clientHeight+2;
 }).map(card=>({id:card.dataset.id,body:card.querySelector(".tt-content").scrollHeight,available:card.querySelector(".tt-content").clientHeight})));
 expect(overflowing).toEqual([]);
});
test("browser card gallery is usable without horizontal overflow on mobile",async({page})=>{
 await page.goto("/");
 for(const w of [375,414,720,1024,1440]){
  await page.setViewportSize({width:w,height:900});
  const measured=await page.evaluate(()=>({doc:document.documentElement.scrollWidth,viewport:innerWidth}));
  expect(measured.doc,"at width "+w).toBeLessThanOrEqual(measured.viewport+2);
 }
});
test("single A4 core rules fit without clipping",async({page})=>{
 await page.goto("/rules.html");
 await page.emulateMedia({media:"print"});
 const dims=await page.locator(".sheet").evaluate(el=>({w:el.getBoundingClientRect().width,
  h:el.getBoundingClientRect().height,body:el.scrollHeight,client:el.clientHeight,
  left:el.scrollWidth,inner:el.clientWidth}));
 expect(dims.w).toBeLessThanOrEqual(192*96/25.4+2);
 expect(dims.h).toBeLessThanOrEqual(279*96/25.4+2);
 expect(dims.body,"One-page rules overflow").toBeLessThanOrEqual(dims.client+2);
 expect(dims.left,"Horizontal rules overflow").toBeLessThanOrEqual(dims.inner+2);
});
test("A4 physical card sheets have exactly four 90x130 mm slots",async({page})=>{
 await page.goto("/");
 await page.emulateMedia({media:"print"});
 const summary=await page.evaluate(()=>{
  const sheets=[...document.querySelectorAll(".tt-print-only .tt-sheet")];
  const cards=[...document.querySelectorAll(".tt-print-only .tt-card")];
  return {sheets:sheets.length,cards:cards.length,pages:sheets.map(page=>({
   width:page.getBoundingClientRect().width,height:page.getBoundingClientRect().height,
   overflowing:page.scrollHeight>page.clientHeight+2,
   children:page.querySelectorAll(".tt-card").length
  })),first:cards[0]?{w:cards[0].getBoundingClientRect().width,h:cards[0].getBoundingClientRect().height}:null};
 });
 expect(summary.cards).toBe(printDeck("all").length);
 expect(summary.sheets).toBe(Math.ceil(summary.cards/4));
 expect(summary.pages.every(p=>p.children<=4&&!p.overflowing)).toBeTruthy();
 expect(summary.first.w).toBeGreaterThan(90*96/25.4-2);
 expect(summary.first.w).toBeLessThan(90*96/25.4+2);
 expect(summary.first.h).toBeGreaterThan(130*96/25.4-2);
 expect(summary.first.h).toBeLessThan(130*96/25.4+2);
});
test("filtering print copies does not generate or lose components",async({page})=>{
 await page.goto("/");
 await page.getByLabel("Card category").selectOption("monster");
 await expect(page.locator(".tt-grid .tt-card")).toHaveCount(printDeck("monster").length);
 await expect(page.locator(".tt-print-only .tt-card")).toHaveCount(printDeck("monster").length);
 await page.getByRole("button",{name:/PRINT QUANTITIES/}).click();
 await expect(page.locator(".tt-grid .tt-card")).toHaveCount(CATALOGUE.filter(c=>c.type==="monster").length);
 await expect(page.getByRole("button",{name:/ONE EACH/})).toBeVisible();
});
