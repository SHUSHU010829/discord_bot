require("colors");

const cron = require("node-cron");
const { DateTime } = require("luxon");
const { AttachmentBuilder } = require("discord.js");

const { normalChannelId, morningMessage } = require("../../config.json");

const getStraw = require("../../utils/getStraw");
const getLunarInfo = require("../../utils/getLunarInfo");
const findNextSpecialDay = require("../../utils/findNextSpecialDay");
const buildCardData = require("../../utils/buildCardData");
const generateMorningCard = require("../../utils/generateMorningCard");

module.exports = (client) => {
  cron.schedule(
    morningMessage.cronSchedule,
    async () => {
      const channel = client.channels.cache.get(normalChannelId);

      if (!channel) {
        console.log(`[ERROR] 早安訊息：無法找到目標頻道`.red);
        return;
      }

      try {
        const now = DateTime.now().setZone(morningMessage.timezone);

        const strawResult = await getStraw();
        const lunarInfo = await getLunarInfo(now.year, now.month, now.day);
        const { nextSpecialDay, daysUntilSpecialDay } = findNextSpecialDay(
          now,
          morningMessage.timezone
        );

        const cardData = buildCardData({
          now,
          lunarInfo,
          strawResult,
          nextSpecialDay,
          daysUntilSpecialDay,
        });

        const pngBuffer = await generateMorningCard(cardData);
        const attachment = new AttachmentBuilder(pngBuffer, {
          name: `morning-${cardData.serialNo}.png`,
        });

        await channel.send({
          content: `早安！${morningMessage.emojis.yaa}`,
          files: [attachment],
        });
      } catch (error) {
        console.log(`[ERROR] 早安訊息發送失敗：\n${error}`.red);
      }
    },
    {
      scheduled: true,
      timezone: morningMessage.timezone,
    }
  );
};
