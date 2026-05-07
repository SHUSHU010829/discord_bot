require("colors");
const { createHash } = require("node:crypto");

const TTL_DAYS = 60;

// 同一個遊戲在同平台的同一波限免應該只推一次。
// GamerPower 每筆活動都有穩定的 id,優先用它組 key;
// 沒 id 才退回 platform+appid/name+endTime (給未來擴充其他來源用)。
const buildKey = ({ giveawayId, platform, appid, endTime, name }) => {
  if (giveawayId) return `free:gp:${giveawayId}`;
  const id = appid && appid > 0
    ? String(appid)
    : "n" + createHash("md5").update(String(name || "unknown")).digest("hex").slice(0, 8);
  return `free:${platform}:${id}:${endTime || 0}`;
};

const ensureIndexes = async (collection) => {
  try {
    await collection.createIndex(
      { expiresAt: 1 },
      { expireAfterSeconds: 0, name: "ttl_expiresAt" }
    );
  } catch (err) {
    console.log(
      `[WARNING] freeGamesPushed TTL index create failed: ${err.message}`
        .yellow
    );
  }
};

const isAlreadyPushed = async (collection, item) => {
  if (!collection) return false;
  const key = buildKey(item);
  const existing = await collection.findOne({ _id: key });
  return Boolean(existing);
};

const markPushed = async (collection, item) => {
  if (!collection) return;
  const now = new Date();
  // TTL 至少蓋過 endTime,否則用預設 60 天
  const baseExpiry = item.endTime
    ? new Date(item.endTime * 1000 + 7 * 24 * 60 * 60 * 1000)
    : new Date(now.getTime() + TTL_DAYS * 24 * 60 * 60 * 1000);

  await collection.updateOne(
    { _id: buildKey(item) },
    {
      $set: {
        platform: item.platform,
        giveawayId: item.giveawayId || null,
        appid: item.appid || null,
        name: item.name || null,
        endTime: item.endTime || null,
        pushedAt: now,
        expiresAt: baseExpiry,
      },
    },
    { upsert: true }
  );
};

module.exports = { ensureIndexes, isAlreadyPushed, markPushed, buildKey };
