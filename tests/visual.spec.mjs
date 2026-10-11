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
 expect(specimens.some(c=>c.ratio<.62)).toBeTruthy(); // Behaviour-heavy cards still reserve readable space for effects.
 for(const c of specimens){
  expect(c.clip,"Rules clipped on "+c.id).toBeLessThanOrEqual(2);
  expect(c.footer,"Footer outside "+c.id).toBeLessThanOrEqual(2);
 }
});


test("Phase 1 xerox treatment survives print while rule panels remain legible",async({page})=>{
 await page.goto("/");
 const spec=page.locator('.tt-grid .tt-card[data-id="delver"]').first();
 const key=page.locator('.tt-grid .tt-card[data-id="key"]').first();
 const first=await spec.evaluate(card=>{
  const title=card.querySelector(".tt-title");
  const img=card.querySelector(".tt-art-image");
  const paper=getComputedStyle(card);
  const label=getComputedStyle(title);
  const art=getComputedStyle(img);
  const rules=card.querySelector(".tt-content");
  return {
   paperTexture:paper.backgroundImage,cardWidth:card.getBoundingClientRect().width,
   labelClip:label.clipPath,labelRotation:label.transform,
   titleSize:parseFloat(label.fontSize),illustrationFilter:art.filter,
   rulesClip:rules.scrollHeight-rules.clientHeight
  };
 });
 expect(first.paperTexture).toContain("repeating-linear-gradient");
 expect(first.labelClip).toContain("polygon(");
 expect(first.labelRotation).not.toBe("none");
 expect(first.titleSize).toBeGreaterThanOrEqual(20);
 expect(first.illustrationFilter).toContain("contrast(2.25)");
 expect(first.rulesClip).toBeLessThanOrEqual(2);
 await expect(key.locator(".tt-art-image")).toBeVisible();
 await page.emulateMedia({media:"print"});
 const printed=await page.locator('.tt-print-only .tt-card[data-id="delver"]').first().evaluate(card=>{
  const label=card.querySelector(".tt-title");
  const image=card.querySelector(".tt-art-image");
  return {
   width:card.getBoundingClientRect().width,
   height:card.getBoundingClientRect().height,
   labelClip:getComputedStyle(label).clipPath,
   contrast:getComputedStyle(image).filter,
   overflow:card.querySelector(".tt-content").scrollHeight-card.querySelector(".tt-content").clientHeight
  };
 });
 expect(printed.width).toBeGreaterThan(90*96/25.4-2);
 expect(printed.height).toBeLessThan(130*96/25.4+2);
 expect(printed.labelClip).toContain("polygon(");
 expect(printed.contrast).toContain("contrast(2.25)");
 expect(printed.overflow).toBeLessThanOrEqual(2);
});


test("Phase 2 uses distinct reference-style physical compositions with complete text",async({page})=>{
 await page.goto("/");
 const hero=page.locator('.tt-grid .tt-card[data-type="hero"]').first();
 const monster=page.locator('.tt-grid .tt-card[data-type="monster"]').first();
 const room=page.locator('.tt-grid .tt-card[data-id="m-flood"]').first();
 const object=page.locator('.tt-grid .tt-card[data-id="key"]').first();
 const potion=page.locator('.tt-grid .tt-card[data-id="smoky"]').first();
 for(const card of [hero,monster]){
  await expect(card.locator(".tt-stats .tt-stat-symbol").first()).toBeVisible();
  await expect(card.locator(".tt-stats")).toBeVisible();
  await expect(card.locator(".tt-illustration")).toBeVisible();
 }
 await expect(monster.locator(".tt-behaviour-row")).toHaveCount(4);
 await expect(monster.locator(".tt-corpse")).toBeVisible();
 await expect(room.locator(".tt-visual--split")).toBeVisible();
 await expect(room.locator(".tt-content--sidebar")).toBeVisible();
 const roomMetrics=await room.evaluate(el=>{
  const visual=el.querySelector(".tt-visual"),side=el.querySelector(".tt-content--sidebar");
  return {share:side.getBoundingClientRect().width/visual.getBoundingClientRect().width,
   clip:side.scrollHeight-side.clientHeight};
 });
 expect(roomMetrics.share).toBeGreaterThan(.3);
 expect(roomMetrics.share).toBeLessThan(.45);
 expect(roomMetrics.clip).toBeLessThanOrEqual(2);
 const ratios=await Promise.all([hero,monster,object,potion].map(card=>card.evaluate(el=>
  el.querySelector(".tt-visual").getBoundingClientRect().height/el.getBoundingClientRect().height)));
 expect(ratios[2]).toBeGreaterThan(ratios[1]);
 expect(ratios[0]).toBeGreaterThan(ratios[1]);
 const content=await page.locator(".tt-grid .tt-card").evaluateAll(cards=>cards.map(card=>({
  id:card.dataset.id,
  titleRight:card.querySelector(".tt-title").getBoundingClientRect().right-card.getBoundingClientRect().right,
  titleTop:card.querySelector(".tt-title").getBoundingClientRect().top-card.getBoundingClientRect().top,
  overflow:card.querySelector(".tt-content").scrollHeight-card.querySelector(".tt-content").clientHeight
 })));
 for(const card of content){
  expect(card.titleRight,"Pasted title outside "+card.id).toBeLessThanOrEqual(2);
  expect(card.titleTop,"Title above card "+card.id).toBeGreaterThanOrEqual(0);
  expect(card.overflow,"Missing mechanical lines on "+card.id).toBeLessThanOrEqual(2);
 }
 await page.emulateMedia({media:"print"});
 await expect(page.locator('.tt-print-only .tt-card[data-id="m-flood"] .tt-content--sidebar').first()).toBeVisible();
});


test("Phase 3 Xerox filter is on illustrations only and appears on all print copies",async({page})=>{
 await page.goto("/");
 const plateFilter=page.locator("#tt-xerox-ink");
 await expect(plateFilter).toHaveCount(1);
 const film=await page.locator("#tt-xerox-ink feFuncR").evaluate(el=>el.getAttribute("tableValues"));
 expect(film).toBe("0 .025 .10 .92 1 1");
 const cards=page.locator(".tt-grid .tt-card");
 const plates=await cards.evaluateAll(xs=>[...new Set(xs.map(x=>x.dataset.plate))].sort());
 expect(plates).toEqual(["a","b","c","d"]);
 for(const id of ["delver","eye","key","smoky","m-flood"]){
  const specimen=page.locator('.tt-grid .tt-card[data-id="'+id+'"]').first();
  const data=await specimen.evaluate(el=>{
    const art=el.querySelector(".tt-art-image");
    const rules=el.querySelector(".tt-content");
    return {
      plate:el.dataset.plate,
      artFilter:getComputedStyle(art).filter,
      rulesFilter:getComputedStyle(rules).filter,
      labelRotate:getComputedStyle(el.querySelector(".tt-title")).transform,
      contentOverflow:rules.scrollHeight-rules.clientHeight
    };
  });
  expect(["a","b","c","d"]).toContain(data.plate);
  expect(data.artFilter).toContain("tt-xerox-ink");
  expect(data.artFilter).toContain("contrast(2.25)");
  expect(data.rulesFilter).toBe("none");
  expect(data.labelRotate).not.toBe("none");
  expect(data.contentOverflow,"text on "+id).toBeLessThanOrEqual(2);
 }
 await page.emulateMedia({media:"print"});
 const preview=await page.locator('.tt-print-only .tt-card[data-id="delver"]').first().evaluate(card=>{
  const art=card.querySelector(".tt-art-image");
  const body=card.querySelector(".tt-content");
  return {artFilter:getComputedStyle(art).filter,ruleFilter:getComputedStyle(body).filter,
   width:card.getBoundingClientRect().width,height:card.getBoundingClientRect().height};
 });
 expect(preview.artFilter).toContain("tt-xerox-ink");
 expect(preview.ruleFilter).toBe("none");
 expect(preview.width).toBeGreaterThan(90*96/25.4-2);
 expect(preview.height).toBeLessThan(130*96/25.4+2);
});


test("collage cards physically overlap art, pasted rules, titles and stat rails without hiding mechanics",async({page})=>{
 await page.goto("/");
 const samples=["delver","eye","key","smoky","m-flood"];
 const measurements=await page.locator(".tt-grid .tt-card").evaluateAll(cards=>cards.filter(c=>
   ["delver","eye","key","smoky","m-flood"].includes(c.dataset.id)).map(card=>{
  const art=card.querySelector(".tt-visual");
  const note=card.querySelector(".tt-content");
  const title=card.querySelector(".tt-title");
  const rail=card.querySelector(".tt-stats");
  const a=art.getBoundingClientRect(),n=note.getBoundingClientRect(),t=title.getBoundingClientRect();
  const overlap=(x,y)=>Math.max(0,Math.min(x.bottom,y.bottom)-Math.max(x.top,y.top))
    *Math.max(0,Math.min(x.right,y.right)-Math.max(x.left,y.left));
  return {id:card.dataset.id,assembly:card.dataset.assembly,
    artWithPaper:overlap(a,n),artWithTitle:overlap(a,t),
    artWithStats:rail?overlap(a,rail.getBoundingClientRect()):null,
    clipped:note.scrollHeight-note.clientHeight,
    textFilter:getComputedStyle(note).filter,
    paperColor:getComputedStyle(note).backgroundColor,
    paperPosition:getComputedStyle(note).position,
    artPosition:getComputedStyle(art).position
  };
 }));
 expect(measurements).toHaveLength(samples.length);
 for(const value of measurements){
  expect(value.assembly).toBe("collage");
  expect(value.artPosition).toBe("absolute");
  expect(value.paperPosition).toBe("absolute");
  expect(value.artWithPaper,"Art and paste-on slip don't overlap on "+value.id).toBeGreaterThan(150);
  expect(value.artWithTitle,"Title doesn't overlay printed image on "+value.id).toBeGreaterThan(100);
  expect(value.clipped,"Rules clipped on "+value.id).toBeLessThanOrEqual(2);
  expect(value.textFilter).toBe("none");
  expect(value.paperColor).not.toBe("rgba(0, 0, 0, 0)");
 }
 for(const value of measurements.filter(v=>v.artWithStats!==null)){
  expect(value.artWithStats,"Stats must intrude onto art on "+value.id).toBeGreaterThan(100);
 }
 await page.emulateMedia({media:"print"});
 for(const id of ["delver","eye","key","m-flood"]){
  const v=await page.locator('.tt-print-only .tt-card[data-id="'+id+'"]').first().evaluate(card=>{
    const art=card.querySelector(".tt-visual").getBoundingClientRect();
    const note=card.querySelector(".tt-content").getBoundingClientRect();
    return {overlap:Math.max(0,Math.min(art.bottom,note.bottom)-Math.max(art.top,note.top)),
      overflow:card.querySelector(".tt-content").scrollHeight-card.querySelector(".tt-content").clientHeight};
  });
  expect(v.overlap,"Print loses collage overlap "+id).toBeGreaterThan(4);
  expect(v.overflow).toBeLessThanOrEqual(2);
 }
});
