require("colors");

const { DateTime } = require("luxon");
const calenderData = require("../data/calender.json");
const { normalChannelId } = require("../config.json");

module.exports = async (client) => {
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
          const message = `早安🫡\n現在是 ${formattedDate} 早上十點鐘。\n逼逼機器人開工了！\n但今天是週末，大家可以繼續睡！！<a:nesuDance:1182636277602992169>\n今日抽卡運勢：**${randomFortune}**。`;
          channel.send(message);
        } else {
          const message = `早安🫡\n現在是 ${formattedDate} 早上十點鐘。\n逼逼機器人開工了！\n但今天是${matchingData.description}，大家可以繼續睡！！<a:nesuDance:1182636277602992169>\n今日抽卡運勢：**${randomFortune}**。`;
          channel.send(message);
        }
      } else {
        const message = `早安🫡\n現在是 ${formattedDate} 早上十點鐘。\n逼逼機器人開工了！\n各位起床起床起床床！！<a:nesuDance:1182636277602992169>\n今日抽卡運勢：**${randomFortune}**。`;
        channel.send(message);
      }
    } else {
      const message = `早安，現在是 ${formattedDate} 早上十點鐘。\n逼逼機器人開工了！\n各位起床起床起床床！！<a:nesuDance:1182636277602992169>\n今日抽卡運勢：**${randomFortune}**。(今天太神秘了，找不到假期資料？)`;
      channel.send(message);
    }
  } else {
    console.log(`[ERROR] 早安訊息：無法找到目標頻道:\n${error}`.red);
  }
};
