require("colors");
const cron = require("node-cron");
const { lockQuiz, settleQuiz } = require("../../features/quiz/quizGame");

// 主辦人沒回來公布答案時的保險：鎖住超過這麼久就自動結算，避免獎金永遠卡住
const AUTO_SETTLE_AFTER_LOCK_MS = 24 * 60 * 60 * 1000;

module.exports = async (client) => {
  cron.schedule("* * * * *", async () => {
    try {
      await processExpiredQuizzes(client);
    } catch (error) {
      console.log(`[ERROR] 處理過期問答時出錯：\n${error}`.red);
    }
  });

  console.log(`[SYSTEM] 問答自動結算系統已啟動！`.green);

  setTimeout(() => {
    processExpiredQuizzes(client).catch((err) => {
      console.log(`[ERROR] 啟動時問答結算掃描失敗：${err}`.red);
    });
  }, 15 * 1000);
};

async function processExpiredQuizzes(client) {
  if (!client.quizGamesCollection) return;

  // 1) 作答時間到 → 鎖住作答（保留待公布答案狀態）
  const toLock = await client.quizGamesCollection
    .find({ status: "ACTIVE", endsAt: { $lte: new Date() } })
    .toArray();
  if (toLock.length > 0) {
    console.log(`[QUIZ] ${toLock.length} 個問答到期，鎖住作答中...`.yellow);
    for (const doc of toLock) {
      try {
        await lockQuiz(client, doc, "expired");
      } catch (error) {
        console.log(`[ERROR] 鎖住問答 ${doc.quizId} 失敗：\n${error}`.red);
      }
    }
  }

  // 2) 鎖住太久仍未公布 → 自動結算，避免獎金卡住
  const cutoff = new Date(Date.now() - AUTO_SETTLE_AFTER_LOCK_MS);
  const toAutoSettle = await client.quizGamesCollection
    .find({ status: "LOCKED", lockedAt: { $lte: cutoff } })
    .toArray();
  if (toAutoSettle.length > 0) {
    console.log(
      `[QUIZ] ${toAutoSettle.length} 個問答鎖住超過 24 小時，自動結算...`.yellow
    );
    for (const doc of toAutoSettle) {
      try {
        await settleQuiz(client, doc, "auto_after_lock");
      } catch (error) {
        console.log(`[ERROR] 自動結算問答 ${doc.quizId} 失敗：\n${error}`.red);
      }
    }
  }
}
