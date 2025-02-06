require("colors");
const axios = require("axios");

module.exports = async () => {
  const apiUrl = "https://oiapi.net/API/BOfA";

  try {
    const response = await axios.get(apiUrl);
    if (response.status !== 200) {
      return "今天回答不出來：）";
    }
    return response.data;
  } catch (error) {
    console.log(
      `[ERROR] An error occurred inside the getAnswer:\n${error}`.red
    );
    return null;
  }
};
