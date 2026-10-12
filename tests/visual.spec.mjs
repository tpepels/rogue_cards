import {test,expect} from "@playwright/test";
test("one canonical gallery covers all families and prints real card sheets",async({page})=>{
 test.setTimeout(180000);
 const errors=[];page.on("pageerror",e=>errors.push(e.message));
 await page.goto("/");
 await expect(page.getByRole("heading",{name:/One dungeon. One deck. One rulebook/i})).toBeVisible();
 await expect(page.locator(".tt-grid .tt-card")).toHaveCount(111);
 await expect(page.getByRole("link",{name:/READ \/ PRINT THE A4 RULES/})).toBeVisible();
 const filter=page.getByRole("combobox",{name:"Card category"});
 const checks=[["hero",8],["room",37],["monster",14],["TOOL",8],["SCROLL",8],["RING",7],["WAND",7],["POTION",8]];
 for(const [type,count] of checks){
  await filter.selectOption(type);
  await expect(page.locator(".tt-grid .tt-card")).toHaveCount(count);
  const values=await page.locator(".tt-grid .tt-card").evaluateAll(cards=>cards.map(c=>{
   const paper=c.querySelector(".tt-collage>.tt-content"),rect=paper.getBoundingClientRect();
   const title=c.querySelector(".tt-title").getBoundingClientRect();
   return {id:c.dataset.id,clipY:paper.scrollHeight-paper.clientHeight,clipX:paper.scrollWidth-paper.clientWidth,titleOverlap:title.bottom-rect.top};
  }));
  for(const row of values){
   expect(row.clipY,type+" clipped vertically: "+row.id).toBeLessThanOrEqual(2);
   expect(row.clipX,type+" clipped horizontally: "+row.id).toBeLessThanOrEqual(2);
   expect(row.titleOverlap,type+" title collision: "+row.id).toBeLessThanOrEqual(5);
  }
 }
 await filter.selectOption("WAND");
 await expect(page.locator(".tt-print-only .tt-sheet")).toHaveCount(2);
 await page.getByRole("button",{name:"ONE OF EACH"}).click();
 await expect(page.getByRole("button",{name:"PRINT QUANTITIES"})).toBeVisible();
 await page.emulateMedia({media:"print"});
 const printed=await page.locator(".tt-print-only .tt-card").evaluateAll(cards=>cards.map(c=>{
  const paper=c.querySelector(".tt-collage>.tt-content"),r=c.getBoundingClientRect();
  return {w:r.width,h:r.height,clip:paper.scrollHeight-paper.clientHeight};
 }));
 expect(printed.length).toBeGreaterThan(0);
 for(const m of printed){
  expect(m.w).toBeGreaterThan(90*96/25.4-2);
  expect(m.h).toBeLessThan(130*96/25.4+2);
  expect(m.clip).toBeLessThanOrEqual(2);
 }
 expect(errors).toEqual([]);
});
test("the only A4 rulebook fits on one sheet and has complete combat and ending",async({page})=>{
 await page.goto("/rules.html");
 await expect(page.getByRole("heading",{name:"ROGUE CARDS"})).toBeVisible();
 await expect(page.getByText(/Opposed d20 combat/i)).toBeVisible();
 await expect(page.getByText(/final Vault/i)).toBeVisible();
 await page.emulateMedia({media:"print"});
 const size=await page.locator(".sheet").evaluate(el=>({w:el.getBoundingClientRect().width,h:el.getBoundingClientRect().height,
  clipY:el.scrollHeight-el.clientHeight,clipX:el.scrollWidth-el.clientWidth}));
 expect(size.w).toBeLessThanOrEqual(192*96/25.4+2);
 expect(size.h).toBeLessThanOrEqual(279*96/25.4+2);
 expect(size.clipY,"One-A4 content overflow").toBeLessThanOrEqual(2);
 expect(size.clipX,"One-A4 width overflow").toBeLessThanOrEqual(2);
});
test("small-screen catalogue controls and cards do not overflow horizontally",async({page})=>{
 await page.setViewportSize({width:390,height:840});
 await page.goto("/");
 await page.getByRole("combobox",{name:"Card category"}).selectOption("hero");
 await expect(page.locator(".tt-grid .tt-card")).toHaveCount(8);
 const x=await page.evaluate(()=>({width:document.documentElement.scrollWidth,viewport:document.documentElement.clientWidth}));
 expect(x.width).toBeLessThanOrEqual(x.viewport+2);
});
