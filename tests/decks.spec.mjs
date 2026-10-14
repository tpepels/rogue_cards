import {test,expect} from "@playwright/test";
import {PRESETS,selectionForPreset,physicalDeck} from "../src/decks.js";
test("three recommended physical decks are selectable and print the right card copies",async({page})=>{
 test.setTimeout(180000);
 const errors=[];page.on("pageerror",err=>errors.push(err.message));
 await page.goto("/decks.html");
 await expect(page.getByRole("heading",{name:"The dungeon is yours to build."})).toBeVisible();
 await expect(page.locator("[data-preset]")).toHaveCount(3);
 await expect(page.locator(".tt-print-only .tt-card")).toHaveCount(physicalDeck(selectionForPreset("strange")).length);
 for(const preset of PRESETS){
  await page.locator("[data-preset='"+preset.id+"']").click();
  await expect(page.locator("#db-preset-select")).toHaveValue(preset.id);
  await expect(page.locator(".tt-print-only .tt-card")).toHaveCount(physicalDeck(selectionForPreset(preset.id)).length);
  await expect(page.locator(".db-warnings")).toHaveCount(0);
 }
 const before=physicalDeck(selectionForPreset("classic")).length;
 await page.locator("[data-preset='classic']").click();
 const entry=page.locator('input[data-card="room:ex-u-guard-cell"]');
 await entry.check(); // already selected; should stay selected
 await entry.uncheck();
 await expect(page.locator("#db-preset-select")).toHaveValue("custom");
 await expect(page.locator(".tt-print-only .tt-card")).toHaveCount(before-1);
 await page.evaluate(()=>window.print=()=>{window.__deckPrinted=true});
 await page.getByRole("button",{name:"PRINT THIS DECK"}).click();
 await expect.poll(()=>page.evaluate(()=>window.__deckPrinted===true)).toBe(true);
 expect(errors).toEqual([]);
});
test("the simple expansion has real visible art and clipped-print-safe notes",async({page})=>{
 test.setTimeout(180000);
 await page.goto("/decks.html");
 await page.locator("[data-preset='classic']").click();
 await page.emulateMedia({media:"print"});
 const measurements=await page.locator('.tt-print-only .tt-card[data-print-expansion="true"]').evaluateAll(cards=>cards.map(c=>{
  const r=c.getBoundingClientRect();
  const parts=[...c.querySelectorAll(".tt-slip")].map(p=>{
   const x=p.getBoundingClientRect();
   return {left:x.left-r.left,right:x.right-r.left,top:x.top-r.top,bottom:x.bottom-r.top,clip:Math.max(p.scrollHeight-p.clientHeight,p.scrollWidth-p.clientWidth)};
  });
  const img=c.querySelector(".tt-art-image");
  return {id:c.dataset.id,width:r.width,height:r.height,parts,src:img?.getAttribute("src"),loaded:img?.complete&&img?.naturalWidth>0};
 }));
 expect(measurements.length).toBeGreaterThan(20);
 for(const c of measurements){
  expect(c.width,c.id).toBeGreaterThan(339);
  expect(c.height,c.id).toBeGreaterThan(489);
  expect(c.src,c.id).toMatch(/assets\/illustrations\/.+\.png/);
  expect(c.loaded,c.id).toBe(true);
  for(const p of c.parts){
   expect(p.clip,c.id+" clipped note").toBeLessThanOrEqual(2);
   expect(p.left,c.id+" note left").toBeGreaterThan(-3);
   expect(p.right,c.id+" note right").toBeLessThan(c.width+3);
   expect(p.bottom,c.id+" footer collision").toBeLessThan(c.height-12);
  }
 }
});
