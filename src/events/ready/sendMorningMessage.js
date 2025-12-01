require("colors");

const cron = require("node-cron");
const { DateTime } = require("luxon");

const { normalChannelId, morningMessage } = require("../../config.json");

const calenderData = require("../../data/calender.json");
const getStraw = require("../../utils/getStraw");
const getForeignExchangeRate = require("../../utils/getForeignExchangeRate");

module.exports = (client) => {
  // Schedule createMorningMessage to run every day at configured time
  // 第一個字段（30）代表分鐘，設定為 30。
  // 第二個字段（2）代表小時，設定為 2。
  // 第三個字段（*）代表一個月中的日子，設定為每天。
  // 第四個字段（*）代表月份，設定為每個月。
  // 第五個字段（*）代表一週中的日子，設定為每天。
  cron.schedule(
    morningMessage.cronSchedule,
    async () => {
      const channel = client.channels.cache.get(normalChannelId);

      if (channel) {
        const formattedDate = DateTime.now()
          .setZone(morningMessage.timezone)
          .toFormat("yyyy-MM-dd");
        const strawResult = await getStraw();

        if (calenderData) {
          const matchingData = calenderData.find(
            (data) => data.date === formattedDate
          );

          if (matchingData && matchingData.is_holiday === true) {
            if (matchingData.description === "") {
              const message = morningMessage.templates.weekendNoDescription
                .replace("{date}", formattedDate)
                .replace("{yaa}", morningMessage.emojis.yaa)
                .replace("{babySit}", morningMessage.emojis.babySit);
              channel.send(message);
            } else {
              const message = morningMessage.templates.holidayWithDescription
                .replace("{date}", formattedDate)
                .replace("{holiday}", matchingData.description)
                .replace("{yaa}", morningMessage.emojis.yaa)
                .replace("{babySit}", morningMessage.emojis.babySit);
              channel.send(message);
            }
          } else {
            if (matchingData.description !== "") {
              const message = morningMessage.templates.workdayWithDescription
                .replace("{date}", formattedDate)
                .replace("{description}", matchingData.description)
                .replace("{yaa}", morningMessage.emojis.yaa)
                .replace("{babySit}", morningMessage.emojis.babySit);
              channel.send(message);
            } else {
              const message = morningMessage.templates.workdaySleep
                .replace("{date}", formattedDate)
                .replace("{yaa}", morningMessage.emojis.yaa)
                .replace("{babySit}", morningMessage.emojis.babySit);
              channel.send(message);
            }
          }
        } else {
          const message = morningMessage.templates.noCalendarData
            .replace("{date}", formattedDate)
            .replace("{babySit}", morningMessage.emojis.babySit);
          channel.send(message);
        }
        if (strawResult) {
          const message = morningMessage.templates.fortune
            .replace("{fortune}", strawResult)
            .replace("{prideFloat}", morningMessage.emojis.prideFloat);
          channel.send(message);
        }
        const foreignExchangeRate = await getForeignExchangeRate(client);
        if (foreignExchangeRate) {
          const message = morningMessage.templates.exchangeRate
            .replace("{rate}", foreignExchangeRate["USDTWD"].Exrate);
          channel.send(message);
        }
      } else {
        console.log(`[ERROR] 早安訊息：無法找到目標頻道:\n${error}`.red);
      }
    },
    {
      scheduled: true,
      timezone: morningMessage.timezone,
    }
  );
};
