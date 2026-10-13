import {test,expect} from "@playwright/test";
test("one canonical gallery covers all families and prints real card sheets",async({page})=>{
 test.setTimeout(180000);
 const errors=[];page.on("pageerror",e=>errors.push(e.message));
 await page.goto("/");
 await expect(page.getByRole("heading",{name:/One dungeon. One deck. One rulebook/i})).toBeVisible();
 await expect(page.locator(".tt-grid .tt-card")).toHaveCount(139);
 await expect(page.locator(".tt-grid .tt-has-art .tt-art-image")).toHaveCount(139);
 await expect(page.locator(".tt-print-only .tt-has-art .tt-art-image")).toHaveCount(139);
 await expect(page.locator(".tt-grid .tt-needs-art")).toHaveCount(0);
 await expect(page.locator(".tt-print-only .tt-needs-art")).toHaveCount(0);
 await expect(page.getByRole("link",{name:/READ \/ PRINT THE A4 RULES/})).toBeVisible();
 const filter=page.getByRole("combobox",{name:"Card category"});
 const checks=[["hero",8],["room",65],["monster",14],["TOOL",8],["EQUIPMENT",6],["COMPANION",4],["RELIC",4],["SCROLL",8],["RING",7],["WAND",7],["POTION",8]];
 for(const [type,count] of checks){
  await filter.selectOption(type);
  await expect(page.locator(".tt-grid .tt-card")).toHaveCount(count);
  const values=await page.locator(".tt-grid .tt-card").evaluateAll(cards=>cards.map(c=>{
   const title=c.querySelector(".tt-title").getBoundingClientRect();
   const notes=[...c.querySelectorAll(".tt-collage>.tt-content>.tt-slip")];
   const issues=notes.map(note=>{
    const r=note.getBoundingClientRect();
    const intersects=Math.min(title.right,r.right)>Math.max(title.left,r.left)&&Math.min(title.bottom,r.bottom)>Math.max(title.top,r.top);
    return {clipY:note.scrollHeight-note.clientHeight,clipX:note.scrollWidth-note.clientWidth,intersects};
   });
   return {id:c.dataset.id,issues};
  }));
  for(const row of values){
   expect(row.issues.length,type+" missing pasted notes: "+row.id).toBeGreaterThanOrEqual(1);
   for(const note of row.issues){
    expect(note.clipY,type+" note clipped vertically: "+row.id).toBeLessThanOrEqual(2);
    expect(note.clipX,type+" note clipped horizontally: "+row.id).toBeLessThanOrEqual(2);
    expect(note.intersects,type+" title intersects a note: "+row.id).toBe(false);
   }
  }
 }
 await filter.selectOption("WAND");
 await expect(page.locator(".tt-print-only .tt-sheet")).toHaveCount(2);
 await page.getByRole("button",{name:"ONE OF EACH"}).click();
 await expect(page.getByRole("button",{name:"PRINT QUANTITIES"})).toBeVisible();
 await page.emulateMedia({media:"print"});
 const printed=await page.locator(".tt-print-only .tt-card").evaluateAll(cards=>cards.map(c=>{
  const slips=[...c.querySelectorAll(".tt-collage>.tt-content>.tt-slip")],r=c.getBoundingClientRect();
  return {w:r.width,h:r.height,clip:Math.max(...slips.map(note=>note.scrollHeight-note.clientHeight))};
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


test("each card has clear pasted notes over full-bleed art",async({page})=>{
 test.setTimeout(180000);
 await page.goto("/");
 const check=async()=>{
  const cards=await page.locator(".tt-grid .tt-card").evaluateAll(cards=>cards.map(card=>{
   const title=card.querySelector(".tt-title").getBoundingClientRect();
   const stamp=card.querySelector(".tt-card-kind").getBoundingClientRect();
   const image=card.querySelector(".tt-collage>.tt-visual").getBoundingClientRect();
   const cardBounds=card.getBoundingClientRect();
   const collage=card.querySelector(".tt-collage").getBoundingClientRect();
   const notes=[...card.querySelectorAll(".tt-collage>.tt-content>.tt-slip")].map(node=>{
    const bounds=node.getBoundingClientRect();
    return {x:bounds.left,y:bounds.top,right:bounds.right,bottom:bounds.bottom,
     width:bounds.width,height:bounds.height,
     clipY:node.scrollHeight-node.clientHeight,
     clipX:node.scrollWidth-node.clientWidth,
     text:node.innerText,angle:getComputedStyle(node).transform};
   });
   return {id:card.dataset.id,type:card.dataset.v2Kind,plate:card.dataset.paste,
    imageH:image.height,imageW:image.width,
    imageFill:getComputedStyle(card.querySelector(".tt-art-image")).objectFit,
    cardBounds:{left:cardBounds.left,top:cardBounds.top,right:cardBounds.right,bottom:cardBounds.bottom},
    collage:{left:collage.left,top:collage.top,right:collage.right,bottom:collage.bottom},
    title:{left:title.left,top:title.top,right:title.right,bottom:title.bottom},
    stampOutside:stamp.right-cardBounds.right,
    stampOverlapX:Math.max(0,Math.min(stamp.right,title.right)-Math.max(stamp.left,title.left)),
    stampOverlapY:Math.max(0,Math.min(stamp.bottom,title.bottom)-Math.max(stamp.top,title.top)),
    notes};
  }));
  expect(cards).toHaveLength(139);
  for(const card of cards){
   expect(card.imageFill,card.id+" missing full artwork").toBe("cover");
   expect(card.imageH,card.id+" illustration too small").toBeGreaterThan(110*96/25.4);
   expect(card.imageW,card.id+" illustration too narrow").toBeGreaterThan(83*96/25.4);
   expect(card.notes.length,card.id+" has no note").toBeGreaterThanOrEqual(1);
   expect(card.notes.length,card.id+" too many pasted notes").toBeLessThanOrEqual(2);
   expect(card.stampOutside,card.id+" stamp outside frame").toBeLessThanOrEqual(2);
   expect(Math.min(card.stampOverlapX,card.stampOverlapY),card.id+" stamp/title overlap").toBeLessThanOrEqual(5);
   for(const note of card.notes){
    expect(note.clipY,card.id+" note vertically clipped").toBeLessThanOrEqual(2);
    expect(note.clipX,card.id+" note horizontally clipped").toBeLessThanOrEqual(2);
    expect(note.y-card.collage.top,card.id+" pasted note extends above artwork").toBeGreaterThanOrEqual(21);
    expect(note.bottom-card.collage.bottom,card.id+" pasted note extends below frame").toBeLessThanOrEqual(4);
    expect(note.x-card.collage.left,card.id+" pasted note extends left").toBeGreaterThanOrEqual(-3);
    expect(note.right-card.collage.right,card.id+" pasted note extends right").toBeLessThanOrEqual(4);
    const overlapX=Math.min(card.title.right,note.right)-Math.max(card.title.left,note.x);
    const overlapY=Math.min(card.title.bottom,note.bottom)-Math.max(card.title.top,note.y);
    expect(Math.min(overlapX,overlapY),card.id+" rules overlap title").toBeLessThanOrEqual(4);
   }
   if(card.notes.length===2){
    const [a,b]=card.notes;
    const overlapX=Math.max(0,Math.min(a.right,b.right)-Math.max(a.x,b.x));
    const overlapY=Math.max(0,Math.min(a.bottom,b.bottom)-Math.max(a.y,b.y));
    expect(Math.min(overlapX,overlapY),card.id+" pasted notes collide").toBeLessThanOrEqual(3);
   }
  }
  return cards;
 };
 const onScreen=await check();
 const families=new Set(onScreen.map(card=>card.type));
 for(const family of ["HERO","MONSTER","WARDEN","TOOL","EQUIPMENT","COMPANION","RELIC","SCROLL","RING","WAND","POTION","HAZARD","SHRINE","ENCOUNTER"])
  expect(families.has(family),"No artwork/layout for "+family).toBeTruthy();
 expect(new Set(onScreen.map(c=>c.plate)).size).toBe(4);
 expect(new Set(onScreen.map(c=>c.notes[0].angle)).size).toBeGreaterThanOrEqual(3);
 await page.emulateMedia({media:"print"});
 // The same physical card component is used in the four-up print sheets.
 const printed=await page.locator(".tt-print-only .tt-card").evaluateAll(cards=>cards.map(c=>({
  id:c.dataset.id,
  w:c.getBoundingClientRect().width,h:c.getBoundingClientRect().height,
  clips:[...c.querySelectorAll(".tt-slip")].map(n=>({
   y:n.scrollHeight-n.clientHeight,x:n.scrollWidth-n.clientWidth
  }))
 })));
 expect(printed).toHaveLength(139);
 for(const card of printed){
  expect(card.w).toBeGreaterThan(90*96/25.4-2);
  expect(card.h).toBeLessThan(130*96/25.4+2);
  for(const clip of card.clips){
   expect(clip.y,"Printed note clipped on "+card.id).toBeLessThanOrEqual(2);
   expect(clip.x,"Printed note clipped on "+card.id).toBeLessThanOrEqual(2);
  }
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
   const slip=card.querySelector(".tt-slip--lead");
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




test("north-east notes and footer depth marks are consistent across all 139 cards",async({page})=>{
 test.setTimeout(180000);
 await page.goto("/");
 const checks=await page.locator(".tt-grid .tt-card").evaluateAll(cards=>cards.map(card=>{
  const collage=card.querySelector(".tt-collage").getBoundingClientRect();
  const lead=card.querySelector(".tt-slip--lead").getBoundingClientRect();
  const result=card.querySelector(".tt-slip--results")?.getBoundingClientRect();
  const depth=card.querySelector(".tt-depth");
  return {id:card.dataset.id,titleBand:card.dataset.titleBand,
   stage:card.dataset.type==="room"||card.dataset.type==="monster",
   depth:depth?.textContent||null,depthInFooter:depth?.closest(".tt-footer")!==null,
   leadEast:(lead.left+lead.right)/2>(collage.left+collage.right)/2,
   leadTopMm:(lead.top-collage.top)*25.4/96,
   resultWest:result?(result.left+result.right)/2<(collage.left+collage.right)/2:null,
   aboveTitle:lead.top<card.querySelector(".tt-title").getBoundingClientRect().bottom
  };
 }));
 expect(checks).toHaveLength(139);
 for(const x of checks){
  expect(x.leadEast,x.id+" first note not north-east").toBe(true);
  expect(x.leadTopMm,x.id+" first note too high").toBeGreaterThan(26);
  expect(x.leadTopMm,x.id+" first note too low").toBeLessThan(45);
  expect(x.aboveTitle,x.id+" upper note collides with title").toBe(false);
  if(x.resultWest!==null)expect(x.resultWest,x.id+" second note not opposite").toBe(true);
  if(x.stage){
   expect(x.depthInFooter,x.id+" depth mark not moved to footer").toBe(true);
   expect(["UPPER","MIDDLE","DEEP","FINAL"]).toContain(x.depth);
  }else expect(x.depth,x.id+" unwanted dungeon depth").toBe(null);
 }
});


test("distressed borders and distinct paper cutouts survive screen and print",async({page})=>{
 await page.goto("/");
 const card=page.locator(".tt-grid .tt-card");
 const metrics=await card.evaluateAll(cards=>cards.slice(0,30).map(c=>{
  const lead=c.querySelector(".tt-slip--lead");
  const results=c.querySelector(".tt-slip--results");
  return {
   id:c.dataset.id,
   border:parseFloat(getComputedStyle(c).borderTopWidth),
   wear:getComputedStyle(c,"::after").backgroundImage,
   titleShape:getComputedStyle(c.querySelector(".tt-title")).clipPath,
   leadShape:getComputedStyle(lead).clipPath,
   leadAngle:getComputedStyle(lead).transform,
   resultsShape:results?getComputedStyle(results).clipPath:null
  };
 }));
 expect(metrics).toHaveLength(30);
 for(const x of metrics){
  expect(x.border,x.id+" lost its frame").toBeGreaterThanOrEqual(3);
  expect(x.wear,x.id+" lost edge distress").toContain("radial-gradient");
  expect(x.titleShape,x.id+" lost hand-cut title").toContain("polygon");
  expect(x.leadShape,x.id+" lost paper scrap").toContain("polygon");
  if(x.resultsShape!==null)expect(x.resultsShape).toContain("polygon");
 }
 expect(new Set(metrics.map(x=>x.leadAngle)).size).toBeGreaterThanOrEqual(3);
 await page.emulateMedia({media:"print"});
 const print=await page.locator(".tt-print-only .tt-card").first().evaluate(c=>({
  title:getComputedStyle(c.querySelector(".tt-title")).clipPath,
  slip:getComputedStyle(c.querySelector(".tt-slip--lead")).clipPath
 }));
 expect(print.title).toContain("polygon");
 expect(print.slip).toContain("polygon");
});
