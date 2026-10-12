// Single canonical Amulet Vault and two printable phases of the same Warden.
// Swap Warden cards at 12 remaining HP; keep the same HP counter.
export const VAULT={
 id:"vault",type:"room",stage:"FINAL",title:"The Amulet Vault",art:"amulet",copies:1,
 flavor:"The prize was never unattended.",rule:"Face the Warden.",
 v2:{kind:"FINAL",number:37,prompt:"Roll OMEN d6 upon entry; then choose FIGHT or SEAL.",
 choices:[
  {label:"FIGHT",effect:"Face the Warden, Phase I. At 12 HP switch to Phase II."},
  {label:"SEAL",effect:"Discard 3 MAGIC Items; opposed d20+WIT vs d20+6. Win: claim Amulet. Fail: fight Warden; it starts with ADV."}
 ],
 roll:{die:"d6",label:"OMEN",outcomes:[
  {range:"1–2",effect:"Warden's first attack has ADV."},
  {range:"3–4",effect:"The Warden watches. No extra effect."},
  {range:"5–6",effect:"First Hero attack has ADV."}
 ]}}
};
const beast=(id,title,flavor,behavior,phase,extra)=>({
 id,type:"monster",title,art:"warden",stage:"FINAL",hp:phase===1?24:12,atk:phase===1?6:7,def:5,copies:1,flavor,
 behavior,v2:{kind:"WARDEN",number:phase===1?13:14,phase,
 tags:["MAGIC","CURSED"],weakness:extra,parley:"No bribery or recruitment. Only the Vault's SEAL choice can bypass this fight.",
 remains:"No edible corpse. Win the Amulet when Phase II falls."}
});
export const WARDEN=beast("warden","Amulet Warden","It hears your heartbeat.",[
 "Watch: no attack.","Blade: ATTACK.","Command: next Hero d20 has DIS.","Judgment: ATTACK with ADV."
],1,"At 12 HP or less, replace this card with Phase II. Keep HP and afflictions.");
export const WARDEN_FURY=beast("warden-fury","Warden Unbound","The vault cracks open.",[
 "Sunder: ATTACK.","Bleed: ATTACK; on hit discard an Item.","Ruin: all Heroes lose 2 HP.","Judgment: ATTACK with ADV; +2 damage on hit."
],2,"FIRE or LIGHTNING: treat its next behaviour 6 as 1–2. At 0 HP the party wins.");
export const WARDEN_CARDS=Object.freeze([WARDEN,WARDEN_FURY]);
