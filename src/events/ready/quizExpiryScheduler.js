require("colors");
const cron = require("node-cron");
const { settleQuiz } = require("../../features/quiz/quizGame");

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
  const expired = await client.quizGamesCollection
    .find({ status: "ACTIVE", endsAt: { $lte: new Date() } })
    .toArray();
  if (expired.length === 0) return;

  console.log(`[QUIZ] 發現 ${expired.length} 個過期問答，開始結算...`.yellow);
  for (const doc of expired) {
    try {
      await settleQuiz(client, doc, "expired");
    } catch (error) {
      console.log(`[ERROR] 結算問答 ${doc.quizId} 失敗：\n${error}`.red);
    }
  }
}
