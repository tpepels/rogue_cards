#!/usr/bin/env node
/**
 * Encounter pacing analysis for canonical all-card study reference expeditions.
 *
 * Usage:
 *   node scripts/analyze-encounter-pacing.mjs PATH_TO_STUDY_OUTPUT
 *
 * Reads the original shared control expeditions from references/*.json,
 * without rerunning MCTS or pooling treated counterfactual expeditions.
 *
 * monsterVisits counts monsters entering the encounter state, including
 * encounters later resolved without combat. A Monster dismissed by a
 * pre-entry effect may not be counted. These are NOT fight totals.
 */
import {readdirSync, readFileSync, existsSync} from "node:fs";
import {join, resolve, basename} from "node:path";

const given = process.argv[2];
if (!given) {
  console.error("Usage: node scripts/analyze-encounter-pacing.mjs PATH_TO_STUDY_OUTPUT");
  process.exit(2);
}
const base = resolve(given);
const directory = basename(base) === "references" ? base : join(base, "references");
if (!existsSync(directory)) {
  console.error("Cannot find references/ at " + directory);
  process.exit(2);
}
const files = readdirSync(directory).filter(f => f.endsWith(".json")).sort();
if (!files.length) {
  console.error("No baseline reference JSON files found.");
  process.exit(2);
}

const stages = ["UPPER", "MIDDLE", "DEEP"];
const ids = {
  UPPER: ["rat", "goblin", "crawler", "bat"],
  MIDDLE: ["troll", "wisp", "eye", "mold"],
  DEEP: ["wraith", "rust", "cultist", "sentinel"]
};
const byMonsterStage = Object.fromEntries(
  stages.flatMap(stage => ids[stage].map(id => [id, stage]))
);
const summaries = [];

for (const filename of files) {
  const record = JSON.parse(readFileSync(join(directory, filename), "utf8"));
  const result = record.result;
  const coverage = result?.coverage;
  if (!Array.isArray(coverage?.rooms) || !coverage?.monsterVisits) {
    throw Error("Missing original reference coverage: " + filename);
  }
  const rooms = coverage.rooms.filter(id => id !== "vault");
  const roomStages = {UPPER: 0, MIDDLE: 0, DEEP: 0};
  for (const id of rooms) {
    const stage = id.startsWith("u-") ? "UPPER"
      : id.startsWith("m-") ? "MIDDLE"
      : id.startsWith("d-") ? "DEEP" : null;
    if (!stage) throw Error("Unknown Room ID in " + filename + ": " + id);
    roomStages[stage]++;
  }

  const monsters = {UPPER: 0, MIDDLE: 0, DEEP: 0};
  const bosses = {warden: 0, "warden-fury": 0};
  for (const [id, value] of Object.entries(coverage.monsterVisits)) {
    if (!Number.isInteger(value) || value < 0)
      throw Error("Bad monster counter in " + filename + ": " + id);
    if (byMonsterStage[id]) monsters[byMonsterStage[id]] += value;
    else if (Object.hasOwn(bosses, id)) bosses[id] += value;
    else throw Error("Unknown Monster ID in " + filename + ": " + id);
  }

  const behaviours = Object.values(coverage.monsterBehaviorBands || {})
    .reduce((total, value) => total + value, 0);
  summaries.push({
    rooms: rooms.length, roomStages, monsters,
    totalMonsters: Object.values(monsters).reduce((a, b) => a + b, 0),
    bosses, behaviours, won: !!result.won,
    vault: !!coverage.vaultEntered
  });
}

const N = summaries.length;
const count = predicate => summaries.filter(predicate).length;
const sum = fn => summaries.reduce((total, row) => total + fn(row), 0);
const avg = fn => (sum(fn) / N).toFixed(3);
const pct = value => (100 * value / N).toFixed(1) + "%";
const histogram = {"0": 0, "1": 0, "2": 0, "3+": 0};
for (const row of summaries)
  histogram[row.totalMonsters >= 3 ? "3+" : String(row.totalMonsters)]++;

console.log("Control expeditions: " + N + " (from " + directory + ")");
console.log("Win rate: " + pct(count(x => x.won)) +
  "; Vault reached: " + pct(count(x => x.vault)));
console.log("Rooms visited: mean " + avg(x => x.rooms) +
  " (excludes Vault; includes Corridors)");
console.log("Ordinary Monster encounters recorded: mean " +
  avg(x => x.totalMonsters) + " per expedition");
console.log("Recorded encounters per Room visited: " +
  (sum(x => x.totalMonsters) / Math.max(1, sum(x => x.rooms))).toFixed(3));
console.log("0 Monsters: " + histogram["0"] + " (" + pct(histogram["0"]) +
  "); 1: " + histogram["1"] + " (" + pct(histogram["1"]) +
  "); 2: " + histogram["2"] + " (" + pct(histogram["2"]) +
  "); 3+: " + histogram["3+"] + " (" + pct(histogram["3+"]) + ")");

console.log("By stage:");
for (const stage of stages) {
  const monsters = sum(x => x.monsters[stage]);
  const rooms = sum(x => x.roomStages[stage]);
  console.log("  " + stage +
    ": mean Rooms " + avg(x => x.roomStages[stage]) +
    ", mean Monsters " + avg(x => x.monsters[stage]) +
    ", >=1 Monster " + pct(count(x => x.monsters[stage] > 0)) +
    ", Monsters per visited Room " +
    (monsters / Math.max(1, rooms)).toFixed(3));
}
console.log("Boss appearances: Warden " +
  avg(x => x.bosses.warden) + " per expedition; Fury " +
  avg(x => x.bosses["warden-fury"]) + " per expedition");
console.log("Monster behaviour activations (including bosses): " +
  avg(x => x.behaviours) + " per expedition");
console.log("NOTE: Encounter counts can include later parley/escape, and do not " +
  "count Monsters dismissed before entering the encounter state. " +
  "The saved references do not contain actual fight/battle totals or " +
  "the exact room in which each Monster appeared.");
