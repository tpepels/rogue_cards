// Rogue Cards — canonical Room data.
// 64 unique regional Rooms; every rolled outcome is printed on its card.
// No new universal actions, conditions, timers or external lookup tables.
import {ROOM_REVISIONS,EXTRA_ROOMS} from "./room-memory.js";
import {FATE_ROOMS} from "./room-fates.js";
const make=(stage,rows)=>rows.map(([id,title,art,kind,prompt,choices,rollLabel,outcomes,links,flavor])=>({
 id,title,art,stage,type:"room",copies:1,
 rule:prompt,flavor:flavor||"",v2:{
  kind,prompt,
  choices:choices.map(([label,effect])=>({label,effect})),
  roll:{label:rollLabel,die:"d6",outcomes:outcomes.map(([range,effect])=>({range,effect}))},
  links:links||[]
 }
}));
export const V2_ROOM_KINDS=Object.freeze(["HAZARD","SHRINE","MYSTERY","ENCOUNTER","LAIR","TREASURE","CORRIDOR"]);
const upper=make("UPPER",[
 ["u-passage","Dripping Passage","corridor","MYSTERY","Water carries a whisper through a grate.",
  [["LISTEN","Roll d6."],["BREAK IT","Lose 2 HP; draw 1 Item."]],"LISTEN",
  [["1–2","A rat answers. Draw an UPPER Monster."],["3–4","Peek at the next Room."],["5","Draw 1 Item."],["6","Draw 1 Item; peek at the next Room."]],[],"The pipes know everyone."],
 ["u-gate","Rusty Gate","door","HAZARD","Something knocks from the other side.",
  [["UNLOCK","Roll d6. Discard Rusty Key to choose 5–6 instead."],["FORCE","Opposed d20+ATK vs d20+3: win, draw 1 Item; lose, lose 2 HP."]],"UNLOCK",
  [["1–2","TRAP: Lose d6 HP."],["3–4","Draw 1 Item."],["5–6","Draw 2 Items."]],["Rusty Key"],"A lock with opinions."],
 ["u-supply","Forgotten Supplies","shop","TREASURE","A storehouse still has its proprietor.",
  [["SEARCH","Roll d6."],["BARTER","Discard 1 Item to draw 2 Items, or discard a MAGIC Item to recharge a Wand."]],"SEARCH",
  [["1–2","A thief! Draw an UPPER Monster."],["3–4","Draw 1 Item."],["5–6","Draw 2 Items, then discard 1 Item."]],["Loyal Hound"],"The dust has a price."],
 ["u-nest","Rat Nest","rat","LAIR","Draw an UPPER Monster. With kept Rat King's Favor, discard it to send the Monster away and draw 1 Item.",
  [["SOOTHE","Roll d6 before combat. With Loyal Hound, choose 5–6."],["FIGHT","If you win, draw 1 Item."]],"SOOTHE",
  [["1–2","It attacks! Fight the Monster."],["3–4","It leaves. Discard the Monster."],["5–6","Discard the Monster; draw 1 Item."]],["Loyal Hound"],"They consider you enormous."],
 ["u-shrine","Abandoned Shrine","altar","SHRINE","An empty bowl waits for an offering.",
  [["PRAY","Roll d6."],["OFFER","Discard 1 Item; heal d6 HP. If the discarded Item was CURSED, recharge a Wand too."]],"PRAY",
  [["1–2","The god bites. Lose d6 HP."],["3–4","It forgives. Heal d6 HP."],["5–6","Cleanse 1 CURSED Item; heal 2 HP."]],["cursed Items","Antidote"],"Even silence expects a gift."],
 ["u-fall","Collapsing Stairs","stairs","HAZARD","A tempting shaft descends into the dark.",
  [["JUMP","Roll d6. With Knotted Rope, choose 5–6."],["CRAWL","Lose 1 HP; peek at the next Room."]],"JUMP",
  [["1–2","TRAP: Fall to MIDDLE; lose d6 HP and face a MIDDLE Monster."],["3–4","TRAP: Fall to MIDDLE; lose 2 HP."],["5–6","Draw 2 Items, then descend to MIDDLE."]],["Knotted Rope"],"Stairs should be trustworthy."],
 ["u-fountain","Laughing Fountain","water","MYSTERY","Its reflection smiles a little late.",
  [["DRINK","Roll d6. REROLL for 1, then 2, then 3 HP; the new result stands. Rerolled 1: draw an UPPER Monster."],["FILL","Discard 1 Item; heal 2 HP, or d6 HP if the discarded Item has ALCHEMY."]],"DRINK",
  [["1–2","The water laughs. You lose 2 HP."],["3–4","Heal d6 HP."],["5–6","Heal d6 HP and draw 1 Item."]],["Bandages"],"Do not smile back."],
 ["u-merchant","Merchant in a Sack","shop","ENCOUNTER","A sack demands to see your inventory.",
  [["TRADE","Roll d6."],["PAY","Discard 2 Items; draw 3 Items."]],"TRADE",
  [["1–2","Pickpocket! Discard 1 Item, if you have one."],["3–4","Exchange: discard 1 Item, draw 2."],["5","Draw 1 Item."],["6","Draw 2 Items."]],["Tunnel Raven","Loyal Hound"],"Nobody asks about the sack."],
 ["u-lamp","Lamp-Eater","wind","LAIR","The darkness politely asks for fire.",
  [["ANSWER","Roll d6. With Pitch Torch or equipped FIRE gear, choose 5–6."],["HIDE","Lose 1 HP; avoid the creature."]],"ANSWER",
  [["1–2","It is hungry. Draw an UPPER Monster."],["3–4","It goes away. Heal 2 HP."],["5–6","It reveals a niche. Draw 1 Item."]],["Pitch Torch"],"It has very small teeth."],
 ["u-puppet","The Puppet Judge","bones","ENCOUNTER","A wooden judge points at your pack.",
  [["PLEAD","Roll d6."],["BRIBE","CURSED gear: lose d6 HP to choose 6. Else discard an Item to peek next Room. Keep this Room; choose 6 at Talking Door."]],"PLEAD",
  [["1–2","Guilty! Lose d6 HP."],["3–4","Acquitted. Heal 2 HP."],["5","Draw 1 Item."],["6","Draw 2 Items."]],["Tunnel Raven"],"Court is always in session."],
 ["u-bookcase","Bookcase of Teeth","wizard","MYSTERY","A book chews through its own cover.",
  [["READ","Roll d6."],["BURN","With equipped FIRE gear, draw 1 Item; or discard a Scroll to peek at the next 2 Rooms."]],"READ",
  [["1–2","It bites. Lose d6 HP."],["3–4","Peek at the next Room."],["5","Draw 1 Item."],["6","Draw 1 Item and heal 2 HP."]],["Pitch Torch","Tunnel Raven"],"The ending is missing."],
 ["u-mimic","Chest with a Pulse","door","TREASURE","The chest is breathing.",
  [["OPEN","Roll d6. Discard Rusty Key to choose 5–6."],["WALK AWAY","Heal 1 HP."]],"OPEN",
  [["1–2","TRAP: Draw an UPPER Monster."],["3–4","Draw 1 Item."],["5–6","Draw 2 Items."]],["Rusty Key"],"It has learned to wink."]
]);
const middle=make("MIDDLE",[
 ["m-flood","Flooded Chamber","water","HAZARD","Something stirs below the waterline.",
  [["WADE","Roll d6. With Knotted Rope, choose 6."],["SWIM","Lose 2 HP; peek at the next Room."]],"WADE",
  [["1–2","Draw a MIDDLE Monster; your first attack has DIS."],["3–4","Cross safely. Draw 1 Item."],["5","Draw 1 Item and heal 2 HP."],["6","Draw 2 Items."]],["Knotted Rope"],"The surface never stills."],
 ["m-statue","Stone Watcher","altar","SHRINE","A statue stretches out one empty hand.",
  [["OFFER","Discard 1 Item and roll d6. If the discarded Item had MAGIC, choose 5–6."],["BOW","Heal 2 HP."]],"OFFER",
  [["1–2","The stone refuses. Lose 2 HP."],["3–4","Heal d6 HP."],["5–6","Draw 2 Items, then discard 1 Item."]],["cursed Items"],"It has moved since yesterday."],
 ["m-vault","Buried Lockbox","door","TREASURE","A keyhole watches you approach.",
  [["PICK","Roll d6. Discard Rusty Key to choose 5–6."],["SMASH","Lose d6 HP; draw 1 Item."]],"PICK",
  [["1–2","TRAP: Become POISONED."],["3–4","Draw 1 Item."],["5–6","Draw 2 Items."]],["Rusty Key","Antidote"],"The lock remembers you."],
 ["m-crypt","Opened Crypt","crypt","LAIR","Draw a MIDDLE Monster. It remembers its name.",
  [["WHISPER","Roll d6 before combat. With Pitch Torch or a carried FIRE Item, choose 5–6."],["FIGHT","If you win, draw 2 Items."]],"WHISPER",
  [["1–2","It charges. Fight the Monster."],["3–4","Discard the Monster."],["5–6","Discard Monster; draw 1 Item."]],["Pitch Torch"],"Someone left recently."],
 ["m-fungus","Fungal Garden","mushroom","HAZARD","Mushrooms mimic familiar faces.",
  [["PICK","Roll d6."],["BURN","With Pitch Torch, heal d6 HP; or discard 1 FIRE Item to heal d6 HP. Otherwise leave."]],"PICK",
  [["1–2","POISONED; draw a MIDDLE Monster."],["3–4","Heal d6 HP."],["5–6","Draw 1 Item; remove POISONED."]],["Pitch Torch","Antidote"],"They grow toward conversation."],
 ["m-altar","Candle Altar","altar","SHRINE","The candles are lit without flames.",
  [["PRAY","Roll d6."],["CLEANSE","Discard 1 other Item to cleanse an equipped CURSED Item."]],"PRAY",
  [["1–2","Become POISONED."],["3–4","Heal d6 HP."],["5–6","Remove POISONED; draw 1 Item."]],["cursed Items","Antidote"],"Wax drips upward."],
 ["m-bridge","Bridge of Whispering Rope","stairs","HAZARD","A bridge offers helpful advice.",
  [["CROSS","Roll d6. With Knotted Rope, choose 5–6."],["ARGUE","Opposed d20+WIT vs d20+4: win, heal 2 HP; lose, lose d6 HP."]],"CROSS",
  [["1–2","TRAP: Lose d6 HP; discard 1 Item."],["3–4","Cross. No further effect."],["5–6","Find a bundle. Draw 2 Items."]],["Knotted Rope"],"The bridge can count."],
 ["m-well","The Bottomless Well","water","MYSTERY","A coin takes a long time to land.",
  [["DROP","Discard 1 Item; roll d6. Discard another to reroll once. If first was CURSED, choose 6."],["LISTEN","Peek at the next Room."]],"DROP",
  [["1–2","Something climbs out. Draw a MIDDLE Monster."],["3–4","Heal d6 HP."],["5","Draw 2 Items."],["6","Draw 3 Items."]],["Tunnel Raven"],"The echo is older than you."],
 ["m-auction","Ghostly Auction","ghost","ENCOUNTER","Bids are taken in memories and teeth.",
  [["BID","Discard 1 Item; roll d6. If the discarded Item is MAGIC, choose 5–6."],["HECKLE","Draw a MIDDLE Monster. If you win, draw 3 Items."]],"BID",
  [["1–2","Become POISONED."],["3–4","Draw 2 Items."],["5–6","Draw 3 Items."]],["Antidote"],"Going once. Going forever."],
 ["m-clock","Clockwork Confessional","warden","MYSTERY","A brass mouth asks for a confession.",
  [["CONFESS","Roll d6."],["BREAK","Opposed d20+ATK vs d20+5: win, draw 1 Item and recharge a Wand; lose, lose d6 HP."]],"CONFESS",
  [["1–2","Lose d6 HP."],["3–4","Heal d6 HP."],["5","Draw 1 Item."],["6","Keep this Room: +2 to your next WIT roll; then discard it."]],["Tunnel Raven"],"The gears are listening."],
 ["m-beetle","Beetle Caravan","rust","ENCOUNTER","Armoured beetles drag an empty cart.",
  [["BARGAIN","Roll d6; Hound or discarded METAL chooses 6. Keep this Room: +1 Item at Midnight Bazaar."],["STEAL","Draw a MIDDLE Monster. Win: draw 2 Items. Keep this Room: Bazaar costs +1 Item."]],"BARGAIN",
  [["1–2","They charge. Lose 2 HP."],["3–4","Discard 1 Item; draw 2 Items."],["5","They give you 1 Item."],["6","They give you 2 Items."]],["Loyal Hound"],"Their driver is a moth."],
 ["m-treasure","Treasure That Sings","amulet","TREASURE","Coins hum whenever you look away.",
  [["POCKET","Roll d6. You may lose 2 HP to roll twice and choose either result."],["QUIET THEM","Discard 1 Item; heal d6 HP. Keep this Room; discard at Choir of Mushrooms to choose 5–6."]],"POCKET",
  [["1–2","The song summons a MIDDLE Monster."],["3–4","Draw 1 Item."],["5–6","Draw 3 Items, then discard 1 Item."]],["Pitch Torch"],"The melody follows you."]
]);
const deep=make("DEEP",[
 ["d-shadow","Lightless Hall","crypt","HAZARD","The light makes no shadow here.",
  [["PROCEED","Roll d6. With equipped FIRE gear, choose 5–6; with equipped ICE gear, choose 3–4."],["WAIT","Lose 2 HP; peek at the next Room."]],"PROCEED",
  [["1–2","TRAP: Draw a DEEP Monster; first attack has ADV."],["3–4","Draw 1 Item."],["5–6","Draw 2 Items."]],["Pitch Torch"],"The dark is watching."],
 ["d-bridge","Broken Bridge","stairs","HAZARD","The far side looks almost reachable.",
  [["LEAP","Roll d6. With Knotted Rope, choose 5–6."],["CRAWL","Lose d6 HP; draw 1 Item."]],"LEAP",
  [["1–2","TRAP: Fall into the Vault; lose 2d6 HP."],["3–4","TRAP: Lose d6 HP."],["5–6","Draw 1 Item."]],["Knotted Rope"],"Do not look down."],
 ["d-reliquary","Lost Reliquary","amulet","TREASURE","A shining reliquary needs one more sacrifice.",
  [["TAKE","Roll d6."],["GIVE","Discard 2 Items; draw 3. If either Item was MAGIC, heal 2 HP."]],"TAKE",
  [["1–2","Lose d6 HP; draw 1 Item."],["3–4","Draw 2 Items."],["5–6","Draw 3 Items; keep this Room to ignore the next TRAP result, then discard it."]],["Rusty Key"],"It feels strangely warm."],
 ["d-bones","Hall of Teeth","bones","LAIR","Piles of teeth are arranged by size.",
  [["SEARCH","Roll d6."],["RATTLE","Draw a DEEP Monster. After victory, draw 4 Items."]],"SEARCH",
  [["1–2","Draw a DEEP Monster."],["3–4","Draw 1 Item."],["5–6","Draw 2 Items, then heal 2 HP."]],["Loyal Hound"],"Many mouths, no answers."],
 ["d-oracle","Broken Oracle","eye","MYSTERY","A cracked eye sees two possible futures.",
  [["ASK","Roll d6. With Tunnel Raven, choose 6."],["SILENCE","Heal 2 HP; do not look ahead."]],"ASK",
  [["1–2","Lose d6 HP."],["3–4","Peek at the next 2 Rooms; swap if both exist."],["5","Peek at the next Room; draw 1 Item."],["6","Peek at the next 2 Rooms; swap if both exist. Draw 2 Items."]],["Tunnel Raven"],"It can only tell the truth."],
 ["d-gate","Warden's Threshold","door","LAIR","Draw a DEEP Monster. It knows the password.",
  [["NEGOTIATE","Roll d6 before combat."],["FIGHT","After victory, heal d6 HP and draw 2 Items."]],"NEGOTIATE",
  [["1–2","Fight the Monster."],["3–4","It leaves. Discard the Monster."],["5–6","Discard the Monster; draw 1 Item (2 with equipped CURSED gear)."]],["Loyal Hound"],"The gate takes notes."],
 ["d-mirror","Mirror of Regrets","eye","SHRINE","It reflects something you have not done.",
  [["LOOK","Roll d6. Discard a MAGIC Item to choose 5–6."],["SHATTER","Lose 2 HP; draw 1 Item."]],"LOOK",
  [["1–2","Become POISONED."],["3–4","Remove POISONED; heal d6 HP."],["5–6","Keep this Room. Discard it to give your next attack ADV."]],["Antidote"],"It is never quite your face."],
 ["d-mouth","The Talking Door","door","ENCOUNTER","The door asks you to tell it a secret.",
  [["LIE","Roll d6. Rusty Key or a kept Puppet Judge lets you choose 6 (discard the Judge)."],["CONFESS","Opposed d20+WIT vs d20+6: win, draw 2 Items; lose, lose d6 HP."]],"LIE",
  [["1–2","It screams. Draw a DEEP Monster."],["3–4","Heal d6 HP."],["5","Draw 1 Item and heal 1 HP."],["6","Draw 2 Items."]],["Rusty Key"],"It knows your childhood nickname."],
 ["d-choir","Choir of Mushrooms","mushroom","MYSTERY","A fungal choir sings one wrong note.",
  [["SING","Roll d6."],["SILENCE","With Pitch Torch, draw 2 Items; discard FIRE to draw 2; or discard kept Treasure That Sings to choose 5–6."]],"SING",
  [["1–2","Become POISONED and lose 2 HP."],["3–4","Heal d6 HP."],["5–6","Draw 2 Items; remove POISONED."]],["Pitch Torch","Antidote"],"You recognise the tune."],
 ["d-bazaar","Midnight Bazaar","shop","ENCOUNTER","A shopkeeper sells tomorrow's luck.",
  [["GAMBLE","Discard 1 Item, or lose 2 HP if empty-handed; roll d6."],["TRADE","Discard 2 Items; draw 2 Items and recharge a Wand."]],"GAMBLE",
  [["1–2","Draw a DEEP Monster."],["3–4","Draw 2 Items."],["5","Draw 3 Items; discard 1."],["6","Draw 3 Items; keep this Room to reroll one d20, then discard."]],["Tunnel Raven"],"Every price is final."],
 ["d-crown","Crown of the Unking","bones","SHRINE","A crown waits on a kneeling skeleton.",
  [["WEAR","Roll d6."],["OFFER","Cleanse and discard 1 CURSED Item; draw 2 Items and recharge a Wand."]],"WEAR",
  [["1–2","Lose d6 HP; become POISONED."],["3–4","Remove POISONED."],["5","Heal d6 HP; remove POISONED."],["6","Keep this Room: +2 DEF through the next Room. At the Vault, with the Sleeping Crown, you may UNTHRONE."]],["cursed Items"],"It does not fit anyone."],
 ["d-last-chest","The Last Chest","door","TREASURE","A box contains exactly what you fear.",
  [["OPEN","Roll d6. REROLL for 1, then 2, then 3 HP; the new result stands. Rerolled 1: draw a DEEP Monster. Rusty Key: choose 5–6."],["SEAL","Discard 1 Item; heal d6 HP."]],"OPEN",
  [["1–2","TRAP: Draw a DEEP Monster."],["3–4","Draw 2 Items."],["5–6","Draw 3 Items; each Hero heals 2 HP."]],["Rusty Key"],"It was built for you."]
]);
const revisions=new Map(ROOM_REVISIONS.map(x=>[x.id,x]));
export const V2_ROOMS=Object.freeze([...upper,...middle,...deep].map(c=>revisions.get(c.id)||c).concat(EXTRA_ROOMS,FATE_ROOMS).map((c,i)=>({
 ...c,v2:{...c.v2,number:i+1}
})));
export const V2_REGIONS=Object.freeze(["UPPER","MIDDLE","DEEP"]);
export const V2_ROOMS_BY_REGION=Object.freeze(Object.fromEntries(V2_REGIONS.map(region=>[
 region,Object.freeze(V2_ROOMS.filter(room=>room.stage===region))
])));
