import {test,expect} from "@playwright/test";
import {FIXED_CARDS,SELECTABLE} from "../src/decks.js";
import {printUrl} from "../src/print-queue.js";

// A4 layout is measured in CSS physical units; printed cards must be in one
// contiguous block so only the outer edges and two internal cuts are needed.
const pxPerMm=96/25.4;
const near=(actual,expected)=>expect(Math.abs(actual-expected)).toBeLessThan(.65);
for(const kind of ["from-gallery","from-deck"]){
 test(`${kind} prints touching 90 x 130 mm cards in a 2 x 2 grid`,async({page})=>{
  await page.route("**/assets/illustrations/**",route=>route.abort());
  const selection=(kind==="from-gallery"?[...FIXED_CARDS,...SELECTABLE]:[...FIXED_CARDS]).slice(0,16);
 await page.goto("/"+printUrl(selection).slice(2),{waitUntil:"domcontentloaded"});
  await expect(page.locator(".tt-sheet").first()).toHaveCount(1);
  await page.emulateMedia({media:"print"});
  const sheet=page.locator(".tt-sheet").first();
  await expect(sheet).toBeVisible();
  const rects=await sheet.locator(":scope > .tt-card").evaluateAll(cards=>cards.map(el=>{
   const r=el.getBoundingClientRect();
   return {x:r.x,y:r.y,w:r.width,h:r.height};
  }));
  expect(rects).toHaveLength(4);
  for(const r of rects){near(r.w,90*pxPerMm);near(r.h,130*pxPerMm);}
  near(rects[1].x-(rects[0].x+rects[0].w),0);
  near(rects[2].y-(rects[0].y+rects[0].h),0);
  near(rects[0].x,rects[2].x);
  near(rects[1].x,rects[3].x);
  near(rects[0].y,rects[1].y);
  near(rects[2].y,rects[3].y);
  const frame=await sheet.boundingBox();
  near(frame.width,194*pxPerMm);
  near(frame.height,280*pxPerMm);
  // Same internal margins on each side, with equal centering above/below.
  near(rects[0].x-frame.x,7*pxPerMm);
  near(rects[0].y-frame.y,10*pxPerMm);
  const style=await sheet.evaluate(el=>{
   const s=getComputedStyle(el);
   return {columns:s.gridTemplateColumns,rows:s.gridTemplateRows,gap:s.gap,breakAfter:s.breakAfter};
  });
  expect(style.gap).toBe("0px");
  expect(style.breakAfter).toBe("page");
  await expect(page.locator(".tt-sheet").nth(1)).toBeVisible();
 });
}

// Print in bounded chunks without losing a copy; don't preload the other batches.
test("quick print advances through all physical cards exactly once",async({page})=>{
 const cards=[...FIXED_CARDS,...SELECTABLE];
 await page.addInitScript(()=>{HTMLImageElement.prototype.decode=async()=>{};});
 await page.route("**/assets/illustrations/**",route=>route.abort());
 await page.goto("/"+printUrl(cards).slice(2));
 await expect(page.locator("#print-app")).toHaveAttribute("data-print-total","193");
 const rendered=[];
 while(true){
  const shown=await page.locator(".tt-print-only .tt-card").evaluateAll(all=>all.map(c=>c.dataset.type+":"+c.dataset.id));
  expect(shown.length).toBeGreaterThan(0);
  expect(shown.length).toBeLessThanOrEqual(16);
  rendered.push(...shown);
  const next=page.locator("#print-next");
  if(await next.isDisabled())break;
  await next.click();
 }
 expect(rendered).toEqual(cards.map(c=>c.type+":"+c.id));
});
test("the print dialog is called for a single prepared batch only",async({page})=>{
 await page.addInitScript(()=>{HTMLImageElement.prototype.decode=async()=>{};});
 await page.route("**/assets/illustrations/**",route=>route.abort());
 await page.goto("/"+printUrl([...FIXED_CARDS,...SELECTABLE].slice(0,32)).slice(2));
 await expect(page.locator(".tt-print-only .tt-card")).toHaveCount(16);
 await expect(page.locator("#print-current")).toBeEnabled();
 await page.evaluate(()=>{window.print=()=>{window.__printInvocations=(window.__printInvocations||0)+1;}});
 await page.locator("#print-current").click();
 expect(await page.evaluate(()=>window.__printInvocations)).toBe(1);
 await page.locator("#print-next").click();
 await expect(page.locator(".tt-print-only .tt-card")).toHaveCount(16);
 await expect(page.locator("#print-current")).toBeEnabled();
 await page.locator("#print-current").click();
 expect(await page.evaluate(()=>window.__printInvocations)).toBe(2);
});
