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
    await interaction.deferReply();

    try {
      if (!client.userLevelsCollection || !client.dailyCheckinCollection) {
        return interaction.editReply("🔧 等級系統尚未啟動，請聯絡舒舒！");
      }

      const cfg = levelSystem.daily;
      const tz = cfg.resetTimezone || "Asia/Taipei";
      const today = DateTime.now().setZone(tz).toISODate();
      const yesterday = DateTime.now().setZone(tz).minus({ days: 1 }).toISODate();

      const userId = interaction.user.id;
      const guildId = interaction.guildId;

      const already = await client.dailyCheckinCollection.findOne({
        userId,
        guildId,
        date: today,
      });
      if (already) {
        return interaction.editReply(
          `今天已經簽到過了！明天再來吧 🌙\n目前連續：**${already.streak}** 天`
        );
      }

      const userDoc = await client.userLevelsCollection.findOne({
        userId,
        guildId,
      });

      let streak = 1;
      if (userDoc?.lastDailyAt === yesterday) {
        streak = (userDoc.streak || 0) + 1;
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
        )
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            `-# 連續 7 天 +50% ・ 連續 30 天 x2`
          )
        );

      await interaction.editReply({
        components: [container],
        files: [attachment],
        flags: MessageFlags.IsComponentsV2,
      });
    } catch (error) {
      console.log(`[ERROR] /每日簽到:\n${error}\n${error.stack}`.red);
      await interaction
        .editReply("🔧 簽到失敗，請呼叫舒舒！")
        .catch(() => {});
    }
  },
};
