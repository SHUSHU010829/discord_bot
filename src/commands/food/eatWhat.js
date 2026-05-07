require("colors");

const { SlashCommandBuilder } = require("discord.js");

const { commandEmojis, commandMessages } = require("../../config");
const {
  CATEGORY_CHOICES,
  CATEGORY_LABEL,
} = require("../../constants/foodCategories");
const autocompleteBeverageStore = require("../../utils/autocompleteBeverageStore");

function pickOneName(name) {
  if (typeof name !== "string") return name;
  const parts = name
    .split(/[、,，;；]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  if (parts.length <= 1) return name;
  return parts[Math.floor(Math.random() * parts.length)];
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("吃什麼")
    .setDescription("食物 / 飲料選擇器！讓逼逼機器人幫你決定吃什麼、喝什麼... 🍽️🥤")
    .addStringOption((option) =>
      option
        .setName("類別")
        .setDescription("選擇類別（不選則隨機所有食物與飲料）")
        .addChoices(...CATEGORY_CHOICES)
    )
    .addStringOption((option) =>
      option
        .setName("飲料店")
        .setDescription("指定飲料店（會自動視為飲料類別）")
        .setRequired(false)
        .setAutocomplete(true)
    ),

  autocomplete: autocompleteBeverageStore,

  run: async (client, interaction) => {
    const collection = client.collection;
    const category = interaction.options.getString("類別");
    const beverageStore = interaction.options.getString("飲料店");

    await interaction.deferReply();

    try {
      const isBeverage =
        beverageStore != null || category === "beverage";

      let query = {};
      if (isBeverage) {
        query.category = "beverage";
        if (beverageStore) {
          query.beverageStore = beverageStore;
        }
      } else if (category) {
        query.category = category;
      }

      const items = await collection.find(query).toArray();

      if (items.length === 0) {
        let msg = isBeverage
          ? "目前沒有可供選擇的飲料"
          : "目前沒有可供選擇的";
        if (beverageStore) {
          msg += `（${beverageStore}）`;
        } else if (!isBeverage && category) {
          msg += `${CATEGORY_LABEL[category]}`;
        }
        msg += "選項。";
        return interaction.editReply(msg);
      }

      const picked = items[Math.floor(Math.random() * items.length)];

      await collection.updateOne(
        { _id: picked._id },
        { $inc: { drawCount: 1 } }
      );

      const pickedName = pickOneName(picked.name);

      let replyMessage = "逼逼機器人推薦你可以";

      if (picked.category === "beverage") {
        replyMessage += "喝... ";
        if (picked.beverageStore) {
          replyMessage += `**${picked.beverageStore}** 的 **${pickedName}**！ ${commandEmojis.hiiiiii}`;
        } else {
          replyMessage += `**${pickedName}**！ ${commandEmojis.hiiiiii}`;
        }
      } else {
        if (category && category !== "beverage") {
          replyMessage += `${CATEGORY_LABEL[category]}吃... `;
        } else {
          replyMessage += "吃... ";
        }
        replyMessage += `**${pickedName}**！ ${commandEmojis.hiiiiii}`;
      }

      return interaction.editReply(replyMessage);
    } catch (error) {
      interaction.editReply(commandMessages.getFoodError);
      console.log(
        `[ERROR] An error occurred inside /吃什麼:\n${error}`.red
      );
    }
  },
};
