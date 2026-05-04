// 卡面風格共用工具：數字轉漢字、轉中文位數念法、千分位、XP 進度、頭像 fallback
// 注意：滿足 Satori 限制，所有元件最終會以 HTML 字串透過 satori-html 轉成 JSX 結構。
// — 不能用 SVG <pattern>、clip-path、mix-blend-mode、box-shadow blur，
//   皆需以 div / gradient / 多層疊圖模擬。

function fmtNumber(num) {
  return Number(num || 0).toLocaleString();
}

// 阿拉伯數字 → 大寫漢字（廟宇用）
// 例：755 → 柒佰伍拾伍；21115 → 貳萬壹仟壹佰壹拾伍
// 開頭的 "壹拾" 簡化為 "拾"（台灣常用法）
function toHanNumber(num) {
  const n = Math.max(0, Math.floor(Number(num) || 0));
  if (n === 0) return "零";
  const digits = ["零", "壹", "貳", "參", "肆", "伍", "陸", "柒", "捌", "玖"];
  const units = ["", "拾", "佰", "仟"];
  const bigUnits = ["", "萬", "億", "兆"];

  function fourDigit(group) {
    const s = String(group).padStart(4, "0");
    let out = "";
    let zeroPending = false;
    for (let i = 0; i < 4; i++) {
      const d = parseInt(s[i], 10);
      const u = 3 - i;
      if (d === 0) {
        zeroPending = out.length > 0;
      } else {
        if (zeroPending) {
          out += "零";
          zeroPending = false;
        }
        out += digits[d] + units[u];
      }
    }
    return out;
  }

  const groups = [];
  let rest = n;
  while (rest > 0) {
    groups.push(rest % 10000);
    rest = Math.floor(rest / 10000);
  }

  let result = "";
  for (let i = groups.length - 1; i >= 0; i--) {
    const g = groups[i];
    if (g === 0) continue;
    const part = fourDigit(g);
    result += part + bigUnits[i];
  }

  // 開頭簡化：壹拾 → 拾
  if (result.startsWith("壹拾")) {
    result = result.slice(1);
  }
  return result;
}

// 阿拉伯數字 → 一般中文數字（位數念法）
// 例：755 → 七五五；7600 → 七六〇〇
function toSimpleHan(num) {
  const map = ["〇", "一", "二", "三", "四", "五", "六", "七", "八", "九"];
  return String(Math.max(0, Math.floor(Number(num) || 0)))
    .split("")
    .map((d) => map[parseInt(d, 10)] || d)
    .join("");
}

function xpProgress(xp, xpMax) {
  const cur = Math.max(0, Number(xp) || 0);
  const max = Math.max(1, Number(xpMax) || 1);
  return Math.min(1, cur / max);
}

function clampPct(p) {
  return Math.max(0, Math.min(100, Number(p) || 0));
}

function avatarFallbackChar(username) {
  const ch = (username || "?").trim()[0];
  return (ch || "?").toUpperCase();
}

function htmlEscape(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// 取使用者名 + 大寫，限制長度避免破版
function safeUsername(name, max = 14) {
  const s = (name || "shushu").trim();
  if (Array.from(s).length <= max) return s;
  return Array.from(s).slice(0, max).join("") + "…";
}

// 將數字轉成英文大寫（皮革風格用）— 支援 0-999,999,999
function numberToWords(num) {
  const n = Math.max(0, Math.floor(Number(num) || 0));
  if (n === 0) return "ZERO";
  const ones = [
    "", "ONE", "TWO", "THREE", "FOUR", "FIVE", "SIX", "SEVEN", "EIGHT", "NINE",
    "TEN", "ELEVEN", "TWELVE", "THIRTEEN", "FOURTEEN", "FIFTEEN",
    "SIXTEEN", "SEVENTEEN", "EIGHTEEN", "NINETEEN",
  ];
  const tens = [
    "", "", "TWENTY", "THIRTY", "FORTY", "FIFTY", "SIXTY", "SEVENTY", "EIGHTY", "NINETY",
  ];

  function under1000(x) {
    let out = "";
    if (x >= 100) {
      out += ones[Math.floor(x / 100)] + " HUNDRED";
      x %= 100;
      if (x > 0) out += " ";
    }
    if (x >= 20) {
      out += tens[Math.floor(x / 10)];
      if (x % 10 > 0) out += "-" + ones[x % 10];
    } else if (x > 0) {
      out += ones[x];
    }
    return out;
  }

  let str = "";
  const billion = Math.floor(n / 1_000_000_000);
  const million = Math.floor((n % 1_000_000_000) / 1_000_000);
  const thousand = Math.floor((n % 1_000_000) / 1000);
  const remainder = n % 1000;

  if (billion) str += under1000(billion) + " BILLION ";
  if (million) str += under1000(million) + " MILLION ";
  if (thousand) str += under1000(thousand) + " THOUSAND ";
  if (remainder) str += under1000(remainder);
  return str.trim();
}

module.exports = {
  fmtNumber,
  toHanNumber,
  toSimpleHan,
  xpProgress,
  clampPct,
  avatarFallbackChar,
  htmlEscape,
  safeUsername,
  numberToWords,
};
