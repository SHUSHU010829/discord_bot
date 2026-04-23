require("colors");
const OpenCC = require("opencc-js");

// 大陸簡體 → 臺灣正體（含慣用詞轉換）
const converter = OpenCC.Converter({ from: "cn", to: "tw" });

module.exports = async (text) => {
  try {
    return { text: converter(text) };
  } catch (error) {
    console.log(
      `[ERROR] An error occurred inside the changeTraditional:\n${error}`.red
    );
    return null;
  }
};
