require("colors");

const axios = require("axios");

module.exports = async (userId) => {
  const apiUrl = ``;

  // Request parameters
  const requestData = {

  };

  try {
    const response = await axios.get(apiUrl, { params: requestData });
    return response.data;

  } catch (error) {
    console.log(
      `[ERROR] An error occurred while fetching tweets for user ${userId}:\n${error}`.red
    );
    return null;
  }
};
