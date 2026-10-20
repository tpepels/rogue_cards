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
  "text": "Loot its satchel: draw 1 Item. Heal d6 HP.",
  "ops": [
   "DRAW:1",
   "HEAL:d6"
  ]
 },
 "crawler": {
  "text": "Break open its carapace: draw 1 Item. Heal d6 HP.",
  "ops": [
   "DRAW:1",
   "HEAL:d6"
  ]
 },
 "bat": {
  "text": "Find your bearings: peek at the next 2 Rooms. Heal d6 HP.",
  "ops": [
   "PEEK:2",
   "HEAL:d6"
  ]
 },
 "troll": {
  "text": "Claim the bridge toll: draw 2 Items. Heal d6 HP.",
  "ops": [
   "DRAW:2",
   "HEAL:d6"
  ]
 },
 "wisp": {
  "text": "Catch its lingering light: +2 on your next WIT test. Heal d6 HP.",
  "ops": [
   "NEXT_WIT:2",
   "HEAL:d6"
  ]
 },
 "eye": {
  "text": "Follow its last gaze: peek at the next 2 Rooms. Heal d6 HP.",
  "ops": [
   "PEEK:2",
   "HEAL:d6"
  ]
 },
 "mold": {
  "text": "Gather useful spores: heal d6 HP.",
  "ops": [
   "HEAL:d6"
  ]
 },
 "wraith": {
  "text": "Recover an old offering: draw 1 Item. Heal d6 HP.",
  "ops": [
   "DRAW:1",
   "HEAL:d6"
  ]
 },
 "rust": {
  "text": "Scavenge metal fragments: draw 2 Items. Heal d6 HP.",
  "ops": [
   "DRAW:2",
   "HEAL:d6"
  ]
 },
 "cultist": {
  "text": "Search its robes: draw 1 Item. Heal d6 HP.",
  "ops": [
   "DRAW:1",
   "HEAL:d6"
  ]
 },
 "sentinel": {
  "text": "Open its armoured compartment: draw 2 Items. Heal d6 HP.",
  "ops": [
   "DRAW:2",
   "HEAL:d6"
  ]
 },
 "drain-leech": {
  "text": "Shake off the leech: heal d6 HP.",
  "ops": [
   "HEAL:d6"
  ]
 },
 "keyhole-mimic": {
  "text": "Break open its secret compartment: draw 2 Items. Heal d6 HP.",
  "ops": [
   "DRAW:2",
   "HEAL:d6"
  ]
 },
 "dust-skeleton": {
  "text": "Recover the last discarded Item, or draw 1 if none. Heal d6 HP.",
  "ops": [
   "SALVAGE",
   "HEAL:d6"
  ]
 },
 "lantern-moth": {
  "text": "Catch its light: your next Hero attack has ADV. Heal d6 HP.",
  "ops": [
   "NEXT_ADV",
   "HEAL:d6"
  ]
 },
 "wax-golem": {
  "text": "Use its warm wax: heal 3 HP.",
  "ops": [
   "HEAL:3"
  ]
 },
 "drowned-jailer": {
  "text": "Take the jailer's keys: draw 2 Items. Heal d6 HP.",
  "ops": [
   "DRAW:2",
   "HEAL:d6"
  ]
 },
 "ropebound-hound": {
  "text": "Loosen its ropes: the next Monster attack against you has DIS. Heal d6 HP.",
  "ops": [
   "DEF_ADV",
   "HEAL:d6"
  ]
 },
 "bell-beetle": {
  "text": "Open its shell: draw 1 Item. Heal d6 HP.",
  "ops": [
   "DRAW:1",
   "HEAL:d6"
  ]
 },
 "ash-penitent": {
  "text": "Gather warm ash: heal d6 HP.",
  "ops": [
   "HEAL:d6"
  ]
 },
 "vault-parasite": {
  "text": "Open what it was guarding: draw 2 Items. Heal d6 HP.",
  "ops": [
   "DRAW:2",
   "HEAL:d6"
  ]
 },
 "bone-cantor": {
  "text": "Search the choir's remains: draw 1 Item. Heal d6 HP.",
  "ops": [
   "DRAW:1",
   "HEAL:d6"
  ]
 },
 "glass-revenant": {
  "text": "Pick through the shards: draw 2 Items. Heal d6 HP.",
  "ops": [
   "DRAW:2",
   "HEAL:d6"
  ]
 }
});
// Metadata for comparing pre-v1 healing hypotheses with the new canonical
// DEFEAT printed values. This list adds NO global or inferred game effect.
export const BALANCED_RECOVERY_V1_MONSTER_IDS=Object.freeze([
 "goblin",
 "crawler",
 "bat",
 "troll",
 "wisp",
 "eye",
 "wraith",
 "rust",
 "cultist",
 "sentinel",
 "keyhole-mimic",
 "dust-skeleton",
 "lantern-moth",
 "drowned-jailer",
 "ropebound-hound",
 "bell-beetle",
 "vault-parasite",
 "bone-cantor",
 "glass-revenant"
]);
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
