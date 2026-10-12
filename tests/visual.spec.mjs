import {test,expect} from "@playwright/test";
test("one canonical gallery covers all families and prints real card sheets",async({page})=>{
 test.setTimeout(180000);
 const errors=[];page.on("pageerror",e=>errors.push(e.message));
 await page.goto("/");
 await expect(page.getByRole("heading",{name:/One dungeon. One deck. One rulebook/i})).toBeVisible();
 await expect(page.locator(".tt-grid .tt-card")).toHaveCount(111);
 await expect(page.getByRole("link",{name:/READ \/ PRINT THE A4 RULES/})).toBeVisible();
 const filter=page.getByRole("combobox",{name:"Card category"});
 const checks=[["hero",8],["room",37],["monster",14],["TOOL",8],["EQUIPMENT",6],["COMPANION",4],["RELIC",4],["SCROLL",8],["RING",7],["WAND",7],["POTION",8]];
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


test("every unique card has legible ink, a physical type stamp and unclipped pasted rules",async({page})=>{
 test.setTimeout(180000);
 await page.goto("/");
 await expect(page.locator(".tt-grid .tt-card")).toHaveCount(111);
 const designs=await page.locator(".tt-grid .tt-card").evaluateAll(cards=>cards.map(card=>{
  const title=card.querySelector(".tt-title").getBoundingClientRect();
  const kind=card.querySelector(".tt-card-kind").getBoundingClientRect();
  const paper=card.querySelector(".tt-collage>.tt-content");
  const slip=paper.getBoundingClientRect();
  const art=card.querySelector(".tt-collage>.tt-visual").getBoundingClientRect();
  const bounds=card.getBoundingClientRect();
  return {id:card.dataset.id,type:card.dataset.v2Kind,
   vertical:paper.scrollHeight-paper.clientHeight,
   horizontal:paper.scrollWidth-paper.clientWidth,
   titleOverlap:title.bottom-slip.top,
   stampBelowTitle:kind.bottom-title.top,
   stampOutside:kind.right-bounds.right,
   illustrationAboveSlip:slip.top-art.top,
   noteWidth:slip.width,
   artWidth:art.width,
   noteTransform:getComputedStyle(paper).transform};
 }));
 const families=new Set();
 for(const card of designs){
  families.add(card.type);
  expect(card.vertical,"Rules vertically clipped on "+card.type+"/"+card.id).toBeLessThanOrEqual(2);
  expect(card.horizontal,"Rules horizontally clipped on "+card.type+"/"+card.id).toBeLessThanOrEqual(2);
  expect(card.titleOverlap,"Title is obscured by notes: "+card.id).toBeLessThanOrEqual(5);
  expect(card.stampOutside,"Type stamp extends outside card: "+card.id).toBeLessThanOrEqual(2);
  expect(card.stampBelowTitle,"Type stamp overlaps title: "+card.id).toBeLessThanOrEqual(9);
  expect(card.illustrationAboveSlip,"No visible art above notes: "+card.id).toBeGreaterThan(24);
 }
 for(const family of ["HERO","MONSTER","WARDEN","TOOL","EQUIPMENT","COMPANION","RELIC","SCROLL","RING","WAND","POTION","HAZARD","SHRINE","ENCOUNTER"]){
  expect(families.has(family),"No artwork/layout for "+family).toBeTruthy();
 }
 const samples=Object.fromEntries(designs.filter(x=>["TOOL","SCROLL","RING","WAND","RELIC","HERO","MONSTER"].includes(x.type))
   .map(x=>[x.type,x]).filter((x,i,all)=>all.findIndex(y=>y[0]===x[0])===i));
 expect(new Set(Object.values(samples).map(x=>x.noteTransform)).size,
  "Card families must have distinct paper rotation/compositions").toBeGreaterThanOrEqual(4);
 await page.emulateMedia({media:"print"});
 const printed=await page.locator(".tt-print-only .tt-card").evaluateAll(cards=>cards.map(card=>{
  const paper=card.querySelector(".tt-collage>.tt-content");
  const frame=card.getBoundingClientRect();
  return {id:card.dataset.id,vertical:paper.scrollHeight-paper.clientHeight,
    horizontal:paper.scrollWidth-paper.clientWidth,w:frame.width,h:frame.height};
 }));
 expect(printed).toHaveLength(111);
 for(const card of printed){
  expect(card.vertical,"Print vertically clipped: "+card.id).toBeLessThanOrEqual(2);
  expect(card.horizontal,"Print horizontally clipped: "+card.id).toBeLessThanOrEqual(2);
  expect(card.w).toBeGreaterThan(90*96/25.4-2);
  expect(card.h).toBeLessThan(130*96/25.4+2);
 }
});

test("physical card families have distinct illustration frames and artifact layouts",async({page})=>{
 await page.goto("/");
 const metrics=await page.locator(".tt-grid .tt-card").evaluateAll(cards=>{
  const families=["HERO","MONSTER","HAZARD","TOOL","EQUIPMENT","COMPANION","RELIC","SCROLL","RING","WAND","POTION"];
  return families.map(family=>{
   const card=cards.find(c=>c.dataset.v2Kind===family);
   if(!card)return {family,missing:true};
   const plate=card.querySelector(".tt-illustration");
   const slip=card.querySelector(".tt-collage>.tt-content");
   const stamp=card.querySelector(".tt-card-kind");
   return {family,frame:getComputedStyle(plate,"::before").border,
    frameShape:getComputedStyle(plate,"::before").borderRadius,
    frameTransform:getComputedStyle(plate,"::before").transform,
    titleLeft:getComputedStyle(card.querySelector(".tt-title")).left,
    slipWidth:Math.round(slip.getBoundingClientRect().width),
    stampDirection:getComputedStyle(stamp).writingMode};
  });
 });
 expect(metrics.every(m=>!m.missing)).toBeTruthy();
 expect(new Set(metrics.map(m=>[m.frame,m.frameShape,m.frameTransform,m.slipWidth,m.stampDirection].join("|"))).size)
  .toBeGreaterThanOrEqual(9);
 expect(metrics.find(m=>m.family==="SCROLL").stampDirection).toBe("vertical-rl");
});
