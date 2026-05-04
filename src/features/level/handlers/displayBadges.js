require("colors");
const { MessageFlags } = require("discord.js");
const { BADGES, BADGE_BY_ID } = require("../../leveling/badgeDefinitions");

const SLOT_NAMES = ["徽章1", "徽章2", "徽章3", "徽章4", "徽章5"];

async function autocomplete(client, interaction) {
  try {
    const focused = interaction.options.getFocused(true);
    if (!SLOT_NAMES.includes(focused.name)) return interaction.respond([]);

    const doc = await client.userLevelsCollection?.findOne({
      userId: interaction.user.id,
      guildId: interaction.guildId,
    });
    const owned = new Set(doc?.badges || []);

    const alreadyPicked = new Set(
      SLOT_NAMES.filter((n) => n !== focused.name)
        .map((n) => interaction.options.getString(n))
        .filter(Boolean)
    );

    const query = (focused.value || "").toLowerCase();
    const opts = BADGES.filter((b) => owned.has(b.id))
      .filter((b) => !alreadyPicked.has(b.id))
      .filter(
        (b) =>
          !query ||
          b.name.toLowerCase().includes(query) ||
          b.id.toLowerCase().includes(query)
      )
      .slice(0, 25)
      .map((b) => ({ name: `${b.emoji} ${b.name}`, value: b.id }));

    await interaction.respond(opts);
  } catch (error) {
    console.log(`[ERROR] /level displaybadges autocomplete: ${error}`.red);
    try {
      await interaction.respond([]);
    } catch {}
  }
}

async function run(client, interaction) {
  const sub = interaction.options.getSubcommand();

  try {
    if (!client.userLevelsCollection) {
      return interaction.reply({
        content: "🔧 等級系統尚未啟動",
        flags: MessageFlags.Ephemeral,
      });
    }

    if (sub === "重置") {
      await client.userLevelsCollection.updateOne(
        { userId: interaction.user.id, guildId: interaction.guildId },
        { $unset: { displayBadges: "" }, $set: { updatedAt: new Date() } }
      );
      return interaction.reply({
        content: "✅ 已回到預設，等級卡會依解鎖順序顯示前 5 個徽章",
        flags: MessageFlags.Ephemeral,
      });
    }

    const picks = SLOT_NAMES.map((n) => interaction.options.getString(n)).filter(
      Boolean
    );

    const seen = new Set();
    for (const id of picks) {
      if (seen.has(id)) {
        const b = BADGE_BY_ID.get(id);
        return interaction.reply({
          content: `❌ 重複選到 ${b ? `${b.emoji} **${b.name}**` : `\`${id}\``}，請每格選不同徽章`,
          flags: MessageFlags.Ephemeral,
        });
      }
      seen.add(id);
    }

    const doc = await client.userLevelsCollection.findOne({
      userId: interaction.user.id,
      guildId: interaction.guildId,
    });
    const owned = new Set(doc?.badges || []);

    for (const id of picks) {
      const b = BADGE_BY_ID.get(id);
      if (!b) {
        return interaction.reply({
          content: `❌ 找不到徽章 \`${id}\``,
          flags: MessageFlags.Ephemeral,
        });
      }
      if (!owned.has(id)) {
        return interaction.reply({
          content: `❌ 你還沒解鎖 ${b.emoji} **${b.name}**`,
          flags: MessageFlags.Ephemeral,
        });
      }
    }

    await client.userLevelsCollection.updateOne(
      { userId: interaction.user.id, guildId: interaction.guildId },
      { $set: { displayBadges: picks, updatedAt: new Date() } },
      { upsert: true }
    );

    const summary = picks
      .map((id) => {
        const b = BADGE_BY_ID.get(id);
        return `${b.emoji} ${b.name}`;
      })
      .join(" ・ ");

    await interaction.reply({
      content: `✅ 已更新展示徽章：${summary}`,
      flags: MessageFlags.Ephemeral,
    });
  } catch (error) {
    console.log(`[ERROR] /level displaybadges ${sub}:\n${error}\n${error.stack}`.red);
    const reply = {
      content: "🔧 操作失敗，請呼叫舒舒！",
      flags: MessageFlags.Ephemeral,
    };
    if (interaction.replied || interaction.deferred) {
      await interaction.editReply(reply).catch(() => {});
    } else {
      await interaction.reply(reply).catch(() => {});
    }
  }
}

module.exports = { run, autocomplete, SLOT_NAMES };
