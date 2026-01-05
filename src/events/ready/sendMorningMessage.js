require("colors");

const cron = require("node-cron");
const { DateTime } = require("luxon");
const { EmbedBuilder } = require("discord.js");

const { normalChannelId, morningMessage } = require("../../config.json");

const calenderData = require("../../data/calender.json");
const getStraw = require("../../utils/getStraw");
const getForeignExchangeRate = require("../../utils/getForeignExchangeRate");

module.exports = (client) => {
  // Schedule createMorningMessage to run every day at configured time
  // 第一個字段（0）代表分鐘，設定為 0。
  // 第二個字段（8）代表小時，設定為 8。
  // 第三個字段（*）代表一個月中的日子，設定為每天。
  // 第四個字段（*）代表月份，設定為每個月。
  // 第五個字段（*）代表一週中的日子，設定為每天。
  cron.schedule(
    morningMessage.cronSchedule,
    async () => {
      const channel = client.channels.cache.get(normalChannelId);

      if (channel) {
        try {
          const now = DateTime.now().setZone(morningMessage.timezone);

          // 格式化日期為 yyyy-MM-dd
          const displayDate = now.toFormat("yyyy-MM-dd");
          const searchDate = now.toFormat("yyyyMMdd");

          // 獲取所有需要的資料
          const strawResult = await getStraw();
          const foreignExchangeRate = await getForeignExchangeRate(client);

          // 查找當日行事曆資料
          const matchingData = calenderData?.find(
            (data) => data.date === searchDate
          );

          // 建立 embed
          const embed = new EmbedBuilder()
            .setColor(0xFFB347) // 溫暖的橘黃色（早晨的顏色）
            .setTitle(`☀️ 早安！${morningMessage.emojis.yaa}`)
            .setTimestamp();

          // 添加日期時間欄位
          embed.addFields({
            name: "📅 日期時間",
            value: `${displayDate} 早上八點`,
            inline: false,
          });

          // 添加節日/特殊日資訊
          if (matchingData) {
            if (matchingData.isHoliday) {
              if (matchingData.description) {
                embed.addFields({
                  name: "🎉 節日資訊",
                  value: `今天是 **${matchingData.description}**，祝大家假期愉快！`,
                  inline: false,
                });
              } else {
                embed.addFields({
                  name: "🎉 節日資訊",
                  value: "今天是週末，好好休息吧！",
                  inline: false,
                });
              }
            } else if (matchingData.description) {
              embed.addFields({
                name: "📌 特殊日",
                value: `今天是 **${matchingData.description}**`,
                inline: false,
              });
            }
          }

          // 添加抽卡運勢
          if (strawResult) {
            embed.addFields({
              name: `🎴 今日抽卡運勢 ${morningMessage.emojis.prideFloat}`,
              value: `**${strawResult}**`,
              inline: true,
            });
          }

          // 添加匯率資訊
          if (foreignExchangeRate && foreignExchangeRate["USDTWD"]) {
            embed.addFields({
              name: "💱 即時匯率",
              value: `USD/TWD - **${foreignExchangeRate["USDTWD"].Exrate}**`,
              inline: true,
            });
          }

          // 添加 footer
          embed.setFooter({
            text: "逼逼機器人祝您有美好的一天！"
          });

          // 發送 embed
          await channel.send({ embeds: [embed] });

        } catch (error) {
          console.log(`[ERROR] 早安訊息發送失敗：\n${error}`.red);
        }
      } else {
        console.log(`[ERROR] 早安訊息：無法找到目標頻道`.red);
      }
    },
    {
      scheduled: true,
      timezone: morningMessage.timezone,
    }
  );
};
