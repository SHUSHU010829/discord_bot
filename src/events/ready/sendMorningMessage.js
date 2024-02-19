require("colors");

const cron = require("node-cron");
const createMorningMessage = require("../../utils/createMorningMessage");

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
      createMorningMessage(client);
    },
    {
      scheduled: true,
      timezone: "Asia/Taipei",
    }
  );
};
