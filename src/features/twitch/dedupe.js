require("colors");

// _id = 使用者 login (小寫)，存上一次已通知的 streamId。
// 同一個 streamId 只會通知一次；下播後再開新一場 (新 streamId) 才會再通知。

const ensureIndexes = async (collection) => {
  if (!collection) return;
  // 預留：未來想做 TTL 清掉長期下線的紀錄就在這裡加
};

const getLastStreamId = async (collection, login) => {
  if (!collection) return null;
  const doc = await collection.findOne({ _id: login.toLowerCase() });
  return doc?.lastStreamId || null;
};

const setLastStreamId = async (collection, login, streamId, extra = {}) => {
  if (!collection) return;
  await collection.updateOne(
    { _id: login.toLowerCase() },
    {
      $set: {
        lastStreamId: streamId,
        notifiedAt: new Date(),
        ...extra,
      },
    },
    { upsert: true }
  );
};

module.exports = { ensureIndexes, getLastStreamId, setLastStreamId };
