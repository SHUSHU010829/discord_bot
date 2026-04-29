require("colors");
const cron = require("node-cron");
const { DateTime } = require("luxon");
const { AttachmentBuilder } = require("discord.js");

const { weeklyReport } = require("../../config");
const buildWeeklyReport = require("../../utils/buildWeeklyReport");
const generateWeeklyReportCard = require("../../utils/generateWeeklyReportCard");

module.exports = (client) => {
  if (!weeklyReport?.enabled) return;
  if (!weeklyReport.channelId) {
    console.log(`[WARNING] weeklyReport.enabled = true 但沒設 channelId，跳過`.yellow);
    return;
  }

  const tz = weeklyReport.timezone || "Asia/Taipei";

  cron.schedule(
    weeklyReport.cronSchedule || "0 21 * * 0",
    async () => {
      try {
        const channel = client.channels.cache.get(weeklyReport.channelId);
        if (!channel) {
          console.log(`[ERROR] weeklyReport: 找不到頻道 ${weeklyReport.channelId}`.red);
          return;
        }

        const guildId = channel.guildId || channel.guild?.id;
        if (!guildId) return;

        const report = await buildWeeklyReport(client, { guildId, timezone: tz });

        // 補上 username（先從 cache 嘗試）
        const guild = client.guilds.cache.get(guildId);
        const enrichedTop = await Promise.all(
          report.topXp.map(async (t) => {
            const m =
              guild?.members.cache.get(t.userId) ||
              (await guild?.members.fetch(t.userId).catch(() => null));
            return {
              ...t,
              username: m?.displayName || m?.user?.username || `<@${t.userId}>`,
            };
          })
        );

        const now = DateTime.now().setZone(tz);
        const weekRangeLabel = `${now.minus({ days: 7 }).toFormat("MM/dd")} – ${now.toFormat("MM/dd")}`;

        const buf = await generateWeeklyReportCard({
          topXp: enrichedTop,
          totalXp: report.totalXp,
          levelUpCount: report.levelUpCount,
          checkinCount: report.checkinCount,
          weekRangeLabel,
        });

        const fileName = `weekly-${now.toFormat("yyyyMMdd")}.png`;
        const attachment = new AttachmentBuilder(buf, { name: fileName });

        await channel.send({
          content: `📈 本週等級週報出爐！`,
          files: [attachment],
        });
      } catch (error) {
        console.log(`[ERROR] weeklyReport scheduler:\n${error}\n${error.stack}`.red);
      }
    },
    {
      scheduled: true,
      timezone: tz,
    }
  );

  console.log(`[SYSTEM] 等級週報排程啟動：${weeklyReport.cronSchedule || "0 21 * * 0"}`.green);
};
