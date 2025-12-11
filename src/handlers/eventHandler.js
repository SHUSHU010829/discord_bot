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
          await eventFunction(client, ...args);
        } else {
          console.log(
            `[ERROR] File ${eventFile} does not export a function`.red
          );
        }
      }
    });
  }
};
