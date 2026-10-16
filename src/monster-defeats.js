/**
 * Printed, individual DEFEAT benefits for all 24 regional Monsters.
 * There is no universal victory reward. The print definition and the
 * executable effect read the same card properties.
 */
export const MONSTER_DEFEATS=Object.freeze({
 "rat": {
  "text": "Recover your breath: heal 2 HP.",
  "ops": [
   "HEAL:2"
  ]
 },
 "goblin": {
  "text": "Loot its satchel: draw 1 Item.",
  "ops": [
   "DRAW:1"
  ]
 },
 "crawler": {
  "text": "Break open its carapace: draw 1 Item.",
  "ops": [
   "DRAW:1"
  ]
 },
 "bat": {
  "text": "Find your bearings: peek at the next 2 Rooms.",
  "ops": [
   "PEEK:2"
  ]
 },
 "troll": {
  "text": "Claim the bridge toll: draw 2 Items.",
  "ops": [
   "DRAW:2"
  ]
 },
 "wisp": {
  "text": "Catch its lingering light: +2 on your next WIT test.",
  "ops": [
   "NEXT_WIT:2"
  ]
 },
 "eye": {
  "text": "Follow its last gaze: peek at the next 2 Rooms.",
  "ops": [
   "PEEK:2"
  ]
 },
 "mold": {
  "text": "Gather useful spores: heal d6 HP.",
  "ops": [
   "HEAL:d6"
  ]
 },
 "wraith": {
  "text": "Recover an old offering: draw 1 Item.",
  "ops": [
   "DRAW:1"
  ]
 },
 "rust": {
  "text": "Scavenge metal fragments: draw 2 Items.",
  "ops": [
   "DRAW:2"
  ]
 },
 "cultist": {
  "text": "Search its robes: draw 1 Item.",
  "ops": [
   "DRAW:1"
  ]
 },
 "sentinel": {
  "text": "Open its armoured compartment: draw 2 Items.",
  "ops": [
   "DRAW:2"
  ]
 },
 "drain-leech": {
  "text": "Shake off the leech: heal d6 HP.",
  "ops": [
   "HEAL:d6"
  ]
 },
 "keyhole-mimic": {
  "text": "Break open its secret compartment: draw 2 Items.",
  "ops": [
   "DRAW:2"
  ]
 },
 "dust-skeleton": {
  "text": "Recover the last discarded Item, or draw 1 if none.",
  "ops": [
   "SALVAGE"
  ]
 },
 "lantern-moth": {
  "text": "Catch its light: your next Hero attack has ADV.",
  "ops": [
   "NEXT_ADV"
  ]
 },
 "wax-golem": {
  "text": "Use its warm wax: heal 3 HP.",
  "ops": [
   "HEAL:3"
  ]
 },
 "drowned-jailer": {
  "text": "Take the jailer's keys: draw 2 Items.",
  "ops": [
   "DRAW:2"
  ]
 },
 "ropebound-hound": {
  "text": "Loosen its ropes: the next Monster attack against you has DIS.",
  "ops": [
   "DEF_ADV"
  ]
 },
 "bell-beetle": {
  "text": "Open its shell: draw 1 Item.",
  "ops": [
   "DRAW:1"
  ]
 },
 "ash-penitent": {
  "text": "Gather warm ash: heal d6 HP.",
  "ops": [
   "HEAL:d6"
  ]
 },
 "vault-parasite": {
  "text": "Open what it was guarding: draw 2 Items.",
  "ops": [
   "DRAW:2"
  ]
 },
 "bone-cantor": {
  "text": "Search the choir's remains: draw 1 Item.",
  "ops": [
   "DRAW:1"
  ]
 },
 "glass-revenant": {
  "text": "Pick through the shards: draw 2 Items.",
  "ops": [
   "DRAW:2"
  ]
 }
});
export function applyMonsterDefeat(state,monster){
 const ops=monster.v2?.defeatOps;
 if(!ops?.length)return;
 state.setActor(state.chooseRecipient("monster-defeat:"+monster.id));
 for(const raw of ops){
  if(!state.alive())break;
  const [name,...args]=raw.split(":");
  state.apply(name,args,monster);
 }
}
