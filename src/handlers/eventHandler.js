require("colors");

const { join } = require("path");
const getAllFiles = require("../utils/getAllFiles");

module.exports = (client) => {
  const eventFolders = getAllFiles(join(__dirname, "..", "events"), true);

  for (const eventFolder of eventFolders) {
    const eventFiles = getAllFiles(eventFolder).sort(); // 確保按字母順序執行
    let eventName;

    eventName = eventFolder.replace(/\\/g, "/").split("/").pop();

    eventName === "validations" ? (eventName = "interactionCreate") : eventName;

    client.on(eventName, async (...args) => {
      for (const eventFile of eventFiles) {
        const eventFunction = require(eventFile);
        if (typeof eventFunction === "function") {
          try {
            await eventFunction(client, ...args);
          } catch (err) {
            // 單一 handler 失敗不該讓整個 client 進 'error' 事件而 crash
            console.error(
              `[ERROR] event ${eventName} handler ${eventFile} threw:`.red,
              err,
            );
          }
        } else {
          console.log(
            `[ERROR] File ${eventFile} does not export a function`.red
          );
        }
      }
    });
  }
};
