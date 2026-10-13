// Single canonical Amulet Vault and two printable phases of the same Warden.
// Swap Warden cards at 10 remaining HP; keep the same HP counter.
export const VAULT={
 id:"vault",type:"room",stage:"FINAL",title:"The Amulet Vault",art:"amulet",copies:1,
 flavor:"The prize was never unattended.",rule:"Face the Warden.",
 v2:{kind:"FINAL",number:37,prompt:"On entry, roll OMEN d6. Choose FIGHT or SEAL. Kept Rooms can unlock SMUGGLE, BARGAIN or UNTHRONE after Phase I.",
 choices:[
  {label:"FIGHT",effect:"Face the Warden, Phase I. At 10 HP switch to Phase II."},
  {label:"SEAL",effect:"Discard 3 MAGIC Items (6 with two Heroes). Opposed d20+WIT vs d20+6. Win: Amulet. Lose: fight Warden; its first attack has ADV."}
 ],
 roll:{die:"d6",label:"OMEN",outcomes:[
  {range:"1–2",effect:"Warden's first attack has ADV."},
  {range:"3–4",effect:"No extra effect."},
  {range:"5–6",effect:"First Hero attack has ADV."}
 ]}}
};
const beast=(id,title,flavor,behavior,phase,extra)=>({
 id,type:"monster",title,art:"warden",stage:"FINAL",hp:phase===1?20:10,atk:6,def:5,copies:1,flavor,
 behavior,v2:{kind:"WARDEN",number:phase===1?13:14,phase,
 tags:["MAGIC","CURSED"],weakness:extra,parley:"Ignores ELBERETH. No PARLEY; kept Rooms may unlock alternatives after Phase I.",
 remains:"No corpse to eat. Defeat Phase II to win the Amulet."}
});
export const WARDEN=beast("warden","Amulet Warden","It hears your heartbeat.",[
 "Watch: no attack.","Blade: ATTACK each Hero.","Command: next Hero d20 has DIS.","Judgment: ATTACK with ADV."
],1,"At 10 HP or less, replace this card with Phase II. Keep HP and afflictions.");
export const WARDEN_FURY=beast("warden-fury","Warden Unbound","The vault cracks open.",[
 "Sunder: ATTACK each Hero.","Bleed: ATTACK; on hit discard an Item.","Ruin: all Heroes lose 1 HP.","Judgment: ATTACK with ADV; +2 damage on hit."
],2,"After FIRE or LIGHTNING damages it, the Warden skips its next response. At 0 HP, win.");
export const WARDEN_CARDS=Object.freeze([WARDEN,WARDEN_FURY]);
