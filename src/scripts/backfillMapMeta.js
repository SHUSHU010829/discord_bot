// 回填現有推薦紀錄的 Google Maps metadata。
//
// 預設只處理尚未抓過 metadata（缺 mapMetas 或為空）的紀錄；
// 加 --reanalyze 會在抓到 meta 後重新跑一次 AI 分類，把店名 / 地區
// 等欄位順便更新（會消耗 Anthropic API 額度）。
//
// 用法範例：
//   # 先看會處理幾筆，不寫 DB
//   node src/scripts/backfillMapMeta.js --dry-run
//
//   # 抓 metadata，只更新 mapMetas 與缺少的 name
//   node src/scripts/backfillMapMeta.js
//
//   # 抓 metadata + 重跑 AI 分類
//   node src/scripts/backfillMapMeta.js --reanalyze
//
//   # 即使已有 mapMetas 也重抓
//   node src/scripts/backfillMapMeta.js --force --reanalyze

require("dotenv/config");
require("colors");

const { MongoClient } = require("mongodb");

const { fetchMapMetaForUrls } = require("../services/mapMetaFetcher");
const {
  analyzeRecommendation,
} = require("../services/recommendationClassifier");

function parseArgs(argv) {
  const args = {
    dryRun: false,
    reanalyze: false,
    force: false,
    limit: Infinity,
    delayMs: 300,
    help: false,
  };
  for (const a of argv.slice(2)) {
    if (a === "--dry-run") args.dryRun = true;
    else if (a === "--reanalyze") args.reanalyze = true;
    else if (a === "--force") args.force = true;
    else if (a.startsWith("--limit=")) args.limit = parseInt(a.slice(8), 10);
    else if (a.startsWith("--delay=")) args.delayMs = parseInt(a.slice(8), 10);
    else if (a === "-h" || a === "--help") args.help = true;
  }
  return args;
}

function printHelp() {
  console.log(`
回填現有推薦紀錄的 Google Maps metadata

用法：
  node src/scripts/backfillMapMeta.js [options]

選項：
  --dry-run        只統計，不寫入資料庫，也不抓 Google Maps
  --reanalyze      抓到 meta 後同時重新跑 AI 分類（會用 Anthropic API）
  --force          即使紀錄已有 mapMetas 也重抓
  --limit=N        最多處理 N 筆
  --delay=MS       每筆之間延遲毫秒數（預設 300，避免被 Google 擋）
  -h, --help       顯示此說明
`);
}

async function connectMongo() {
  if (!process.env.MONGO_PASSWORD) {
    throw new Error("缺少 MONGO_PASSWORD 環境變數");
  }
  const uri = `mongodb+srv://SHUSHU:${process.env.MONGO_PASSWORD}@morningbot.ar55cbn.mongodb.net/?retryWrites=true&w=majority`;
  const mongoClient = new MongoClient(uri);
  await mongoClient.connect();
  const collection = mongoClient.db("MorningBot").collection("Recommendations");
  return { mongoClient, collection };
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    printHelp();
    process.exit(0);
  }

  console.log("=== 推薦 Maps metadata 回填工具 ===".cyan);
  console.log(
    `模式：${args.dryRun ? "dry-run" : args.reanalyze ? "fetch + reanalyze" : "fetch only"}`,
  );
  console.log(`force=${args.force}　limit=${args.limit}　delay=${args.delayMs}ms`);
  console.log("");

  const { mongoClient, collection } = await connectMongo();

  const baseQuery = { mapUrls: { $exists: true, $ne: [] } };
  if (!args.force) {
    baseQuery.$or = [
      { mapMetas: { $exists: false } },
      { mapMetas: { $size: 0 } },
      { mapMetas: null },
    ];
  }

  const total = await collection.countDocuments(baseQuery);
  console.log(`符合條件：${total} 筆`.cyan);

  if (total === 0 || args.dryRun) {
    if (args.dryRun) console.log("dry-run 結束，未寫入任何資料".yellow);
    await mongoClient.close();
    process.exit(0);
  }

  const cursorLimit = Number.isFinite(args.limit) ? args.limit : 0;
  const cursor = collection.find(baseQuery).limit(cursorLimit);

  let processed = 0;
  let updated = 0;
  let fetched = 0;
  let empty = 0;
  let reanalyzed = 0;
  const t0 = Date.now();

  for await (const doc of cursor) {
    processed++;
    try {
      const metas = await fetchMapMetaForUrls(doc.mapUrls, {
        delayMs: 0, // 內部 delay 由外圈控制
      });

      const updateSet = {
        mapMetas: metas,
        mapMetaFetchedAt: new Date(),
        updatedAt: new Date(),
      };

      if (metas.length === 0) {
        empty++;
      } else {
        fetched++;
        // name 為空時用 placeName 補；reanalyze 模式下交給 AI 決定
        if (!args.reanalyze && !doc.name && metas[0].placeName) {
          updateSet.name = metas[0].placeName.slice(0, 50);
        }
      }

      if (args.reanalyze && metas.length > 0) {
        const analysis = await analyzeRecommendation(
          doc.content || doc.cleanText || "",
          { mapMetas: metas },
        );
        Object.assign(updateSet, {
          type: analysis.type,
          cuisine: analysis.cuisine,
          mealTimes: analysis.mealTimes,
          area: analysis.area,
          name: analysis.name,
          summary: analysis.summary,
          keywords: analysis.keywords,
        });
        reanalyzed++;
      }

      await collection.updateOne({ _id: doc._id }, { $set: updateSet });
      updated++;

      if (processed % 5 === 0 || processed === total) {
        const sec = ((Date.now() - t0) / 1000).toFixed(1);
        process.stdout.write(
          `\r進度 ${processed}/${total}　成功 ${fetched}　無 meta ${empty}　reanalyze ${reanalyzed}　耗時 ${sec}s`,
        );
      }
    } catch (error) {
      console.log(`\n[ERROR] ${doc.messageId}：${error.message}`.red);
    }

    if (args.delayMs > 0) {
      await new Promise((r) => setTimeout(r, args.delayMs));
    }
  }
  process.stdout.write("\n");

  console.log("");
  console.log("=== 完成 ===".green);
  console.log(
    `處理：${processed}　寫入：${updated}　成功抓 meta：${fetched}　無 meta：${empty}` +
      (args.reanalyze ? `　重新分析：${reanalyzed}` : ""),
  );

  await mongoClient.close();
  process.exit(0);
}

main().catch((err) => {
  console.error("回填失敗：".red, err);
  process.exit(1);
});
