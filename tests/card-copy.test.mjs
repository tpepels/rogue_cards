import test from "node:test";
import assert from "node:assert/strict";
import {CATALOGUE,OBJECTS} from "../src/tabletop-data.js";
import {cardMarkup,ruleMarkup} from "../src/tabletop-view.js";

const printedLines=card=>{
 const v=card.v2;
 if(card.type==="hero")return [v.trigger,...v.roll.outcomes.map(o=>o.effect)];
 if(card.type==="monster")return [...card.behavior,v.weakness,v.parley,v.remains];
 if(card.type==="room")return [v.prompt,...v.choices.map(o=>o.label+": "+o.effect),
  ...(v.roll?.outcomes||[]).map(o=>o.range+": "+o.effect)];
 return [v.trigger,...(v.roll?.outcomes||[]).map(o=>o.range+": "+o.effect),v.alternative]
  .filter(Boolean);
};
const words=s=>(s.match(/[\p{L}\p{N}]+/gu)||[]).length;

test("all 139 canonical cards keep their printed instructions concise",()=>{
 assert.equal(CATALOGUE.length,139);
 const issues=[];
 for(const card of CATALOGUE){
  const lines=printedLines(card),text=lines.join(" ");
  if(words(text)>70)issues.push(card.id+": "+words(text)+" words");
  if(lines.some(x=>x.length>135))issues.push(card.id+": overlong printed instruction");
  assert.ok(card.v2.kind);
  assert.ok(lines.every(line=>line.trim().length>0),card.id+" has an empty printed instruction");
 }
 assert.deepEqual(issues,[],
  "Card-copy budget exceeded; shorten wording without removing rules");
});

test("potion identification appears exactly once, not twice",()=>{
 const potions=OBJECTS.filter(o=>o.type==="potion");
 assert.equal(potions.length,8);
 for(const potion of potions){
  const markup=cardMarkup(potion);
  assert.equal((markup.match(/used Potion face up/g)||[]).length,1,potion.id);
  assert.doesNotMatch(markup,/IDENTIFY: keep one spent copy face up/,potion.id);
 }
});

test("brief tools do not repeat their ordinary Room interactions",()=>{
 for(const id of ["key","rope"]){
  const card=OBJECTS.find(o=>o.id===id);
  assert.ok(card,id);
  assert.equal(card.v2.alternative,"",id+" duplicates its main rule");
  assert.equal((cardMarkup(card).match(/tt-slip tt-slip--lead/g)||[]).length,1);
  assert.doesNotMatch(cardMarkup(card),/tt-slip tt-slip--results/);
 }
});

test("dice, statistics and conditions are bold but retain exact safe printed words",()=>{
 const example="Roll d6+2 vs d20+WIT. Gain ADV or lose 2 HP; become POISONED.";
 const html=ruleMarkup(example);
 for(const token of ["d6","d20","WIT","ADV","HP","POISONED"])
  assert.ok(html.includes(">"+token+"</strong>"),"Missing typographic emphasis: "+token);
 assert.equal(html.replace(/<[^>]*>/g,""),example);
 assert.equal(ruleMarkup("<b>1d6 & WIT</b>").replace(/<[^>]*>/g,""),
  "&lt;b&gt;1d6 &amp; WIT&lt;/b&gt;");
 assert.doesNotMatch(ruleMarkup("<img src=x onerror=alert(1)>"),/<img/);
});
