// 德州撲克牌堆。共用 21 點的牌面編碼：
//   rank: A 2 3 4 5 6 7 8 9 T J Q K
//   suit: S H D C
//   "AS" = A♠

const SUITS = ["S", "H", "D", "C"];
const RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "T", "J", "Q", "K"];

function buildDeck() {
  const deck = [];
  for (const r of RANKS) {
    for (const s of SUITS) {
      deck.push(`${r}${s}`);
    }
  }
  return deck;
}

function shuffleInPlace(deck) {
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

function freshShuffledDeck() {
  return shuffleInPlace(buildDeck());
}

function rankOf(card) {
  return card[0];
}

function suitOf(card) {
  return card[1];
}

module.exports = {
  SUITS,
  RANKS,
  buildDeck,
  freshShuffledDeck,
  rankOf,
  suitOf,
};
