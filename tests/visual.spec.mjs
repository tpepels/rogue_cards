import { test, expect } from "@playwright/test";
import { CATALOGUE, TYPES, printDeck } from "../src/data.js";

test("specimen gallery has no horizontal overflow or card clipping across breakpoints", async ({page})=>{
  const errors=[];
  page.on("pageerror",e=>errors.push(e.message));
  await page.goto("/");
  await page.getByRole("button",{name:/\[\s*02\s*\]\s*CARDS/}).click();
  for(const width of [375,414,630,768,1024,1440]){
    await page.setViewportSize({width,height:900});
    await expect(page.locator(".gallery .game-card")).toHaveCount(CATALOGUE.length);
    const m=await page.evaluate(()=>{
      const cards=[...document.querySelectorAll(".gallery .game-card")];
      return {width:document.documentElement.scrollWidth,viewport:innerWidth,
        clipped:cards.filter(card=>{
          const rect=card.getBoundingClientRect();
          const title=card.querySelector(".game-card__title").getBoundingClientRect();
          const rule=card.querySelector(".game-card__rule").getBoundingClientRect();
          const flavor=card.querySelector(".game-card__flavor").getBoundingClientRect();
          return rect.left<-2||rect.right>innerWidth+2||card.scrollHeight>card.clientHeight+3||
            title.bottom>rect.bottom-2||rule.bottom>rect.bottom-2||flavor.bottom>rect.bottom-2;
        }).map(card=>card.dataset.cardId)};
    });
    expect(m.width,"horizontal scroll at "+width).toBeLessThanOrEqual(m.viewport+2);
    expect(m.clipped,"clipped cards at "+width).toEqual([]);
  }
  expect(errors).toEqual([]);
});
test("hero can explore two-action dungeon and branch to side room",async({page})=>{
  await page.setViewportSize({width:390,height:850});
  await page.goto("/");
  await page.getByRole("button",{name:/Cave Delver/}).click();
  await expect(page.locator(".mobile-hud")).toBeVisible();
  await expect(page.getByText("2 OF 2 ACTIONS LEFT")).toBeVisible();
  await page.getByRole("button",{name:/Explore Depth 1/}).click();
  await expect(page.locator(".map-cell--active")).toContainText("1");
  await expect(page.locator(".encounter__cards .game-card").first()).toBeVisible();
  await expect(page.locator(".command-panel")).toBeVisible();
  const m=await page.evaluate(()=>({width:document.documentElement.scrollWidth,viewport:innerWidth}));
  expect(m.width).toBeLessThanOrEqual(m.viewport+2);
  await page.getByRole("button",{name:/NEW RUN/}).click();
  await expect(page.getByText("ABANDON THIS EXPEDITION?")).toBeVisible();
  await page.getByRole("button",{name:/KEEP PLAYING/}).click();
  await expect(page.locator(".command-panel")).toBeVisible();
});
test("physical kit contains correct counts and explicit A4 sheets",async({page})=>{
  await page.goto("/");
  await page.getByRole("button",{name:/\[\s*02\s*\]\s*CARDS/}).click();
  await page.getByRole("button",{name:"PHYSICAL KIT"}).click();
  const size=TYPES.slice(1).flatMap(type=>printDeck(type)).length;
  await expect(page.locator(".gallery .game-card")).toHaveCount(size);
  await page.emulateMedia({media:"print"});
  const totalSheets=Math.ceil(size/4);
  await expect(page.locator(".print-sheet")).toHaveCount(totalSheets);
  await expect(page.locator(".gallery")).toBeHidden();
  const info=await page.evaluate(()=>{
    const sheets=[...document.querySelectorAll(".print-sheet")];
    const style=getComputedStyle(sheets[0].querySelector(".game-card"));
    return {width:parseFloat(style.width),height:parseFloat(style.height),
      cardMax:Math.max(...sheets.map(s=>s.querySelectorAll(".game-card").length)),
      count:sheets.reduce((n,s)=>n+s.querySelectorAll(".game-card").length,0)};
  });
  expect(info.cardMax).toBe(4);
  expect(info.count).toBe(size);
  expect(info.width).toBeCloseTo(90*96/25.4,0);
  expect(info.height).toBeCloseTo(140*96/25.4,0);
});
test("field guide and tracking sheets contain their intended pages",async({page})=>{
  await page.goto("/field-guide.html");
  await expect(page.locator("section.paper")).toHaveCount(3);
  await expect(page.getByText("TWO ACTIONS", {exact:false}).first()).toBeVisible();
  await page.goto("/playmat.html");
  await expect(page.locator("section.paper")).toHaveCount(2);
  await expect(page.getByText("VAULT OF YENDOR")).toBeVisible();
});

test("print handouts fit their declared A4 content area without clipping",async({page})=>{
  for(const route of ["/field-guide.html","/playmat.html"]){
    await page.goto(route);
    await page.emulateMedia({media:"print"});
    const geom=await page.evaluate(()=>{
      const paper=document.querySelector("section.paper");
      const table=paper.querySelector(".map-table");
      if(!table) return null;
      const row=table.querySelector("tbody tr");
      const footer=paper.querySelector("footer");
      return {paperScroll:paper.scrollHeight,paperClient:paper.clientHeight,
        tableHeight:table.getBoundingClientRect().height,
        firstRowHeight:row.getBoundingClientRect().height,
        rowCSS:getComputedStyle(row.querySelector("td")).height,
        footerBottom:footer.getBoundingClientRect().bottom-paper.getBoundingClientRect().top,
        pageHeight:paper.getBoundingClientRect().height};
    });
    if(geom) console.log("PRINT MAP GEOMETRY",JSON.stringify(geom));
    const pages=await page.locator("section.paper").evaluateAll(elements=>elements.map(el=>{
      const rect=el.getBoundingClientRect();
      return {height:rect.height, client:el.clientHeight, scroll:el.scrollHeight, width:rect.width};
    }));
    expect(pages.length).toBe(route.includes("field-guide")?3:2);
    for(let i=0;i<pages.length;i++){
      const sheet=pages[i];
      expect(sheet.width,route+" page "+i+" width").toBeLessThanOrEqual(190*96/25.4+2);
      expect(sheet.height,route+" page "+i+" height").toBeLessThanOrEqual(277*96/25.4+3);
      expect(sheet.scroll,route+" page "+i+" content overflow").toBeLessThanOrEqual(sheet.client+2);
    }
  }
});
