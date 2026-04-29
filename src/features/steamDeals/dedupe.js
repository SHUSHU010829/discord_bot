require("colors");

const TTL_DAYS = 14;

/**
 * MongoDB-backed dedupe store for Steam deal pushes.
 *
 * Document shape:
 *   {
 *     _id: "{appid}:{discountPercent}",
 *     appid, discountPercent, isLowest,
 *     pushedAt: Date,
 *     expiresAt: Date  // TTL index
 *   }
 *
 * Logic:
 *   - Same appid + same discount %  → already pushed, skip
 *   - Same appid, different %       → treated as a new deal, push
 *   - is_lowest flips to true       → forced push (separate marker doc)
 */
const buildKey = (appid, discountPercent) => `${appid}:${discountPercent}`;
const buildLowestKey = (appid) => `lowest:${appid}`;

const ensureIndexes = async (collection) => {
  try {
    await collection.createIndex(
      { expiresAt: 1 },
      { expireAfterSeconds: 0, name: "ttl_expiresAt" }
    );
  } catch (err) {
    console.log(
      `[WARNING] steamDealsPushed TTL index create failed: ${err.message}`
        .yellow
    );
  }
};

const isAlreadyPushed = async (collection, { appid, discountPercent, isLowest }) => {
  if (!collection) return false;

  const key = buildKey(appid, discountPercent);
  const existing = await collection.findOne({ _id: key });

  // 史低狀態剛剛變成 true 時強制推一次,即使先前推過同折扣
  if (isLowest) {
    const lowestKey = buildLowestKey(appid);
    const lowestRecord = await collection.findOne({ _id: lowestKey });
    if (!lowestRecord) return false;
  }

  return Boolean(existing);
};

const markPushed = async (collection, { appid, discountPercent, isLowest }) => {
  if (!collection) return;
  const now = new Date();
  const expiresAt = new Date(now.getTime() + TTL_DAYS * 24 * 60 * 60 * 1000);

  const key = buildKey(appid, discountPercent);
  await collection.updateOne(
    { _id: key },
    {
      $set: {
        appid,
        discountPercent,
        isLowest: Boolean(isLowest),
        pushedAt: now,
        expiresAt,
      },
    },
    { upsert: true }
  );

  if (isLowest) {
    await collection.updateOne(
      { _id: buildLowestKey(appid) },
      {
        $set: {
          appid,
          markedAt: now,
          expiresAt,
        },
      },
      { upsert: true }
    );
  }
};

module.exports = { ensureIndexes, isAlreadyPushed, markPushed };
