require("colors");
const {
  AttachmentBuilder,
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  MessageFlags,
} = require("discord.js");

const { getLevelProgress } = require("../../../utils/levelMath");
const { getTier } = require("../../../utils/levelTier");
const generateProfileCard = require("../../../utils/generateProfileCard");
const { BADGES } = require("../../leveling/badgeDefinitions");
const { resolveAccent } = require("../../../utils/cardThemes");
const { getTwitchSubBonus } = require("../../../utils/twitchSubBonus");

async function run(client, interaction) {
  const ephemeral = interaction.options.getBoolean("私密") ?? false;
  await interaction.deferReply({
    flags: ephemeral ? MessageFlags.Ephemeral : 0,
  });

  try {
    if (!client.userLevelsCollection) {
      return interaction.editReply("🔧 等級系統尚未啟動，請聯絡舒舒！");
    }

    const target = interaction.options.getUser("用戶") || interaction.user;
    const member = await interaction.guild.members
      .fetch(target.id)
      .catch(() => null);

    const doc = await client.userLevelsCollection.findOne({
      userId: target.id,
      guildId: interaction.guildId,
    });

    if (!doc) {
      return interaction.editReply(
        `${target.username} 還沒有等級資料！多聊天/開語音才會開始累積喔 🌱`
      );
    }

    const progress = getLevelProgress(doc.totalXp);
    const tier = getTier(progress.level);

    const rank =
      (await client.userLevelsCollection.countDocuments({
        guildId: interaction.guildId,
        totalXp: { $gt: doc.totalXp },
      })) + 1;
    const totalUsers = await client.userLevelsCollection.countDocuments({
      guildId: interaction.guildId,
    });

    const owned = new Set(doc.badges || []);
    const customDisplay = Array.isArray(doc.displayBadges)
      ? doc.displayBadges.filter((id) => owned.has(id))
      : null;
    const badgeIds = (customDisplay && customDisplay.length > 0
      ? customDisplay
      : doc.badges || []
    ).slice(0, 5);

    const badgeDocs = badgeIds.map((id) => {
      const found = BADGES.find((b) => b.id === id);
      if (found) return found;
      return { id, name: id, emoji: "🏅" };
    });

    const displayName = member?.displayName || target.username;
    const titleLine = doc.title ? doc.title : `${tier.emoji} ${tier.label}`;

    const cardAccent = resolveAccent(doc.cardAccent, tier.color);

    const buf = await generateProfileCard({
      username: displayName,
      avatarUrl: target.displayAvatarURL({ extension: "png", size: 256 }),
      level: progress.level,
      currentLevelXp: progress.currentLevelXp,
      xpToNextLevel: progress.xpToNextLevel,
      progress: progress.progress,
      totalXp: doc.totalXp,
      rank,
      totalUsers,
      tier,
      title: titleLine,
      streak: doc.streak || 0,
      streakFreezes: doc.streakFreezes || 0,
      totalMessages: doc.totalMessages || 0,
      totalVoiceMinutes: doc.totalVoiceMinutes || 0,
      badges: badgeDocs,
      cardAccent,
    });

    const fileName = `profile-${target.id}.png`;
    const attachment = new AttachmentBuilder(buf, { name: fileName });

    const twitchSub = getTwitchSubBonus(member);
    const subLine =
      twitchSub.multiplier > 1
        ? ` ・ 💜 ${twitchSub.name}（XP x${twitchSub.multiplier}）`
        : "";

    const accentInt = parseInt(cardAccent.slice(1), 16);
    const container = new ContainerBuilder()
      .setAccentColor(accentInt)
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `## ${tier.emoji} ${displayName} 的等級卡\n-# Lv.${progress.level} ・ ${tier.label} ・ #${rank} / ${totalUsers}${subLine}`
        )
      )
      .addSeparatorComponents(new SeparatorBuilder())
      .addMediaGalleryComponents(
        new MediaGalleryBuilder().addItems(
          new MediaGalleryItemBuilder()
            .setURL(`attachment://${fileName}`)
            .setDescription(`Lv.${progress.level} · ${tier.label}`)
        )
      );

    await interaction.editReply({
      components: [container],
      files: [attachment],
      flags:
        MessageFlags.IsComponentsV2 |
        (ephemeral ? MessageFlags.Ephemeral : 0),
    });
  } catch (error) {
    console.log(`[ERROR] /level profile:\n${error}\n${error.stack}`.red);
    await interaction
      .editReply("🔧 等級卡產生失敗，請呼叫舒舒！")
      .catch(() => {});
  }
}

module.exports = { run };
