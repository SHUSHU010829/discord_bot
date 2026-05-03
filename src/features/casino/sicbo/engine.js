const { TOTAL_PAYOUTS } = require("./paytable");

// 結算單一注。
// 回傳 { won, payout, multiplier }
//   payout 是「拿回的總額」（含本金）；輸 = 0
//   multiplier 是純獎金倍率（不含本金），輸時為 0
function settleBet(bet, dice) {
  const sum = dice[0] + dice[1] + dice[2];
  const isTriple = dice[0] === dice[1] && dice[1] === dice[2];
  const amount = bet.amount;

  switch (bet.type) {
    case "big": {
      if (isTriple) return { won: false, payout: 0, multiplier: 0 };
      const won = sum >= 11;
      return won
        ? { won: true, payout: amount * 2, multiplier: 1 }
        : { won: false, payout: 0, multiplier: 0 };
    }

    case "small": {
      if (isTriple) return { won: false, payout: 0, multiplier: 0 };
      const won = sum <= 10;
      return won
        ? { won: true, payout: amount * 2, multiplier: 1 }
        : { won: false, payout: 0, multiplier: 0 };
    }

    case "single": {
      const count = dice.filter((d) => d === bet.value).length;
      if (count === 0) return { won: false, payout: 0, multiplier: 0 };
      return {
        won: true,
        payout: amount * (1 + count),
        multiplier: count,
      };
    }

    case "total": {
      if (sum !== bet.value) return { won: false, payout: 0, multiplier: 0 };
      const m = TOTAL_PAYOUTS[bet.value];
      if (!m) return { won: false, payout: 0, multiplier: 0 };
      return { won: true, payout: amount * (1 + m), multiplier: m };
    }

    case "double": {
      const c = dice.filter((d) => d === bet.value).length;
      return c >= 2
        ? { won: true, payout: amount * 11, multiplier: 10 }
        : { won: false, payout: 0, multiplier: 0 };
    }

    case "triple_specific": {
      return isTriple && dice[0] === bet.value
        ? { won: true, payout: amount * 181, multiplier: 180 }
        : { won: false, payout: 0, multiplier: 0 };
    }

    case "triple_any": {
      return isTriple
        ? { won: true, payout: amount * 31, multiplier: 30 }
        : { won: false, payout: 0, multiplier: 0 };
    }

    default:
      return { won: false, payout: 0, multiplier: 0 };
  }
}

function settleRound(bets, dice) {
  const results = bets.map((bet) => ({
    bet,
    ...settleBet(bet, dice),
  }));
  const totalBet = bets.reduce((s, b) => s + b.amount, 0);
  const totalPayout = results.reduce((s, r) => s + r.payout, 0);
  return { dice, totalBet, totalPayout, results };
}

module.exports = { settleBet, settleRound };
