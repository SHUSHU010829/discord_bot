require("colors");
const cron = require("node-cron");
const { finalizeProposal } = require("../../features/voting/finalizeProposal");

module.exports = async (client) => {
  // 每 5 分鐘檢查一次過期的投票
  cron.schedule("*/5 * * * *", async () => {
    try {
      await processExpiredVotes(client);
    } catch (error) {
      console.log(`[ERROR] 處理過期投票時出錯：\n${error}`.red);
    }
  });

  console.log(`[SYSTEM] 投票自動結算系統已啟動！`.green);
};

async function processExpiredVotes(client) {
  try {
    const expiredProposals = await client.votingProposalsCollection
      .find({
        status: "VOTING",
        expiresAt: { $lte: new Date() },
      })
      .toArray();

    if (expiredProposals.length === 0) return;

    console.log(
      `[VOTE] 發現 ${expiredProposals.length} 個過期的投票，開始處理...`.yellow,
    );

    for (const proposal of expiredProposals) {
      try {
        await finalizeProposal(client, proposal, { reason: "expired" });
      } catch (error) {
        console.log(
          `[ERROR] 處理投票 ${proposal.voteId} 時出錯：\n${error}`.red,
        );
      }
    }
  } catch (error) {
    console.log(`[ERROR] 查詢過期投票時出錯：\n${error}`.red);
  }
}
