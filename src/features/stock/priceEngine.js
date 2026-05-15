const { stockSystem } = require("../../config");

function gaussian() {
  // Box-Muller
  let u1 = Math.random();
  let u2 = Math.random();
  if (u1 < Number.EPSILON) u1 = Number.EPSILON;
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

function roundPrice(p) {
  return Math.round(p * 10) / 10;
}

function calcMarketDrift(sentiment) {
  const drifts = stockSystem?.marketDrift || { bull: 0.001, bear: -0.001, sideways: 0 };
  if (sentiment === "bull") return drifts.bull ?? 0.001;
  if (sentiment === "bear") return drifts.bear ?? -0.001;
  return drifts.sideways ?? 0;
}

function nextPrice(lastPrice, sigma, drift, floor) {
  const epsilon = gaussian();
  const raw = lastPrice * (1 + (drift || 0) + (sigma || 0) * epsilon);
  return Math.max(floor || 1, roundPrice(raw));
}

function applyEvent(currentPrice, effectRate, floor) {
  const raw = currentPrice * (1 + (effectRate || 0));
  return Math.max(floor || 1, roundPrice(raw));
}

module.exports = {
  nextPrice,
  applyEvent,
  calcMarketDrift,
  roundPrice,
};
