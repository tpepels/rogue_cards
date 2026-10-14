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
  roll:id==="d-oracle"?null:{label:rollLabel,die:"d6",outcomes:outcomes.map(([range,effect])=>({range,effect}))},
  links:links||[]
 }
}));
export const V2_ROOM_KINDS=Object.freeze(["HAZARD","SHRINE","MYSTERY","ENCOUNTER","LAIR","TREASURE","CORRIDOR"]);
const upper=make("UPPER",[
 ["u-passage","Dripping Passage","corridor","MYSTERY","Water whispers through a rusted grate.",[["LISTEN","Roll d6."],["PRY GRATE","Lose 2 HP; draw 1 Item. With Rusty Key, lose 1 HP instead."]],"LISTEN",[["1–2","Something growls through the drain. Draw an UPPER Monster."],["3–4","Follow the drip: peek at the next Room."],["5","Find a wet bundle: draw 1 Item."],["6","Draw 1 Item; peek at the next Room."]],["Rusty Key"],"The pipes know everyone."],
 ["u-gate","Rusty Gate","door","HAZARD","Corroded metal rattles behind a locked gate.",[["PICK","Roll d6. Discard Rusty Key to change 1–2 to 3–4."],["FORCE","Opposed d20+ATK vs d20+3. Win: draw 1 Item. Lose: lose 2 HP; your next DEF roll has DIS."]],"PICK",[["1–2","TRAP: Rusty spring cuts you. Lose d6 HP."],["3–4","Gate opens; draw 1 Item."],["5–6","Find the guard's cache; draw 2 Items."]],["Rusty Key"],"The hinges know your weight."],
 ["u-supply","Forgotten Supplies","shop","TREASURE","A dusty storehouse of abandoned equipment.",[["SCAVENGE","Roll d6."],["BARTER","Discard 1 Item to draw 2, or discard a MAGIC Item to recharge a Wand."]],"SCAVENGE",[["1–2","Shelves collapse: discard 1 Item or lose 2 HP."],["3–4","Take the most recently discarded Item. If none, draw 1 Item."],["5–6","Draw 2 Items, then discard 1 Item."]],["Loyal Hound"],"The dust has a price."],
 ["u-nest","Rat Nest","rat","LAIR","Rats hoard stolen trinkets. Turn kept Rat King's Favor sideways to use SOOTHE 5–6.",[["SOOTHE","Roll d6. With Loyal Hound, choose 5–6."],["DISTURB","Opposed d20+ATK vs d20+3: win, draw 1 Item; lose, lose d6 HP."]],"SOOTHE",[["1–2","Rats bite: lose 2 HP; your next WIT roll has DIS."],["3–4","The rats scatter."],["5–6","They surrender a stolen Item. Draw 1 Item."]],["Loyal Hound","Rat King's Favor"],"They consider you enormous."],
 ["u-shrine","Abandoned Shrine","altar","SHRINE","An empty bowl waits for an offering.",
  [["PRAY","Roll d6."],["OFFER","Discard 1 Item; heal d6 HP. If the discarded Item was CURSED, recharge a Wand too."]],"PRAY",
  [["1–2","The god bites. Lose d6 HP."],["3–4","It forgives. Heal d6 HP."],["5–6","Cleanse 1 CURSED Item; heal 2 HP."]],["cursed Items","Antidote"],"Even silence expects a gift."],
 ["u-fall","Collapsing Stairs","stairs","HAZARD","A tempting shaft descends into the dark.",
  [["JUMP","Roll d6. Knotted Rope may adjust this result by ±1 (within 1–6)."],["CRAWL","Lose 1 HP; peek at the next Room."]],"JUMP",
  [["1–2","TRAP: Fall to MIDDLE; lose d6 HP and face a MIDDLE Monster."],["3–4","TRAP: Fall to MIDDLE; lose 2 HP."],["5–6","Draw 2 Items, then descend to MIDDLE."]],["Knotted Rope"],"Stairs should be trustworthy."],
 ["u-fountain","Laughing Fountain","water","MYSTERY","Its reflection smiles a little late.",
  [["DRINK","Roll d6. REROLL for 1, then 2, then 3 HP; the new result stands. Rerolled 1: draw an UPPER Monster."],["FILL","Discard 1 Item; heal 2 HP, or d6 HP if the discarded Item has ALCHEMY."]],"DRINK",
  [["1–2","The water laughs. You lose 2 HP."],["3–4","Heal d6 HP."],["5–6","Heal d6 HP and draw 1 Item."]],["Bandages"],"Do not smile back."],
 ["u-merchant","Merchant in a Sack","shop","ENCOUNTER","A bag trades, swallows and sneezes.",[["TRADE","Roll d6. With Pocket Goblin, roll twice and keep one result."],["BUY IN BULK","Discard 2 Items; draw 3 Items."]],"TRADE",[["1–2","Sack swallows one of your Items: discard 1."],["3–4","Trade: discard 1 Item, draw 2."],["5","Sack coughs up 1 Item."],["6","Draw 2 Items from its lining."]],["Pocket Goblin"],"There is no merchant."],
 ["u-lamp","Lamp-Eater","wind","LAIR","It consumes flames. Carrying FIRE attracts its appetite.",[["LIGHT","Roll d6. With Ring of Embers, choose 5–6."],["SNEAK","Lose 1 HP; peek at the next Room."]],"LIGHT",[["1–2","Discard 1 carried FIRE Item; if none, lose 2 HP. Next WIT roll has DIS."],["3–4","It follows the light away."],["5–6","Its glow reveals a hidden niche. Draw 1 Item."]],["Pitch Torch","Ring of Embers"],"It has very small teeth."],
 ["u-puppet","The Puppet Judge","bones","ENCOUNTER","A wooden judge points at your pack.",[["PLEAD","Roll d6."],["BRIBE","Only if Hollow Knight was not SPARED. Discard 1 Item; keep acquittal. At Talking Door, turn sideways for LIE 6; keep afterward."]],"VERDICT",[["1–2","Guilty: discard 1 Item or lose d6 HP."],["3–4","Acquitted: peek next Room."],["5","Evidence returned: take the most recently discarded Item, or draw 1 if none."],["6","Confiscated goods: draw 2 Items."]],["The Talking Door"],"Court is always in session."],
 ["u-bookcase","Bookcase of Teeth","wizard","MYSTERY","A book chews through its own cover.",[["READ","Roll d6."],["BURN","With equipped FIRE gear, draw 1 Item; or discard a Scroll to peek at the next 2 Rooms."]],"READ",[["1–2","The book bites. Lose d6 HP."],["3–4","Find a hidden passage: peek next Room."],["5","A page conceals an Item. Draw 1 Item."],["6","Draw 1 Item; peek next Room."]],["Pitch Torch","Tunnel Raven"],"The ending is missing."],
 ["u-mimic","Chest with a Pulse","door","TREASURE","A living chest draws slow breaths.",[["OPEN","Roll d6. Discard Rusty Key to change 1–2 to 3–4."],["LISTEN","Peek next Room; leave chest closed."]],"OPEN",[["1–2","TRAP: Lose d6 HP. Tuck 1 carried Item beneath this Room; recover it when you leave."],["3–4","Reach between teeth: draw 1 Item."],["5–6","Retrieve 2 Items from its stomach."]],["Rusty Key"],"The lock is its mouth."],
]);
const middle=make("MIDDLE",[
 ["m-flood","Flooded Chamber","water","HAZARD","Something stirs below the waterline.",[["WADE","Roll d6. Equipped METAL armour gives DIS on your first DEF roll here; Knotted Rope cancels it."],["SWIM","Lose 2 HP; peek at the next Room."]],"WADE",[["1–2","Something pulls you under: draw a MIDDLE Monster; first Hero attack has DIS."],["3–4","Find a submerged pack: draw 1 Item."],["5–6","Find dry shelves: draw 2 Items."]],["Knotted Rope"],"The surface never stills."],
 ["m-statue","Stone Watcher","altar","SHRINE","A stone figure moves when no one looks.",[["OFFER","Discard 1 Item; roll d6. MAGIC offerings use the 5–6 result."],["FOLLOW ITS GAZE","Peek at the next 2 Rooms without changing their order."]],"OFFER",[["1–2","Stone fingers grip you: lose 2 HP; your next WIT roll has DIS."],["3–4","A hidden alcove restores d6 HP."],["5–6","Its palm opens: draw 2 Items, then discard 1."]],["cursed Items"],"It has moved since yesterday."],
 ["m-vault","Buried Lockbox","door","TREASURE","A keyhole watches you approach.",
  [["PICK","Roll d6. Discard Rusty Key to choose 5–6."],["SMASH","Lose d6 HP; draw 1 Item."]],"PICK",
  [["1–2","TRAP: Become POISONED."],["3–4","Draw 1 Item."],["5–6","Draw 2 Items."]],["Rusty Key","Antidote"],"The lock remembers you."],
 ["m-crypt","Opened Crypt","crypt","MYSTERY","The dead whisper from beneath an open tomb.",[["WHISPER","Roll d6."],["PRY TOMB","Opposed d20+ATK vs d20+4: win, draw 2 Items; lose, lose d6 HP."]],"WHISPER",[["1–2","Dead voices bite: lose 2 HP; your next WIT roll has DIS."],["3–4","The grave falls silent."],["5–6","The dead reveal a buried Item. Draw 1 Item."]],["Pitch Torch"],"Someone left recently."],
 ["m-fungus","Fungal Garden","mushroom","HAZARD","Mushrooms mimic familiar faces.",
  [["PICK","Roll d6."],["BURN","With Pitch Torch, heal d6 HP; or discard 1 FIRE Item to heal d6 HP. Otherwise leave."]],"PICK",
  [["1–2","POISONED; draw a MIDDLE Monster."],["3–4","Heal d6 HP."],["5–6","Draw 1 Item; remove POISONED."]],["Pitch Torch","Antidote"],"They grow toward conversation."],
 ["m-altar","Candle Altar","altar","SHRINE","The candles are lit without flames.",[["PRAY","Roll d6."],["CLEANSE","Discard 1 other Item to cleanse an equipped CURSED Item."]],"PRAY",[["1–2","Hot wax scalds: lose 2 HP."],["3–4","Candle warmth: heal d6 HP."],["5–6","Lift a blessed wick: remove POISONED; draw 1 Item."]],["cursed Items","Antidote"],"Wax drips upward."],
 ["m-bridge","Bridge of Whispering Rope","stairs","HAZARD","A bridge offers helpful advice.",
  [["CROSS","Roll d6. Knotted Rope may adjust this result by ±1 (within 1–6)."],["ARGUE","Opposed d20+WIT vs d20+4: win, heal 2 HP; lose, lose d6 HP."]],"CROSS",
  [["1–2","TRAP: Lose d6 HP; discard 1 Item."],["3–4","Cross. No further effect."],["5–6","Find a bundle. Draw 2 Items."]],["Knotted Rope"],"The bridge can count."],
 ["m-well","The Bottomless Well","water","MYSTERY","A coin takes a long time to land.",
  [["DROP","Discard 1 Item; roll d6. Discard another to reroll once. If first was CURSED, choose 6."],["LISTEN","Peek at the next Room."]],"DROP",
  [["1–2","Something climbs out. Draw a MIDDLE Monster."],["3–4","Heal d6 HP."],["5","Draw 2 Items."],["6","Draw 3 Items."]],["Tunnel Raven"],"The echo is older than you."],
 ["m-auction","Ghostly Auction","ghost","ENCOUNTER","Bids are taken in memories and teeth.",[["BID","Discard 1 Item or lose 2 HP; then roll d6."],["DOUBLE BID","Discard 2 Items; roll d6 twice, resolving both results. Do not pay BID's entry cost again."]],"BID",[["1–2","Auctioneers seize 1 more Item or deal 2 HP."],["3–4","Win 2 Items."],["5–6","Win 3 Items."]],["Ghost Coin"],"Going once. Going forever."],
 ["m-clock","Clockwork Confessional","warden","MYSTERY","A brass mouth asks for a confession.",
  [["CONFESS","Roll d6."],["BREAK","Opposed d20+ATK vs d20+5: win, draw 1 Item and recharge a Wand; lose, lose d6 HP."]],"CONFESS",
  [["1–2","Lose d6 HP."],["3–4","Heal d6 HP."],["5","Draw 1 Item."],["6","Keep this Room: +2 to your next WIT roll; then discard it."]],["Tunnel Raven"],"The gears are listening."],
 ["m-beetle","Beetle Caravan","rust","ENCOUNTER","Beetles pull a cart.",
  [["BARGAIN","Roll d6. Discard 1 METAL Item to resolve 6. With Loyal Hound, peek next Room. Keep for +1 Item at Midnight Bazaar."],["STEAL","Draw a MIDDLE Monster. Win: draw 2 Items. Keep this Room: Bazaar costs +1 Item."]],"BARGAIN",
  [["1–2","They charge. Lose 2 HP."],["3–4","Discard 1 Item; draw 2 Items."],["5","They give you 1 Item."],["6","They give you 2 Items."]],["Loyal Hound"],"Their driver is a moth."],
 ["m-treasure","Treasure That Sings","amulet","TREASURE","Coins hum when no one looks.",[["TAKE","Roll d6. After seeing result, lose 2 HP to roll again and choose either."],["MUFFLE","Discard 1 Item; keep this Room. Discard at a Monster to set first behaviour to 1–2, or at Choir of Mushrooms for SING 5–6."]],"TAKE",[["1–2","Song attracts a MIDDLE Monster."],["3–4","Take 1 Item."],["5–6","Take 3 Items, then discard 1."]],["Choir of Mushrooms"],"The melody follows you."],
]);
const deep=make("DEEP",[
 ["d-shadow","Lightless Hall","crypt","HAZARD","The dark swallows even your shadow.",[["PROCEED","Roll d6. FIRE removes the first-attack DIS; ICE chooses 3–4."],["FEEL ALONG WALL","Lose 1 HP; peek next 2 Rooms."]],"PROCEED",[["1–2","TRAP: Stumble into a DEEP Monster; first Hero attack has DIS."],["3–4","Feel a lost pack: draw 1 Item."],["5–6","Find a glinting cache: draw 2 Items."]],["Pitch Torch","Candle Tunnel"],"The dark is watching."],
 ["d-bridge","Broken Bridge","stairs","HAZARD","The far side looks almost reachable.",
  [["LEAP","Roll d6. Knotted Rope may adjust this result by ±1 (within 1–6)."],["CRAWL","Lose d6 HP; draw 1 Item."]],"LEAP",
  [["1–2","TRAP: Fall into the Vault; lose 2d6 HP."],["3–4","TRAP: Lose d6 HP."],["5–6","Draw 1 Item."]],["Knotted Rope"],"Do not look down."],
 ["d-reliquary","Lost Reliquary","amulet","TREASURE","A sacred box still requires an offering.",[["TAKE","Roll d6."],["OFFER","Tuck 1 Item beneath this Room; keep it. At a later TRAP, discard both to cancel damage, not other effects."]],"TAKE",[["1–2","TRAP: Relic burns; lose d6 HP, then draw 1 Item."],["3–4","Draw 2 Items."],["5–6","Draw 2 Items; keep this Room. Discard at next TRAP result to prevent up to 3 HP damage."]],["Antidote"],"It feels warm before you touch it."],
 ["d-bones","Hall of Teeth","bones","LAIR","The floor is paved with teeth.",[["SEARCH","Roll d6."],["RATTLE","Draw a DEEP Monster. Win: draw 3 Items. During this fight, natural 1 on a Hero attack means the teeth bite for 2 HP."]],"SEARCH",[["1–2","Teeth clamp shut: lose d6 HP; next ATK roll has DIS."],["3–4","Find a gold filling: draw 1 Item."],["5–6","Find 2 Items lodged between jaws."]],["Loyal Hound"],"Many mouths, no answers."],
 ["d-oracle","Broken Oracle","eye","MYSTERY","Its fractured lens tells tomorrow badly.",[["ASK","Guess TREASURE/CORRIDOR/OTHER. Reveal next Room; replace it. Right: peek another, +2 next WIT. Wrong: lose 2 HP, next WIT DIS."],["SILENCE","Peek next Room, leave it in place."]],"PROPHECY",[],["Tunnel Raven"],"Its eyes disagree."],
 ["d-gate","Warden's Threshold","door","LAIR","Draw a DEEP Monster guarding the password gate.",[["WHISPER PASSWORD","Roll d6 before fighting guardian."],["FIGHT GUARDIAN","Defeat it: draw 2 Items; heal d6 HP."]],"PASSWORD",[["1–2","Alarm: fight the guardian; its first attack has ADV."],["3–4","Correct password; guardian leaves."],["5–6","Guardian withdraws; draw 1 Item from its post."]],["CURSED gear"],"The door knows the Warden."],
 ["d-mirror","Mirror of Regrets","eye","SHRINE","Your reflection has decided already.",[["LOOK","Roll d6."],["SHATTER","Lose 2 HP; reverse your next Room d6 in this depth (1↔6, 2↔5, 3↔4)."]],"LOOK",[["1–2","Reflection demands payment: discard 1 Item or lose 3 HP."],["3–4","See two futures: peek next 2 Rooms and order them."],["5–6","Keep this Room. Discard after an opposed d20 roll to exchange the two dice faces."]],["Mirror Shard of Yesterday"],"Only one of you blinks."],
 ["d-mouth","The Talking Door","door","ENCOUNTER","The door demands a secret.",[["LIE","Roll d6. With upright Puppet Judge acquittal, turn it sideways to use 6."],["CONFESS","Opposed d20+WIT vs d20+6: win, draw 2 Items; lose, lose d6 HP."]],"LIE",[["1–2","It screams: draw a DEEP Monster."],["3–4","Discard 1 Item or lose 2 HP to open it."],["5","It whispers: peek next 2 Rooms."],["6","A hidden niche opens: draw 2 Items."]],["Rusty Key","The Puppet Judge"],"It knows your childhood nickname."],
 ["d-choir","Choir of Mushrooms","mushroom","MYSTERY","Mushrooms sing in familiar voices.",[["SING","Roll d6."],["SILENCE","Discard 1 FIRE Item to stop next Monster response. Or discard kept Treasure That Sings for SING 5–6."]],"SING",[["1–2","Spores: become POISONED; your next WIT roll has DIS."],["3–4","Their melody reveals the next Room."],["5–6","Draw 1 Item from roots; remove POISONED."]],["Treasure That Sings","Pitch Torch"],"The harmony has an extra voice."],
 ["d-bazaar","Midnight Bazaar","shop","ENCOUNTER","A shopkeeper sells tomorrow's luck.",
  [["GAMBLE","Discard 1 Item, or lose 2 HP if empty-handed; roll d6."],["TRADE","Discard 2 Items; draw 2 Items and recharge a Wand."]],"GAMBLE",
  [["1–2","Draw a DEEP Monster."],["3–4","Draw 2 Items."],["5","Draw 3 Items; discard 1."],["6","Draw 3 Items; keep this Room to reroll one d20, then discard."]],["Tunnel Raven"],"Every price is final."],
 ["d-crown","Crown of the Unking","bones","SHRINE","A dead king demands tribute.",[["WEAR","Roll d6."],["OFFER","Discard 1 CURSED Item; draw 2 Items."]],"WEAR",[["1–2","Lose d6 HP; next Monster behaviour is 6."],["3–4","Next Monster behaviour is 1–2."],["5","Keep Room; discard for DIS on next Monster's first DEF roll."],["6","Keep Room; with Sleeping Crown unlock UNTHRONE. Discard for next Monster DEF DIS."]],["The Sleeping Crown"],"It carries someone's final order."],
 ["d-last-chest","The Last Chest","door","TREASURE","A box rattles with final preparations.",[["OPEN","Roll d6. May REROLL for 1, then 2, then 3 HP; rerolled 1 draws DEEP Monster. Rusty Key changes 1–2 to 3–4."],["SEAL IT","Discard 1 Item; heal d6 HP."]],"OPEN",[["1–2","TRAP: Draw a DEEP Monster."],["3–4","Draw 2 Items."],["5–6","Draw 2 Items; keep this Room. Discard when Warden hits to prevent 3 damage."]],["Rusty Key"],"It was built for you."],
]);
const revisions=new Map(ROOM_REVISIONS.map(x=>[x.id,x]));
export const V2_ROOMS=Object.freeze([...upper,...middle,...deep].map(c=>revisions.get(c.id)||c).concat(EXTRA_ROOMS,FATE_ROOMS).map((c,i)=>({
 ...c,v2:{...c.v2,number:i+1}
})));
export const V2_REGIONS=Object.freeze(["UPPER","MIDDLE","DEEP"]);
export const V2_ROOMS_BY_REGION=Object.freeze(Object.fromEntries(V2_REGIONS.map(region=>[
 region,Object.freeze(V2_ROOMS.filter(room=>room.stage===region))
])));
