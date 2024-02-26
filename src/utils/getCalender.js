require("colors");

// const { DateTime } = require("luxon");
// const axios = require("axios");
const calendarData = require("../data/calendarData.json");

module.exports = async () => {
  // const nowYear = DateTime.now().setZone("Asia/Taipei").year;
  // const apiUrl = `https://superiorapis-creator.cteam.com.tw/manager/feature/proxy/b5ee01181d81b040a8dc565992bfa6ffae/pub_00a5c1a2c9bedba7465992cf62dedc?year=${nowYear}`;
  // // Fetch data from both APIs concurrently
  // const headers = {
  //   token: `${process.env.CALENDER_API_KEY}`,
  // };

  // try {
  //   const response = await axios.get(apiUrl, { headers });
  //   return response.data;
  // } catch (error) {
  //   console.log(
  //     `[ERROR] An error occurred inside the getCalender:\n${error}`.red
  //   );
  //   return null;
  // }
  return calendarData;
};
