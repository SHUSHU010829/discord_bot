require("colors");

const axios = require("axios");

const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");

const VALID_LOCATIONS = [
  "臺北市",
  "新北市",
  "桃園市",
  "臺中市",
  "臺南市",
  "高雄市",
  "基隆市",
  "新竹市",
  "嘉義市",
  "新竹縣",
  "苗栗縣",
  "彰化縣",
  "南投縣",
  "雲林縣",
  "嘉義縣",
  "屏東縣",
  "宜蘭縣",
  "花蓮縣",
  "臺東縣",
  "澎湖縣",
  "金門縣",
  "連江縣",
];

module.exports = {
  data: new SlashCommandBuilder()
    .setName("天氣")
    .setDescription("查詢個別縣市天氣預報。")
    .addStringOption((option) =>
      option
        .setName("縣市名稱")
        .setDescription("輸入台灣的縣市名稱")
        .setRequired(true)
    ),

  run: async (client, interaction) => {
    const locationName = interaction.options.getString("縣市名稱");
    const modifiedLocationName = locationName.replace(/^台/, "臺");

    // 先驗證縣市名稱再 defer，避免使用者看到「抓取中」後又秒被打回
    if (!VALID_LOCATIONS.includes(modifiedLocationName)) {
      return interaction.reply({
        content: `我找不到 [${modifiedLocationName}] 這個縣市 <a:think:1196806259152789514>`,
        ephemeral: true,
      });
    }

    await interaction.deferReply();

    try {
      const apiUrl = `https://opendata.cwa.gov.tw/api/v1/rest/datastore/F-C0032-001?Authorization=${process.env.WEATHER_API_KEY}&locationName=${modifiedLocationName}`;
      const response = await axios.get(apiUrl);
      const weatherData = response.data;

      if (weatherData.success !== "true") {
        console.log(
          `[ERROR] Weather API returned non-success for ${modifiedLocationName}`
            .red
        );
        return interaction.editReply("哎呀！氣象局可能罷工了。");
      }

      const locationData = weatherData.records.location[0];
      const weatherElement = locationData.weatherElement;

      const weatherInfo = {
        weather: weatherElement[0].time[0].parameter.parameterName, // 天氣狀況 (Wx)
        precipitation: `${weatherElement[1].time[0].parameter.parameterName}%`, // 降雨機率 (PoP)
        temperature: `${weatherElement[2].time[0].parameter.parameterName}°C - ${weatherElement[4].time[0].parameter.parameterName}°C`, // 溫度範圍 (MinT 和 MaxT)
      };

      const embed = new EmbedBuilder()
        .setColor("Random")
        .setTitle(`今日${locationData.locationName}天氣預報 🌤️`)
        .setAuthor({
          name: "中央氣象署",
          iconURL: "https://openweathermap.org/img/wn/10d@2x.png",
          url: "https://www.cwa.gov.tw/V8/C/",
        })
        .addFields(
          { name: "🔅 溫度", value: weatherInfo.temperature },
          { name: "🔅 降雨機率", value: weatherInfo.precipitation },
          { name: "🔅 天氣狀況", value: weatherInfo.weather }
        );

      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      await interaction.editReply("哎呀！氣象局可能罷工了。");
      console.log(
        `[ERROR] An error occurred inside the weather city data:\n${error}`.red
      );
    }
  },
};
