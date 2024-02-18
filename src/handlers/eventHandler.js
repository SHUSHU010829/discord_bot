const { join } = require("path");
const getAllFiles = require("../utils/getAllFiles");

module.exports = (client) => {
  const eventFolders = getAllFiles(join(__dirname, "..", "events"), true);

  for (const eventFolder of eventFolders) {
    const eventFiles = getAllFiles(eventFolder);
    let eventName;

    eventName = eventFolder.replace(/\\/g, "/").split("/").pop();

    eventName === "validations" ? (eventName = "interactionCreate") : eventName;

    client.on(eventName, async (arg) => {
      for (const eventFile of eventFiles) {
        const eventFunction = require(eventFile);
        if (typeof eventFunction === "function") {
          await eventFunction(client, arg);
        } else {
          console.error(`File ${eventFile} does not export a function`);
        }
      }

    });
  }
};
