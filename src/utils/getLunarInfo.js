require("colors");
const { SolarDay } = require("tyme4ts");
const changeTraditional = require("./changeTraditional");

/**
 * 獲取農曆資訊（日期、宜忌）
 * @param {number} year - 西曆年
 * @param {number} month - 西曆月
 * @param {number} day - 西曆日
 * @returns {Object} 農曆資訊
 */
async function getLunarInfo(year, month, day) {
  try {
    const solar = SolarDay.fromYmd(year, month, day);
    const lunar = solar.getLunarDay();
    const lunarMonth = lunar.getLunarMonth();
    const lunarYear = lunarMonth.getLunarYear();

    // 獲取干支和生肖
    const sixtyCycle = lunarYear.getSixtyCycle();
    const zodiac = sixtyCycle.getEarthBranch().getZodiac().toString();

    // 組合農曆日期顯示
    const lunarDateStr = `${sixtyCycle.toString()}年（${zodiac}） ${lunarMonth.getName()}${lunar.getName()}`;

    // 獲取宜忌
    const recommends = lunar.getRecommends().map((r) => r.toString());
    const avoids = lunar.getAvoids().map((a) => a.toString());

    // 轉換簡體字為繁體字
    const textToConvert = [
      lunarDateStr,
      ...recommends,
      ...avoids,
    ].join("|");

    const convertedResult = await changeTraditional(textToConvert);

    // 如果轉換成功，使用繁體字；否則使用原始簡體字
    if (convertedResult && convertedResult.text) {
      const convertedParts = convertedResult.text.split("|");
      const convertedLunarDate = convertedParts[0];
      const convertedRecommends = convertedParts.slice(1, 1 + recommends.length);
      const convertedAvoids = convertedParts.slice(1 + recommends.length);

      return {
        lunarDate: convertedLunarDate,
        lunarYear: sixtyCycle.toString() + "年",
        lunarMonth: lunarMonth.getName(),
        lunarDay: lunar.getName(),
        zodiac: zodiac,
        recommends: convertedRecommends,
        avoids: convertedAvoids,
      };
    }

    // 轉換失敗，返回簡體字版本
    return {
      lunarDate: lunarDateStr,
      lunarYear: sixtyCycle.toString() + "年",
      lunarMonth: lunarMonth.getName(),
      lunarDay: lunar.getName(),
      zodiac: zodiac,
      recommends: recommends,
      avoids: avoids,
    };
  } catch (error) {
    console.log(`[ERROR] 獲取農曆資訊失敗：${error}`.red);
    return null;
  }
}

module.exports = getLunarInfo;
