require("colors");
const axios = require("axios");

module.exports = async (name) => {
  // Get the API key from the environment variable
  const apiKey = process.env.CRYPTOCURRENCY_API_KEY;

  const apiUrl = `https://min-api.cryptocompare.com/data/price?fsym=${name}&tsyms=USD`;

  // Add the API key in the request header
  const headers = {
    authorization: `Apikey ${apiKey}`,
  };

  try {
    const response = await axios.get(apiUrl, { headers });
    if (response.status !== 200) {
      console.log(
        `[ERROR] API returned an error: ${response.data.Message}`.red
      );
      return null;
    } else {
      console.log("🚀 ~ module.exports= ~ response:", response.data);
      return response.data;
    }
  } catch (error) {
    console.log(
      `[ERROR] An error occurred inside the cryptocurrency:\n${error.message}`
        .red
    );
    console.log(
      `[ERROR DETAILS] ${JSON.stringify(error.response?.data || error)}`.red
    );
    return null;
  }
};
