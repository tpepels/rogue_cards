// The print queue is a small URL, not hundreds of hidden card DOM nodes.
// The data is self-contained, so custom decks survive navigation without storage.
import {FIXED_CARDS,SELECTABLE,cardKey} from "./decks.js";
const byKey=new Map([...FIXED_CARDS,...SELECTABLE].map(card=>[cardKey(card),card]));
const LIMIT=1500;
export function printUrl(cards){
 if(!Array.isArray(cards)||!cards.length)throw Error("Select at least one card to print.");
 const groups=new Map();
 for(const card of cards){
  const key=cardKey(card);
  if(!byKey.has(key))throw Error("Unknown physical card: "+key);
  groups.set(key,(groups.get(key)||0)+1);
 }
 if(cards.length>LIMIT)throw Error("Too many printed copies.");
 const spec=[...groups].map(([key,count])=>key+"~"+count).join(",");
 return "./print.html?cards="+encodeURIComponent(spec);
}
export function decodePrintQueue(search){
 const input=new URLSearchParams(search).get("cards");
 if(!input)throw Error("No selected cards. Start printing from the gallery or deck builder.");
 const groups=input.split(","),seen=new Set();
 let count=0;
 const cards=[];
 for(const token of groups){
  const match=/^((?:hero|room|monster|item|potion):[a-z0-9-]+)~([1-9]\d*)$/.exec(token);
  if(!match)throw Error("Invalid print selection.");
  const [,key,n]=match;
  if(seen.has(key))throw Error("Repeated print selection: "+key);
  seen.add(key);
  const card=byKey.get(key),copies=Number(n);
  if(!card||copies>50||!Number.isSafeInteger(copies)||count+copies>LIMIT)
   throw Error("Invalid print quantity for "+key);
  count+=copies;
  for(let i=0;i<copies;i++)cards.push(card);
 }
 return cards;
}
