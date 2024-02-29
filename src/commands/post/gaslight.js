require("colors");

const {
    SlashCommandBuilder,
    PermissionFlagsBits,
    EmbedBuilder,
} = require("discord.js");
const getPoem = require("../../utils/getPoem");
const changeTraditional = require("../../utils/changeTraditional");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("生成情勒文")
        .setDescription("這裡有現成的情勒文，歡迎偷偷拿走！"),

    run: async (client, interaction) => {
        const collection = client.gaslightCollection;

        const msg = await interaction.reply({
            content: "生成中... 🎰",
            fetchReply: true,
        });

        try {
            const postList = await collection.find({}).toArray();
            if (postList.length > 0) {
                const randomFood =
                    postList[Math.floor(Math.random() * postList.length)].post;
                interaction.editReply(randomFood);
            } else {
                interaction.editReply("目前沒有情勒文庫存。");
            }
        } catch (error) {
            interaction.editReply("🔧 獲取情勒文失敗，請呼叫舒舒！");
            console.log(
                `[ERROR] An error occurred inside the draw lot:\n${error}`.red
            );
        }
    },
};
