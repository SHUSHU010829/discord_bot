const { readdirSync } = require("fs");
const { join } = require("path");

module.exports = (directory, foldersOnly = false) => {
  let filesNames = [];

  const files = readdirSync(directory, { withFileTypes: true });

  for (const file of files) {
    const filePath = join(directory, file.name);

    if (foldersOnly) {
      if (file.isDirectory()) {
        filesNames.push(filePath);
      }
    } else {
      if (file.isFile()) {
        filesNames.push(filePath);
      }
    }
  }

  return filesNames;
};
