require("colors");

const axios = require("axios");

const {
  SlashCommandBuilder,
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  MessageFlags,
} = require("discord.js");

const LOCATION_TO_REGION = {
  基隆市: "北部地區",
  臺北市: "北部地區",
  新北市: "北部地區",
  桃園市: "北部地區",
  新竹市: "北部地區",
  新竹縣: "北部地區",
  宜蘭縣: "北部地區",
  苗栗縣: "中部地區",
  臺中市: "中部地區",
  彰化縣: "中部地區",
  南投縣: "中部地區",
  雲林縣: "南部地區",
  嘉義市: "南部地區",
  嘉義縣: "南部地區",
  臺南市: "南部地區",
  高雄市: "南部地區",
  屏東縣: "南部地區",
  花蓮縣: "東部地區",
  臺東縣: "東部地區",
  澎湖縣: "離島地區",
  金門縣: "離島地區",
  連江縣: "離島地區",
};

const REGION_META = {
  北部地區: { emoji: "🏙️", order: 1 },
  中部地區: { emoji: "🌾", order: 2 },
  南部地區: { emoji: "🌴", order: 3 },
  東部地區: { emoji: "⛰️", order: 4 },
  離島地區: { emoji: "🏝️", order: 5 },
};

// 將 CWA 天氣描述對應到 emoji（找不到就用 🌤️）
function weatherEmoji(desc) {
  if (!desc) return "🌤️";
  if (/雷/.test(desc)) return "⛈️";
  if (/雪/.test(desc)) return "❄️";
  if (/雨/.test(desc)) return "🌧️";
  if (/陰/.test(desc)) return "☁️";
  if (/多雲/.test(desc)) return "⛅";
  if (/晴/.test(desc)) return "☀️";
  return "🌤️";
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("全台天氣")
    .setDescription("查看全台今日天氣狀況 🌤️"),

  run: async (client, interaction) => {
    try {
      await interaction.deferReply();
      const apiUrl = `https://opendata.cwa.gov.tw/api/v1/rest/datastore/F-C0032-001?Authorization=${process.env.WEATHER_API_KEY}`;
      const response = await axios.get(apiUrl);
      const weatherData = response.data;

      if (weatherData.success !== "true") {
        await interaction.editReply("哎呀！氣象局可能罷工了。");
        console.log(`[ERROR] Can't not get the weather data from the API.`.red);
        return;
      }

      const regionWeather = {
        北部地區: [],
        中部地區: [],
        南部地區: [],
        東部地區: [],
        離島地區: [],
      };

      for (const location of weatherData.records.location) {
        const region = LOCATION_TO_REGION[location.locationName];
        if (!region) continue;
        const elements = location.weatherElement;
        regionWeather[region].push({
          name: location.locationName,
          weather: elements[0].time[0].parameter.parameterName,
          precipitation: elements[1].time[0].parameter.parameterName,
          tempMin: elements[2].time[0].parameter.parameterName,
          tempMax: elements[4].time[0].parameter.parameterName,
        });
      }

      const container = new ContainerBuilder()
        .setAccentColor(0x4a90e2)
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            `# 🌤️ 今日全台天氣預報\n-# 資料來源：中央氣象署 ・ <t:${Math.floor(Date.now() / 1000)}:R>`,
          ),
        );

      const orderedRegions = Object.entries(REGION_META)
        .sort(([, a], [, b]) => a.order - b.order)
        .map(([name]) => name);

      let isFirstRegion = true;
      for (const region of orderedRegions) {
        const cities = regionWeather[region];
        if (!cities || cities.length === 0) continue;

        container.addSeparatorComponents(
          new SeparatorBuilder().setSpacing(
            isFirstRegion
              ? SeparatorSpacingSize.Large
              : SeparatorSpacingSize.Small,
          ),
        );
        isFirstRegion = false;

        const meta = REGION_META[region];
        const cityLines = cities.map((c) => {
          const emoji = weatherEmoji(c.weather);
          return `${emoji} **${c.name}**\n　${c.weather}・🌡 ${c.tempMin}°C ~ ${c.tempMax}°C・☔ ${c.precipitation}%`;
        });

        container.addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            `### ${meta.emoji} ${region}\n${cityLines.join("\n")}`,
          ),
        );
      }

      await interaction.editReply({
        components: [container],
        flags: MessageFlags.IsComponentsV2,
      });
    } catch (error) {
      await interaction
        .editReply("哎呀！氣象局可能罷工了。")
        .catch(() => {});
      console.log(
        `[ERROR] An error occurred inside the all weather city data:\n${error}`
          .red
      );
    }
  },
};
