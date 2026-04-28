require("colors");

const {
  SlashCommandBuilder,
} = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("新增情勒文")
    .setDescription("擴增情勒文庫存")
    .addStringOption((option) =>
      option
        .setName("內文")
        .setDescription("新增您的情勒大作")
        .setRequired(true)
    ),

  run: async (client, interaction) => {
    const { options } = interaction;
    const newPost = options.getString("內文");

    const collection = client.gaslightCollection;

    await interaction.deferReply();

    try {
      const existingPost = await collection.findOne({ post: newPost });
      if (existingPost) {
        await interaction.editReply(`有重複文章了！`);
      } else {
        await collection.insertOne({ post: newPost });
        await interaction.editReply(`已新增新的情勒文！`);
      }
    } catch (error) {
      await interaction.editReply("新增文章失敗，看來文筆有待加強 :(");
      console.log(
        `[ERROR] An error occurred inside the increase gaslight post:\n${error}`.red
      );
    }
  },
};
