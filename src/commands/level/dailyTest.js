require("colors");
const {
  SlashCommandBuilder,
  AttachmentBuilder,
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  MessageFlags,
} = require("discord.js");
const { DateTime } = require("luxon");

const { levelSystem } = require("../../config");
const generateCheckinCard = require("../../utils/generateCheckinCard");
const { getLevelProgress } = require("../../utils/levelMath");

module.exports = {
  devOnly: true,

  data: new SlashCommandBuilder()
    .setName("dailytest")
    .setDescription("[DEV ONLY] 簽到卡預覽 / 重置今日紀錄")
    .setDMPermission(false)
    .addSubcommand((sub) =>
      sub
        .setName("preview")
        .setDescription("產生一張簽到卡（不寫 DB、不給 XP）")
        .addIntegerOption((opt) =>
          opt
            .setName("streak")
            .setDescription("模擬連勝天數（預設 1）")
            .setMinValue(1)
            .setMaxValue(365)
            .setRequired(false)
        )
        .addIntegerOption((opt) =>
          opt
            .setName("pastdays")
            .setDescription("模擬最近 30 天有幾天簽到過（預設 = 連勝天數）")
            .setMinValue(0)
            .setMaxValue(30)
            .setRequired(false)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("reset")
        .setDescription("刪掉今日簽到紀錄，讓你重新測試 /每日簽到（XP 不會退還）")
    )
    .toJSON(),

  run: async (client, interaction) => {
    const sub = interaction.options.getSubcommand();

    if (sub === "preview") {
      return runPreview(client, interaction);
    }
    if (sub === "reset") {
      return runReset(client, interaction);
    }
  },
};

async function runPreview(client, interaction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  try {
    const cfg = levelSystem.daily;
    const tz = cfg.resetTimezone || "Asia/Taipei";
    const today = DateTime.now().setZone(tz).toISODate();

    const streak = interaction.options.getInteger("streak") ?? 1;
    const checkedDaysOpt = interaction.options.getInteger("pastdays");
    const checkedDays = checkedDaysOpt ?? Math.min(streak, 30);

    let xp = cfg.baseXp;
    const bonusDays = Math.min(streak, cfg.streakBonusCapDays || 30);
    xp += bonusDays * (cfg.streakBonusPerDay || 0);
    let multiplier = 1;
    if (streak >= 30) multiplier = cfg.streak30Multiplier || 2.0;
    else if (streak >= 7) multiplier = cfg.streak7Multiplier || 1.5;
    xp = Math.floor(xp * multiplier);

    // 從過往 N 天回推（含今天）
    const checkinDates = new Set();
    for (let i = 0; i < checkedDays; i++) {
      const d = DateTime.now().setZone(tz).minus({ days: i }).toISODate();
      checkinDates.add(d);
    }
    checkinDates.add(today);

    const userDoc = await client.userLevelsCollection?.findOne({
      userId: interaction.user.id,
      guildId: interaction.guildId,
    });
    const fakeAfterLevel = userDoc
      ? getLevelProgress(userDoc.totalXp + xp).level
      : 0;

    const buf = await generateCheckinCard({
      username: interaction.member?.displayName || interaction.user.username,
      avatarUrl: interaction.user.displayAvatarURL({ extension: "png", size: 256 }),
      streak,
      totalCheckins: (userDoc?.totalCheckins || 0) + 1,
      xpEarned: xp,
      multiplier,
      afterLevel: fakeAfterLevel,
      checkinDates,
      today,
      timezone: tz,
    });

    const fileName = `checkin-preview-${today}.png`;
    const attachment = new AttachmentBuilder(buf, { name: fileName });

    const container = new ContainerBuilder()
      .setAccentColor(0xc9302c)
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `## 🧪 簽到卡預覽（不寫 DB）\n` +
            `連勝 **${streak}** 天 ・ +${xp} XP` +
            (multiplier > 1 ? ` ・ 加成 x${multiplier}` : "") +
            ` ・ 模擬最近 ${checkedDays} 天有簽到`
        )
      )
      .addSeparatorComponents(new SeparatorBuilder())
      .addMediaGalleryComponents(
        new MediaGalleryBuilder().addItems(
          new MediaGalleryItemBuilder()
            .setURL(`attachment://${fileName}`)
            .setDescription("Check-in preview")
        )
      );

    await interaction.editReply({
      components: [container],
      files: [attachment],
      flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
    });
  } catch (error) {
    console.log(`[ERROR] /dailytest preview:\n${error}\n${error.stack}`.red);
    await interaction.editReply("🔧 預覽失敗，請看 console").catch(() => {});
  }
}

async function runReset(client, interaction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  try {
    if (!client.dailyCheckinCollection || !client.userLevelsCollection) {
      return interaction.editReply("🔧 等級系統尚未啟動");
    }

    const cfg = levelSystem.daily;
    const tz = cfg.resetTimezone || "Asia/Taipei";
    const today = DateTime.now().setZone(tz).toISODate();

    const userId = interaction.user.id;
    const guildId = interaction.guildId;

    const todayDoc = await client.dailyCheckinCollection.findOne({
      userId,
      guildId,
      date: today,
    });
    if (!todayDoc) {
      return interaction.editReply(
        "今天沒有簽到紀錄，可以直接跑 `/每日簽到` 測試！"
      );
    }

    await client.dailyCheckinCollection.deleteOne({ _id: todayDoc._id });

    const userDoc = await client.userLevelsCollection.findOne({
      userId,
      guildId,
    });

    // 從歷史紀錄反推真正的 streak：找最近一筆 < today 的紀錄，從那天往回連續計數
    const recentDocs = await client.dailyCheckinCollection
      .find({ userId, guildId, date: { $lt: today } })
      .project({ date: 1 })
      .sort({ date: -1 })
      .limit(60)
      .toArray();

    const dateSet = new Set(recentDocs.map((d) => d.date));

    let newStreak = 0;
    let newLastDailyAt = null;

    if (recentDocs.length > 0) {
      newLastDailyAt = recentDocs[0].date;
      let cursor = DateTime.fromISO(newLastDailyAt, { zone: tz });
      while (dateSet.has(cursor.toISODate())) {
        newStreak += 1;
        cursor = cursor.minus({ days: 1 });
      }
    }

    const newTotalCheckins = Math.max(0, (userDoc?.totalCheckins || 0) - 1);

    await client.userLevelsCollection.updateOne(
      { userId, guildId },
      {
        $set: {
          lastDailyAt: newLastDailyAt,
          streak: newStreak,
          totalCheckins: newTotalCheckins,
          updatedAt: new Date(),
        },
      }
    );

    await interaction.editReply(
      `🔄 已重置今日簽到紀錄。\n` +
        `streak ${userDoc?.streak ?? 0} → ${newStreak}（從歷史紀錄反推）\n` +
        `lastDailyAt → ${newLastDailyAt ?? "null"}\n` +
        `totalCheckins ${userDoc?.totalCheckins ?? 0} → ${newTotalCheckins}\n` +
        `XP **不會**退還（${todayDoc.reward?.xp ?? 0} XP 仍記在帳上）。\n` +
        `現在可以重跑 \`/每日簽到\`。`
    );
  } catch (error) {
    console.log(`[ERROR] /dailytest reset:\n${error}\n${error.stack}`.red);
    await interaction.editReply("🔧 重置失敗，請看 console").catch(() => {});
  }
}
