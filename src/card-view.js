import { CATALOGUE } from "./data.js";
import { illustration } from "./art.js";

// Shared presentation for play, card catalogue and A4 print sheets.
// No DOM access: output can be validated with plain Node tests.
export const CARD_WIDTH_MM = 90;
export const CARD_HEIGHT_MM = 140;
export const CARDS_PER_SHEET = 4;

export const escapeHtml = value => String(value ?? "").replace(/[&<>"']/g, char => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
}[char]));

export function cardNumber(card) {
  if (card.number != null) return String(card.number);
  const index = CATALOGUE.findIndex(item => item.type === card.type && item.id === card.id);
  return index < 0 ? "—" : String(index + 1).padStart(2, "0");
}

export function cardMarkup(card, opts = {}) {
  if (!card || !card.type || !card.title || !card.art) throw new TypeError("Invalid card");
  const esc = escapeHtml;
  const stats = card.type === "hero" || card.type === "monster"
    ? '<div class="game-card__stats" aria-label="Stats">' +
      '<span><b>' + Number(card.hp) + '</b> HP</span>' +
      '<span><b>' + Number(card.attack) + '</b> ATK</span>' +
      '<span><b>' + Number(card.defense) + '</b> DEF</span></div>'
    : "";
  const blessingTag = card.blessing ? '<span class="game-card__tag">' + esc(card.blessing.toUpperCase()) + '</span>' : "";
  const tag = card.terrain
    ? '<span class="game-card__tag">' + esc(card.terrain) + '</span>'
    : "";
  const body = card.type === "potion" && opts.effect
    ? "IDENTIFIED: " + esc(opts.effect.name.toUpperCase()) + "<br>" + esc(opts.effect.drink)
    : esc(card.rule || "");
  const index = cardNumber(card);
  const symbol = card.type === "monster" ? "!" : card.type === "room" ? "#" : card.type === "potion" ? "?" : "*";
  return '<article class="game-card game-card--' + esc(card.type) +
    '" data-card-id="' + esc(card.id || "") + '" aria-label="' + esc(card.title) + ' card">' +
    '<div class="game-card__meta"><span>RC / ' + esc(card.type.toUpperCase()) +
    '</span><span>NO. ' + esc(index) + '</span></div>' +
    '<h3 class="game-card__title">' + esc(card.title) + '</h3>' +
    '<div class="game-card__picture">' + illustration(card.art) +
    '<span class="picture-index" aria-hidden="true">' + symbol + '</span></div>' +
    stats + tag + blessingTag +
    '<div class="game-card__rule">' + body + '</div>' +
    '<div class="game-card__flavor">“' + esc(card.flavor || "Here lies trouble.") + '”</div>' +
    '</article>';
}

export function printSheets(cards) {
  if (!Array.isArray(cards)) throw new TypeError("Expected cards array");
  const chunks = [];
  for (let i = 0; i < cards.length; i += CARDS_PER_SHEET) {
    chunks.push('<section class="print-sheet" aria-label="Print sheet ' + (chunks.length + 1) +
      '" data-print-sheet="' + (chunks.length + 1) + '">' +
      cards.slice(i, i + CARDS_PER_SHEET).map(card => cardMarkup(card)).join("") +
      '</section>');
  }
  return '<div class="print-only" aria-hidden="true">' + chunks.join("") + '</div>';
}
