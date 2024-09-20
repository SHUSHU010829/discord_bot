require("colors");

const { readdirSync } = require("fs");
const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");

const { footerText } = require("../../messageConfig.json");
const buttonPaginator = require("../../utils/buttonPagination");
const command = require("nodemon/lib/config/command");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("help")
    .setDescription("逼逼機器人工作介紹！"),

  run: async (client, interaction) => {
    try {
      return interaction.reply({
        command: "還在製作中...",
      });
    } catch (error) {
      console.log(
        `[ERROR] An error occurred inside the command ask:\n${error}`.red
      );
    }
  },
};
