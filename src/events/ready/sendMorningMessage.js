require("colors");

const cron = require("node-cron");
const { DateTime } = require("luxon");

const calenderData = require("../../data/calender.json");
const { normalChannelId } = require("../../config.json");

module.exports = (client) => {
  // Schedule createMorningMessage to run every day at 10:00 AM
  // 第一個字段（30）代表分鐘，設定為 30。
  // 第二個字段（2）代表小時，設定為 2。
  // 第三個字段（*）代表一個月中的日子，設定為每天。
  // 第四個字段（*）代表月份，設定為每個月。
  // 第五個字段（*）代表一週中的日子，設定為每天。
  cron.schedule(
    "0 10 * * *",
    () => {
      const channel = client.channels.cache.get(normalChannelId);

      if (channel) {
        const formattedDate = DateTime.now()
          .setZone("Asia/Taipei")
          .toFormat("yyyy-MM-dd");
        const fortuneList = ["大吉", "中吉", "小吉", "平凡無奇", "凶", "大凶"];
        const randomFortune =
          fortuneList[Math.floor(Math.random() * fortuneList.length)];

        if (calenderData) {
          const matchingData = calenderData.find(
            (data) => data.date === formattedDate
          );

          if (matchingData && matchingData.is_holiday === true) {
            if (matchingData.description === null) {
              const message = `早安 <:FlushedHug:1220244873064742972> \n現在是 ${formattedDate} 10:00 A.M.\n逼逼機器人開工了！\n但今天是週末，大家可以繼續睡！！<a:nesuDance:1182636277602992169>\n今日抽卡運勢：**${randomFortune}** <:PrideFloat:1220032890658619452>  `;
              channel.send(message);
            } else {
              const message = `早安 <:FlushedHug:1220244873064742972> \n現在是 ${formattedDate} 10:00 A.M.\n逼逼機器人開工了！\n但今天是${matchingData.description}，大家可以繼續睡！！<a:nesuDance:1182636277602992169>\n今日抽卡運勢：**${randomFortune}** <:PrideFloat:1220032890658619452>  `;
              channel.send(message);
            }
          } else {
            const message = `早安 <:FlushedHug:1220244873064742972> \n現在是 ${formattedDate} 10:00 A.M.\n逼逼機器人開工了！\n各位起床起床起床床！！<a:nesuDance:1182636277602992169>\n今日抽卡運勢：**${randomFortune}** <:PrideFloat:1220032890658619452>  `;
            channel.send(message);
          }
        } else {
          const message = `早安 <:FlushedHug:1220244873064742972> \n現在是 ${formattedDate} 10:00 A.M.\n逼逼機器人開工了！\n各位起床起床起床床！！<a:nesuDance:1182636277602992169>\n今日抽卡運勢：**${randomFortune}** <:PrideFloat:1220032890658619452> (今天太神秘了，找不到假期資料？)`;
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
