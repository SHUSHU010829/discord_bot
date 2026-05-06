const path = require('path');
const axios = require('axios');
const { createCanvas, loadImage, registerFont } = require('canvas');
const GIFEncoder = require('gif-encoder-2');
const { Resvg } = require('@resvg/resvg-js');

const { SYMBOLS } = require('../features/casino/slot/paytable');

// ─── Fonts ───────────────────────────────────────────────────────────────────
const FONT_DIR = path.join(__dirname, '../../fonts');
let fontsLoaded = false;
function ensureFonts() {
  if (fontsLoaded) return;
  registerFont(path.join(FONT_DIR, 'NotoSansJP-Black.otf'),  { family: 'NotoSans', weight: '900' });
  registerFont(path.join(FONT_DIR, 'NotoSansJP-Medium.otf'), { family: 'NotoSans', weight: '500' });
  fontsLoaded = true;
}

// ─── Emoji rasterizer (twemoji SVG → PNG → canvas Image) ─────────────────────
const EMOJI_IMG_CACHE = new Map();
const TWEMOJI_VERSION = '14.0.2';
const EMOJI_RENDER_PX = 256; // raster size; downscaled when drawn

function toCodePoint(emoji) {
  const codes = [];
  for (const ch of emoji) {
    const cp = ch.codePointAt(0);
    if (cp === 0xfe0f) continue;
    codes.push(cp.toString(16));
  }
  return codes.join('-');
}

async function getEmojiImage(emoji) {
  if (EMOJI_IMG_CACHE.has(emoji)) return EMOJI_IMG_CACHE.get(emoji);
  const code = toCodePoint(emoji);
  if (!code) return null;
  try {
    const url = `https://cdn.jsdelivr.net/gh/twitter/twemoji@${TWEMOJI_VERSION}/assets/svg/${code}.svg`;
    const res = await axios.get(url, { responseType: 'arraybuffer', timeout: 5000 });
    const png = new Resvg(Buffer.from(res.data), {
      fitTo: { mode: 'width', value: EMOJI_RENDER_PX },
    }).render().asPng();
    const img = await loadImage(Buffer.from(png));
    EMOJI_IMG_CACHE.set(emoji, img);
    return img;
  } catch (_) {
    EMOJI_IMG_CACHE.set(emoji, null);
    return null;
  }
}

// ─── Canvas layout ───────────────────────────────────────────────────────────
const W = 1080;
const H = 680;

const PALETTE = {
  card:   '#F4ECD8',
  ink:    '#2A2420',
  muted:  '#A89270',
  reelBg: '#E8DFC8',
  gold:   '#D4A437',
  red:    '#C9302C',
  teal:   '#3D6F6A',
  win:    '#2D7A4A',
  loss:   '#888888',
};

function pickAccent(matchType) {
  switch (matchType) {
    case 'jackpot':       return PALETTE.gold;
    case 'triple':
    case 'double_cherry': return PALETTE.red;
    case 'double':        return PALETTE.teal;
    default:              return PALETTE.muted;
  }
}

function buildHeadline(matchType) {
  switch (matchType) {
    case 'jackpot':       return { left: '🎉', text: 'JACKPOT',  right: '🎉' };
    case 'triple':        return { left: '🎊', text: '三連線中獎', right: null };
    case 'double_cherry': return { left: '🍒', text: '兩個櫻桃',   right: null };
    case 'double':        return { left: '✨', text: '兩個一樣',   right: null };
    default:              return { left: '💸', text: 'NO MATCH', right: null };
  }
}

// ─── Reel strip ──────────────────────────────────────────────────────────────
const STRIP = SYMBOLS;                       // 6 entries
const CELL = 200;                            // reel viewport size (px)
const STRIP_H = STRIP.length * CELL;         // 1200
const REEL_GAP = 16;
const REELS_TOTAL_W = 3 * CELL + 2 * REEL_GAP;

// ─── Math helpers ────────────────────────────────────────────────────────────
function easeOut3(t) { return 1 - Math.pow(1 - t, 3); }
function clamp01(t)  { return Math.max(0, Math.min(1, t)); }
function mod(n, m)   { return ((n % m) + m) % m; }

// ─── Drawing primitives ──────────────────────────────────────────────────────
function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.lineTo(x + w - rr, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
  ctx.lineTo(x + w, y + h - rr);
  ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
  ctx.lineTo(x + rr, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
  ctx.lineTo(x, y + rr);
  ctx.quadraticCurveTo(x, y, x + rr, y);
  ctx.closePath();
}

function dashedLine(ctx, x1, y1, x2, y2, color, dash = [5, 5]) {
  ctx.save();
  ctx.setLineDash(dash);
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.restore();
}

// Fallback colors when twemoji CDN is unreachable — keep reels readable.
const EMOJI_FALLBACK = {
  '🍒': { bg: '#C9302C', label: 'CH' },
  '🍋': { bg: '#E0B53D', label: 'LM' },
  '🍉': { bg: '#3D8C5C', label: 'WM' },
  '🔔': { bg: '#D4A437', label: 'BL' },
  '⭐': { bg: '#E8B11C', label: 'ST' },
  '7️⃣': { bg: '#2A2420', label: '7' },
  '🎉': { bg: '#D4A437', label: '!' },
  '🎊': { bg: '#C9302C', label: '!' },
  '✨': { bg: '#3D6F6A', label: '*' },
  '💸': { bg: '#A89270', label: '$' },
  '💰': { bg: '#D4A437', label: '$' },
};

function drawEmoji(ctx, emoji, cx, cy, size) {
  const img = EMOJI_IMG_CACHE.get(emoji);
  if (img) {
    ctx.drawImage(img, cx - size / 2, cy - size / 2, size, size);
    return;
  }
  const fb = EMOJI_FALLBACK[emoji];
  if (!fb) return;
  ctx.save();
  ctx.fillStyle = fb.bg;
  ctx.beginPath();
  ctx.arc(cx, cy, size / 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.font = `900 ${Math.round(size * 0.45)}px NotoSans`;
  ctx.fillStyle = '#FFFFFF';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(fb.label, cx, cy + 1);
  ctx.restore();
}

// ─── Static frame chrome ─────────────────────────────────────────────────────
function drawBackground(ctx) {
  ctx.fillStyle = PALETTE.card;
  ctx.fillRect(0, 0, W, H);
}

function drawCardFrame(ctx) {
  // Outer card panel
  const x = 24, y = 24, w = W - 48, h = H - 48;
  ctx.fillStyle = PALETTE.card;
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = PALETTE.ink;
  ctx.lineWidth = 3;
  ctx.strokeRect(x + 1.5, y + 1.5, w - 3, h - 3);
}

function drawHeader(ctx, accent) {
  const x = 71, y = 59;
  // Badge
  ctx.fillStyle = accent;
  ctx.fillRect(x, y, 64, 64);
  ctx.strokeStyle = PALETTE.ink;
  ctx.lineWidth = 3;
  ctx.strokeRect(x + 1.5, y + 1.5, 61, 61);

  ctx.font = '900 36px NotoSans';
  ctx.fillStyle = PALETTE.card;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('霸', x + 32, y + 36);

  // Title
  ctx.font = '900 44px NotoSans';
  ctx.fillStyle = PALETTE.ink;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText('SLOT MACHINE', x + 64 + 20, y + 34);

  // Right chip
  const chipText = '逼逼賭場';
  ctx.font = '500 18px NotoSans';
  const chipW = ctx.measureText(chipText).width + 36;
  const chipH = 36;
  const chipX = W - 71 - chipW;
  const chipY = y + 32 - chipH / 2;
  ctx.fillStyle = PALETTE.ink;
  ctx.fillRect(chipX, chipY, chipW, chipH);
  ctx.fillStyle = PALETTE.card;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(chipText, chipX + chipW / 2, chipY + chipH / 2 + 1);
}

function drawJackpotBanner(ctx, jackpotPool, jackpotBust, isBust) {
  const x = 71, y = 158, w = W - 71 * 2, h = 52;
  const bg = isBust ? PALETTE.gold : PALETTE.reelBg;

  ctx.fillStyle = bg;
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = PALETTE.ink;
  ctx.lineWidth = 2;
  ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);

  // Left: 💰 + label
  drawEmoji(ctx, '💰', x + 24, y + h / 2, 26);
  ctx.font = '500 14px NotoSans';
  ctx.fillStyle = PALETTE.ink;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  const label = isBust ? 'JACKPOT BUSTED!' : 'JACKPOT POOL';
  // letter-spacing emulation
  let lx = x + 44;
  for (const ch of label) {
    ctx.fillText(ch, lx, y + h / 2 + 1);
    lx += ctx.measureText(ch).width + 5;
  }

  // Right: amount
  ctx.font = '900 30px NotoSans';
  ctx.fillStyle = PALETTE.ink;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  const amount = isBust
    ? `+${jackpotBust.toLocaleString()}`
    : jackpotPool.toLocaleString();
  ctx.fillText(amount, x + w - 18, y + h / 2 + 1);
}

function drawReelBox(ctx, rx, ry, offset, accent, highlight, pulse) {
  // Background
  ctx.fillStyle = PALETTE.reelBg;
  ctx.fillRect(rx, ry, CELL, CELL);

  // Symbols (clipped)
  ctx.save();
  ctx.beginPath();
  ctx.rect(rx, ry, CELL, CELL);
  ctx.clip();

  const off = mod(offset, STRIP_H);
  const baseI = Math.floor(off / CELL);
  for (let k = -1; k <= 2; k++) {
    const i = mod(baseI + k, STRIP.length);
    const sym = STRIP[i];
    const cy = ry + CELL / 2 + ((baseI + k) * CELL - off);
    drawEmoji(ctx, sym.emoji, rx + CELL / 2, cy, 130);
  }

  ctx.restore();

  // Frame (with optional pulsing highlight)
  if (highlight) {
    const w = 4 + 2 * pulse;
    ctx.strokeStyle = accent;
    ctx.lineWidth = w;
    ctx.strokeRect(rx + w / 2, ry + w / 2, CELL - w, CELL - w);
  } else {
    ctx.strokeStyle = PALETTE.ink;
    ctx.lineWidth = 3;
    ctx.strokeRect(rx + 1.5, ry + 1.5, CELL - 3, CELL - 3);
  }
}

function drawHeadline(ctx, headline, color, cx, cy, size, weight, gap = 12) {
  ctx.textBaseline = 'middle';
  ctx.font = `${weight} ${size}px NotoSans`;
  const textW = ctx.measureText(headline.text).width + (size * 0.05) * (headline.text.length - 1);
  const emojiSize = Math.round(size * 1.05);
  const leftW = headline.left ? emojiSize + gap : 0;
  const rightW = headline.right ? emojiSize + gap : 0;
  const totalW = leftW + textW + rightW;

  let x = cx - totalW / 2;
  if (headline.left) {
    drawEmoji(ctx, headline.left, x + emojiSize / 2, cy, emojiSize);
    x += leftW;
  }

  ctx.fillStyle = color;
  ctx.textAlign = 'left';
  ctx.fillText(headline.text, x, cy + 1);
  x += textW;

  if (headline.right) {
    drawEmoji(ctx, headline.right, x + gap + emojiSize / 2, cy, emojiSize);
  }
}

function drawResultPanel(ctx, opts) {
  const { phase, matchType, payout, accent, areaY, areaH } = opts;
  const cx = W / 2;

  if (phase === 'spinning') {
    ctx.font = '500 26px NotoSans';
    ctx.fillStyle = PALETTE.muted;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    let lx = cx - 100;
    const label = 'SPINNING...';
    const tw = ctx.measureText(label).width + 4 * (label.length - 1);
    let cursor = cx - tw / 2;
    for (const ch of label) {
      ctx.fillText(ch, cursor + ctx.measureText(ch).width / 2, areaY + areaH / 2);
      cursor += ctx.measureText(ch).width + 4;
    }
    return;
  }

  const headline = buildHeadline(matchType);
  if (payout > 0) {
    const headlineY = areaY + 38;
    const payoutY   = areaY + areaH - 50;
    drawHeadline(ctx, headline, accent, cx, headlineY, 30, '900', 12);

    ctx.font = '900 84px NotoSans';
    ctx.fillStyle = accent;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const numText = `＋${payout.toLocaleString()}`;
    ctx.fillText(numText, cx, payoutY);
  } else {
    drawHeadline(ctx, headline, PALETTE.muted, cx, areaY + areaH / 2, 48, '900', 16);
  }
}

function drawFooter(ctx, opts) {
  const { bet, balance, multiplier, won, username } = opts;
  const y = 612;

  // Dashed separator above
  dashedLine(ctx, 71, y - 26, W - 71, y - 26, PALETTE.muted, [3, 4]);

  ctx.textBaseline = 'middle';

  // BET
  ctx.font = '500 13px NotoSans';
  ctx.fillStyle = PALETTE.muted;
  ctx.textAlign = 'left';
  let lx = 71;
  for (const ch of 'BET') {
    ctx.fillText(ch, lx, y);
    lx += ctx.measureText(ch).width + 5;
  }

  ctx.font = '900 24px NotoSans';
  ctx.fillStyle = PALETTE.ink;
  const betText = bet.toLocaleString();
  ctx.fillText(betText, 71 + 38, y);

  if (won) {
    const betW = ctx.measureText(betText).width;
    ctx.font = '500 13px NotoSans';
    ctx.fillStyle = PALETTE.muted;
    let mx = 71 + 38 + betW + 14;
    for (const ch of `×${multiplier}`) {
      ctx.fillText(ch, mx, y);
      mx += ctx.measureText(ch).width + 3;
    }
  }

  // BALANCE (centered)
  ctx.font = '500 13px NotoSans';
  ctx.fillStyle = PALETTE.muted;
  const balLabel = 'BALANCE';
  ctx.font = '900 24px NotoSans';
  const balValueText = balance.toLocaleString();
  const balValueW = ctx.measureText(balValueText).width;

  ctx.font = '500 13px NotoSans';
  let balLabelW = 0;
  for (const ch of balLabel) balLabelW += ctx.measureText(ch).width + 5;
  balLabelW -= 5;

  const balTotalW = balLabelW + 12 + balValueW;
  let bx = W / 2 - balTotalW / 2;

  ctx.textAlign = 'left';
  ctx.fillStyle = PALETTE.muted;
  for (const ch of balLabel) {
    ctx.fillText(ch, bx, y);
    bx += ctx.measureText(ch).width + 5;
  }
  bx += 7;
  ctx.font = '900 24px NotoSans';
  ctx.fillStyle = PALETTE.ink;
  ctx.fillText(balValueText, bx, y);

  // Username (right)
  const handle = `@${(username || 'shushu').toUpperCase()}`;
  ctx.font = '500 14px NotoSans';
  ctx.fillStyle = PALETTE.ink;
  ctx.textAlign = 'right';
  let hx = W - 71;
  // letter-spacing right-aligned: render right-to-left
  const chars = [...handle];
  for (let i = chars.length - 1; i >= 0; i--) {
    const w = ctx.measureText(chars[i]).width;
    ctx.fillText(chars[i], hx, y);
    hx -= w + 5;
  }
}

// ─── Reel state machine ──────────────────────────────────────────────────────
function buildReelPlan({ reels, totalFrames }) {
  // Phase frame budgets per reel (total must fit within totalFrames).
  // Reels stop in sequence: left → middle → right.
  const SPIN_BASE   = 10;  // reel 0 spin frames
  const SPIN_DELTA  = 3;   // each subsequent reel spins this many extra frames
  const SETTLE_LEN  = 6;
  const SPIN_SPEED  = 110; // px / frame during free spin

  const plans = reels.map((r, idx) => {
    const targetIdx = STRIP.findIndex((s) => s.id === r.id);
    const spinFrames = SPIN_BASE + idx * SPIN_DELTA;
    const settleStart = spinFrames;
    const settleEnd   = settleStart + SETTLE_LEN; // exclusive
    const startOffset = idx * 137; // visually de-sync the reels
    return {
      targetIdx,
      spinFrames,
      settleStart,
      settleEnd,
      startOffset,
    };
  });

  // Pre-compute per-reel spin-end & target offsets so `settle` can interpolate.
  for (const p of plans) {
    p.spinEndOffset = p.startOffset + p.spinFrames * SPIN_SPEED;

    // Pick a target offset >= spinEndOffset + STRIP_H (≥ one extra wrap),
    // landing exactly on `targetIdx`.
    const minOff = p.spinEndOffset + STRIP_H;
    const wraps = Math.ceil((minOff - p.targetIdx * CELL) / STRIP_H);
    p.finalOffset = wraps * STRIP_H + p.targetIdx * CELL;
  }

  const allStoppedAt = Math.max(...plans.map((p) => p.settleEnd));
  const revealStart = allStoppedAt;
  const holdFrames = totalFrames - revealStart;

  return { plans, spinSpeed: SPIN_SPEED, revealStart, holdFrames };
}

function reelOffsetAtFrame(plan, f, spinSpeed) {
  if (f < plan.settleStart) {
    return plan.startOffset + f * spinSpeed;
  }
  if (f < plan.settleEnd) {
    const t = (f - plan.settleStart) / (plan.settleEnd - plan.settleStart);
    const e = easeOut3(clamp01(t));
    return plan.spinEndOffset + (plan.finalOffset - plan.spinEndOffset) * e;
  }
  return plan.finalOffset;
}

// ─── Main export ─────────────────────────────────────────────────────────────

/**
 * @param {object} data
 * @param {string} data.username
 * @param {Array<{id:string, emoji:string}>} data.reels
 * @param {string} data.matchType   - jackpot|triple|double_cherry|double|none
 * @param {string|null} data.matchedSymbol
 * @param {number} data.bet
 * @param {number} data.payout      - total payout (base + jackpot bust)
 * @param {number} data.multiplier
 * @param {number} data.balance
 * @param {number|null} [data.jackpotPool]
 * @param {number} [data.jackpotBust]
 * @returns {Promise<Buffer>}
 */
async function generateSlotGif(data) {
  ensureFonts();

  // Collect every emoji we might draw and preload their twemoji raster.
  const emojisNeeded = new Set([
    ...SYMBOLS.map((s) => s.emoji),
    '🎉', '🎊', '🍒', '✨', '💸',
    ...(data.jackpotPool != null ? ['💰'] : []),
  ]);
  await Promise.all([...emojisNeeded].map(getEmojiImage));

  const accent = pickAccent(data.matchType);
  const won = data.payout > 0;
  const isBust = data.matchType === 'jackpot' && (data.jackpotBust || 0) > 0;
  const showJackpotBanner = data.jackpotPool != null;

  const reelsY = showJackpotBanner ? 226 : 174;
  const reelsX0 = (W - REELS_TOTAL_W) / 2;

  const resultAreaY = reelsY + CELL + 16;
  const resultAreaH = 612 - 32 - resultAreaY;

  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');

  // Frame budget. Tuned so the GIF wraps just under 2s including hold.
  const TOTAL_FRAMES = 27;
  const FRAME_DELAY  = 50;     // 20 fps
  const HOLD_DELAY   = 140;    // slow down toward the end so people read result

  const { plans, spinSpeed, revealStart } =
    buildReelPlan({ reels: data.reels, totalFrames: TOTAL_FRAMES });

  const encoder = new GIFEncoder(W, H, 'neuquant', true, TOTAL_FRAMES);
  encoder.setRepeat(0);
  encoder.setQuality(20);
  encoder.start();

  // Yield event loop occasionally — same trick as roulette gif.
  const YIELD_EVERY = 4;
  let frameCount = 0;

  for (let f = 0; f < TOTAL_FRAMES; f++) {
    const inReveal = f >= revealStart;

    // Per-frame delay (longer on final frames so the result lingers).
    if (f === TOTAL_FRAMES - 1)         encoder.setDelay(HOLD_DELAY * 3);
    else if (f >= TOTAL_FRAMES - 4)     encoder.setDelay(HOLD_DELAY);
    else                                encoder.setDelay(FRAME_DELAY);

    // ── Background + frame ──
    drawBackground(ctx);
    drawCardFrame(ctx);
    drawHeader(ctx, accent);

    // dashed line under header
    dashedLine(ctx, 71, 141, W - 71, 141, PALETTE.muted, [5, 5]);

    if (showJackpotBanner) {
      drawJackpotBanner(ctx, data.jackpotPool, data.jackpotBust || 0, isBust && inReveal);
    }

    // ── Reels ──
    const winningSet = new Set();
    if (inReveal && won && data.matchedSymbol) {
      if (data.matchType === 'jackpot' || data.matchType === 'triple') {
        winningSet.add(0); winningSet.add(1); winningSet.add(2);
      } else {
        data.reels.forEach((r, i) => {
          if (r.id === data.matchedSymbol) winningSet.add(i);
        });
      }
    }

    // Pulse 0..1 (flash for highlighted reels during reveal)
    const revealLocal = inReveal ? f - revealStart : 0;
    const pulse = inReveal
      ? 0.5 + 0.5 * Math.sin(revealLocal * 0.9)
      : 0;

    for (let i = 0; i < 3; i++) {
      const rx = reelsX0 + i * (CELL + REEL_GAP);
      const offset = reelOffsetAtFrame(plans[i], f, spinSpeed);
      drawReelBox(
        ctx,
        rx,
        reelsY,
        offset,
        accent,
        winningSet.has(i),
        pulse,
      );
    }

    // ── Result panel ──
    drawResultPanel(ctx, {
      phase: inReveal ? 'reveal' : 'spinning',
      matchType: data.matchType,
      payout: data.payout,
      accent,
      areaY: resultAreaY,
      areaH: resultAreaH,
    });

    // ── Footer ──
    drawFooter(ctx, {
      bet: data.bet,
      balance: data.balance,
      multiplier: data.multiplier,
      won,
      username: data.username,
    });

    encoder.addFrame(ctx);
    frameCount++;
    if (frameCount % YIELD_EVERY === 0) {
      await new Promise((resolve) => setImmediate(resolve));
    }
  }

  encoder.finish();
  return encoder.out.getData();
}

module.exports = generateSlotGif;
