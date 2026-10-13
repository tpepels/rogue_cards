import {CATALOGUE,CARD_WIDTH_MM,CARD_HEIGHT_MM,printDeck} from "./tabletop-data.js";
export {CARD_WIDTH_MM,CARD_HEIGHT_MM};
export const CARDS_PER_SHEET=4;
export const esc=value=>String(value??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));

/**
 * Treat card text as plain data. Escape each fragment before inserting semantic
 * emphasis; card content must never be interpreted as handwritten HTML.
 * Bold uses the existing Courier typeface (no reliance on synthetic italics).
 */
const MECHANIC_PATTERN=/\b(?:[1-9][0-9]*)?d(?:20|6)\b|\b(?:HP|ATK|DEF|WIT|ADV|DIS|POISONED|ELBERETH|TRAPDOOR|TRAP|OMEN|REROLL|SEAL|SMUGGLE|BARGAIN|UNTHRONE|CURSED|MAGIC|ALCHEMY|FIRE|ICE|LIGHTNING|METAL|SHRINE|LAIR|TREASURE|UPPER|MIDDLE|DEEP)\b/gi;
export function ruleMarkup(value){
 const raw=String(value??"");
 let html="",last=0;
 for(const match of raw.matchAll(MECHANIC_PATTERN)){
  const start=match.index,term=match[0],upper=term.toUpperCase();
  html+=esc(raw.slice(last,start));
  const kind=/^[0-9]*D(?:6|20)$/.test(upper)?"die":
   ["HP","ATK","DEF","WIT"].includes(upper)?"stat":
   ["ADV","DIS","POISONED","CURSED"].includes(upper)?"condition":"keyword";
  html+='<strong class="tt-mechanic tt-mechanic--'+kind+'">'+esc(term)+'</strong>';
  last=start+term.length;
 }
 return html+esc(raw.slice(last));
}


/** Exact canonical card-to-art assignment for the entire printed catalogue.
 * Artwork filenames are intentionally numbered, while card ids remain stable.
 * All entries must refer to a real file; tests enforce one-to-one coverage.
 */
export const CARD_ART=Object.freeze({
 "hero:warrior":"001_veteran_warrior.png",
 "hero:knight":"002_wandering_knight.png",
 "hero:wizard":"003_hedge_wizard.png",
 "hero:witch":"004_marsh_witch.png",
 "hero:rogue":"005_cutpurse.png",
 "hero:thief":"006_tunnel_thief.png",
 "hero:priest":"007_ash_priest.png",
 "hero:monk":"008_roadless_monk.png",
 "room:u-passage":"009_dripping_passage.png",
 "room:u-gate":"010_rusty_gate.png",
 "room:u-supply":"011_forgotten_supplies.png",
 "room:u-nest":"012_rat_nest.png",
 "room:u-shrine":"013_abandoned_shrine.png",
 "room:u-fall":"014_collapsing_stairs.png",
 "room:u-fountain":"015_laughing_fountain.png",
 "room:u-merchant":"016_merchant_in_a_sack.png",
 "room:u-lamp":"017_lamp_eater.png",
 "room:u-puppet":"018_the_puppet_judge.png",
 "room:u-bookcase":"019_bookcase_of_teeth.png",
 "room:u-mimic":"020_chest_with_a_pulse.png",
 "room:m-flood":"021_flooded_chamber.png",
 "room:m-statue":"022_stone_watcher.png",
 "room:m-vault":"023_buried_lockbox.png",
 "room:m-crypt":"024_opened_crypt.png",
 "room:m-fungus":"025_fungal_garden.png",
 "room:m-altar":"026_candle_altar.png",
 "room:m-bridge":"027_bridge_of_whispering_rope.png",
 "room:m-well":"028_the_bottomless_well.png",
 "room:m-auction":"029_ghostly_auction.png",
 "room:m-clock":"030_clockwork_confessional.png",
 "room:m-beetle":"031_beetle_caravan.png",
 "room:m-treasure":"032_treasure_that_sings.png",
 "room:d-shadow":"033_lightless_hall.png",
 "room:d-bridge":"034_broken_bridge.png",
 "room:d-reliquary":"035_lost_reliquary.png",
 "room:d-bones":"036_hall_of_teeth.png",
 "room:d-oracle":"037_broken_oracle.png",
 "room:d-gate":"038_warden_s_threshold.png",
 "room:d-mirror":"039_mirror_of_regrets.png",
 "room:d-mouth":"040_the_talking_door.png",
 "room:d-choir":"041_choir_of_mushrooms.png",
 "room:d-bazaar":"042_midnight_bazaar.png",
 "room:d-crown":"043_crown_of_the_unking.png",
 "room:d-last-chest":"044_the_last_chest.png",
 "room:vault":"045_the_amulet_vault.png",
 "monster:rat":"046_giant_rat.png",
 "monster:goblin":"047_goblin_raider.png",
 "monster:crawler":"048_sewer_crawler.png",
 "monster:bat":"049_cave_bat_swarm.png",
 "monster:troll":"050_bridge_troll.png",
 "monster:wisp":"051_will_o_wisp.png",
 "monster:eye":"052_floating_eye.png",
 "monster:mold":"053_living_mold.png",
 "monster:wraith":"054_restless_shade.png",
 "monster:rust":"055_rust_monster.png",
 "monster:cultist":"056_forgotten_acolyte.png",
 "monster:sentinel":"057_iron_sentinel.png",
 "monster:warden":"058_amulet_warden.png",
 "monster:warden-fury":"059_warden_unbound.png",
 "item:key":"060_rusty_key.png",
 "item:rope":"061_knotted_rope.png",
 "item:torch":"062_pitch_torch.png",
 "item:crowbar":"063_dented_crowbar.png",
 "item:chalk":"064_chalk_of_detours.png",
 "item:spore-jar":"065_spore_jar.png",
 "item:coin":"066_ghost_coin.png",
 "item:needle":"067_bone_needle.png",
 "item:sword":"068_notched_sword.png",
 "item:staff":"069_ashwood_staff.png",
 "item:cursed-blade":"070_whispering_blade.png",
 "item:mail":"071_patchwork_mail.png",
 "item:shield":"072_warded_shield.png",
 "item:cursed-mail":"073_burial_mail.png",
 "item:dog":"074_loyal_hound.png",
 "item:raven":"075_tunnel_raven.png",
 "item:moth":"076_coffin_moth.png",
 "item:goblin-pet":"077_pocket_goblin.png",
 "item:mirror":"078_mirror_shard_of_yesterday.png",
 "item:skull":"079_very_helpful_skull.png",
 "item:lantern-heart":"080_lantern_heart.png",
 "item:crown-relic":"081_crown_of_rehearsals.png",
 "item:scroll-flame":"082_scroll_of_cinder.png",
 "item:scroll-frost":"083_scroll_of_hush.png",
 "item:scroll-lightning":"084_scroll_of_storm_teeth.png",
 "item:scroll-unlock":"085_scroll_of_unsealing.png",
 "item:scroll-reveal":"086_scroll_of_third_sight.png",
 "item:scroll-banish":"087_scroll_of_go_away.png",
 "item:scroll-mischief":"088_scroll_of_misprint.png",
 "item:scroll-last":"089_scroll_of_the_last_word.png",
 "item:ring-luck":"090_ring_of_crooked_luck.png",
 "item:ring-bargain":"091_ring_of_small_deals.png",
 "item:ring-eye":"092_ring_of_the_sideways_eye.png",
 "item:ring-spores":"093_ring_of_the_mold_king.png",
 "item:ring-hunger":"094_hungry_ring.png",
 "item:ring-ashes":"095_ring_of_embers.png",
 "item:ring-echo":"096_ring_of_echoes.png",
 "item:wand-sparks":"097_wand_of_impolite_sparks.png",
 "item:wand-undo":"098_wand_of_undoing.png",
 "item:wand-morph":"099_wand_of_questionable_shapes.png",
 "item:wand-turn":"100_wand_of_turning.png",
 "item:wand-market":"101_wand_of_bad_trades.png",
 "item:wand-frost":"102_wand_of_cold_shoulders.png",
 "item:wand-door":"103_wand_of_almost_doors.png",
 "potion:smoky":"104_smoky_potion.png",
 "potion:milky":"105_milky_potion.png",
 "potion:amber":"106_amber_potion.png",
 "potion:fizzy":"107_fizzy_potion.png",
 "potion:mushroom":"108_mushroom_tea.png",
 "potion:midnight":"109_midnight_ink.png",
 "potion:antidote":"110_antidote.png",
 "potion:laughing":"111_laughing_water.png",
 "room:u-cartographer":"130_the_blind_cartographer.png",
 "room:u-hollow-knight":"131_the_hollow_knight.png",
 "room:u-scribe-dust":"132_the_scribe_of_dust.png",
 "room:u-bone-seed":"133_the_unburied_seed.png",
 "room:m-ferryman-oath":"134_the_ferryman_s_oath.png",
 "room:m-choir-nails":"135_choir_of_nails.png",
 "room:m-hourglass":"136_the_inverted_hourglass.png",
 "room:m-drowned-banner":"137_the_drowned_banner.png",
 "room:d-sleeping-crown":"138_the_sleeping_crown.png",
 "room:d-last-witness":"139_the_last_witness.png",
 "room:u-fork":"112_forked_passage.png",
 "room:u-echoes":"113_hall_of_three_echoes.png",
 "room:u-mossy":"114_mossy_switchback.png",
 "room:u-smuggler":"115_smuggler_s_crawl.png",
 "room:u-candle":"116_candle_tunnel.png",
 "room:m-maps":"117_gallery_of_cracked_maps.png",
 "room:m-ladder":"118_rope_ladder_junction.png",
 "room:m-red-detour":"119_the_red_detour.png",
 "room:d-whisper-junction":"120_whispering_junction.png",
 "room:d-gilded":"121_gilded_hallway.png",
 "room:u-lantern-shrine":"122_lantern_shrine.png",
 "room:u-leech-pool":"123_leech_pool.png",
 "room:u-rat-favor":"124_rat_king_s_favor.png",
 "room:m-second-name":"125_shrine_of_the_second_name.png",
 "room:m-wax-bridge":"126_wax_bridge.png",
 "room:m-hungry-door":"127_the_hungry_door.png",
 "room:d-apothecary":"128_forgotten_apothecary.png",
 "room:d-last-bell":"129_chapel_of_the_last_bell.png"
});
/** Fixed plate offsets for print reproducibility, not CSS randomness or game state.
 * Identical cards share an intentional slightly imperfect edition mark.
 */
export function printPlate(card){
 const key=card.type+":"+card.id;
 let hash=2166136261;
 for(const char of key)hash=Math.imul(hash^char.charCodeAt(0),16777619)>>>0;
 return ["a","b","c","d"][hash%4];
}
export const assetPath=card=>{
 const file=CARD_ART[card.type+":"+card.id];
 return file?"./assets/illustrations/"+file:null;
};

/** The one physical edition uses one renderer per card family. */
export function composition(card){
 if(!card?.v2)throw new TypeError("Unknown canonical card");
 const layout={hero:"v2-hero",room:"v2-room",monster:"v2-monster",item:"v2-object",potion:"v2-object"}[card.type];
 if(!layout)throw new TypeError("Unknown card type: "+card.type);
 return layout;
}
function visual(card){
 const asset=assetPath(card);
 if(!asset)throw new Error("Missing card illustration: "+card.type+":"+card.id);
 // The illustrations themselves already carry the intentionally rough
 // spot-color print texture. Never substitute the legacy ink SVGs.
 return '<div class="tt-illustration"><img class="tt-art-image" src="'+esc(asset)+
  '" alt="" loading="eager" decoding="async"></div>';
}
function stats(card){
 if(card.type!=="hero"&&card.type!=="monster")return "";
 const values=[["HP",card.hp,"♥"],["ATK","+"+card.atk,"⚔"],["DEF","+"+card.def,"⬟"],
 ...(card.type==="hero"?[["WIT","+"+card.wit,"✶"]]:[])];
 return '<div class="tt-stats" aria-label="Printed character statistics">'+values.map(([name,value,mark])=>
  '<div class="tt-stat"><span class="tt-stat-symbol" aria-hidden="true">'+mark+'</span><b>'+esc(value)+'</b><small>'+esc(name)+'</small></div>').join("")+'</div>';
}
function content(card,{sidebar=false}={}){
 if(card.type==="hero"&&card.v2){
  const v=card.v2;
  return '<section class="tt-content tt-content--v2-hero" aria-label="Hero ability and starting equipment">'+
   '<div class="tt-slip tt-slip--lead"><div class="tt-v2-hero-start">START WITH: '+esc(v.starter.toUpperCase())+' + 1 RANDOM OBJECT</div>'+
   '<p class="tt-v2-hero-trigger">'+ruleMarkup(v.trigger)+'</p></div>'+
   '<div class="tt-slip tt-slip--results"><div class="tt-v2-results">'+v.roll.outcomes.map(o=>
    '<div class="tt-v2-result"><b>'+esc(o.range)+'</b><span>'+ruleMarkup(o.effect)+'</span></div>').join("")+'</div></div></section>';
 }
 if(card.type==="monster"&&card.v2){
  const v=card.v2;
  return '<section class="tt-content tt-content--v2-monster" aria-label="Monster dice, weakness and bargain">'+
   '<div class="tt-slip tt-slip--lead"><div class="tt-v2-monster-head">'+(v.phase?'PHASE '+(v.phase===1?'I':'II')+' · ':'')+'BEHAVIOUR · ROLL d6 AFTER EACH HERO TURN</div>'+
   '<div class="tt-v2-monster-rows">'+card.behavior.map((effect,i)=>
     '<div class="tt-v2-result"><b>'+["1–2","3–4","5","6"][i]+'</b><span>'+ruleMarkup(effect)+'</span></div>').join("")+'</div></div>'+
   '<div class="tt-slip tt-slip--results"><p class="tt-v2-monster-rule"><b>WEAKNESS — </b>'+ruleMarkup(v.weakness)+'</p>'+
   '<p class="tt-v2-monster-rule"><b>PARLEY — </b>'+ruleMarkup(v.parley)+'</p>'+
   '<p class="tt-v2-monster-remains"><b>REMAINS — </b>'+ruleMarkup(v.remains)+'</p></div></section>';
 }
 if(card.v2&&(card.type==="item"||card.type==="potion")){
  const v=card.v2;
  const tags=v.tags.map(tag=>'<span class="tt-v2-tag">'+esc(tag)+'</span>').join("");
  const dice=v.roll
   ?'<div class="tt-v2-roll-heading">ROLL d6</div>'+
    '<div class="tt-v2-results">'+v.roll.outcomes.map(row=>
      '<div class="tt-v2-result"><b>'+esc(row.range)+'</b><span>'+ruleMarkup(row.effect)+'</span></div>').join("")+'</div>'
   :"";
  return '<section class="tt-content tt-content--v2 tt-content--v2-object" aria-label="Item effects and roll ranges">'+
   '<div class="tt-slip tt-slip--lead"><div class="tt-v2-kind">'+esc(v.kind)+' <span class="tt-v2-tags">'+tags+'</span></div>'+
   '<p class="tt-v2-trigger">'+ruleMarkup(v.trigger)+'</p></div>'+
   ((dice||v.alternative||card.type==="potion")?'<div class="tt-slip tt-slip--results">'+
   dice+(v.alternative?'<div class="tt-v2-alternative">'+ruleMarkup(v.alternative)+'</div>':"")+

   '</div>':"")+'</section>';
 }
 if(card.v2&&card.type==="room"){
  const v=card.v2;
  const choices=v.choices.map(choice=>'<div class="tt-v2-choice"><b>'+esc(choice.label)+'</b><span>'+ruleMarkup(choice.effect)+'</span></div>').join("");
  const results=(v.roll?.outcomes||[]).map(outcome=>'<div class="tt-v2-result"><b>'+esc(outcome.range)+'</b><span>'+ruleMarkup(outcome.effect)+'</span></div>').join("");
  return '<section class="tt-content tt-content--v2" aria-label="Room choices and d6 results">'+
   '<div class="tt-slip tt-slip--lead"><div class="tt-v2-kind">'+esc(v.kind)+' <span>CHOOSE ONE</span></div>'+
   '<p class="tt-v2-prompt">'+ruleMarkup(v.prompt)+'</p>'+
   '<div class="tt-v2-choices">'+choices+'</div></div>'+
   (v.roll?'<div class="tt-slip tt-slip--results"><div class="tt-v2-roll-heading">'+esc(v.roll.label)+' · ROLL '+esc(v.roll.die)+'</div>'+
   '<div class="tt-v2-results">'+results+'</div></div>':'')+'</section>';
 }
 throw new TypeError("No canonical card effects: "+card.type);
}
export function cardMarkup(card){
 if(!card||!card.type||!card.title||!card.art)throw new TypeError("Invalid tabletop card");
 const index=card.v2?.number??(CATALOGUE.findIndex(c=>c.id===card.id&&c.type===card.type)+1);
 const type=esc(card.type), layout=composition(card),asset=assetPath(card),plate=printPlate(card);
 const stage=card.stage?'<span class="tt-depth" aria-label="Depth '+esc(card.stage)+'">'+esc(card.stage)+'</span>':"";
 const titleBand=card.title.length>22?"long":"short";
 const label='<h2 class="tt-title"><span>'+esc(card.title)+'</span></h2>';
 const typeStamp='<span class="tt-card-kind" aria-hidden="true">'+esc(card.v2?.kind||card.type).replaceAll("EQUIPMENT","GEAR")+'</span>';
 let middle;
 // The print plate and paste-on rule paper share one overlapping collage plane.
 // Neither is a browser background: the art is a genuine illustrated card layer.
 middle='<div class="tt-collage" aria-label="Illustration with pasted game instructions">'+
   '<div class="tt-visual">'+visual(card)+stats(card)+'</div>'+
   content(card)+'</div>';
 return '<article class="tt-card tt-paper-collage tt-'+type+' tt-layout-'+layout+
  ' tt-plate-'+plate+(asset?' tt-has-art':' tt-needs-art')+
  '" data-title-band="'+titleBand+'" data-v2-kind="'+esc(card.v2?.kind||"")+'" data-assembly="collage" data-paste="'+plate+'" data-plate="'+plate+'" data-type="'+type+'" data-id="'+esc(card.id)+'" data-layout="'+layout+
  '" data-art-file="'+esc(asset||"")+'" data-art-status="'+(asset?'generated':'placeholder')+
  '" aria-label="'+esc(card.title)+' card">'+
  label+typeStamp+middle+
  '<footer class="tt-footer"><i>'+esc(card.flavor||"")+'</i>'+
  '<span class="tt-footer-meta">'+stage+'<span class="tt-footer-number">No. '+
  String(index).padStart(2,"0")+'</span></span></footer></article>';
}
export function printSheets(cards=printDeck("all")){
 if(!Array.isArray(cards))throw new TypeError("Expected a physical card list");
 const pages=[];
 for(let i=0;i<cards.length;i+=CARDS_PER_SHEET){
  pages.push('<section class="tt-sheet" aria-label="Print sheet '+(pages.length+1)+'">'+cards.slice(i,i+CARDS_PER_SHEET).map(cardMarkup).join("")+'</section>');
 }
 return pages.join("");
}
