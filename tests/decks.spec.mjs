import {test,expect} from "@playwright/test";
import {PRESETS,selectionForPreset,physicalDeck} from "../src/decks.js";
test("all deck presets send the intended quantities to fast printing",async({page})=>{
 test.setTimeout(180000);
 const errors=[];page.on("pageerror",e=>errors.push(e.message));
 await page.goto("/decks.html");
 await expect(page.locator("[data-preset]")).toHaveCount(PRESETS.length);
 for(const preset of PRESETS){
  await page.locator('[data-preset="'+preset.id+'"]').click();
  await expect(page.locator("#db-preset-select")).toHaveValue(preset.id);
  await expect(page.locator(".tt-print-only .tt-card")).toHaveCount(0);
  await page.getByRole("button",{name:"FAST PRINT THIS DECK"}).click();
  await expect(page).toHaveURL(/print\.html\?cards=/);
  await expect(page.locator("#print-app")).toHaveAttribute("data-print-total",
   String(physicalDeck(selectionForPreset(preset.id)).length));
  await expect(page.locator(".tt-print-only .tt-card")).toHaveCount(16);
  await page.goBack();
 }
 const before=physicalDeck(selectionForPreset("classic")).length;
 await page.locator('[data-preset="classic"]').click();
 const entry=page.locator('input[data-card="room:ex-u-guard-cell"]');
 await entry.uncheck();
 await expect(page.locator("#db-preset-select")).toHaveValue("custom");
 await page.reload();
 await expect(page.locator("#db-preset-select")).toHaveValue("custom");
 await page.getByRole("button",{name:"FAST PRINT THIS DECK"}).click();
 await expect(page.locator("#print-app")).toHaveAttribute("data-print-total",String(before-1));
 expect(errors).toEqual([]);
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
test("all 193 cards enter the fast print queue, never the catalogue DOM",async({page})=>{
 await page.goto("/cards.html");
 await expect(page.locator(".tt-grid .tt-card")).toHaveCount(193);
 await expect(page.locator(".tt-print-only .tt-card")).toHaveCount(0);
 await page.getByRole("combobox",{name:"Card category"}).selectOption("expansion");
 await expect(page.locator(".tt-grid .tt-card")).toHaveCount(54);
 await page.getByRole("button",{name:"FAST PRINT ALL COPIES"}).click();
 await expect(page).toHaveURL(/print\.html\?cards=/);
 await expect(page.locator("#print-app")).toHaveAttribute("data-print-total",
  String(physicalDeck(selectionForPreset("chaos")).length));
 await expect(page.locator(".tt-print-only .tt-card")).toHaveCount(16);
 await expect(page.locator(".tt-print-only .tt-sheet")).toHaveCount(4);
});
