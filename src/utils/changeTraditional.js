require("colors");
const axios = require("axios");

module.exports = async (text) => {
  const apiUrl = "https://api.zhconvert.org/convert";

  const requestData = {
    text: text,
    converter: "Traditional",
  };

  try {
    const response = await axios.get(apiUrl, { params: requestData });
    return response.data.data;
  } catch (error) {
    console.log(
      `[ERROR] An error occurred inside the changeTraditional:\n${error}`.red
    );
    return null;
  }
};
