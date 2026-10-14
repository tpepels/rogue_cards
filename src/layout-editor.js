import {CATALOGUE} from "./tabletop-data.js";
import {cardMarkup} from "./tabletop-view.js";
import {emptyPlacements,normalizePlacements,placementCSS,PARTS,DEFAULT_LAYERS} from "./card-layouts.js";

const $=selector=>document.querySelector(selector);
const mmPx=96/25.4;
const STORAGE="rogue-cards-layout-draft-v1";
const partSelectors={title:".tt-title",rules:".tt-slip--lead",results:".tt-slip--results"};
const partNames={title:"TITLE",rules:"UPPER RULES",results:"DICE / EXTRA"};
const editStyle=document.createElement("style");
editStyle.id="editor-placements";
document.head.append(editStyle);
const families=[...new Set(CATALOGUE.map(card=>card.type))];
const cardKey=card=>card.type+":"+card.id;
const cardByKey=new Map(CATALOGUE.map(card=>[cardKey(card),card]));
const ui={
 family:$("#family"),picker:$("#card-picker"),prev:$("#prev"),next:$("#next"),
 frame:$("#card-frame"),host:$("#editor-card"),zoom:$("#zoom"),
 status:$("#draft-status"),pieces:$("#piece-list"),selected:$("#selected-name"),
 warning:$("#layout-warning"),snap:$("#snap"),file:$("#import-file"),
 undo:$("#undo"),redo:$("#redo")
};
let layout=emptyPlacements(),baseLayout=emptyPlacements(),currentCard=CATALOGUE[0],selectedPart="rules";
let snapshots=[],historyIndex=0,activePointer=null;
const round=n=>Math.round(n*100)/100;
const step=()=>ui.snap.checked?.5:.1;
const quant=n=>round(Math.round(n/step())*step());
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const cardFromKey=key=>cardByKey.get(key);
function listCards(){
 return CATALOGUE.filter(c=>ui.family.value==="all"||c.type===ui.family.value);
}
function piece(part=selectedPart){
 return ui.host.querySelector(partSelectors[part]);
}
function scale(){
 const c=ui.host.querySelector(".tt-card");
 return c?c.getBoundingClientRect().width/c.offsetWidth:1;
}
function physical(el){
 // offsetLeft/Top are unrotated CSS pixels relative to the positioned parent.
 return {
  x:round(el.offsetLeft/mmPx),y:round(el.offsetTop/mmPx),
  w:round(el.offsetWidth/mmPx),h:round(el.offsetHeight/mmPx)
 };
}
// Unedited cutouts keep their original CSS tilt until it is customized.
function cssRotation(el){
 const matrix=getComputedStyle(el).transform;
 if(!matrix||matrix==="none")return 0;
 const match=matrix.match(/^matrix\(([^)]+)\)$/);
 if(!match)return 0;
 const numbers=match[1].split(",").map(Number);
 return round(Math.atan2(numbers[1],numbers[0])*180/Math.PI);
}
function existing(part){
 return layout.cards[cardKey(currentCard)]?.[part]||{};
}
function positionOf(part){
 const el=piece(part);
 if(!el)return null;
 return {
  ...physical(el),
  rotation:cssRotation(el),
  zIndex:DEFAULT_LAYERS[part],
  ...existing(part)
 };
}
function patchPlacement(part,patch){
 const key=cardKey(currentCard);
 layout.cards[key]??={};
 layout.cards[key][part]={...layout.cards[key][part],...patch};
 applyCSS();
 updateInspector();
}
// All unedited cards inherit the checked-in generated stylesheet. Compile
// only the selected card while dragging, not a 180 KB stylesheet on every move.
function applyCSS(){
 const key=cardKey(currentCard);
 editStyle.textContent=placementCSS({version:1,units:"mm",cards:layout.cards[key]?{[key]:layout.cards[key]}:{}});
}
function mergeWithDefaults(patch){
 const next=JSON.parse(JSON.stringify(baseLayout));
 for(const [key,value] of Object.entries(patch.cards))next.cards[key]={
  ...(next.cards[key]||{}),...value
 };
 return normalizePlacements(next);
}
function localSave(){
 try{localStorage.setItem(STORAGE,JSON.stringify(layout));return true;}
 catch{ui.warning.textContent="Local storage unavailable. Export JSON to preserve your work.";return false;}
}
function showStatus(){
 const count=Object.keys(layout.cards).length;
 const pieces=Object.values(layout.cards).reduce((a,c)=>a+Object.keys(c).length,0);
 ui.status.textContent=count+" / "+CATALOGUE.length+" cards adjusted · "+pieces+" cutouts · draft in this browser";
 ui.undo.disabled=historyIndex===0;
 ui.redo.disabled=historyIndex>=snapshots.length-1;
}
function historyPush(){
 const image=JSON.stringify(layout);
 if(image===snapshots[historyIndex])return;
 snapshots=snapshots.slice(0,historyIndex+1);
 snapshots.push(image);
 if(snapshots.length>100)snapshots.shift();
 historyIndex=snapshots.length-1;
 localSave();
 showStatus();
}
function historyRestore(index){
 if(index<0||index>=snapshots.length)return;
 historyIndex=index;
 layout=normalizePlacements(JSON.parse(snapshots[historyIndex]));
 applyCSS();localSave();render();showStatus();
}
function selectPart(part){
 if(!PARTS.includes(part)||!piece(part))return;
 selectedPart=part;
 for(const p of PARTS)piece(p)?.classList.toggle("le-selected",p===part);
 ui.selected.textContent=partNames[part];
 for(const button of ui.pieces.querySelectorAll("button"))
  button.setAttribute("aria-pressed",String(button.dataset.part===part));
 updateInspector();
}
function warningCheck(){
 const card=ui.host.querySelector(".tt-card");
 if(!card)return;
 const frame=card.getBoundingClientRect();
 const rects=PARTS.filter(p=>piece(p)).map(p=>({part:p,rect:piece(p).getBoundingClientRect()}));
 const overs=rects.filter(({rect})=>rect.left<frame.left-2||rect.right>frame.right+2||
  rect.top<frame.top-2||rect.bottom>frame.bottom+2).map(x=>x.part);
 for(let i=0;i<rects.length;i++)for(let j=i+1;j<rects.length;j++){
  const a=rects[i].rect,b=rects[j].rect;
  const dx=Math.min(a.right,b.right)-Math.max(a.left,b.left);
  const dy=Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top);
  if(dx>5&&dy>5)overs.push(rects[i].part+" / "+rects[j].part);
 }
 const outside=overs.filter(x=>!x.includes(" / "));
 const overlapping=overs.filter(x=>x.includes(" / "));
 ui.warning.textContent=[
  outside.length?"Outside card: "+[...new Set(outside)].join(", "):"",
  overlapping.length?"Overlapping: "+[...new Set(overlapping)].join(", ")+". Higher layer appears in front.":""
 ].filter(Boolean).join(" · ");
}
function updateInspector(){
 const pos=positionOf(selectedPart);
 for(const key of ["x","y","w","h","rotation","zIndex"]){
  const input=$("#position-"+key);
  input.disabled=!pos;
  input.value=pos?pos[key]:"";
 }
 const slider=$("#rotation-slider");
 slider.disabled=!pos;
 if(pos)slider.value=String(clamp(pos.rotation,-45,45));
 for(const id of ["layer-behind","layer-ahead","reset-rotation"])$("#"+id).disabled=!pos;
 warningCheck();
 showStatus();
}
function populatePicker(){
 const subset=listCards();
 ui.picker.innerHTML="";
 for(const c of subset){
  const option=document.createElement("option");
  option.value=cardKey(c);
  option.textContent=c.type.toUpperCase()+" - "+c.title+
   (layout.cards[cardKey(c)]?" *":"");
  ui.picker.append(option);
 }
 if(!subset.includes(currentCard))currentCard=subset[0];
 if(currentCard)ui.picker.value=cardKey(currentCard);
 ui.prev.disabled=subset.length<2;ui.next.disabled=subset.length<2;
}
function render(){
 populatePicker();
 applyCSS();
 if(!currentCard)return;
 ui.host.innerHTML=cardMarkup(currentCard);
 for(const part of PARTS){
  const el=piece(part);
  if(!el)continue;
  el.dataset.part=part;
  const corner=document.createElement("span");
  corner.className="le-handle";
  corner.dataset.handle="resize";
  corner.title="Drag to resize "+partNames[part].toLowerCase();
  corner.setAttribute("aria-hidden","true");
  el.append(corner);
  const knob=document.createElement("span");
  knob.className="le-rotate-handle";
  knob.dataset.handle="rotate";
  knob.textContent="↻";
  knob.title="Drag to rotate "+partNames[part].toLowerCase();
  knob.setAttribute("aria-hidden","true");
  el.append(knob);
  el.addEventListener("pointerdown",startPointer);
  el.addEventListener("click",()=>selectPart(part));
 }
 ui.pieces.innerHTML="";
 for(const part of PARTS){
  if(!piece(part))continue;
  const button=document.createElement("button");
  button.type="button";
  button.dataset.part=part;
  button.textContent=partNames[part];
  button.addEventListener("click",()=>selectPart(part));
  ui.pieces.append(button);
 }
 const target=piece(selectedPart)?selectedPart:"rules";
 selectPart(target);
}
function startPointer(e){
 if(e.button!==0)return;
 const el=e.currentTarget,part=el.dataset.part;
 if(!part)return;
 e.preventDefault();e.stopPropagation();
 selectPart(part);
 const resizing=Boolean(e.target.closest(".le-handle"));
 const rotating=Boolean(e.target.closest(".le-rotate-handle"));
 const current=positionOf(part),rect=el.getBoundingClientRect();
 const cx=rect.left+rect.width/2,cy=rect.top+rect.height/2;
 activePointer={
  pointerId:e.pointerId,part,kind:rotating?"rotate":resizing?"resize":"move",
  startX:e.clientX,startY:e.clientY,position:current,changed:false,
  centerX:cx,centerY:cy,
  initialAngle:Math.atan2(e.clientY-cy,e.clientX-cx)*180/Math.PI
 };
 try{el.setPointerCapture(e.pointerId);}catch{}
}
function updatePointer(e){
 const active=activePointer;
 if(!active||e.pointerId!==active.pointerId)return;
 const dx=(e.clientX-active.startX)/(mmPx*scale());
 const dy=(e.clientY-active.startY)/(mmPx*scale());
 const p=active.position;
 if(active.kind==="rotate"){
  const angle=Math.atan2(e.clientY-active.centerY,e.clientX-active.centerX)*180/Math.PI;
  const delta=angle-active.initialAngle;
  const raw=((p.rotation+delta+540)%360)-180;
  const step=ui.snap.checked?.5:.1;
  const degrees=round(Math.round(raw/step)*step);
  patchPlacement(active.part,{rotation:degrees});
 }else if(active.kind==="resize"){
  const w=clamp(quant(p.w+dx),10,90-p.x);
  const h=clamp(quant(p.h+dy),0,130-p.y);
  patchPlacement(active.part,{x:p.x,y:p.y,w,h});
 }else{
  const x=clamp(quant(p.x+dx),0,Math.max(0,90-p.w));
  const y=clamp(quant(p.y+dy),0,Math.max(0,130-p.h));
  patchPlacement(active.part,{x,y,w:p.w});
 }
 active.changed=true;
}
function endPointer(e){
 if(!activePointer||e.pointerId!==activePointer.pointerId)return;
 const changed=activePointer.changed;
 activePointer=null;
 if(changed){historyPush();populatePicker();}
}
function changeCard(delta){
 const subset=listCards();
 const i=subset.indexOf(currentCard);
 if(!subset.length)return;
 currentCard=subset[(i+delta+subset.length)%subset.length];
 render();
}
function download(name,body,type){
 const url=URL.createObjectURL(new Blob([body],{type}));
 const a=document.createElement("a");a.href=url;a.download=name;
 document.body.append(a);a.click();a.remove();
 setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function exportDraft(){
 download("rogue-cards-layouts.json",JSON.stringify(normalizePlacements(layout),null,2)+"\n","application/json");
 ui.status.textContent="JSON exported - upload the file to ChatGPT when ready.";
}
function applyNumber(field,value){
 if(!Number.isFinite(value))return;
 const before=positionOf(selectedPart);
 if(!before)return;
 const p={...before,[field]:value};
 if(field==="rotation"){
  patchPlacement(selectedPart,{rotation:round(clamp(value,-180,180))});
  historyPush();populatePicker();return;
 }
 if(field==="zIndex"){
  patchPlacement(selectedPart,{zIndex:clamp(Math.round(value),1,99)});
  historyPush();populatePicker();return;
 }
 p.w=clamp(p.w,10,90);
 p.x=clamp(p.x,0,90-p.w);
 p.y=clamp(p.y,0,130);
 if(field==="h")p.h=clamp(p.h,0,130-p.y);
 if(field==="w")p.w=clamp(p.w,10,90-p.x);
 patchPlacement(selectedPart,{[field]:p[field]});
 historyPush();populatePicker();
}
function discard(part){
 const key=cardKey(currentCard);
 const preset=baseLayout.cards[key];
 if(part){
  layout.cards[key]??={};
  if(preset?.[part])layout.cards[key][part]={...preset[part]};
  else delete layout.cards[key][part];
 }else if(preset)layout.cards[key]=JSON.parse(JSON.stringify(preset));
 else delete layout.cards[key];
 if(layout.cards[key]&&!Object.keys(layout.cards[key]).length)delete layout.cards[key];
 applyCSS();historyPush();render();
}
function installEvents(){
 ui.family.addEventListener("change",render);
 ui.picker.addEventListener("change",()=>{currentCard=cardFromKey(ui.picker.value)||currentCard;render()});
 ui.prev.addEventListener("click",()=>changeCard(-1));
 ui.next.addEventListener("click",()=>changeCard(1));
 ui.zoom.addEventListener("input",()=>{
  ui.frame.style.setProperty("--zoom",ui.zoom.value);
  $("#zoom-value").textContent=Math.round(Number(ui.zoom.value)*100)+"%";
 });
 ui.frame.style.setProperty("--zoom",ui.zoom.value);
 ui.host.addEventListener("pointermove",updatePointer);
 ui.host.addEventListener("pointerup",endPointer);
 ui.host.addEventListener("pointercancel",endPointer);
 $("#export").addEventListener("click",exportDraft);
 $("#import").addEventListener("click",()=>ui.file.click());
 ui.file.addEventListener("change",async()=>{
  const file=ui.file.files?.[0];
  if(!file)return;
  try{
   const parsed=normalizePlacements(JSON.parse(await file.text()));
   if(!confirm("Apply placements for "+Object.keys(parsed.cards).length+" imported cards over the initialized layouts?"))return;
   layout=mergeWithDefaults(parsed);snapshots=[JSON.stringify(layout)];historyIndex=0;
   applyCSS();localSave();render();showStatus();
  }catch(e){alert("Cannot import this layout: "+e.message);}
  finally{ui.file.value="";}
 });
 $("#reset-piece").addEventListener("click",()=>discard(selectedPart));
 $("#reset-card").addEventListener("click",()=>discard(null));
 ui.undo.addEventListener("click",()=>historyRestore(historyIndex-1));
 ui.redo.addEventListener("click",()=>historyRestore(historyIndex+1));
 for(const key of ["x","y","w","h","rotation","zIndex"]){
  $("#position-"+key).addEventListener("change",e=>applyNumber(key,Number(e.target.value)));
 }
 const angleSlider=$("#rotation-slider");
 angleSlider.addEventListener("input",e=>{
  if(!piece(selectedPart))return;
  patchPlacement(selectedPart,{rotation:Number(e.target.value)});
 });
 angleSlider.addEventListener("change",()=>{historyPush();populatePicker();});
 // Place the selected paper above or below its siblings in one click.
 function moveLayer(front){
  if(!piece(selectedPart))return;
  const selectedBox=piece(selectedPart).getBoundingClientRect();
  const overlaps=PARTS.filter(p=>p!==selectedPart&&piece(p)).filter(part=>{
   const box=piece(part).getBoundingClientRect();
   const dx=Math.min(box.right,selectedBox.right)-Math.max(box.left,selectedBox.left);
   const dy=Math.min(box.bottom,selectedBox.bottom)-Math.max(box.top,selectedBox.top);
   return dx>2&&dy>2;
  });
  // Put a piece immediately above or below the pieces it actually covers.
  // Unrelated pieces must not silently change its stacking order.
  const relevant=overlaps.length?overlaps:PARTS.filter(p=>p!==selectedPart&&piece(p));
  const others=relevant.map(p=>positionOf(p).zIndex);
  const current=positionOf(selectedPart).zIndex;
  const target=front?
   clamp(Math.max(current,...others.map(n=>n+1)),1,99):
   clamp(Math.min(current,...others.map(n=>n-1)),1,99);
  patchPlacement(selectedPart,{zIndex:target});
  historyPush();populatePicker();
 }
 $("#layer-ahead").addEventListener("click",()=>moveLayer(true));
 $("#layer-behind").addEventListener("click",()=>moveLayer(false));
 $("#reset-rotation").addEventListener("click",()=>{
  if(!piece(selectedPart))return;
  patchPlacement(selectedPart,{rotation:0});
  historyPush();populatePicker();
 });
 document.addEventListener("keydown",e=>{
  const input=e.target?.closest?.("input,select,textarea");
  if(input)return;
  if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==="z"){
   e.preventDefault();historyRestore(historyIndex+(e.shiftKey?1:-1));return;
  }
  if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==="y"){
   e.preventDefault();historyRestore(historyIndex+1);return;
  }
  const vector={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]}[e.key];
  if(!vector||!piece(selectedPart))return;
  e.preventDefault();
  const p=positionOf(selectedPart);
  const step=e.shiftKey?2:0.5;
  patchPlacement(selectedPart,{
   x:clamp(round(p.x+vector[0]*step),0,Math.max(0,90-p.w)),
   y:clamp(round(p.y+vector[1]*step),0,Math.max(0,130-p.h)),
   w:p.w
  });
  historyPush();populatePicker();
 });
}
async function initialise(){
 try{
  const response=await fetch("./data/card-placements.json",{cache:"no-store"});
  if(!response.ok)throw Error("HTTP "+response.status);
  baseLayout=normalizePlacements(await response.json());
  layout=JSON.parse(JSON.stringify(baseLayout));
 }catch(e){ui.warning.textContent="Could not load repository layouts: "+e.message;}
 try{
  const saved=localStorage.getItem(STORAGE);
  if(saved)layout=mergeWithDefaults(normalizePlacements(JSON.parse(saved)));
 }catch(e){ui.warning.textContent="Previous draft could not be opened: "+e.message;}
 snapshots=[JSON.stringify(layout)];historyIndex=0;
 applyCSS();installEvents();render();showStatus();
}
initialise();
