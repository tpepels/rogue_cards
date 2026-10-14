// Presets for new cards, inspired by the hand-positioned Veteran Warrior,
// Laughing Water and Antidote. No existing layout is ever overwritten.
// Only printed card text and stable IDs determine the automatic geometry.
const within=(n,a,b)=>Math.max(a,Math.min(b,n));
const dec=n=>Number(n.toFixed(2));
const variation=(id)=>{let h=2166136261;for(const c of id)h=Math.imul(h^c.charCodeAt(0),16777619)>>>0;return h;};
const little=(seed,n,span)=>((seed>>>n)%span);
const lines=(text,width,reserved=0)=>{
 const chars=Math.max(11,(width-reserved-2)/1.57);
 // A conservative estimate: paper uses bold Courier around 9-10px.
 return Math.max(1,Math.ceil(String(text||"").length/chars*1.07));
};
const outline=(card)=>{
 const v=card.v2,kind=v?.kind||card.type,roll=v?.roll?.outcomes||[];
 if(card.type==="hero"){
  return {
   lead:5+lines(v.trigger,38)*3,
   outcome:6+roll.reduce((s,r)=>s+(lines(r.effect,75,11)*2.9)+.9,0)
  };
 }
 if(card.type==="monster"){
  return {
   lead:6+card.behavior.reduce((s,text)=>s+3*lines(text,42,12)+.65,0),
   outcome:6+[v.weakness,v.parley,v.remains].reduce((s,text)=>s+2.9*lines(text,80)+1.2,0)
  };
 }
 if(card.type==="room"){
  const leadWidth=card.v2.choices.reduce((acc,c)=>acc+c.effect.length,0)>245?67:
   card.v2.choices.reduce((acc,c)=>acc+c.effect.length,0)>155?54:43;
  const h=5+3*lines(v.prompt,leadWidth)+v.choices.reduce((sum,c)=>sum+3.0*lines(c.effect,leadWidth,16)+1.0,0);
  return {
   lead:h,outcome:roll.length?5+roll.reduce((s,r)=>s+3.05*lines(r.effect,84,13)+.8,0):0,
   preferredLeadWidth:leadWidth
  };
 }
 const leadWidth=String(v.trigger).length>95?40:35;
 const lead=4+3.0*lines(v.trigger,leadWidth);
 let outcome=roll.length?5+roll.reduce((s,r)=>s+3.0*lines(r.effect,83,12)+.6,0):0;
 if(v.alternative)outcome+=3*lines(v.alternative,80)+2.4;
 return {lead,outcome,preferredLeadWidth:leadWidth};
};
export function initializeCardLayouts(cards,existing){
 const out=JSON.parse(JSON.stringify(existing));
 out.cards??={};
 for(const card of cards){
  const key=card.type+":"+card.id;
  if(out.cards[key])continue;
  const v=card.v2||{},hash=variation(key);
  const shift=little(hash,3,5)-2;
  const kind=v.kind||card.type;
  const titleLength=card.title.length;
  // Reading large typewritten names needs roughly 3.1mm per character.
  const width=within(11+titleLength*2.63,kind==="HERO"?47:30,kind==="HERO"?75:80);
  const hero=card.type==="hero",potion=card.type==="potion";
  const titleX=hero?15.5:2.5+little(hash,6,4)*.7;
  const titleY=hero?5:(width>66?13:8+little(hash,9,4)*.6);
  const titleWidth=within(width,30,90-titleX-2);
  const titleRotation=hero?1.5+(little(hash,13,5)-2)*.6:
   potion?-11+(little(hash,13,5)-2)*.55:
   -4+(little(hash,13,7)-3)*1.2;
  const title={x:dec(titleX),y:dec(titleY),w:dec(titleWidth),rotation:dec(titleRotation),zIndex:30};
  const o=outline(card),hasResults=card.type==="hero"||card.type==="monster"||!!v.roll||
   !!v.alternative; // The template renders a results paper only in these cases.
  const wRules=hero?33.5+(little(hash,5,4)-1)*2:
   potion?35+(little(hash,5,3)-1)*2:
   card.type==="monster"?42+(little(hash,5,3)-1)*2:
   card.type==="room"?o.preferredLeadWidth:
   o.preferredLeadWidth;
  const wResults=hero?77.5:potion?85:card.type==="monster"?80:card.type==="room"?84:83;
  const xResults=hero?2.5:potion?2.2:3;
  const resultsHeight=hasResults?o.outcome:0;
  const resultsY=hasResults?dec(within(122-resultsHeight,72,hero?100.5:potion?98:99)):null;
  const leadHeight=card.type==="room"&&o.preferredLeadWidth!==43?
   // Recalculate the leading slip at its actual width, not the default.
   o.lead:
   o.lead;
  const rightMargin=2.6;
  const rulesX=dec(90-wRules-rightMargin);
  const targetTop=hasResults?resultsY-leadHeight-1.8:121-leadHeight;
  const rulesY=dec(within(targetTop,Math.max(titleY+12,card.type==="monster"?41:35),hero?90:potion?93:92));
  const rules={
   x:rulesX,y:rulesY,w:dec(wRules),
   rotation:dec((hero?6.6:potion?2.5:3.2)+shift*.72),
   zIndex:31
  };
  const pieces={title,rules};
  if(hasResults){
   pieces.results={
    x:xResults,y:resultsY,w:wResults,
    rotation:dec(-3+(little(hash,18,7)-3)*.55),
    zIndex:21
   };
  }
  out.cards[key]=pieces;
 }
 return out;
}
