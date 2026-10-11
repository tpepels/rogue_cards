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

test("illustration-first draft uses ten role-specific art proportions without clipping mechanics",async({page})=>{
 await page.goto("/docs/illustration-first-layout-study.html");
 await expect(page.locator(".specimen .card")).toHaveCount(10);
 const layouts=await page.locator(".specimen .card").evaluateAll(cards=>cards.map(card=>{
  const visual=card.querySelector(".visual");
  const rules=card.querySelector(".rules");
  const footer=card.querySelector(".footer");
  const cardRect=card.getBoundingClientRect(), artRect=visual.getBoundingClientRect();
  return {type:card.className,
   artRatio:artRect.height/cardRect.height,
   rulesOverflow:rules.scrollHeight-rules.clientHeight,
   footerBottom:footer.getBoundingClientRect().bottom-cardRect.bottom
  };
 }));
 expect(layouts.some(x=>x.artRatio>.6)).toBeTruthy();
 expect(layouts.some(x=>x.artRatio<.52)).toBeTruthy();
 for(const l of layouts){
  expect(l.rulesOverflow,"Clipped rules on "+l.type).toBeLessThanOrEqual(2);
  expect(l.footerBottom,"Footer outside card on "+l.type).toBeLessThanOrEqual(2);
 }
});

test("design studies are accessible from the live homepage without replacing playable cards",async({page})=>{
 await page.goto("/");
 await expect(page.getByRole("link",{name:"DESIGN REFERENCE",exact:true})).toHaveAttribute("href","./docs/illustration-first-layout-study.html");
 await expect(page.getByRole("link",{name:/VIEW DESIGN REFERENCE/})).toHaveAttribute("href","./docs/illustration-first-layout-study.html");
 await expect(page.getByRole("link",{name:/VIEW ROOM & CHEST STUDY/})).toHaveAttribute("href","./docs/room-feature-layout-study.html");
 await expect(page.locator(".tt-grid .tt-card")).toHaveCount(printDeck("all").length);
 await page.getByRole("link",{name:/VIEW DESIGN REFERENCE/}).click();
 await expect(page).toHaveURL(/\/docs\/illustration-first-layout-study\.html$/);
 await expect(page.locator(".specimen .card")).toHaveCount(10);
});

test("canonical printed cards use live PNG art, fallback placeholders and flexible compositions",async({page})=>{
 await page.goto("/");
 const hero=page.locator('.tt-grid .tt-card[data-id="delver"]').first();
 const eye=page.locator('.tt-grid .tt-card[data-id="eye"]').first();
 const key=page.locator('.tt-grid .tt-card[data-id="key"]').first();
 const flood=page.locator('.tt-grid .tt-card[data-id="m-flood"]').first();
 await expect(hero).toHaveAttribute("data-art-status","original");
 await expect(hero).toHaveAttribute("data-layout","portrait-stats");
 await expect(eye).toHaveAttribute("data-layout","monster-dense");
 await expect(key).toHaveAttribute("data-layout","illustration-dominant");
 await expect(flood).toHaveAttribute("data-layout","room-split");
 for(const card of [hero,eye,key,flood]){
  const img=card.locator("img.tt-art-image");
  await expect(img).toBeVisible();
  await expect.poll(()=>img.evaluate(el=>el.complete&&el.naturalWidth>0)).toBe(true);
 }
 const specimens=await page.locator(".tt-grid .tt-card").evaluateAll(cards=>cards.map(card=>{
  const vis=card.querySelector(".tt-visual"),rules=card.querySelector(".tt-content");
  return {id:card.dataset.id,ratio:vis.getBoundingClientRect().height/card.getBoundingClientRect().height,
    clip:rules?.scrollHeight-rules?.clientHeight??0,
    footer:card.querySelector(".tt-footer").getBoundingClientRect().bottom-card.getBoundingClientRect().bottom};
 }));
 expect(specimens.some(c=>c.ratio>.6)).toBeTruthy();
 expect(specimens.some(c=>c.ratio<.42)).toBeTruthy();
 for(const c of specimens){
  expect(c.clip,"Rules clipped on "+c.id).toBeLessThanOrEqual(2);
  expect(c.footer,"Footer outside "+c.id).toBeLessThanOrEqual(2);
 }
});
