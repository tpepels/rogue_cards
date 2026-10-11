import { test, expect } from "@playwright/test";
import { CATALOGUE } from "../src/data.js";

test("card gallery remains readable at desktop, tablet, and mobile sizes", async ({page}) => {
  const runtimeErrors=[];
  page.on("pageerror",error=>runtimeErrors.push(error.message));
  await page.goto("/");
  await page.getByRole("button",{name:/\[\s*02\s*\]\s*CARDS/}).click();
  for(const width of [375, 414, 630, 768, 1024, 1440]) {
    await page.setViewportSize({width,height:900});
    await expect(page.locator(".gallery .game-card")).toHaveCount(CATALOGUE.length);
    const info=await page.evaluate(()=>{
      const cards=[...document.querySelectorAll(".gallery .game-card")];
      return {
        pageWidth:document.documentElement.scrollWidth,
        viewport:innerWidth,
        overflowCards:cards.filter(card=>{
          const b=card.getBoundingClientRect();
          const title=card.querySelector(".game-card__title").getBoundingClientRect();
          const rule=card.querySelector(".game-card__rule").getBoundingClientRect();
          const flavor=card.querySelector(".game-card__flavor").getBoundingClientRect();
          return b.left < -2 || b.right > innerWidth+2 ||
            card.scrollHeight > card.clientHeight+3 ||
            title.right > b.right+2 || title.bottom > b.bottom-4 ||
            rule.bottom > b.bottom-4 || flavor.bottom > b.bottom-4;
        }).map(c=>c.getAttribute("data-card-id"))
      };
    });
    expect(info.pageWidth, "horizontal scrollbar at "+width).toBeLessThanOrEqual(info.viewport+2);
    expect(info.overflowCards,"clipped cards at "+width).toEqual([]);
  }
  expect(runtimeErrors).toEqual([]);
});

test("playable encounter stays visible on a phone",async({page})=>{
  await page.setViewportSize({width:375,height:850});
  await page.goto("/");
  await page.getByRole("button",{name:/Cave Delver/}).click();
  await expect(page.locator(".mobile-hud")).toBeVisible();
  await page.getByRole("button",{name:/Descend \/ explore/}).click();
  await expect(page.locator(".encounter__cards .game-card").first()).toBeVisible();
  const metrics=await page.evaluate(()=>({
    pageWidth:document.documentElement.scrollWidth,
    viewport:innerWidth,
    controls:document.querySelectorAll(".actions button").length
  }));
  expect(metrics.pageWidth).toBeLessThanOrEqual(metrics.viewport+2);
  expect(metrics.controls).toBeGreaterThan(0);
});

test("print mode is exactly two 90x140 mm cards per row, four per A4 sheet",async({page})=>{
  await page.goto("/");
  await page.getByRole("button",{name:/\[\s*02\s*\]\s*CARDS/}).click();
  await page.emulateMedia({media:"print"});
  const count=Math.ceil(CATALOGUE.length/4);
  await expect(page.locator(".print-sheet")).toHaveCount(count);
  await expect(page.locator(".gallery")).toBeHidden();
  const info=await page.evaluate(()=>{
    const sheet=document.querySelector(".print-sheet");
    const card=sheet.querySelector(".game-card");
    const cardStyle=getComputedStyle(card);
    const sheetStyle=getComputedStyle(sheet);
    return {
      cardWidth:cardStyle.width,cardHeight:cardStyle.height,
      columns:sheetStyle.gridTemplateColumns,
      rows:sheetStyle.gridTemplateRows,
      visible:getComputedStyle(sheet).display !== "none",
      maxCards:Math.max(...[...document.querySelectorAll(".print-sheet")].map(s=>s.querySelectorAll(".game-card").length))
    };
  });
  expect(info.visible).toBe(true);
  expect(info.maxCards).toBe(4);
  // CSS physical units resolve to ~3.78 CSS pixels per millimetre.
  expect(parseFloat(info.cardWidth)).toBeCloseTo(90*96/25.4,0);
  expect(parseFloat(info.cardHeight)).toBeCloseTo(140*96/25.4,0);
});
