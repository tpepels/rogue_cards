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
