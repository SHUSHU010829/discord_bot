function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function rollThree() {
  return [randInt(1, 6), randInt(1, 6), randInt(1, 6)].sort((a, b) => a - b);
}

module.exports = { rollThree, randInt };
