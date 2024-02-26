require("colors");
const axios = require("axios");

module.exports = async () => {
  const apiUrl = "https://v1.jinrishici.com/all.json";

  try {
    const response = await axios.get(apiUrl);
    return response.data;
  } catch (error) {
    console.log(
      `[ERROR] An error occurred inside the poem data:\n${error}`.red
    );
    return null;
  }
};
