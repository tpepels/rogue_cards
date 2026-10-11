// Reproducible expeditions for Phase 6 balance diagnostics, not a physical-time claim.
import {startRun,act,availableActions,currentMonster,nodeDepth} from "../src/engine.js";
const heroes=["delver","knight","wizard","rogue"];
const n=Number.parseInt(process.argv[2]||"80",10);
if(!Number.isInteger(n)||n<1||n>1000)throw Error("Simulation count must be 1..1000 per hero");
const results=[];
for(const hero of heroes){
 for(let seed=1;seed<=n;seed++){
  let s=startRun(hero,seed*997+23),steps=0,maxDepth=0,rooms=0,bargains=0,caches=0,techniques=0;
  const visited=new Set(["0"]);
  while(s.phase!=="won"&&s.phase!=="dead"&&steps<500&&s.turn<110){
   const legal=availableActions(s);
   const find=(id,p=()=>true)=>legal.find(a=>a.id===id&&p(a));
   const mon=currentMonster(s);
   let a=null;
   if(mon){
    a=find("technique");
    if(!a&&s.hp<=4)a=find("drink",x=>s.assignments[s.inventory[x.index].id]==="healing");
    if(!a)a=find("attack");
   }else{
    if(s.hunger<14)a=find("eat");
    if(!a&&s.hp<s.maxHp-3)a=find("consume");
    if(!a&&s.hp<7)a=find("drink",x=>s.assignments[s.inventory[x.index].id]==="healing");
    if(!a)a=find("take")||find("take-bones");
    if(!a&&s.phase==="descending"&&seed%3===0&&s.hunger>=10)a=find("solve");
    if(!a&&s.phase==="descending"&&seed%5===0&&s.hp>=9)a=find("bargain");
    if(!a&&s.phase==="descending"&&s.position==="10")a=find("claim");
    const depth=nodeDepth(s.position);
    if(!a&&s.phase==="descending"){
     if(seed%4===0&&depth>=1&&depth<=9&&!s.position.endsWith("b")&&s.hunger>14&&s.hp>7&&!s.rooms[depth+"b"])
      a=find("explore",x=>x.target===depth+"b");
     if(!a&&s.position.endsWith("b"))a=find("travel",x=>x.target===String(depth));
     if(!a)a=find("explore",x=>x.target===String(depth+1))||find("travel",x=>x.target===String(depth+1));
    }else if(!a&&s.phase==="ascending"){
     a=find("travel",x=>x.target===String(depth-1));
    }
    if(!a&&s.hp>8&&s.hunger>16)a=find("solve");
    if(!a&&s.hp>10&&s.hunger>13)a=find("bargain");
   }
   if(!a)a=find("end");
   if(!a)break;
   if(a.id==="technique")techniques++;
   if(a.id==="bargain")bargains++;
   if(a.id==="solve")caches++;
   const next=act(s,a.id,a.index??a.target??null);
   if(next===s)throw Error("Illegal simulation choice "+a.id);
   if(!visited.has(next.position)){visited.add(next.position);rooms++;}
   s=next;steps++;maxDepth=Math.max(maxDepth,nodeDepth(s.position));
  }
  results.push({hero,seed,result:s.phase,turns:s.turn,actions:steps,maxDepth,rooms,bargains,caches,techniques});
 }
}
const mean=(list,key)=>list.reduce((acc,x)=>acc+x[key],0)/list.length;
const round=x=>Math.round(x*100)/100;
for(const hero of heroes){
 const xs=results.filter(x=>x.hero===hero);
 const wins=xs.filter(x=>x.result==="won").length;
 const deaths=xs.filter(x=>x.result==="dead").length;
 const timeouts=xs.length-wins-deaths;
 console.log(JSON.stringify({hero,runs:xs.length,wins,deaths,timeouts,winPct:round(100*wins/xs.length),
   meanTurns:round(mean(xs,"turns")),meanActions:round(mean(xs,"actions")),
   meanMaxDepth:round(mean(xs,"maxDepth")),meanRooms:round(mean(xs,"rooms")),
   meanTechniques:round(mean(xs,"techniques")),
   meanBargains:round(mean(xs,"bargains")),meanCaches:round(mean(xs,"caches"))}));
}
console.log("Note: computer turns/actions cannot establish the 90–120-minute tabletop target.");
