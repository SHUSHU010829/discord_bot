require("colors");
const axios = require("axios");

module.exports = async () => {
  const apiUrl = "https://openapi.taifex.com.tw/v1/DailyForeignExchangeRates";

  try {
    const response = await axios.get(apiUrl);
    return response.data;
  } catch (error) {
    console.log(
      `[ERROR] An error occurred inside the exchange rates:\n${error}`.red
    );
    return null;
  }
};
