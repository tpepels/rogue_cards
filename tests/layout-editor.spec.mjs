import {test,expect} from "@playwright/test";
import {readFile} from "node:fs/promises";

test("layout editor drags, resizes and exports real per-card millimetres",async({page})=>{
 await page.goto("/layout-editor.html");
 const card=page.locator("#editor-card .tt-card");
 await expect(card).toHaveCount(1);
 await expect(page.locator("#card-picker option")).toHaveCount(139);
 const rules=card.locator(".tt-slip--lead");
 await rules.click();
 await expect(page.locator("#selected-name")).toHaveText("UPPER RULES");
 const before=await rules.boundingBox();
 await page.mouse.move(before.x+before.width/2,before.y+before.height/2);
 await page.mouse.down();
 await page.mouse.move(before.x+before.width/2-25,before.y+before.height/2+16,{steps:5});
 await page.mouse.up();
 const after=await rules.boundingBox();
 expect(after.x).toBeLessThan(before.x-10);
 expect(after.y).toBeGreaterThan(before.y+6);
 const widthBefore=Number(await page.locator("#position-w").inputValue());
 const corner=await rules.locator(".le-handle").boundingBox();
 await page.mouse.move(corner.x+corner.width/2,corner.y+corner.height/2);
 await page.mouse.down();
 await page.mouse.move(corner.x+corner.width/2+35,corner.y+corner.height/2+15,{steps:4});
 await page.mouse.up();
 expect(Number(await page.locator("#position-w").inputValue())).toBeGreaterThan(widthBefore);
 const downloadPromise=page.waitForEvent("download");
 await page.getByRole("button",{name:/EXPORT JSON/}).click();
 const download=await downloadPromise;
 expect(download.suggestedFilename()).toBe("rogue-cards-layouts.json");
 const data=JSON.parse(await readFile(await download.path(),"utf8"));
 expect(data.version).toBe(1);
 expect(data.units).toBe("mm");
 const name=await card.getAttribute("data-type")+":"+await card.getAttribute("data-id");
 expect(data.cards[name].rules.w).toBeGreaterThan(widthBefore);
 await page.reload();
 await expect(page.locator("#draft-status")).toContainText("1 / 139 cards adjusted");
 await page.getByRole("button",{name:"RESET THIS CARD"}).click();
 await expect(page.locator("#draft-status")).toContainText("0 / 139 cards adjusted");
});
test("layout editor imports a multi-card JSON and shows those placements",async({page})=>{
 await page.goto("/layout-editor.html");
 const importData={version:1,units:"mm",cards:{
  "hero:warrior":{title:{x:18,y:7,w:48}},
  "room:m-well":{rules:{x:44,y:33,w:38}}
 }};
 page.once("dialog",dialog=>dialog.accept());
 await page.locator("#import-file").setInputFiles({
  name:"rogue-cards-layouts.json",mimeType:"application/json",
  buffer:Buffer.from(JSON.stringify(importData))
 });
 await expect(page.locator("#draft-status")).toContainText("2 / 139 cards adjusted");
 const actual=await page.locator("#editor-card .tt-title").evaluate(el=>getComputedStyle(el).left);
 expect(parseFloat(actual)).toBeGreaterThan(50);
 await page.locator("#family").selectOption("room");
 await page.locator("#card-picker").selectOption("room:m-well");
 await page.getByRole("button",{name:"UPPER RULES"}).click();
 await expect(page.locator("#position-w")).toHaveValue("38");
});
