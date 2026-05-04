require("colors");
const crypto = require("crypto");
const {
  SlashCommandBuilder,
  AttachmentBuilder,
} = require("discord.js");
const { DateTime } = require("luxon");

const { coinSystem, casino } = require("../../config");
const grantCoins = require("../../features/economy/grantCoins");
const { rollThree } = require("../../features/casino/sicbo/dice");
const { settleBet } = require("../../features/casino/sicbo/engine");
const {
  isValidBet,
  describeBet,
  NEEDS_VALUE,
} = require("../../features/casino/sicbo/paytable");
const generateSicboCard = require("../../utils/generateSicboCard");

const BET_CHOICES = [
  { name: "大 (11-17)", value: "big" },
  { name: "小 (4-10)", value: "small" },
  { name: "任意圍骰 (三同)", value: "triple_any" },
  { name: "對子 (兩同)", value: "double" },
  { name: "圍骰 (指定三同)", value: "triple_specific" },
  { name: "單骰 (押點數)", value: "single" },
  { name: "總點數", value: "total" },
];

async function getTodayBetTotal(client, userId, guildId) {
  if (!client.coinTransactionsCollection) return 0;
  const tz = coinSystem?.daily?.resetTimezone || "Asia/Taipei";
  const today = DateTime.now().setZone(tz).toISODate();
  const agg = await client.coinTransactionsCollection
    .aggregate([
      {
        $match: {
          userId,
          guildId,
          source: "bet",
          "meta.game": "sicbo",
          date: today,
        },
      },
      { $group: { _id: null, total: { $sum: "$amount" } } },
    ])
    .toArray();
  // bet 是負數，取絕對值得「今日已下注總額」
  return Math.abs(agg[0]?.total || 0);
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("骰寶")
    .setDescription("擲三顆骰子賭運氣 🎲")
    .setDMPermission(false)
    .addStringOption((opt) =>
      opt
        .setName("押法")
        .setDescription("選擇下注類型")
        .setRequired(true)
        .addChoices(...BET_CHOICES)
    )
    .addIntegerOption((opt) =>
      opt
        .setName("金額")
        .setDescription("下注 credits")
        .setRequired(true)
        .setMinValue(casino?.sicbo?.minBet ?? 10)
        .setMaxValue(casino?.sicbo?.maxBet ?? 1000)
    )
    .addIntegerOption((opt) =>
      opt
        .setName("數值")
        .setDescription("單骰/對子/圍骰需要點數 1-6；總點數需要 4-17")
        .setRequired(false)
        .setMinValue(1)
        .setMaxValue(17)
    )
    .toJSON(),

  run: async (client, interaction) => {
    await interaction.deferReply();

    try {
      if (!coinSystem?.enabled) {
        return interaction.editReply("🔧 金幣系統尚未啟動！");
      }
      if (!client.userCoinsCollection || !client.coinTransactionsCollection) {
        return interaction.editReply("🔧 金幣系統尚未啟動，請聯絡舒舒！");
      }

      const betType = interaction.options.getString("押法");
      const betAmount = interaction.options.getInteger("金額");
      const betValueRaw = interaction.options.getInteger("數值");
      const betValue = NEEDS_VALUE.includes(betType) ? betValueRaw : null;

      if (NEEDS_VALUE.includes(betType) && betValueRaw === null) {
        return interaction.editReply(
          `押法「${describeBet(betType, null)}」需要指定**數值**參數。`
        );
      }
      if (!isValidBet(betType, betValue)) {
        if (betType === "single" || betType === "double" || betType === "triple_specific") {
          return interaction.editReply(
            `押法「${describeBet(betType, null)}」的**數值**必須是 1-6。`
          );
        }
        if (betType === "total") {
          return interaction.editReply(
            "押法「總點數」的**數值**必須是 4-17（3 與 18 與圍骰重複，不開放）。"
          );
        }
        return interaction.editReply("下注參數錯誤。");
      }

      const userId = interaction.user.id;
      const guildId = interaction.guildId;
      const username = interaction.member?.displayName || interaction.user.username;

      // 餘額檢查
      const before = await client.userCoinsCollection.findOne({ userId, guildId });
      const balance = before?.totalCoins || 0;
      if (balance < betAmount) {
        return interaction.editReply(
          `💰 餘額不足！目前 **${balance.toLocaleString()}** credits，無法下注 ${betAmount.toLocaleString()}。`
        );
      }

      // 每日下注上限
      const dailyLimit = casino?.sicbo?.dailyBetLimit ?? 50000;
      const todayBet = await getTodayBetTotal(client, userId, guildId);
      if (todayBet + betAmount > dailyLimit) {
        const remain = Math.max(0, dailyLimit - todayBet);
        return interaction.editReply(
          `📈 今日骰寶下注已達上限。今日已下注 **${todayBet.toLocaleString()}** / ${dailyLimit.toLocaleString()}，剩 **${remain.toLocaleString()}**。`
        );
      }

      const roundId = crypto.randomUUID();
      const member = interaction.member;

      // 扣款
      const betResult = await grantCoins(client, {
        userId,
        guildId,
        username,
        avatarHash: interaction.user.avatar,
        amount: -betAmount,
        source: "bet",
        member,
        meta: {
          game: "sicbo",
          betType,
          betValue,
          roundId,
        },
      });

      if (!betResult) {
        return interaction.editReply("🔧 下注失敗，請稍後再試。");
      }

      // 擲骰
      const dice = rollThree();
      const sum = dice[0] + dice[1] + dice[2];
      const isTriple = dice[0] === dice[1] && dice[1] === dice[2];
      const settled = settleBet({ type: betType, value: betValue, amount: betAmount }, dice);

      let balanceAfter = betResult.doc?.totalCoins ?? balance - betAmount;

      // 中獎發 payout
      if (settled.won && settled.payout > 0) {
        const payoutResult = await grantCoins(client, {
          userId,
          guildId,
          username,
          avatarHash: interaction.user.avatar,
          amount: settled.payout,
          source: "payout",
          member,
          meta: {
            game: "sicbo",
            betType,
            betValue,
            multiplier: settled.multiplier,
            roundId,
          },
        });
        balanceAfter = payoutResult?.doc?.totalCoins ?? balanceAfter + settled.payout;
      }

      // 渲染圖卡
      const buf = await generateSicboCard({
        userId,
        username,
        dice,
        sum,
        betLabel: describeBet(betType, betValue),
        betAmount,
        won: settled.won,
        isTriple,
        payout: settled.payout,
        multiplier: settled.multiplier,
        balance: balanceAfter,
      });

      const attachment = new AttachmentBuilder(buf, {
        name: `sicbo-${roundId}.png`,
      });

      const headline = settled.won
        ? isTriple
          ? `🎉 **圍骰！** 擲出 ${dice.join("・")} = ${sum}，**+${settled.payout.toLocaleString()}** credits`
          : `✨ **中獎！** 擲出 ${dice.join("・")} = ${sum}，**+${settled.payout.toLocaleString()}** credits`
        : `💸 擲出 ${dice.join("・")} = ${sum}，沒中，下次加油！`;

      const bankruptLine =
        balanceAfter <= 0
          ? `\n🚨 **你破產了！** 餘額歸零，去發言、聊天賺金幣再來吧！`
          : "";

      await interaction.editReply({
        content: `${headline}\n・押法：**${describeBet(betType, betValue)}**　・下注：${betAmount.toLocaleString()}　・餘額：**${balanceAfter.toLocaleString()}**${bankruptLine}`,
        files: [attachment],
      });
    } catch (error) {
      console.log(`[ERROR] /骰寶:\n${error}\n${error.stack}`.red);
      await interaction
        .editReply("🔧 骰寶執行失敗，請呼叫舒舒！")
        .catch(() => {});
    }
  },
};
