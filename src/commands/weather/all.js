require("colors");

const axios = require("axios");

const { SlashCommandBuilder } = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("全台天氣")
    .setDescription("查看全台今日天氣狀況"),

  run: async (client, interaction) => {
    try {
      await interaction.deferReply();
      const apiUrl = `https://opendata.cwa.gov.tw/api/v1/rest/datastore/F-C0032-001?Authorization=${process.env.WEATHER_API_KEY}`;
      const response = await axios.get(apiUrl);
      const weatherData = response.data;

      if (weatherData.success === "true") {
        const locations = weatherData.records.location;
        const locationToRegion = {
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
        // Initialize region-based weather data
        const regionWeatherData = {
          北部地區: [],
          中部地區: [],
          南部地區: [],
          東部地區: [],
          離島地區: [],
        };
        // Iterate through each station
        for (const location of locations) {
          const countryName = location.locationName;
          const region = locationToRegion[countryName];
          const weatherElement = location.weatherElement;
          const weatherInfo = {
            weather: weatherElement[0].time[0].parameter.parameterName, // Weather condition
            precipitation: weatherElement[1].time[0].parameter.parameterName, // Precipitation probability
            temperatureMin: weatherElement[2].time[0].parameter.parameterName, // Minimum temperature
            temperatureMax: weatherElement[4].time[0].parameter.parameterName, // Maximum temperature
          };
          regionWeatherData[region].push({
            countryName,
            weatherInfo,
          });
        }
        // Generate the weather message by region
        let weatherMessage = "今日全台天氣預報：\n";
        const regionsInOrder = [
          "北部地區",
          "中部地區",
          "南部地區",
          "東部地區",
          "離島地區",
        ];
        for (const region of regionsInOrder) {
          if (regionWeatherData[region].length > 0) {
            weatherMessage += `\n⏺︎ ${region}：\n`;
            for (const data of regionWeatherData[region]) {
              const { countryName, weatherInfo } = data;
              const { weather, precipitation, temperatureMin, temperatureMax } =
                weatherInfo;
              weatherMessage += `▫︎ ${countryName}\n➡︎ 【 天氣狀況：${weather} 】【 降雨機率：${precipitation}% 】【 溫度：${temperatureMin}°C - ${temperatureMax}°C 】\n`;
            }
          }
        }
        // Send the weather information as a message
        interaction.editReply(weatherMessage);
      } else {
        interaction.editReply("哎呀！氣象局可能罷工了。");
        console.log(`[ERROR] Can't not get the weather data from the API.`.red);
      }
    } catch (error) {
      interaction.editReply("哎呀！氣象局可能罷工了。");
      console.log(
        `[ERROR] An error occurred inside the all weather city data:\n${error}`
          .red
      );
    }
  },
};
