// Canonical Rogue Cards Heroes. All abilities, risks and dice ranges print on-card.
const data=[
 ["warrior","Veteran Warrior","delver",18,4,3,2,"sword","BLOOD RUSH · after your attack hits",
  [["1–2","Overextend: lose 2 HP."],["3–4","Deal +2 damage."],["5–6","Deal +d6 damage; treat the Monster's next behaviour 6 as 1–2."]],"Warriors know when to stop. Almost."],
 ["knight","Wandering Knight","knight",20,4,4,2,"shield","INTERCEPT · after you or an ally is hit",
  [["1–2","Take 2 damage instead."],["3–4","Reduce that hit by d6 damage."],["5","Cancel the hit."],["6","Cancel the hit; Monster's next behaviour is 1–2."]],"A promise weighs more than armour."],
 ["wizard","Hedge Wizard","wizard",18,2,3,6,"staff","WILD SPARK · as your combat action",
  [["1–2","Misfire: roll d6; lose half as much HP (round up)."],["3–4","Deal d6+2 damage to Monster."],["5–6","Deal 2d6 damage; skip its next response."]],"Most definitely harmless."],
 ["witch","Marsh Witch","wizard",20,3,4,5,"smoky","HEX BREW · after using a Potion or Scroll",
  [["1–2","It curdles: become POISONED."],["3–4","Remove POISONED from a Hero."],["5–6","Choose the Monster's next d6 behaviour, if present."]],"Every answer has ingredients."],
 ["rogue","Cutpurse","rogue",19,4,4,5,"key","DIRTY TRICK · before you attack or negotiate",
  [["1–2","Caught: this d20 has DIS."],["3–4","This d20 has ADV."],["5–6","Opposed d20+WIT vs Monster d20+DEF with ADV; win: draw 1 Item."]],"A lock is a conversation."],
 ["thief","Tunnel Thief","rogue",19,4,4,4,"rope","POCKET CHANGE · when a Room offers a reward",
  [["1–2","Caught: lose 2 HP."],["3–4","Draw 1 Item, then discard 1 Item."],["5–6","Draw 2 Items, then discard 1 Item."]],"Some pockets are doors."],
 ["priest","Ash Priest","wizard",20,4,4,5,"antidote","BLESS OR CURSE · before any Hero d20 roll",
  [["1–2","Omen: roll d6; lose half as much HP (round up)."],["3–4","Add +2 to that Hero's roll."],["5–6","That Hero rolls with ADV; remove POISONED."]],"The gods decline to comment."],
 ["monk","Roadless Monk","delver",19,4,4,4,"needle","STILLNESS · after a Monster rolls behaviour",
  [["1–2","Lose 2 HP."],["3–4","Change behaviour 5 or 6 to 3–4."],["5","Change result to 1–2; heal 2 HP."],["6","Cancel this Monster response; heal 2 HP."]],"The empty hand has room for more."]
];
// A Hero can accept a modest certain benefit or gamble on the printed d6.
// The trigger is once per Room; the choice is made when it fires.
const reliable=Object.freeze({
 warrior:"PRESS: Lose 1 HP for +2 damage",
 knight:"GUARD: Lose 1 HP to prevent 3 damage from this hit",
 wizard:"CONTROL: Deal 2 damage to the Monster without rolling",
 witch:"DISTIL: Remove your POISONED; otherwise heal 1 HP",
 rogue:"BRIBE: Discard 1 Item for ADV on the coming d20",
 thief:"SWAP: Draw 1 Item, then discard 1 Item",
 priest:"BLESS: Lose 1 HP to add +2 to the Hero d20",
 monk:"ENDURE: Lose 2 HP to change behaviour 5–6 to 3–4"
});
export const HEROES=Object.freeze(data.map(([id,title,art,hp,atk,def,wit,starter,trigger,outcomes,flavor],i)=>({
 id,type:"hero",title,art,hp,atk,def,wit,flavor,copies:1,rule:trigger,
 v2:{kind:"HERO",number:i+1,starter,trigger:"ONCE PER ROOM: "+trigger+". CHOOSE "+reliable[id]+"; or RISK: roll d6.",
 roll:{die:"d6",outcomes:outcomes.map(([range,effect])=>({range,effect}))}}
})));
