// Canonical Rogue Cards Heroes. All abilities, risks and dice ranges print on-card.
const data=[
 ["warrior","Veteran Warrior","delver",23,5,3,2,"sword","BLOOD RUSH · after your attack hits",
  [["1–2","Overextend: lose 2 HP."],["3–4","Deal +2 damage."],["5–6","Deal +d6 damage; Monster's next 6 becomes 1–2."]],"Warriors know when to stop. Almost."],
 ["knight","Wandering Knight","knight",26,4,5,2,"shield","INTERCEPT · after you or an ally is hit",
  [["1–2","Take 2 damage instead."],["3–4","Reduce that hit by d6 damage."],["5–6","Cancel the hit; Monster's next behaviour is 1–2."]],"A promise weighs more than armour."],
 ["wizard","Hedge Wizard","wizard",17,2,2,6,"staff","WILD SPARK · as your combat action",
  [["1–2","Misfire: lose d6 HP."],["3–4","Deal d6+2 damage to Monster."],["5–6","Deal 2d6 damage; skip its next response."]],"Most definitely harmless."],
 ["witch","Marsh Witch","wizard",19,2,3,5,"smoky","HEX BREW · when you use a Potion or Scroll",
  [["1–2","It curdles: become POISONED."],["3–4","Remove POISONED from a Hero."],["5–6","Use the spell, then choose the Monster's next d6 result."]],"Every answer has ingredients."],
 ["rogue","Cutpurse","rogue",20,4,3,5,"key","DIRTY TRICK · before you attack or negotiate",
  [["1–2","Caught: your next d20 has DIS."],["3–4","Your next d20 has ADV."],["5–6","Roll opposed d20 with ADV; on win draw 1 Item."]],"A lock is a conversation."],
 ["thief","Tunnel Thief","rogue",19,4,3,4,"rope","POCKET CHANGE · when a Room offers a reward",
  [["1–2","Caught: lose 2 HP."],["3–4","Draw 1 Item, then discard 1 Item."],["5–6","Draw 2 Items; keep 1."]],"Some pockets are doors."],
 ["priest","Ash Priest","wizard",21,3,3,5,"antidote","BLESS OR CURSE · before any Hero d20 roll",
  [["1–2","Omen: lose d6 HP."],["3–4","Add +2 to that Hero's roll."],["5–6","That Hero rolls with ADV; remove POISONED."]],"The gods decline to comment."],
 ["monk","Roadless Monk","delver",22,4,4,4,"needle","STILLNESS · after a Monster rolls behaviour",
  [["1–2","Lose 2 HP."],["3–4","Change behaviour 6 to 3–4."],["5–6","Change that result to 1–2; heal 2 HP."]],"The empty hand has room for more."]
];
export const HEROES=Object.freeze(data.map(([id,title,art,hp,atk,def,wit,starter,trigger,outcomes,flavor],i)=>({
 id,type:"hero",title,art,hp,atk,def,wit,flavor,copies:1,rule:trigger,
 v2:{kind:"HERO",number:i+1,starter,trigger:"ONCE PER ROOM: "+trigger+" — roll d6.",
 roll:{die:"d6",outcomes:outcomes.map(([range,effect])=>({range,effect}))}}
})));
