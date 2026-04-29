// Resolves data file paths with persistent-volume support.
// On Zeabur (or any platform), set DATA_DIR=/data (mounted volume) so runtime
// state survives redeploys. Without DATA_DIR, falls back to src/data/ for
// local development.
//
// First-time read: if the runtime file is missing but a default exists in
// src/data/, copy the default into DATA_DIR as a seed.

const fs = require("fs");
const path = require("path");
require("colors");

const DEFAULTS_DIR = path.join(__dirname, "..", "data");
const RUNTIME_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : DEFAULTS_DIR;

let announced = false;
function announceOnce() {
  if (announced) return;
  announced = true;
  if (process.env.DATA_DIR) {
    console.log(`[DATA] runtime data dir = ${RUNTIME_DIR}`.cyan);
  } else {
    console.log(
      `[DATA] DATA_DIR not set, using bundled ${RUNTIME_DIR} (not persistent on Zeabur)`
        .yellow,
    );
  }
}

function ensureRuntimeDir() {
  if (!fs.existsSync(RUNTIME_DIR)) {
    fs.mkdirSync(RUNTIME_DIR, { recursive: true });
  }
}

// Returns the absolute path for a data file, seeding it from the bundled
// default on first access if needed.
function getDataFile(filename) {
  announceOnce();
  ensureRuntimeDir();

  const runtimePath = path.join(RUNTIME_DIR, filename);
  if (!fs.existsSync(runtimePath)) {
    const defaultPath = path.join(DEFAULTS_DIR, filename);
    if (
      RUNTIME_DIR !== DEFAULTS_DIR &&
      fs.existsSync(defaultPath)
    ) {
      try {
        fs.copyFileSync(defaultPath, runtimePath);
        console.log(`[DATA] seeded ${filename} from defaults`.cyan);
      } catch (error) {
        console.log(`[ERROR] failed to seed ${filename}: ${error}`.red);
      }
    }
  }
  return runtimePath;
}

module.exports = { getDataFile, RUNTIME_DIR, DEFAULTS_DIR };
