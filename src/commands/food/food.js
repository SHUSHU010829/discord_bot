require("colors");

const { SlashCommandBuilder } = require("discord.js");

const {
  CATEGORY_CHOICES,
} = require("../../constants/foodCategories");

const drawHandler = require("../../features/food/handlers/draw");
const drinkHandler = require("../../features/food/handlers/drink");
const listHandler = require("../../features/food/handlers/list");
const rankingHandler = require("../../features/food/handlers/ranking");
const storesHandler = require("../../features/food/handlers/stores");

// 抽食物不含飲料
const FOOD_CHOICES = CATEGORY_CHOICES.filter((c) => c.value !== "beverage");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("food")
    .setDescription("食物與飲料：抽選、清單、排行榜、飲料店 🍽️")
    .addSubcommand((sub) =>
      sub
        .setName("draw")
        .setDescription("食物選擇器!讓逼逼機器人幫你決定吃什麼... 🎰")
        .addStringOption((option) =>
          option
            .setName("類別")
            .setDescription("選擇食物類別（不選則隨機所有類別）")
            .addChoices(...FOOD_CHOICES)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("drink")
        .setDescription("飲料選擇器！讓逼逼機器人幫你決定喝什麼... 🥤")
        .addStringOption((option) =>
          option
            .setName("飲料店")
            .setDescription("選擇飲料店（不選則隨機所有飲料店）")
            .setRequired(false)
            .setAutocomplete(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("list")
        .setDescription("查看現在食物列表... 📚")
        .addStringOption((option) =>
          option
            .setName("類別")
            .setDescription("選擇要查看的食物類別（不選則顯示所有）")
            .addChoices(...CATEGORY_CHOICES)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("ranking")
        .setDescription("查看最受歡迎的食物排行榜 🏆")
        .addStringOption((option) =>
          option
            .setName("類別")
            .setDescription("選擇要查看的食物類別（不選則顯示總排行）")
            .addChoices(...CATEGORY_CHOICES)
        )
        .addIntegerOption((option) =>
          option
            .setName("數量")
            .setDescription("顯示前幾名（預設：10，最多：20）")
            .setMinValue(5)
            .setMaxValue(20)
        )
    )
    .addSubcommand((sub) =>
      sub.setName("stores").setDescription("查看所有可用的飲料店清單 🥤")
    ),

  autocomplete: async (client, interaction) => {
    const sub = interaction.options.getSubcommand();
    if (sub === "drink" && drinkHandler.autocomplete) {
      return drinkHandler.autocomplete(client, interaction);
    }
    return interaction.respond([]).catch(() => {});
  },

  run: async (client, interaction) => {
    const sub = interaction.options.getSubcommand();
    switch (sub) {
      case "draw":
        return drawHandler.run(client, interaction);
      case "drink":
        return drinkHandler.run(client, interaction);
      case "list":
        return listHandler.run(client, interaction);
      case "ranking":
        return rankingHandler.run(client, interaction);
      case "stores":
        return storesHandler.run(client, interaction);
    }
  },
};
