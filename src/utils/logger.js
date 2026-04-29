// 統一 logger：之後新程式碼一律用 logger.error / warn / info / debug，
// 舊的 console.log(...red/yellow) 在動到的時候順手改掉。
//
// 環境變數：
//   LOG_LEVEL=info|debug|warn|error  （未設時：dev=debug, prod=info）
let pino;
try {
  pino = require("pino");
} catch (e) {
  pino = null;
}

function envLogLevel() {
  if (process.env.LOG_LEVEL) return process.env.LOG_LEVEL;
  return process.env.NODE_ENV === "production" ? "info" : "debug";
}

let logger;

if (pino) {
  const isDev = process.env.NODE_ENV !== "production";
  const opts = {
    level: envLogLevel(),
    base: { service: "discord_bot" },
  };
  if (isDev) {
    try {
      logger = pino({
        ...opts,
        transport: {
          target: "pino-pretty",
          options: { colorize: true, translateTime: "SYS:HH:MM:ss" },
        },
      });
    } catch (e) {
      logger = pino(opts);
    }
  } else {
    logger = pino(opts);
  }
} else {
  // pino 還沒裝 → 退化成最簡 console wrapper，介面相容
  const levels = { fatal: 60, error: 50, warn: 40, info: 30, debug: 20, trace: 10 };
  const threshold = levels[envLogLevel()] || 30;
  const log = (lvl, args) => {
    if (levels[lvl] < threshold) return;
    const [first, ...rest] = args;
    if (typeof first === "object") {
      const { source, ...meta } = first;
      const msg = rest[0] || "";
      console.log(`[${lvl.toUpperCase()}]${source ? `[${source}]` : ""} ${msg}`, meta);
    } else {
      console.log(`[${lvl.toUpperCase()}] ${first}`, ...rest);
    }
  };
  logger = {
    fatal: (...a) => log("fatal", a),
    error: (...a) => log("error", a),
    warn: (...a) => log("warn", a),
    info: (...a) => log("info", a),
    debug: (...a) => log("debug", a),
    trace: (...a) => log("trace", a),
    child: (bindings) => {
      const child = {};
      for (const lvl of Object.keys(levels)) {
        child[lvl] = (...a) => {
          if (typeof a[0] === "object") {
            log(lvl, [{ ...bindings, ...a[0] }, ...a.slice(1)]);
          } else {
            log(lvl, [{ ...bindings }, ...a]);
          }
        };
      }
      child.child = logger.child;
      return child;
    },
  };
}

module.exports = logger;
module.exports.child = (bindings) => logger.child(bindings);
