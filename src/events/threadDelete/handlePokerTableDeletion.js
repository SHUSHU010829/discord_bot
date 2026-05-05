// 撲克牌桌的 thread 被刪 → 立刻結算退錢，不等 cron。
//
// 為什麼這樣寫：
//   - 牌桌狀態存在 mongo，thread 只是 UI 表面。
//   - 玩家若直接刪 thread，原本要等到 expiresAt 過了 cron 才退錢；
//     最多會卡 gameTtlSeconds（預設 15 分鐘）期間玩家開不了新桌。
//   - 這個 handler 一收到 threadDelete event 就走 closeTable，
//     裡面的 thread.archive 會因為 thread 沒了而 silent no-op，
//     退錢與狀態更新都仍正確完成。

require("colors");

const { closeTable } = require("../../features/casino/poker/service");

module.exports = async (client, thread) => {
  try {
    if (!client.pokerGamesCollection) return;
    if (!thread?.id) return;

    const doc = await client.pokerGamesCollection.findOne({
      threadId: thread.id,
      status: { $in: ["waiting", "playing", "settled"] },
    });
    if (!doc) return;

    console.log(
      `[POKER] thread ${thread.id} 被刪 → 立刻結算 gameId=${doc.gameId} status=${doc.status}`.cyan
    );
    await closeTable(client, doc, { reason: "thread_deleted" });
  } catch (err) {
    console.log(`[ERROR] handlePokerThreadDelete:\n${err}\n${err.stack}`.red);
  }
};
