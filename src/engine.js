import {
  HEROES, MONSTERS, ROOMS, APPEARANCES, EFFECTS, ITEMS, EQUIPMENT,
  BEHAVIOURS, EVENTS, ENTRANCE, VAULT, PRINT_COPIES
} from "./data.js";
import { MAGIC_TYPES } from "./magic-data.js";
import { magicStock,setupMagic,actionList,magicAction,magicModifier,ignoresDark,ignoresHunger,resistsPoison,magicName,propertiesOf } from "./magic.js";
import {initEcology,corpseFor,eatCorpse,pray,petTurn,bonesInRoom,buildBones,ECOLOGY} from "./ecology.js";

export const VERSION = 5;
export const LAST_FLOOR = 10;
export const MAX_ACTIONS = 2;
export const MAX_HUNGER = 24;
export const PHYSICAL_RULES = Object.freeze({
  die: 6, target: 4, normalDamage: 2, criticalDamage: 3,
  encounterSpine: 4, encounterBranch: 3
});

const find = (array, id) => array.find(card => card.id === id);
const log = (state, line) => {
  state.log.unshift(line);
  if (state.log.length > 36) state.log.length = 36;
};
function random(state, size) {
  if (!Number.isInteger(size) || size < 1) throw new RangeError("Invalid random range");
  state.rng = (Math.imul(1664525, state.rng) + 1013904223) >>> 0;
  return Math.floor((state.rng / 4294967296) * size);
}
function d6(state) { return 1 + random(state, 6); }
function choice(state, array) { return array[random(state, array.length)]; }
function shuffle(state, array) {
  const items = [...array];
  for (let i = items.length - 1; i > 0; i--) {
    const j = random(state, i + 1);
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}
function deck(state, cards) { return { draw: shuffle(state, cards), discard: [] }; }
function draw(state, pile) {
  if (pile.draw.length === 0) {
    if (pile.discard.length === 0) return null;
    pile.draw = shuffle(state, pile.discard);
    pile.discard = [];
  }
  return pile.draw.pop() ?? null;
}
function potion(id) { return {kind:"potion",id}; }
function item(id) { return {kind:id,id}; }
function takeReserved(state, wanted) {
  // Starting gear is removed from the printed Object supply, not conjured.
  const index=state.decks.loot.draw.findIndex(x=>x.kind===wanted.kind && x.id===wanted.id);
  if(index < 0) throw new Error("Starting object missing from print supply: "+wanted.id);
  return state.decks.loot.draw.splice(index,1)[0];
}
function stock(type, ids) {
  return ids.flatMap(card => Array.from(
    {length:PRINT_COPIES[type]?.[card.id] || 0}, () => card.id
  ));
}
function lootStock() {
  return [...magicStock(),...stock("potion", APPEARANCES).map(id=>potion(id)),
    ...stock("item", [...ITEMS, ...EQUIPMENT].filter(x=>!["amulet"].includes(x.id)))
      .map(id=>item(id))];
}
export const currentRoom = state => state.rooms[state.position];
export const currentMonster = state => currentRoom(state)?.monster?.hp > 0 ? currentRoom(state).monster : null;
export const heroAttack = state => state.attack + (state.equipped.weapon ? 1 : 0);
export const heroDefense = state => state.defense + (state.equipped.armour ? 1 : 0) + magicModifier(state,"defense");
export const appearanceTitle = id => find(APPEARANCES, id)?.title || "Unknown potion";
export function itemTitle(thing) {
  if (!thing) return "Nothing";
  if (thing.kind === "potion") return appearanceTitle(thing.id);
  if (MAGIC_TYPES.includes(thing.kind)) return magicName(thing);
  if(thing.kind==="corpse") return thing.id+" corpse";
  return find([...ITEMS, ...EQUIPMENT], thing.id)?.title || thing.id;
}
export function knownIdentity(state, appearanceId) {
  return find(EFFECTS, state.known[appearanceId])?.name || null;
}
export function connectedLocations(node, state=null) {
  const depth = Number.parseInt(node, 10);
  if (!Number.isInteger(depth) || depth < 0 || depth > LAST_FLOOR) return [];
  if (String(node).endsWith("b")) {
    const links=[String(depth)];
    if(state){
      const room=state.rooms[node];
      for(const n of [depth-1,depth+1]){
        const other=state.rooms[n+"b"];
        if(n>0 && n<LAST_FLOOR && room?.exits?.includes("LINK") && other?.exits?.includes("LINK"))
          links.push(n+"b");
      }
    }
    return links;
  }
  const links=[];
  if (depth>0) links.push(String(depth-1));
  if (depth<LAST_FLOOR) links.push(String(depth+1));
  if (depth>0 && depth<LAST_FLOOR && (!state || state.rooms[String(depth)]?.exits?.includes("SIDE")))
    links.push(depth+"b");
  return links;
}
export const REGIONS = Object.freeze([
  {name:"UPPER",first:1,last:3,label:"The Upper Works"},
  {name:"MIDDLE",first:4,last:6,label:"The Flooded Hollows"},
  {name:"DEEP",first:7,last:9,label:"The Black Crypts"}
]);
export const regionAt = depth => REGIONS.find(r=>depth>=r.first&&depth<=r.last)?.name||"BOUNDARY";
export const nodeDepth = id => Number.parseInt(id, 10);
export const isBranch = id => id.endsWith("b");
export const nodeLabel = id => id === "0" ? "Entrance" : isBranch(id) ? "Side "+nodeDepth(id) : "Depth "+nodeDepth(id);
export function startRun(heroId = "delver", seed = Date.now(), bones = null) {
  const hero = find(HEROES, heroId) || HEROES[0];
  const s = {
    version: VERSION, seed: Number(seed) >>> 0,
    rng: (Number(seed) >>> 0) || 1, heroId: hero.id,
    hp: hero.hp, maxHp:hero.hp, attack:hero.attack, defense:hero.defense,
    hunger:18, turn:1, actionsLeft:MAX_ACTIONS,
    position:"0", rooms:{}, phase:"descending", hasAmulet:false,
    assignments:{}, known:{}, status:{invisible:0},
    inventory:[], equipped:{weapon:null,armour:null,companion:false},
    decks:{}, lastBehaviour:null, lastRoll:null, log:[]
  };
  initEcology(s,bones);
  s.rooms["0"] = {...ENTRANCE, nodeId:"0", depth:0, branch:false,
    used:false, monster:null, loot:null, visited:true,exits:["FORWARD"]};
  const effects=shuffle(s, EFFECTS.map(card=>card.id));
  APPEARANCES.forEach((card,i)=>{s.assignments[card.id]=effects[i];});
  setupMagic(s,shuffle);
  // Physical setup: shuffle each region's printed room stack separately.
  // Retain a single supply object for saves and depletion checks.
  const roomIds=shuffle(s,stock("room",ROOMS));
  s.decks.rooms={draw:roomIds,discard:[]};
  s.decks.monsters = deck(s, stock("monster", MONSTERS.filter(x=>x.id!=="sentinel")));
  s.decks.loot = deck(s, lootStock());
  s.decks.events = deck(s, stock("event", EVENTS));
  s.decks.behaviour = deck(s, stock("behaviour", BEHAVIOURS));
  if (hero.id==="delver") for(let i=0;i<2;i++) s.inventory.push(takeReserved(s,item("ration")));
  if (hero.id==="knight") s.inventory.push(takeReserved(s,item("ration")));
  if (hero.id==="wizard") for(let i=0;i<3;i++) {
    const bottles=s.decks.loot.draw.filter(thing=>thing.kind==="potion");
    s.inventory.push(takeReserved(s,choice(s,bottles)));
  }
  if (hero.id==="rogue") for(const x of [item("ration"),item("key"),potion("smoky")])
    s.inventory.push(takeReserved(s,x));
  log(s,"You have two actions each turn. Descend to depth 10; return with the Amulet.");
  return s;
}
function findItemIndex(state, id) { return state.inventory.findIndex(x=>x.kind===id); }
function roomEffect(state, room) {
  if (room.id==="locked") {
    if(state.status.passage>0) {state.status.passage--;log(state,"DIGGING opens the locked passage.");return;}
    const i=findItemIndex(state,"key");
    if (i>=0) { state.inventory.splice(i,1); log(state,"Used a key to open the gallery."); }
    else { state.hunger=Math.max(0,state.hunger-2); log(state,"Forced the lock. Hunger -2."); }
  }
  if (room.id==="trap") {
    if(state.status.passage>0) {state.status.passage--;log(state,"DIGGING disarms the pressure plate.");return;}
    const i=findItemIndex(state,"key");
    if (i>=0) { state.inventory.splice(i,1); log(state,"Jammed the trap with a key."); }
    else { state.hp -= 2; log(state,"Spring trap! HP -2."); }
  }
}
function eventEffect(state) {
  const id = draw(state,state.decks.events);
  if (!id) return;
  state.decks.events.discard.push(id);
  const card=find(EVENTS,id);
  if (id==="unease") { state.hunger=Math.max(0,state.hunger-1); }
  if (id==="bones") {
    const reserve=state.decks.loot.draw.findIndex(x=>x.kind==="ration");
    if(reserve>=0) state.inventory.push(...state.decks.loot.draw.splice(reserve,1));
    else log(state,"No rations remain in the Object supply.");
  }
  if (id==="whisper") { state.hunger=Math.max(0,state.hunger-2); }
  if (id==="wind") { state.hp=Math.min(state.maxHp,state.hp+1); }
  log(state, "Event: "+card.title+". "+card.rule);
}
function openRoom(state, target) {
  const depth=nodeDepth(target);
  const branch=isBranch(target);
  const isVault=target===String(LAST_FLOOR);
  let template;
  if (isVault) template=VAULT;
  else {
    const region=regionAt(depth);
    const index=state.decks.rooms.draw.findLastIndex(id=>find(ROOMS,id)?.region===region);
    if(index<0) throw Error("Room supply exhausted in "+region);
    const [id]=state.decks.rooms.draw.splice(index,1);
    template=find(ROOMS,id);
  }
  const room={...template,nodeId:target,depth,branch,region:regionAt(depth),used:false,
    monster:null,loot:null,bones:null,corpse:null,visited:true};
  if (isVault) room.monster=spawnMonster(find(MONSTERS,"sentinel"));
  else {
    const encounterRoll=d6(state);
    const baseline=regionAt(depth)==="UPPER"?3:regionAt(depth)==="MIDDLE"?4:5;
    const threshold=branch?Math.max(1,baseline-1):baseline;
    if (encounterRoll <= threshold) {
      const enemyId=draw(state,state.decks.monsters);
      if (enemyId) room.monster=spawnMonster(find(MONSTERS,enemyId));
    }
    const lootRoll=d6(state);
    if (lootRoll <= (branch?5:4)) room.loot=draw(state,state.decks.loot);
  }
  if(room.monster && ECOLOGY[room.monster.id]?.habitat===room.terrain){
    room.monster.hp++;room.monster.maxHp++;room.monster.habitatBonus=true;
  }
  state.rooms[target]=room;
  state.position=target;
  log(state,room.region+" / "+nodeLabel(target)+": "+room.title+(room.monster?". "+room.monster.title+" appears.":"."));
  roomEffect(state,room);
  checkDeath(state); // Fatal traps end the run before a beneficial event can occur.
  if (state.phase!=="dead" && !isVault && d6(state)===6) eventEffect(state);
  if(state.phase!=="dead") bonesInRoom(state,d6,line=>log(state,line),depth);
  if(state.intrinsics.includes("scent") && room.monster)log(state,"SCENT: the monster is "+room.monster.title+".");
}
function spawnMonster(template) {
  return {...template, maxHp:template.hp, guard:0, frozen:0, blinded:0,
    ambushed:false, petUsed:false};
}
function releaseMonster(state, monster) {
  if (monster.id!=="sentinel") state.decks.monsters.discard.push(monster.id);
  const room=currentRoom(state);
  if(!room.corpse)room.corpse=corpseFor(monster,state.turn);
  log(state,monster.title+" falls.");
}
function checkDeath(state) {
  if (state.hp<=0) {
    state.hp=0;
    state.phase="dead";
    state.bonesOutcome=buildBones(state);
    log(state,"YOU DIE. Your bones may be found in a future expedition.");
  }
  if (state.hunger<0) state.hunger=0;
}
function rollAttack(state, attack, defense, label, adjustment=0) {
  const roll=d6(state);
  const total=roll+attack+adjustment;
  const threshold=4+defense;
  const hit=roll!==1 && (roll===6 || total>=threshold);
  const damage=hit?(roll===6?PHYSICAL_RULES.criticalDamage:PHYSICAL_RULES.normalDamage):0;
  state.lastRoll={roll,total,threshold,hit,damage,label};
  log(state,label+": d6 "+roll+" + "+attack+(adjustment?" + "+adjustment:"")+" vs "+threshold+" — "+(hit?"HIT "+damage:"MISS")+".");
  return {roll,hit,damage};
}
function monsterAttack(state, monster, modifier=0) {
  const attack=rollAttack(state,monster.attack,heroDefense(state),monster.title,modifier);
  if(!attack.hit) return;
  let damage=attack.damage;
  if(state.status.ward>0){state.status.ward--;damage=Math.max(0,damage-2);log(state,"Ward absorbs 2 damage.");}
  if(monster.id==="goblin" && !monster.ambushed) { damage++;monster.ambushed=true; }
  state.hp-=damage;
  if(monster.id==="rust" && !state.intrinsics.includes("rustproof")) { state.defense=Math.max(0,state.defense-1);log(state,"Rust corrodes your defence."); }
  if(monster.id==="wraith"&&!resistsPoison(state)&&!state.intrinsics.includes("shade")) { state.hunger=Math.max(0,state.hunger-1);log(state,"The shade steals 1 hunger."); }
  log(state,"You suffer "+damage+" damage.");
}
function monsterTurn(state) {
  const monster=currentMonster(state);
  if(!monster) return;
  if(state.status.invisible>0) { log(state,"Invisible: "+monster.title+" cannot find you.");return; }
  if(monster.frozen>0) {monster.frozen--;log(state,monster.title+" remains frozen.");return;}
  if(monster.blinded>0) {monster.blinded--;log(state,monster.title+" is blinded.");return;}
  const id=draw(state,state.decks.behaviour);
  if(!id) throw Error("Behaviour deck exhausted");
  state.decks.behaviour.discard.push(id);
  state.lastBehaviour=id;
  const card=find(BEHAVIOURS,id);
  log(state,"Monster behaviour: "+card.title+".");
  monster.guard=0; // Guard from previous turn applied to the two hero actions just completed.
  if(id==="guard") monster.guard=1;
  if(id==="strike") monsterAttack(state,monster);
  if(id==="lunge") monsterAttack(state,monster,1);
  if(id==="frenzy") {
    monsterAttack(state,monster,-1);
    if(state.hp>0) monsterAttack(state,monster,-1);
  }
  if(id==="drain") {state.hunger=Math.max(0,state.hunger-2);log(state,"Drain: hunger -2.");}
  if(id==="recover") {monster.hp=Math.min(monster.maxHp,monster.hp+2);log(state,"Monster recovers 2 HP.");}
}
function finishTurn(state) {
  if(state.phase==="dead"||state.phase==="won") return;
  state.hunger=Math.max(0,state.hunger-(ignoresHunger(state)?0:1));
  if(state.hunger===0) {state.hp--;log(state,"Starvation costs 1 HP.");}
  checkDeath(state);
  if(state.phase==="dead") return;
  petTurn(state,d6,line=>log(state,line),()=>currentMonster(state));
  if(currentRoom(state).monster?.hp<=0 && currentRoom(state).corpse==null &&
     currentRoom(state).monster.id!=="sentinel")releaseMonster(state,currentRoom(state).monster);
  monsterTurn(state);
  if(state.status.invisible>0) state.status.invisible--;
  state.prayer.cooldown=Math.max(0,state.prayer.cooldown-1);
  if(state.intrinsics.includes("regeneration") && state.turn%3===0)state.hp=Math.min(state.maxHp,state.hp+1);
  checkDeath(state);
  if(state.phase==="dead") return;
  state.turn++;
  state.actionsLeft=MAX_ACTIONS;
}
function consumePotion(state, appearanceId, thrown) {
  const effect=state.assignments[appearanceId];
  state.known[appearanceId]=effect;
  log(state,appearanceTitle(appearanceId)+" identified: "+find(EFFECTS,effect).name+".");
  const mon=currentMonster(state);
  if(thrown && mon) {
    if(effect==="healing") mon.hp-=2;
    if(effect==="poison") mon.hp -= 5 + (propertiesOf(mon.id).includes("organic") ? 2 : 0);
    if(effect==="invisibility") mon.blinded=2;
    if(effect==="frost") {mon.hp-=(propertiesOf(currentRoom(state).id).includes("water")?5:3);mon.frozen=1;}
    if(effect==="polymorph") {
      let replacement=draw(state,state.decks.monsters);
      let attempts=0;
      while(replacement===mon.id && attempts++<20) {
        state.decks.monsters.discard.push(replacement);
        replacement=draw(state,state.decks.monsters);
      }
      if(replacement) {
        if(mon.id!=="sentinel") state.decks.monsters.discard.push(mon.id);
        const transformed=spawnMonster(find(MONSTERS,replacement));
        currentRoom(state).monster=transformed;
        log(state,"Polymorph! "+transformed.title+" appears.");
      } else log(state,"The polymorph fizzles; no monster cards remain.");
      return;
    }
    if(mon.hp<=0) releaseMonster(state,mon);
    return;
  }
  if(effect==="healing") state.hp=Math.min(state.maxHp,state.hp+5);
  if(effect==="poison") {if(resistsPoison(state))log(state,"Resistance ring blocks POISON.");else state.hp-=3;}
  if(effect==="invisibility") state.status.invisible=3;
  if(effect==="frost") state.hunger=Math.min(MAX_HUNGER,state.hunger+4);
  if(effect==="polymorph") {
    const delta=d6(state)%3-1;
    state.attack=Math.max(1,state.attack+delta);
    log(state,"Polymorph: attack "+(delta>=0?"+":"")+delta+".");
  }
}
export function availableActions(state) {
  if(!state || ["dead","won"].includes(state.phase)) return [];
  const actions=[];
  const room=currentRoom(state);
  const monster=currentMonster(state);
  if (monster) {
    actions.push({id:"attack",label:"Attack (roll d6)"});
  } else {
    if(room.loot) actions.push({id:"take",label:"Take "+itemTitle(room.loot)});
    if(room.corpse)actions.push({id:"take-corpse",label:"Collect "+room.corpse.id+" corpse"});
    if(room.bones)actions.push({id:"take-bones",label:"Recover remains: "+itemTitle(room.bones)});

    if(room.id==="fountain"&&!room.used) actions.push({id:"fountain",label:"Drink from fountain"});
    if(state.position===String(LAST_FLOOR)&&!state.hasAmulet)
      actions.push({id:"claim",label:"Claim the Amulet"});
  }
  const neighbours=connectedLocations(state.position,state);
  for(const target of neighbours) {
    if(monster) {
      // Retreat is possible through an already explored passage toward the surface.
      const retreat=state.rooms[target] &&
        (isBranch(state.position)?nodeDepth(target)<=nodeDepth(state.position):
         !isBranch(target)&&nodeDepth(target)<nodeDepth(state.position));
      if(retreat) actions.push({id:"travel",target,label:"Retreat to "+nodeLabel(target)});
    } else if(state.rooms[target]) {
      actions.push({id:"travel",target,label:"Move to "+nodeLabel(target)});
    } else if(state.phase==="descending") {
      actions.push({id:"explore",target,label:"Explore "+nodeLabel(target)});
    }
  }
  if(state.prayer.cooldown===0)actions.push({id:"pray",label:"Pray ("+(room.id==="altar"?"altar bonus":"roll d6")+")"});
  actions.push(...actionList(state,monster));
  state.inventory.forEach((thing,index)=>{
    if(thing.kind==="potion") {
      actions.push({id:"drink",index,label:"Drink "+itemTitle(thing)});
      if(monster) actions.push({id:"throw",index,label:"Throw "+itemTitle(thing)});
    }
    if(thing.kind==="ration") actions.push({id:"eat",index,label:"Eat ration"});
    if(thing.kind==="corpse")actions.push({id:"eat-corpse",index,label:"Eat "+thing.id+" corpse"});
    if(thing.kind==="ration"&&state.pet.active&&state.pet.hunger<9)actions.push({id:"feed-pet",index,label:"Feed dog ration"});
    if(thing.kind==="charm") actions.push({id:"consume",index,label:"Use lucky bone"});
    if(["sword","mail","dog"].includes(thing.kind))
      actions.push({id:"equip",index,label:"Equip "+itemTitle(thing)});
  });
  actions.push({id:"end",label:"End turn (monster reacts)"});
  return actions;
}
export function act(previous, id, argument=null) {
  if(!validateSave(previous)) return previous;
  const valid=availableActions(previous).some(a=>a.id===id &&
    (a.index??a.target??null)===(argument??null));
  if(!valid) return previous;
  const state=JSON.parse(JSON.stringify(previous));
  if(id==="end") {finishTurn(state);return state;}
  const room=currentRoom(state);
  const mon=currentMonster(state);
  if(id==="explore") openRoom(state,argument);
  if(id==="travel") {
    state.position=argument;
    log(state,"Move to "+nodeLabel(argument)+": "+currentRoom(state).title+".");
    if(argument==="0" && state.hasAmulet) {
      state.phase="won";
      log(state,"YOU ASCEND! The Amulet reaches daylight.");
    }
  }
  if(id==="attack" && mon) {
    const darkPenalty=currentRoom(state).terrain==="DARK"&&!ignoresDark(state)&&!state.intrinsics.includes("focus")?-1:0;
    const hit=rollAttack(state,heroAttack(state)+darkPenalty,mon.defense+mon.guard,"Hero");
    if(hit.hit) {
      const petBonus=0; // Autonomous companion resolves at turn end, never on Hero attack.
      if(petBonus) {mon.petUsed=true; log(state,"Your companion assists (+1).");}
      mon.hp-=hit.damage+petBonus;
    }
    if(mon.id==="eye" && mon.hp>0) {state.hp--;log(state,"The eye's gaze costs 1 HP.");}
    if(mon.hp<=0) releaseMonster(state,mon);
  }
  if(id==="take") {state.inventory.push(room.loot);log(state,"Found "+itemTitle(room.loot)+".");room.loot=null;}
  if(id==="take-corpse"){state.inventory.push(room.corpse);log(state,"Collected "+room.corpse.id+" corpse.");room.corpse=null;}
  if(id==="take-bones"){state.inventory.push(room.bones);log(state,"Recovered lost equipment.");room.bones=null;}
  if(id==="claim") {state.hasAmulet=true;state.phase="ascending";log(state,"The Amulet is yours. Return to the entrance.");}
  if(id==="pray") pray(state,d6,line=>log(state,line),room.id==="altar");
  if(id==="fountain") {
    room.used=true;
    if(d6(state)<=3) {state.hp=Math.min(state.maxHp,state.hp+3);log(state,"Fountain: restore 3 HP.");}
    else {
      const potions=state.decks.loot.draw.filter(x=>x.kind==="potion");
      if(potions.length) {
        const found=choice(state,potions);
        const index=state.decks.loot.draw.findIndex(x=>x.id===found.id&&x.kind==="potion");
        state.inventory.push(...state.decks.loot.draw.splice(index,1));
        log(state,"Fountain: gain a mystery potion from the Object supply.");
      } else log(state,"Fountain: no potion remains in the Object supply.");
    }
  }
  if(["read","zap","wear"].includes(id)) {
    magicAction(state,id,argument,{
      monster:()=>currentMonster(state),room:()=>currentRoom(state),
      neighbours:()=>connectedLocations(state.position,state),
      roomTitle:roomId=>find(ROOMS,roomId)?.title,
      log:line=>log(state,line),
      hurt:(mon,damage,property)=>{mon.hp-=damage;log(state,property+" deals "+damage+" damage.");if(mon.hp<=0)releaseMonster(state,mon);}
    });
  }
  if(id==="eat-corpse"){
    eatCorpse(state,argument,d6,line=>log(state,line));
    if(state.intrinsics.includes("scavenger")&&!state.status.scavenged){state.hunger=Math.min(MAX_HUNGER,state.hunger+3);state.status.scavenged=true;log(state,"Scavenger grants +3 hunger (once).");}
  }
  if(id==="feed-pet"){state.inventory.splice(argument,1);state.pet.hunger=9;state.pet.loyalty=Math.min(4,state.pet.loyalty+1);log(state,"Fed your dog.");}
  if(["drink","throw","eat","consume","equip"].includes(id)) {
    const thing=state.inventory[argument];
    if(id==="drink"||id==="throw") {
      state.inventory.splice(argument,1);
      consumePotion(state,thing.id,id==="throw");
    }
    if(id==="eat") {
      state.inventory.splice(argument,1);
      state.hunger=Math.min(MAX_HUNGER,state.hunger+7);
      log(state,"Eat: hunger +7.");
    }
    if(id==="consume") {
      state.inventory.splice(argument,1);
      state.hp=Math.min(state.maxHp,state.hp+3);
      log(state,"Lucky Bone restores 3 HP.");
    }
    if(id==="equip") {
      state.inventory.splice(argument,1);
      const slot=thing.kind==="sword"?"weapon":thing.kind==="mail"?"armour":"companion";
      const old=state.equipped[slot];
      if(old && old!==true) state.inventory.push(item(old));
      if(slot==="companion" && old) state.inventory.push(item("dog"));
      state.equipped[slot]=slot==="companion"?true:thing.kind;
      if(slot==="companion"){state.pet.active=true;state.pet.alive=true;state.pet.position=state.position;state.pet.hunger=9;}
      log(state,"Equipped "+itemTitle(thing)+".");
    }
  }
  checkDeath(state);
  if(state.phase==="dead"||state.phase==="won") return state;
  state.actionsLeft--;
  if(state.actionsLeft<=0) finishTurn(state);
  return state;
}
export function validateSave(s) {
  if (!s || s.version!==VERSION || !HEROES.some(h=>h.id===s.heroId) ||
      !["descending","ascending","won","dead"].includes(s.phase)) return false;
  if (!s.rooms || !s.rooms[s.position] || !Array.isArray(s.inventory) ||
      !s.equipped || !s.decks?.behaviour || !s.decks?.loot ||
      !s.assignments || !s.known || !s.pet || !s.prayer || !Array.isArray(s.intrinsics) || !s.rooms["0"]?.exits || !s.magicAssignments || !s.magicKnown || s.equipped.ring===undefined) return false;
  if (!Number.isInteger(s.actionsLeft) || s.actionsLeft<1 || s.actionsLeft>MAX_ACTIONS) return false;
  if (!Array.isArray(s.log) || !Number.isInteger(s.turn)) return false;
  return true;
}
