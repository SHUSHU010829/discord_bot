// 共用的角色面板資料存取層：優先使用 MongoDB（在 Zeabur 上能跨重新部署持久），
// 若 Mongo 未連線則 fallback 到 src/data/role-panels.json（僅作為開發環境或第一次
// 部署的種子；在 Zeabur 上對檔案的寫入不會在重啟後保留）。
const fs = require("fs");
const path = require("path");
require("colors");

const PANELS_FILE = path.join(__dirname, "../data/role-panels.json");
const DOC_ID = "rolePanels";

function loadFromFile() {
  try {
    if (fs.existsSync(PANELS_FILE)) {
      return JSON.parse(fs.readFileSync(PANELS_FILE, "utf8"));
    }
  } catch (error) {
    console.log(`[ERROR] 讀取 role-panels.json 失敗：${error}`.red);
  }
  return { roles: [], panels: {}, targetChannelId: "" };
}

function saveToFile(data) {
  try {
    const dir = path.dirname(PANELS_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(PANELS_FILE, JSON.stringify(data, null, 2));
  } catch (error) {
    console.log(`[ERROR] 寫入 role-panels.json 失敗：${error}`.red);
  }
}

function stripId(doc) {
  if (!doc) return doc;
  const { _id, ...rest } = doc;
  return rest;
}

async function loadPanels(client) {
  const collection = client?.rolePanelsCollection;
  if (!collection) {
    console.log(
      `[WARNING] rolePanelsCollection 未連線，改用本地檔案（資料不會持久）`
        .yellow,
    );
    return loadFromFile();
  }

  const doc = await collection.findOne({ _id: DOC_ID });
  if (doc) {
    return stripId(doc);
  }

  // 第一次跑：把現有的 JSON 內容當成種子寫進 MongoDB
  const seed = loadFromFile();
  await collection.insertOne({ _id: DOC_ID, ...seed });
  console.log(
    `[DATA] 已將 role-panels.json 內容初始化到 MongoDB RolePanels 集合`.cyan,
  );
  return seed;
}

async function savePanels(client, data) {
  const collection = client?.rolePanelsCollection;
  if (collection) {
    const { _id, ...rest } = data;
    await collection.updateOne(
      { _id: DOC_ID },
      { $set: rest },
      { upsert: true },
    );
    return;
  }

  console.log(
    `[WARNING] rolePanelsCollection 未連線，寫入本地檔案（Zeabur 上重啟後會消失）`
      .yellow,
  );
  saveToFile(data);
}

module.exports = { loadPanels, savePanels };
