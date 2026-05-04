require("colors");

const cron = require("node-cron");
const { EmbedBuilder } = require("discord.js");

const { coinSystem } = require("../../config");
const grantCoins = require("../../features/economy/grantCoins");

// 每週掃 totalCoins > threshold 的帳戶，扣 rate% 作為財富稅。
// 預設：每週一 04:00 (Asia/Taipei)，threshold 50,000，rate 1%。
// 連續錯誤 3 次自動關閉。

let consecutiveErrors = 0;
const MAX_CONSECUTIVE_ERRORS = 3;
let task = null;

async function sweepOnce(client, cfg) {
  if (!client.userCoinsCollection) return null;

  const threshold = cfg.threshold ?? 50000;
  const rate = cfg.rate ?? 0.01;
  const minDeduction = cfg.minDeduction ?? 1;

  const cursor = client.userCoinsCollection.find({
    totalCoins: { $gt: threshold },
  });

  let affectedUsers = 0;
  let totalTaxed = 0;
  let topAffected = [];

  while (await cursor.hasNext()) {
    const u = await cursor.next();
    const taxable = u.totalCoins - threshold;
    if (taxable <= 0) continue;
    let tax = Math.floor(taxable * rate);
    if (tax < minDeduction) tax = minDeduction;
    if (tax > u.totalCoins) tax = u.totalCoins;
    if (tax <= 0) continue;

    try {
      await grantCoins(client, {
        userId: u.userId,
        guildId: u.guildId,
        username: u.username,
        amount: -tax,
        source: "wealth_tax",
        meta: { threshold, rate, before: u.totalCoins },
      });
      affectedUsers += 1;
      totalTaxed += tax;
      topAffected.push({
        userId: u.userId,
        username: u.username,
        before: u.totalCoins,
        tax,
      });
    } catch (e) {
      console.log(`[WTAX] grantCoins failed user=${u.userId}: ${e}`.red);
    }
  }

  topAffected.sort((a, b) => b.tax - a.tax);
  topAffected = topAffected.slice(0, 5);

  return { affectedUsers, totalTaxed, topAffected, threshold, rate };
}

async function postReport(client, cfg, summary) {
  const channelId = cfg.reportChannelId;
  if (!channelId || !summary) return;
  const channel = await client.channels.fetch(channelId).catch(() => null);
  if (!channel?.isTextBased?.()) return;

  const embed = new EmbedBuilder()
    .setTitle("💸 每週財富稅結算")
    .setColor(0xed4245)
    .setDescription(
      [
        `・扣稅門檻：**${summary.threshold.toLocaleString()}**`,
        `・稅率：**${(summary.rate * 100).toFixed(2)}%**（超過門檻部分）`,
        `・受影響玩家數：**${summary.affectedUsers}**`,
        `・本次回收金幣：**${summary.totalTaxed.toLocaleString()}**`,
      ].join("\n"),
    );

  if (summary.topAffected.length > 0) {
    const top = summary.topAffected
      .map(
        (t, i) =>
          `${i + 1}. <@${t.userId}> 扣 **${t.tax.toLocaleString()}**（餘額 ${t.before.toLocaleString()} → ${(t.before - t.tax).toLocaleString()}）`,
      )
      .join("\n");
    embed.addFields({ name: "本次扣最多 Top 5", value: top });
  }

  embed.setTimestamp(new Date());
  await channel.send({ embeds: [embed] }).catch(() => {});
}

async function runSweep(client) {
  const cfg = coinSystem?.wealthTax;
  if (!cfg?.enabled) return;
  console.log(`[WTAX] 開始每週財富稅掃描`.cyan);
  const summary = await sweepOnce(client, cfg);
  if (!summary) return;
  console.log(
    `[WTAX] 完成：${summary.affectedUsers} 人，回收 ${summary.totalTaxed} 金幣`.cyan,
  );
  await postReport(client, cfg, summary);
}

module.exports = async (client) => {
  if (task) return;

  const cfg = coinSystem?.wealthTax;
  if (!cfg?.enabled) {
    console.log(`[WTAX] 財富稅未啟用，跳過排程`.gray);
    return;
  }

  const schedule = cfg.cronSchedule || "0 4 * * 1";
  const tz = cfg.timezone || "Asia/Taipei";

  task = cron.schedule(
    schedule,
    async () => {
      try {
        await runSweep(client);
        consecutiveErrors = 0;
      } catch (err) {
        consecutiveErrors += 1;
        console.log(
          `[ERROR] wealthTaxScheduler failed (${consecutiveErrors}/${MAX_CONSECUTIVE_ERRORS}):\n${err}`.red,
        );
        if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
          console.log(`[ERROR] 連續錯誤過多，停止財富稅 cron`.red);
          task.stop();
        }
      }
    },
    { timezone: tz },
  );

  console.log(
    `[WTAX] 財富稅排程已啟動：${schedule} (${tz})，門檻 ${cfg.threshold ?? 50000}、稅率 ${(cfg.rate ?? 0.01) * 100}%`.cyan,
  );
};
