import {test,expect} from "@playwright/test";
import {PRESETS,selectionForPreset,physicalDeck} from "../src/decks.js";
test("all presets offer a single downloadable vector PDF",async({page})=>{
 await page.goto("/decks.html");
 await expect(page.locator("[data-preset]")).toHaveCount(PRESETS.length);
 for(const preset of PRESETS){
  await page.locator('[data-preset="'+preset.id+'"]').click();
  await expect(page.locator("#db-preset-select")).toHaveValue(preset.id);
  await expect(page.locator(".tt-print-only .tt-card")).toHaveCount(0);
  await expect(page.locator("#db-print")).toHaveAttribute("href",
   "https://github.com/tpepels/rogue_cards/releases/download/print-ready/rogue-cards-"+(preset.id==="chaos"?"all-copies":preset.id)+".pdf");
 }
 const before=physicalDeck(selectionForPreset("classic")).length;
 await page.locator('[data-preset="classic"]').click();
 await page.locator('input[data-card="room:ex-u-guard-cell"]').uncheck();
 await expect(page.locator("#db-preset-select")).toHaveValue("custom");
 await page.reload();
 await expect(page.locator("#db-preset-select")).toHaveValue("custom");
 await page.getByRole("button",{name:"PRINT CUSTOM DECK IN BATCHES"}).click();
 await expect(page).toHaveURL(/print\.html\?cards=/);
 await expect(page.locator("#print-app")).toHaveAttribute("data-print-total",String(before-1));
});
test("the fast print page includes genuine expansion art with legible notes",async({page})=>{
 test.setTimeout(180000);
 await page.goto("/decks.html");
 await page.locator('[data-preset="classic"]').click();
 await page.getByRole("button",{name:"FAST PRINT THIS DECK"}).click();
 await page.emulateMedia({media:"print"});
 await expect(page.locator(".tt-print-only .tt-card")).toHaveCount(16);
 const measurements=await page.locator('.tt-print-only .tt-card').evaluateAll(cards=>cards.map(c=>{
  const r=c.getBoundingClientRect();
  const parts=[...c.querySelectorAll(".tt-slip")].map(p=>({
   clip:Math.max(p.scrollHeight-p.clientHeight,p.scrollWidth-p.clientWidth)
  }));
  const img=c.querySelector(".tt-art-image");
  return {id:c.dataset.id,width:r.width,height:r.height,parts,src:img?.getAttribute("src"),status:c.dataset.artStatus};
 }));
 for(const c of measurements){
  expect(c.width,c.id).toBeGreaterThan(339);
  expect(c.height,c.id).toBeGreaterThan(489);
  expect(c.status,c.id).toBe("generated");
  expect(c.src,c.id).toMatch(/assets\/illustrations\/.+\.png/);
  for(const p of c.parts)expect(p.clip,c.id+" clipped note").toBeLessThanOrEqual(2);
 }
});
test("all 193 designs offer one full physical PDF without hidden card DOM",async({page})=>{
 await page.goto("/cards.html");
 await expect(page.locator(".tt-grid .tt-card")).toHaveCount(193);
 await expect(page.locator(".tt-print-only .tt-card")).toHaveCount(0);
 await expect(page.locator("#card-print-all")).toHaveAttribute("href",
  "https://github.com/tpepels/rogue_cards/releases/download/print-ready/rogue-cards-all-copies.pdf");
 await page.getByRole("combobox",{name:"Card category"}).selectOption("expansion");
 await expect(page.locator(".tt-grid .tt-card")).toHaveCount(54);
 await expect(page.locator("#card-print-all")).toHaveAttribute("href",
  /rogue-cards-all-copies\.pdf$/);
});
