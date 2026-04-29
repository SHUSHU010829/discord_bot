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

const { levelSystem } = require("../../config.json");
const grantXp = require("../../features/leveling/grantXp");
const generateCheckinCard = require("../../utils/generateCheckinCard");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("每日簽到")
    .setDescription("每日簽到領 XP 🗓️")
    .setDMPermission(false),

  run: async (client, interaction) => {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    try {
      if (!client.userLevelsCollection || !client.dailyCheckinCollection) {
        return interaction.editReply("🔧 等級系統尚未啟動，請聯絡舒舒！");
      }

      const cfg = levelSystem.daily;
      const tz = cfg.resetTimezone || "Asia/Taipei";
      const today = DateTime.now().setZone(tz).toISODate();
      const yesterday = DateTime.now().setZone(tz).minus({ days: 1 }).toISODate();
      const dayBefore = DateTime.now().setZone(tz).minus({ days: 2 }).toISODate();

      const userId = interaction.user.id;
      const guildId = interaction.guildId;

      const already = await client.dailyCheckinCollection.findOne({
        userId,
        guildId,
        date: today,
      });
      if (already) {
        const nextResetTs = Math.floor(
          DateTime.now()
            .setZone(tz)
            .plus({ days: 1 })
            .startOf("day")
            .toSeconds()
        );
        return interaction.editReply(
          `今天已經簽到過了！\n目前連續：**${already.streak}** 天\n下次可簽到：<t:${nextResetTs}:R>（<t:${nextResetTs}:t>）`
        );
      }

      const userDoc = await client.userLevelsCollection.findOne({
        userId,
        guildId,
      });

      // 連勝計算
      const prevStreak = userDoc?.streak || 0;
      const prevFreezes = userDoc?.streakFreezes || 0;
      const maxStock = cfg.maxStreakFreezeStock ?? 3;
      const unlockEvery = cfg.streakFreezeUnlockEvery ?? 30;

      let streak = 1;
      let freezesAfter = prevFreezes;
      let consumedFreeze = false;

      if (userDoc?.lastDailyAt === yesterday) {
        streak = prevStreak + 1;
      } else if (
        userDoc?.lastDailyAt === dayBefore &&
        prevFreezes > 0 &&
        prevStreak > 0
      ) {
        // 用一張保護卡，streak 不歸零
        streak = prevStreak + 1;
        freezesAfter = prevFreezes - 1;
        consumedFreeze = true;
      }

      // 達到 30/60/90... 連勝里程碑且庫存未滿 → +1 保護卡
      let unlockedFreeze = false;
      if (
        unlockEvery > 0 &&
        streak >= unlockEvery &&
        streak % unlockEvery === 0 &&
        freezesAfter < maxStock
      ) {
        freezesAfter += 1;
        unlockedFreeze = true;
      }

      let xp = cfg.baseXp;
      const bonusDays = Math.min(streak, cfg.streakBonusCapDays || 30);
      xp += bonusDays * (cfg.streakBonusPerDay || 0);
      let multiplier = 1;
      if (streak >= 30) multiplier = cfg.streak30Multiplier || 2.0;
      else if (streak >= 7) multiplier = cfg.streak7Multiplier || 1.5;
      xp = Math.floor(xp * multiplier);

      try {
        await client.dailyCheckinCollection.insertOne({
          userId,
          guildId,
          date: today,
          streak,
          usedFreeze: consumedFreeze,
          reward: { xp, bonus: multiplier > 1 },
          createdAt: new Date(),
        });
      } catch (err) {
        if (err?.code === 11000) {
          return interaction.editReply("今天已經簽到過了！明天再來吧 🌙");
        }
        throw err;
      }

      await client.userLevelsCollection.updateOne(
        { userId, guildId },
        {
          $set: {
            lastDailyAt: today,
            streak,
            streakFreezes: freezesAfter,
            longestStreak: Math.max(streak, userDoc?.longestStreak || 0),
            updatedAt: new Date(),
          },
          $inc: { totalCheckins: 1 },
          $setOnInsert: {
            userId,
            guildId,
            badges: [],
            title: null,
            createdAt: new Date(),
          },
        },
        { upsert: true }
      );

      const grantResult = await grantXp(client, {
        userId,
        guildId,
        username: interaction.user.username,
        avatarHash: interaction.user.avatar,
        amount: xp,
        source: "daily",
        counterField: "xpFromDaily",
        member: interaction.member,
        channel: interaction.channel,
      });

      const calendarStart = DateTime.now()
        .setZone(tz)
        .minus({ days: 29 })
        .toISODate();
      const recentCheckins = await client.dailyCheckinCollection
        .find({ userId, guildId, date: { $gte: calendarStart } })
        .toArray();
      const checkinDates = new Set(recentCheckins.map((c) => c.date));

      const buf = await generateCheckinCard({
        username: interaction.member?.displayName || interaction.user.username,
        avatarUrl: interaction.user.displayAvatarURL({
          extension: "png",
          size: 256,
        }),
        streak,
        totalCheckins: (userDoc?.totalCheckins || 0) + 1,
        xpEarned: xp,
        multiplier,
        afterLevel: grantResult?.after,
        checkinDates,
        today,
        timezone: tz,
      });

      const fileName = `checkin-${today}.png`;
      const attachment = new AttachmentBuilder(buf, { name: fileName });

      const container = new ContainerBuilder()
        .setAccentColor(0xc9302c)
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            `## 🗓️ 簽到成功！\n獲得 **+${xp} XP**${
              multiplier > 1 ? ` ・ 連勝加成 x${multiplier}` : ""
            } ・ 連續 **${streak}** 天`
          )
        )
        .addSeparatorComponents(new SeparatorBuilder())
        .addMediaGalleryComponents(
          new MediaGalleryBuilder().addItems(
            new MediaGalleryItemBuilder()
              .setURL(`attachment://${fileName}`)
              .setDescription(`簽到・${today}`)
          )
        );

      const noteLines = [];
      if (consumedFreeze) {
        noteLines.push(
          `🛡️ 你昨天忘了簽到，但消耗 1 張連勝保護卡，連勝沒歸零！剩餘庫存：${freezesAfter}`
        );
      }
      if (unlockedFreeze) {
        noteLines.push(
          `🎁 達成 ${streak} 天連勝里程碑，獲得 1 張連勝保護卡！目前庫存：${freezesAfter}/${maxStock}`
        );
      }
      if (noteLines.length > 0) {
        container
          .addSeparatorComponents(new SeparatorBuilder())
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(noteLines.join("\n"))
          );
      }

      const newBadges = grantResult?.newBadges || [];
      if (newBadges.length > 0) {
        const lines = newBadges
          .map((b) => `${b.emoji} **${b.name}** — ${b.description}`)
          .join("\n");
        container
          .addSeparatorComponents(new SeparatorBuilder())
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
              `🎉 解鎖新徽章：\n${lines}`
            )
          );
      }

      const eventNames = grantResult?.eventNames || [];
      const eventLine =
        eventNames.length > 0
          ? `\n-# ⚡ XP 倍率事件：${eventNames.join("、")}（x${grantResult.multiplier}）`
          : "";

      container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `-# 連續 7 天 +50% ・ 連續 30 天 x2 ・ 🛡️ 庫存 ${freezesAfter}/${maxStock}${eventLine}`
        )
      );

      await interaction.editReply({
        components: [container],
        files: [attachment],
        flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
      });
    } catch (error) {
      console.log(`[ERROR] /每日簽到:\n${error}\n${error.stack}`.red);
      await interaction
        .editReply("🔧 簽到失敗，請呼叫舒舒！")
        .catch(() => {});
    }
  },
};
