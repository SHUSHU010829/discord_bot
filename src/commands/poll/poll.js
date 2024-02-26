require("colors");

const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
} = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("投票")
    .setDescription("在指定頻道發起投票!")
    .addStringOption((option) =>
      option.setName("問題").setDescription("本次投票主題").setRequired(true)
    )
    .addChannelOption((option) =>
      option.setName('頻道').setDescription('想發起投票頻道').setRequired(true)
    ),

  run: async (client, interaction) => {
    const { options, member } = interaction;
    const channel = options.getChannel("頻道");
    const question = options.getString("問題");

    const embed = new EmbedBuilder()
      .setTitle(`🗳️ ${question}`)
      .setDescription(`發起人: ${member}`)
      .setColor("Random")
      .setTimestamp();

    try {
      const msg = await channel.send({
        embeds: [embed],
      });
      await msg.react("✅");
      await msg.react("❌");
      await interaction.reply({
        content: "投票已發起!",
        ephemeral: true,
      });
    } catch (error) {
      console.log(
        `[ERROR] An error occurred inside the poll data:\n${error}`.red
      );
    }
  },
};
