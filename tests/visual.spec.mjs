import {test,expect} from "@playwright/test";
import {mkdir,writeFile} from "node:fs/promises";
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
 await expect(page.getByRole("link",{name:/READ \/ PRINT THE RULEBOOK/})).toBeVisible();
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
test("readable two-page guide prints as exactly two A4 pages without clipped content",async({page})=>{
 await page.goto("/rules.html");
 await expect(page.getByRole("heading",{name:"ROGUE CARDS"})).toBeVisible();
 await expect(page.getByRole("heading",{name:/Explore a Room/})).toBeVisible();
 await expect(page.getByRole("heading",{name:/The Amulet Vault/})).toBeVisible();
 await expect(page.locator(".sheet")).toHaveCount(2);
 await page.emulateMedia({media:"print"});
 const sizes=await page.locator(".sheet").evaluateAll(elements=>elements.map(el=>({
  width:el.getBoundingClientRect().width,height:el.getBoundingClientRect().height,
  clipY:el.scrollHeight-el.clientHeight,clipX:el.scrollWidth-el.clientWidth
 })));
 for(const [i,size] of sizes.entries()){
  expect(size.width,"A4 page width "+i).toBeLessThanOrEqual(192*96/25.4+2);
  expect(size.height,"A4 page height "+i).toBeLessThanOrEqual(279*96/25.4+2);
  expect(size.clipY,"A4 text clipped on page "+(i+1)).toBeLessThanOrEqual(2);
  expect(size.clipX,"A4 horizontal clipping on page "+(i+1)).toBeLessThanOrEqual(2);
 }
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
   expect(Math.abs(card.collage.left-card.cardBounds.left),card.id+" art not flush left").toBeLessThanOrEqual(2);
   expect(Math.abs(card.collage.top-card.cardBounds.top),card.id+" art not flush top").toBeLessThanOrEqual(2);
   expect(Math.abs(card.collage.right-card.cardBounds.right),card.id+" art not flush right").toBeLessThanOrEqual(2);
   expect(Math.abs(card.collage.bottom-card.cardBounds.bottom),card.id+" art not flush bottom").toBeLessThanOrEqual(2);
   expect(card.imageH,card.id+" illustration too small").toBeGreaterThan(110*96/25.4);
   expect(card.imageW,card.id+" illustration too narrow").toBeGreaterThan(83*96/25.4);
   expect(card.notes.length,card.id+" has no note").toBeGreaterThanOrEqual(1);
   expect(card.notes.length,card.id+" too many pasted notes").toBeLessThanOrEqual(2); 
   if(card.notes.length===2){
    const resultsNote=card.notes[1];
    const footerClearance=6*96/25.4; // protect the printed caption and card number
    expect(resultsNote.bottom,card.id+" results text reaches footer")
     .toBeLessThanOrEqual(card.cardBounds.bottom-footerClearance);
   }
   // A pasted note may tilt or touch the other note's paper edge, but it may
   // not cover a meaningful area of the other note's printed instructions.
   if(card.notes.length===2){
    const [a,b]=card.notes;
    const overlapX=Math.max(0,Math.min(a.right,b.right)-Math.max(a.x,b.x));
    const overlapY=Math.max(0,Math.min(a.bottom,b.bottom)-Math.max(a.y,b.y));
    expect(Math.min(overlapX,overlapY),card.id+" pasted notes obscure each other").toBeLessThanOrEqual(6);
   }
   expect(card.stampOutside,card.id+" stamp outside frame").toBeLessThanOrEqual(2);
   expect(Math.min(card.stampOverlapX,card.stampOverlapY),card.id+" stamp/title overlap").toBeLessThanOrEqual(5);
   for(const note of card.notes){
    expect(note.clipY,card.id+" note vertically clipped").toBeLessThanOrEqual(2);
    expect(note.clipX,card.id+" note horizontally clipped").toBeLessThanOrEqual(2);
    // Hand-positioned cutouts can be rotated and intentionally overlap.
    // Only reject cutouts actually extending outside the printable card.
    const margin=6*96/25.4;
    expect(note.y-card.cardBounds.top,card.id+" note goes off top").toBeGreaterThanOrEqual(-margin);
    expect(note.bottom-card.cardBounds.bottom,card.id+" result text extends past printable bottom edge").toBeLessThanOrEqual(5);
    expect(note.x-card.cardBounds.left,card.id+" note goes off left").toBeGreaterThanOrEqual(-margin);
    expect(note.right-card.cardBounds.right,card.id+" note goes off right").toBeLessThanOrEqual(margin);
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




test("individual card placements preserve room depth and readable pasted rules",async({page})=>{
 test.setTimeout(180000);
 await page.goto("/");
 const checks=await page.locator(".tt-grid .tt-card").evaluateAll(cards=>cards.map(card=>{
  const title=card.querySelector(".tt-title"),lead=card.querySelector(".tt-slip--lead");
  const results=card.querySelector(".tt-slip--results");
  const depth=card.querySelector(".tt-depth");
  return {id:card.dataset.id,
   stage:card.dataset.type==="room"||card.dataset.type==="monster",
   depth:depth?.textContent||null,depthInFooter:depth?.closest(".tt-footer")!==null,
   titleAngle:getComputedStyle(title).transform,
   leadAngle:getComputedStyle(lead).transform,
   resultsAngle:results?getComputedStyle(results).transform:null,
   leadWidth:lead.getBoundingClientRect().width
  };
 }));
 expect(checks).toHaveLength(139);
 for(const item of checks){
  expect(item.leadWidth,item.id+" has no visible rules paper").toBeGreaterThan(20);
  expect(item.titleAngle,item.id+" lost title placement").not.toBe("none");
  expect(item.leadAngle,item.id+" lost rules rotation").not.toBe("none");
  if(item.stage){
   expect(item.depthInFooter,item.id+" depth not in footer").toBe(true);
   expect(["UPPER","MIDDLE","DEEP","FINAL"]).toContain(item.depth);
  }else expect(item.depth,item.id+" unwanted depth").toBe(null);
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
  expect(x.border,x.id+" has an unwanted frame").toBe(0);
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

test("capture all 139 rendered cards for visual inspection",async({page})=>{
 test.setTimeout(180000);
 await page.goto("/");
 const dir="test-results/card-visual-inspection";
 await mkdir(dir,{recursive:true});
 const eager=await page.locator(".tt-grid .tt-art-image").evaluateAll(async imgs=>{
  for(const img of imgs)img.loading="eager";
  await Promise.all(imgs.map(img=>img.decode().catch(()=>{})));
  return imgs.map(img=>({loaded:img.complete&&img.naturalWidth>0,url:img.getAttribute("src")}));
 });
 expect(eager).toHaveLength(139);
 expect(eager.filter(i=>!i.loaded),"Missing actual illustration files").toEqual([]);
 const bounds=await page.locator(".tt-grid .tt-card").evaluateAll(cards=>cards.map(card=>{
  const r=card.getBoundingClientRect();
  return {id:card.dataset.id,left:r.left,right:r.right,top:r.top,bottom:r.bottom};
 }));
 const overlaps=[];
 for(let i=0;i<bounds.length;i++)for(let j=i+1;j<bounds.length;j++){
  const a=bounds[i],b=bounds[j];
  const x=Math.min(a.right,b.right)-Math.max(a.left,b.left);
  const y=Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top);
  if(x>2&&y>2)overlaps.push(a.id+" overlaps "+b.id);
 }
 expect(overlaps,"Gallery must not overlap physical cards").toEqual([]);
 const measures=await page.locator(".tt-grid .tt-card").evaluateAll(cards=>cards.map(card=>{
  const cardRect=card.getBoundingClientRect();
  return {id:card.dataset.id,type:card.dataset.v2Kind,
    card:{x:cardRect.x,y:cardRect.y,w:cardRect.width,h:cardRect.height},
    slips:[...card.querySelectorAll(".tt-slip")].map(note=>{
     const r=note.getBoundingClientRect();
     return {text:note.innerText,x:r.left-cardRect.left,y:r.top-cardRect.top,
      w:r.width,h:r.height,clipY:note.scrollHeight-note.clientHeight,
      clipX:note.scrollWidth-note.clientWidth};
    })
  };
 }));
 expect(measures).toHaveLength(139);
 await writeFile(dir+"/card-measurements.json",JSON.stringify(measures,null,2));
 const groups=[["hero",null],["room","UPPER"],["room","MIDDLE"],["room","DEEP"],["room","FINAL"],
  ["monster",null],...["TOOL","EQUIPMENT","COMPANION","RELIC","SCROLL","RING","WAND","POTION"].map(x=>[x,null])];
 for(const [category,region] of groups){
  await page.getByRole("combobox",{name:"Card category"}).selectOption(category);
  if(region)await page.getByRole("combobox",{name:"Dungeon region"}).selectOption(region);
  const loaded=await page.locator(".tt-grid .tt-art-image").evaluateAll(async imgs=>{
   for(const img of imgs)img.loading="eager";
   await Promise.all(imgs.map(img=>img.decode().catch(()=>{})));
   return imgs.filter(img=>!img.complete||!img.naturalWidth).length;
  });
  expect(loaded,"Images not ready in "+category+"/"+(region||"all")).toBe(0);
  const name=(category+"-"+(region||"all")).toLowerCase();
  await page.locator(".tt-grid").screenshot({path:dir+"/"+name+".png",animations:"disabled",timeout:45000});
 }
});
