require("colors");
const cron = require("node-cron");
const {
  lockQuiz,
  settleQuiz,
  cancelQuiz,
  isPrediction,
} = require("../../features/quiz/quizGame");

// 預測主辦人沒回來公布答案時的保險：鎖住超過這麼久就自動取消退款，避免獎金永遠卡住
const AUTO_HANDLE_AFTER_LOCK_MS = 24 * 60 * 60 * 1000;

module.exports = async (client) => {
  cron.schedule("* * * * *", async () => {
    try {
      await processExpiredQuizzes(client);
    } catch (error) {
      console.log(`[ERROR] 處理過期問答/預測時出錯：\n${error}`.red);
    }
  });

  console.log(`[SYSTEM] 問答/預測自動結算系統已啟動！`.green);

  setTimeout(() => {
    processExpiredQuizzes(client).catch((err) => {
      console.log(`[ERROR] 啟動時問答/預測結算掃描失敗：${err}`.red);
    });
  }, 15 * 1000);
};

async function processExpiredQuizzes(client) {
  if (!client.quizGamesCollection) return;

  // 1) 作答時間到的 ACTIVE：
  //    - 問答 (kind=quiz 或舊資料): 直接結算
  //    - 預測 (kind=prediction): 鎖住等待主辦人公布答案
  const toHandle = await client.quizGamesCollection
    .find({ status: "ACTIVE", endsAt: { $lte: new Date() } })
    .toArray();
  if (toHandle.length > 0) {
    console.log(`[QUIZ] ${toHandle.length} 個活動到期，自動處理中...`.yellow);
    for (const doc of toHandle) {
      try {
        if (isPrediction(doc)) {
          await lockQuiz(client, doc, "expired");
        } else {
          await settleQuiz(client, doc, "expired");
        }
      } catch (error) {
        console.log(`[ERROR] 自動處理 ${doc.quizId} 失敗：\n${error}`.red);
      }
    }
  }

  // 2) LOCKED 太久沒處理 → 保險路徑
  //    - 有 correctKey (舊版問答資料)：自動結算
  //    - 預測 / 沒 correctKey：自動取消並退款給主辦人
  const cutoff = new Date(Date.now() - AUTO_HANDLE_AFTER_LOCK_MS);
  const stuck = await client.quizGamesCollection
    .find({ status: "LOCKED", lockedAt: { $lte: cutoff } })
    .toArray();
  if (stuck.length > 0) {
    console.log(
      `[QUIZ] ${stuck.length} 個活動鎖住超過 24 小時，自動處理...`.yellow
    );
    for (const doc of stuck) {
      try {
        if (doc.correctKey) {
          await settleQuiz(client, doc, "auto_after_lock");
        } else {
          await cancelQuiz(
            client,
            doc,
            { id: doc.hostId }
          );
        }
      } catch (error) {
        console.log(`[ERROR] 自動處理鎖住的 ${doc.quizId} 失敗：\n${error}`.red);
      }
    }
  }
}
