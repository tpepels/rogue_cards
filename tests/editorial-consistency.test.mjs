import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {FIXED_CARDS,SELECTABLE,cardKey} from "../src/decks.js";
import {cardMarkup,ruleMarkup} from "../src/tabletop-view.js";
import {HEROES,MONSTERS,WARDEN} from "../src/tabletop-data.js";

const rulebook=readFileSync(new URL("../rules.html",import.meta.url),"utf8");
const tutorial=readFileSync(new URL("../tutorial.html",import.meta.url),"utf8");
const cards=[...FIXED_CARDS,...SELECTABLE];

function printedEffects(card){
 const v=card.v2;
 if(card.type==="hero")return [v.trigger,...v.roll.outcomes.map(x=>x.effect)];
 if(card.type==="monster")return [...card.behavior,v.weakness,v.parley,v.remains,...(v.defeat?[v.defeat]:[])];
 if(card.type==="room")return [v.prompt,...v.choices.map(x=>x.effect),...(v.roll?.outcomes||[]).map(x=>x.effect)];
 return [v.trigger,v.alternative,...(v.roll?.outcomes||[]).map(x=>x.effect)].filter(Boolean);
}
test("every one of the 193 printable card designs has complete printed effects",()=>{
 assert.equal(cards.length,193);
 assert.equal(new Set(cards.map(cardKey)).size,193);
 const failures=[];
 for(const card of cards){
  if(!card.v2||!card.title||!card.id)failures.push(cardKey(card)+": missing printed definition");
  const effects=printedEffects(card);
  const markup=cardMarkup(card);
  for(const effect of effects){
   if(typeof effect!=="string"||!effect.trim()){
    failures.push(cardKey(card)+": empty effect");continue;
   }
   if(effect.length>320)failures.push(cardKey(card)+": lengthy instruction "+effect.length);
   if(!markup.includes(ruleMarkup(effect)))
    failures.push(cardKey(card)+": missing printed effect "+effect.slice(0,55));
  }
  if(card.type==="room"){
   if(card.v2.choices.length!==2)failures.push(card.id+": room must offer two choices");
   for(const choice of card.v2.choices)
    if(!markup.includes(choice.label))failures.push(card.id+": missing choice "+choice.label);
  }
  if(card.type==="monster"&&(!card.v2.phase)&&!card.v2.defeat)
   failures.push(card.id+": missing named victory reward");
 }
 assert.deepEqual(failures,[]);
});
test("tutorial uses canonical stats and never teaches rolled DEF or obsolete choices",()=>{
 const warrior=HEROES.find(c=>c.id==="warrior");
 const rat=MONSTERS.find(c=>c.id==="rat");
 assert.equal(warrior.hp,18);
 assert.equal(warrior.atk+2,6);
 assert.equal(rat.hp,3);
 assert.equal(rat.atk,1);
 assert.equal(12+rat.def,13);
 assert.equal(WARDEN.hp,15);
 for(const term of ['warrior=byCard("hero","warrior")','rat=byCard("monster","rat")',
  'warden=byCard("monster","warden")','warriorAtk=warrior.atk+swordBonus',
  "The defender does not roll","PRY GRATE","SOOTHE","DISTURB",
  "DEFEAT","PHASE II AT 8 HP","not a separate nine-Room ruleset"])
  assert.ok(tutorial.includes(term),"Missing novice tutorial safeguard: "+term);
 for(const obsolete of ["defends with a separate","ties defend","20 HP, +5 ATK",
  "FIGHT reward","BREAK IT","20 HP → PHASE II AT 10 HP"])
  assert.ok(!tutorial.includes(obsolete),"Old tutorial rule: "+obsolete);
});
test("printed rulebook combat example agrees with live fixed AC and HP",()=>{
 const wisp=MONSTERS.find(m=>m.id==="wisp");
 const warrior=HEROES.find(h=>h.id==="warrior");
 const knight=HEROES.find(h=>h.id==="knight");
 assert.ok(rulebook.includes("Defence is a fixed target"));
 assert.ok(rulebook.includes("The defender does not roll"));
 assert.ok(rulebook.includes("ties fail for the acting Hero"));
 assert.ok(rulebook.includes("There is no return journey"));
 assert.ok(rulebook.includes("12 non-Corridor Rooms per depth"));
 assert.ok(rulebook.includes("Wisp</strong> · "+wisp.hp+" HP · AC "+(12+wisp.def)+" · ATK +"+wisp.atk));
 assert.ok(rulebook.includes("Warrior</strong> · ATK +"+(warrior.atk+2)+" with Sword · AC "+(12+warrior.def)));
 assert.ok(rulebook.includes("Knight</strong> · ATK +"+knight.atk+" · AC "+(12+knight.def+1)+" with Shield"));
 for(const needle of ["5 → 1 HP","1 → 0 HP","14 + 2 = 16","15 + 2 = 17"])
  assert.ok(rulebook.includes(needle),"Inconsistent fight example: "+needle);
 for(const obsolete of ["9 → 5 HP","12 + 4 = 16","15 + 4 = 19"])
  assert.ok(!rulebook.includes(obsolete),"Old combat example: "+obsolete);
});
test("printed odd-item timing and Oracle match implemented interpretation",()=>{
 const odd=SELECTABLE;
 const find=id=>odd.find(c=>c.id===id);
 assert.match(find("odd-red-string").v2.trigger,/face.*d20.*face/);
 assert.match(find("odd-sun-charm").v2.trigger,/already waiting/);
 assert.match(find("odd-moon-lens").v2.trigger,/printed d6 table/);
 assert.match(find("odd-fever-candle").v2.trigger,/lose 1 HP now/);
 assert.match(find("odd-echo-bell").v2.trigger,/one extra use/);
 assert.match(find("d-oracle").v2.choices[0].effect,/return to top/);
 assert.match(find("u-puppet").v2.choices[1].effect,/KEEP this Room/);
});
