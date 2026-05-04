// 21 點牌堆：1 副 52 張，每局 freshShuffledDeck() 重新洗。
// 牌的編碼：2 字元字串
//   rank: A 2 3 4 5 6 7 8 9 T J Q K
//   suit: S H D C  (♠♥♦♣)
//   例如 "AS" = A♠、"TD" = 10♦、"KH" = K♥

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

// Fisher–Yates 洗牌（in-place）。
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

// 從 deck 抽一張：不 mutate 原 array，回傳剩餘 deck（給 immutable state）。
function drawOne(deck) {
  if (!deck || deck.length === 0) {
    throw new Error("blackjack: deck is empty");
  }
  return { card: deck[0], deck: deck.slice(1) };
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
  freshShuffledDeck,
  drawOne,
  rankOf,
  suitOf,
};
