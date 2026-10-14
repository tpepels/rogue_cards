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
 await expect(page.locator("#draft-status")).toContainText("139 / 139 cards adjusted");
 await page.getByRole("button",{name:"RESTORE STARTING LAYOUT"}).click();
 await expect(page.locator("#draft-status")).toContainText("139 / 139 cards adjusted");
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
 await expect(page.locator("#draft-status")).toContainText("139 / 139 cards adjusted");
 const actual=await page.locator("#editor-card .tt-title").evaluate(el=>getComputedStyle(el).left);
 expect(parseFloat(actual)).toBeGreaterThan(50);
 await page.locator("#family").selectOption("room");
 await page.locator("#card-picker").selectOption("room:m-well");
 await page.getByRole("button",{name:"UPPER RULES"}).click();
 await expect(page.locator("#position-w")).toHaveValue("38");
});


test("rotation and stacking change what appears in front and survive JSON export",async({page})=>{
 await page.goto("/layout-editor.html");
 const overlap={version:1,units:"mm",cards:{
  "hero:warrior":{
   title:{x:15,y:30,w:60,rotation:0,zIndex:10},
   rules:{x:15,y:30,w:60,rotation:0,zIndex:60}
  }
 }};
 page.once("dialog",dialog=>dialog.accept());
 await page.locator("#import-file").setInputFiles({
  name:"overlap.json",mimeType:"application/json",
  buffer:Buffer.from(JSON.stringify(overlap))
 });
 await page.locator("#card-picker").selectOption("hero:warrior");
 const card=page.locator("#editor-card .tt-card");
 const title=card.locator(".tt-title");
 const rules=card.locator(".tt-slip--lead");
 await expect(title).toHaveCSS("z-index","10");
 await expect(rules).toHaveCSS("z-index","60");
 await expect(card.locator(".tt-collage")).toHaveCSS("z-index","auto");
 // The title is not trapped above the rules by its former parent stacking context.
 async function frontPiece(){
  return card.evaluate(el=>{
   const a=el.querySelector(".tt-title").getBoundingClientRect();
   const b=el.querySelector(".tt-slip--lead").getBoundingClientRect();
   const left=Math.max(a.left,b.left),right=Math.min(a.right,b.right);
   const top=Math.max(a.top,b.top),bottom=Math.min(a.bottom,b.bottom);
   if(left>=right||top>=bottom)return "no-overlap";
   const hit=document.elementFromPoint((left+right)/2,(top+bottom)/2);
   return hit?.closest(".tt-title,.tt-slip")?.classList.contains("tt-title")?"title":
    hit?.closest(".tt-slip")?.classList.contains("tt-slip--lead")?"rules":"other";
  });
 }
 expect(await frontPiece()).toBe("rules");
 await page.locator("#piece-list").getByRole("button",{name:"TITLE"}).click();
 await expect(page.locator("#position-zIndex")).toHaveValue("10");
 await page.locator("#position-rotation").fill("-13.5");
 await page.locator("#position-rotation").press("Tab");
 const radians=await title.evaluate(el=>{
  const numbers=getComputedStyle(el).transform.match(/matrix\(([^)]+)\)/)?.[1].split(",").map(Number);
  return Math.atan2(numbers[1],numbers[0])*180/Math.PI;
 });
 expect(radians).toBeCloseTo(-13.5,0);
 await page.locator("#position-zIndex").fill("90");
 await page.locator("#position-zIndex").press("Tab");
 await expect(title).toHaveCSS("z-index","90");
 expect(await frontPiece()).toBe("title");
 await page.getByRole("button",{name:"SEND TO BACK"}).click();
 await expect(title).toHaveCSS("z-index","59");
 expect(await frontPiece()).toBe("rules");
 await page.getByRole("button",{name:"BRING TO FRONT"}).click();
 await expect(title).toHaveCSS("z-index","61");
 const downloadPromise=page.waitForEvent("download");
 await page.getByRole("button",{name:/EXPORT JSON/}).click();
 const download=await downloadPromise;
 const saved=JSON.parse(await readFile(await download.path(),"utf8"));
 assertKnownEditorExport(saved);
 function assertKnownEditorExport(d){
  expect(d.cards["hero:warrior"].title.rotation).toBe(-13.5);
  expect(d.cards["hero:warrior"].title.zIndex).toBe(61);
  expect(d.cards["hero:warrior"].rules.zIndex).toBe(60);
 }
});
