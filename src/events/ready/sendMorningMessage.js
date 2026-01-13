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
          const searchDate = now.toFormat("yyyyMMdd");

          // 獲取所有需要的資料
          const strawResult = await getStraw();
          const foreignExchangeRate = await getForeignExchangeRate(client);

          // 查找當日行事曆資料
          const matchingData = calenderData?.find(
            (data) => data.date === searchDate
          );

          // 格式化日期，包含星期
          const weekDay = matchingData?.week || now.toFormat("ccc");
          const displayDate = `${now.toFormat("yyyy-MM-dd")}（${weekDay}）`;

          // 查找下一個有 description 的日子（不管是否為假期）
          let nextSpecialDay = null;
          let daysUntilSpecialDay = null;
          if (calenderData) {
            const sortedSpecialDays = calenderData
              .filter((data) => data.description && data.description.trim() !== "" && data.date > searchDate)
              .sort((a, b) => a.date.localeCompare(b.date));

            if (sortedSpecialDays.length > 0) {
              nextSpecialDay = sortedSpecialDays[0];
              const specialDate = DateTime.fromFormat(
                nextSpecialDay.date,
                "yyyyMMdd",
                { zone: morningMessage.timezone }
              );
              daysUntilSpecialDay = Math.ceil(
                specialDate.diff(now, "days").days
              );
            }
          }

          // 建立 embed
          const embed = new EmbedBuilder()
            .setColor(0xFFB347) // 溫暖的橘黃色（早晨的顏色）
            .setTitle(`早安！${morningMessage.emojis.yaa}`)
            .setTimestamp();

          // 添加日期時間欄位
          embed.addFields({
            name: "日期時間",
            value: `${displayDate} 早上八點`,
            inline: false,
          });

          // 添加節日/特殊日資訊
          if (matchingData) {
            if (matchingData.isHoliday) {
              if (matchingData.description) {
                embed.addFields({
                  name: "節日資訊",
                  value: `今天是 **${matchingData.description}**，祝大家假期愉快！`,
                  inline: false,
                });
              } else {
                embed.addFields({
                  name: "節日資訊",
                  value: "今天是週末，好好休息吧！",
                  inline: false,
                });
              }
            } else if (matchingData.description) {
              embed.addFields({
                name: "特殊日",
                value: `今天是 **${matchingData.description}**`,
                inline: false,
              });
            }
          }

          // 添加倒數計時資訊（只顯示有 description 的特殊日子）
          if (nextSpecialDay && daysUntilSpecialDay) {
            const specialDayName = nextSpecialDay.description;
            const countdownText = daysUntilSpecialDay === 1
              ? `距離 **${specialDayName}** 還有 **1 天**`
              : `距離 **${specialDayName}** 還有 **${daysUntilSpecialDay} 天**`;

            embed.addFields({
              name: "倒數計時",
              value: countdownText,
              inline: false,
            });
          }

          // 添加抽卡運勢
          if (strawResult) {
            embed.addFields({
              name: `今日抽卡運勢 ${morningMessage.emojis.prideFloat}`,
              value: `**${strawResult}**`,
              inline: true,
            });
          }

          // 添加匯率資訊
          if (foreignExchangeRate && foreignExchangeRate["USDTWD"]) {
            embed.addFields({
              name: "即時匯率",
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
