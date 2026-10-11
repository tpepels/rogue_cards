import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {CATALOGUE,PRINT_DECK,HEROES,ROOMS,MONSTERS,VAULT,WARDEN,POTIONS,ITEMS,CARD_WIDTH_MM,CARD_HEIGHT_MM,printDeck} from "../src/tabletop-data.js";
import {cardMarkup,printSheets,CARDS_PER_SHEET,esc} from "../src/tabletop-view.js";
import {illustration} from "../src/art.js";
test("entire printable game is physical-first and uses no browser engine",()=>{
 const index=readFileSync("index.html","utf8");
 assert.match(index,/tabletop-app\.js/);
 assert.doesNotMatch(index,/src\/app\.js/);
 assert.equal(HEROES.length,4);
 assert.equal(CARD_WIDTH_MM,90);
 assert.equal(CARD_HEIGHT_MM,130);
 assert.equal(CARDS_PER_SHEET,4);
});
test("sequential dungeon has three regional room piles and exactly one fixed Vault",()=>{
 assert.deepEqual([...new Set(ROOMS.map(r=>r.stage))],["UPPER","MIDDLE","DEEP"]);
 for(const stage of ["UPPER","MIDDLE","DEEP"])assert.ok(ROOMS.filter(x=>x.stage===stage).length>=5);
 assert.equal(VAULT.stage,"FINAL");
 assert.equal(VAULT.copies,1);
 assert.equal(WARDEN.stage,"FINAL");
 assert.equal(WARDEN.copies,1);
 const rules=readFileSync("rules.html","utf8");
 assert.match(rules,/three of each/);
 assert.match(rules,/tenth Room/);
 assert.match(rules,/No return journey/);
});
test("the d20 opposed system, d6 damage and monster behaviour are on the single core sheet",()=>{
 const rules=readFileSync("rules.html","utf8");
 assert.match(rules,/OPPOSED d20 COMBAT/);
 assert.match(rules,/d20 \+ ATK/);
 assert.match(rules,/d20 \+ DEF/);
 assert.match(rules,/d6 damage/);
 assert.match(rules,/d6 MONSTER BEHAVIOUR/);
 assert.match(rules,/ONE ACTION PER HERO/);
 assert.match(rules,/POISONED/);
 assert.match(rules,/Both Heroes and Monsters/);
 assert.equal((rules.match(/<main class="sheet">/g)||[]).length,1);
});
test("every monster includes four exact d6 behaviours and an edible or excluded corpse effect",()=>{
 for(const monster of [...MONSTERS,WARDEN]){
  assert.equal(monster.behavior.length,4,monster.id);
  assert.ok(monster.behavior.every(s=>s&&typeof s==="string"&&s.length<90),monster.id);
  assert.ok(monster.corpse?.length,monster.id);
  assert.ok(monster.hp>0&&monster.atk>=0&&monster.def>=0);
  const html=cardMarkup(monster);
  for(const roll of ["1–2","3–4","5","6"])assert.ok(html.includes(roll),monster.id);
  assert.match(html,/CORPSE/);
 }
});
test("all core abilities, items and mysteries are actual cards rather than off-card references",()=>{
 for(const hero of HEROES)assert.ok(hero.rule&&hero.wit>=0&&hero.hp>0);
 for(const card of [...ROOMS,VAULT,...ITEMS,...POTIONS])assert.ok(card.rule&&card.rule.length<300,card.id);
 assert.equal(POTIONS.length,3);
 for(const potion of POTIONS){assert.match(potion.rule,/FIRST USE/);assert.match(potion.rule,/d6/);}
 assert.ok(ITEMS.some(c=>c.rule.includes("COMPANION")));
 assert.ok(ITEMS.some(c=>c.rule.includes("CURSED")));
 assert.ok(ROOMS.some(c=>c.rule.includes("PRAY")));
 assert.ok(MONSTERS.some(c=>c.corpse.includes("EAT d6")));
 assert.ok(!readFileSync("rules.html","utf8").toLowerCase().includes("hunger"));
});
test("all printed copies are represented exactly once with distinct card numbering",()=>{
 const total=CATALOGUE.reduce((n,c)=>n+c.copies,0);
 assert.equal(printDeck("all").length,total);
 assert.equal(PRINT_DECK.length,total);
 for(const type of ["hero","room","monster","item","potion"])
  assert.equal(printDeck(type).length,CATALOGUE.filter(c=>c.type===type).reduce((n,c)=>n+c.copies,0));
 assert.equal((printSheets().match(/class="tt-sheet"/g)||[]).length,Math.ceil(total/4));
 for(const card of CATALOGUE){
  const html=cardMarkup(card);
  assert.match(html,/tt-card/);
  assert.match(html,/tt-footer/);
  assert.ok(html.includes(esc(card.title)),card.id);
  assert.match(illustration(card.art),/^<svg/);
 }
});
test("print hub leads only to the one canonical rules sheet",()=>{
 const hub=readFileSync("print-and-play.html","utf8");
 assert.match(hub,/rules\.html/);
 assert.match(hub,/four per A4/);
 assert.doesNotMatch(hub,/magic-guide\.html|field-guide\.html|living-guide\.html/);
});
