require("colors");

const cron = require("node-cron");
const { DateTime } = require("luxon");

const { normalChannelId } = require("../../config.json");

const calenderData = require("../../data/calender.json");
const getStraw = require("../../utils/getStraw");
const getForeignExchangeRate = require("../../utils/getForeignExchangeRate");

module.exports = (client) => {
  // Schedule createMorningMessage to run every day at 10:00 AM
  // 第一個字段（30）代表分鐘，設定為 30。
  // 第二個字段（2）代表小時，設定為 2。
  // 第三個字段（*）代表一個月中的日子，設定為每天。
  // 第四個字段（*）代表月份，設定為每個月。
  // 第五個字段（*）代表一週中的日子，設定為每天。
  cron.schedule(
    "0 8 * * *",
    async () => {
      const channel = client.channels.cache.get(normalChannelId);

      if (channel) {
        const formattedDate = DateTime.now()
          .setZone("Asia/Taipei")
          .toFormat("yyyy-MM-dd");
        const strawResult = await getStraw();

        if (calenderData) {
          const matchingData = calenderData.find(
            (data) => data.date === formattedDate
          );

          if (matchingData && matchingData.is_holiday === true) {
            if (matchingData.description === null) {
              const message = `早安 <:FlushedHug:1220244873064742972> \n現在是 ${formattedDate} 早上八點鐘\n逼逼機器人開工了！但今天是週末，大家可以繼續睡！<a:nesuDance:1182636277602992169>`;
              channel.send(message);
            } else {
              const message = `早安 <:FlushedHug:1220244873064742972> \n現在是 ${formattedDate} 早上八點鐘\n逼逼機器人開工了！但今天是${matchingData.description}，大家可以繼續睡！<a:nesuDance:1182636277602992169>`;
              channel.send(message);
            }
          } else {
            if (matchingData.description !== null) {
              const message = `早安 <:FlushedHug:1220244873064742972> \n現在是 ${formattedDate} 早上八點鐘\n逼逼機器人開工了！順帶一提今天是${matchingData.description}！嗨起來各位！<a:nesuDance:1182636277602992169>`;
              channel.send(message);
            } else {
              const message = `早安 <:FlushedHug:1220244873064742972> \n現在是 ${formattedDate} 早上八點鐘\n各位早八人請加油好好上課喔 <:FlushedHug:1220244873064742972>\n逼逼機器人繼續睡覺了，晚安 <a:nesuDance:1182636277602992169>`;
              channel.send(message);
            }
          }
        } else {
          const message = `早安 <:FlushedHug:1220244873064742972> \n現在是 ${formattedDate} 早上八點鐘\n逼逼機器人開工了！各位起床起床起床床！！<a:nesuDance:1182636277602992169>\n(今天太神秘了，找不到假期資料？)`;
          channel.send(message);
        }
        if (strawResult) {
          const message = `今日抽卡運勢：**${strawResult}** <:PrideFloat:1220032890658619452>`;
          channel.send(message);
        }
        const foreignExchangeRate = await getForeignExchangeRate(client);
        if (foreignExchangeRate) {
          const message = `\n匯率資訊：USD/NTD - ${foreignExchangeRate["USDTWD"].Exrate}（來源 RTER.info）`;
          channel.send(message);
        }
      } else {
        console.log(`[ERROR] 早安訊息：無法找到目標頻道:\n${error}`.red);
      }
    },
    {
      scheduled: true,
      timezone: "Asia/Taipei",
    }
  );
};
