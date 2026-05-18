require("colors");
const {
  ActionRowBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  MessageFlags,
} = require("discord.js");
const { ObjectId } = require("mongodb");

const equipItem = require("../../features/shop/equipItem");
const { buildInventoryView } = require("../../features/shop/inventoryView");

const EQUIP_BTN_PREFIX = "shop_equip_btn_";
const TITLE_OPEN_PREFIX = "shop_title_open_";
const TITLE_MODAL_PREFIX = "shop_title_modal_";
const EQUIP_SELECT_PREFIX = "shop_equip_select_";
const TITLE_SELECT_ID = "shop_title_select";

function isValidObjectId(id) {
  if (typeof id !== "string") return false;
  try {
    return new ObjectId(id).toString() === id;
  } catch (_) {
    return false;
  }
}

function buildTitleModal(inventoryId) {
  const modal = new ModalBuilder()
    .setCustomId(`${TITLE_MODAL_PREFIX}${inventoryId}`)
    .setTitle("設定自訂稱號");
  const input = new TextInputBuilder()
    .setCustomId("title_text")
    .setLabel("稱號文字（最多 24 字）")
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMinLength(1)
    .setMaxLength(24);
  modal.addComponents(new ActionRowBuilder().addComponents(input));
  return modal;
}

async function handleEquipButton(client, interaction, inventoryId) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const result = await equipItem(client, {
    userId: interaction.user.id,
    guildId: interaction.guildId,
    member: interaction.member,
    guild: interaction.guild,
    inventoryId,
  });
  if (!result.ok) return interaction.editReply(`❌ ${result.error}`);
  await interaction.editReply(`✅ 已裝備 **${result.item.name}**`);
}

async function handleEquipFromInventorySelect(client, interaction, inventoryId) {
  await interaction.deferUpdate();
  const result = await equipItem(client, {
    userId: interaction.user.id,
    guildId: interaction.guildId,
    member: interaction.member,
    guild: interaction.guild,
    inventoryId,
  });

  if (!result.ok) {
    return interaction.followUp({
      content: `❌ ${result.error}`,
      flags: MessageFlags.Ephemeral,
    });
  }

  try {
    const view = await buildInventoryView(client, {
      userId: interaction.user.id,
      guildId: interaction.guildId,
      username: interaction.user.username,
    });
    await interaction.editReply(view);
  } catch (err) {
    console.log(`[ERROR] refresh inventory view: ${err}`.red);
  }

  await interaction
    .followUp({
      content: `✅ 已裝備 **${result.item.name}**`,
      flags: MessageFlags.Ephemeral,
    })
    .catch(() => {});
}

async function handleTitleModalSubmit(client, interaction, inventoryId) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const text = interaction.fields.getTextInputValue("title_text");
  if (!text || !text.trim()) {
    return interaction.editReply("❌ 稱號不可為空");
  }
  const result = await equipItem(client, {
    userId: interaction.user.id,
    guildId: interaction.guildId,
    member: interaction.member,
    guild: interaction.guild,
    inventoryId,
    titleText: text,
  });
  if (!result.ok) return interaction.editReply(`❌ ${result.error}`);
  await interaction.editReply(
    `✅ 已將稱號設為「${text.trim().slice(0, 24)}」`,
  );
}

async function replyInvalidId(interaction) {
  try {
    if (interaction.deferred || interaction.replied) return;
    await interaction.reply({
      content: "❌ 道具識別碼無效",
      flags: MessageFlags.Ephemeral,
    });
  } catch (_) {
    /* noop */
  }
}

module.exports = async (client, interaction) => {
  try {
    if (!client.userInventoryCollection) return;

    if (
      interaction.isButton() &&
      interaction.customId?.startsWith(EQUIP_BTN_PREFIX)
    ) {
      const invId = interaction.customId.slice(EQUIP_BTN_PREFIX.length);
      if (!isValidObjectId(invId)) return replyInvalidId(interaction);
      return handleEquipButton(client, interaction, invId);
    }

    if (
      interaction.isButton() &&
      interaction.customId?.startsWith(TITLE_OPEN_PREFIX)
    ) {
      const invId = interaction.customId.slice(TITLE_OPEN_PREFIX.length);
      if (!isValidObjectId(invId)) return replyInvalidId(interaction);
      return interaction.showModal(buildTitleModal(invId));
    }

    if (
      interaction.isStringSelectMenu() &&
      interaction.customId?.startsWith(EQUIP_SELECT_PREFIX)
    ) {
      const invId = interaction.values?.[0];
      if (!isValidObjectId(invId)) return replyInvalidId(interaction);
      return handleEquipFromInventorySelect(client, interaction, invId);
    }

    if (
      interaction.isStringSelectMenu() &&
      interaction.customId === TITLE_SELECT_ID
    ) {
      const invId = interaction.values?.[0];
      if (!isValidObjectId(invId)) return replyInvalidId(interaction);
      return interaction.showModal(buildTitleModal(invId));
    }

    if (
      interaction.isModalSubmit() &&
      interaction.customId?.startsWith(TITLE_MODAL_PREFIX)
    ) {
      const invId = interaction.customId.slice(TITLE_MODAL_PREFIX.length);
      if (!isValidObjectId(invId)) return replyInvalidId(interaction);
      return handleTitleModalSubmit(client, interaction, invId);
    }
  } catch (error) {
    console.log(`[ERROR] handleShopInteraction:\n${error}\n${error.stack}`.red);
    try {
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply({ content: "🔧 處理商店互動時發生錯誤" });
      } else if (
        interaction.isModalSubmit?.() ||
        interaction.isMessageComponent?.()
      ) {
        await interaction.reply({
          content: "🔧 處理商店互動時發生錯誤",
          flags: MessageFlags.Ephemeral,
        });
      }
    } catch (_) {
      /* noop */
    }
  }
};
