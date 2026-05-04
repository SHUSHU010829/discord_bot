require("colors");

const { commandEmojis } = require("../../../config");
const autocompleteBeverageStore = require("../../../utils/autocompleteBeverageStore");

async function run(client, interaction) {
  const collection = client.collection;
  const beverageStore = interaction.options.getString("飲料店");

  await interaction.deferReply();

  try {
    let query = { category: "beverage" };

    if (beverageStore) {
      query.beverageStore = beverageStore;
    }

    const beverageList = await collection.find(query).toArray();

    if (beverageList.length > 0) {
      const randomBeverage =
        beverageList[Math.floor(Math.random() * beverageList.length)];

      await collection.updateOne(
        { _id: randomBeverage._id },
        { $inc: { drawCount: 1 } }
      );

      let replyMessage = `逼逼機器人推薦你可以喝... `;

      if (randomBeverage.beverageStore) {
        replyMessage += `**${randomBeverage.beverageStore}** 的 **${randomBeverage.name}**！ ${commandEmojis.hiiiiii}`;
      } else {
        replyMessage += `**${randomBeverage.name}**！ ${commandEmojis.hiiiiii}`;
      }

      interaction.editReply(replyMessage);
    } else {
      let noBeverageMsg = "目前沒有可供選擇的飲料";
      if (beverageStore) {
        noBeverageMsg += `（${beverageStore}）`;
      }
      noBeverageMsg += "選項。";
      interaction.editReply(noBeverageMsg);
    }
  } catch (error) {
    interaction.editReply("🔧 獲取飲料清單失敗，請呼叫舒舒！");
    console.log(
      `[ERROR] An error occurred inside the drink selector:\n${error}`.red
    );
  }
}

module.exports = { run, autocomplete: autocompleteBeverageStore };
