const { SolarDay } = require("tyme4ts");

/**
 * 獲取農曆資訊（日期、宜忌）
 * @param {number} year - 西曆年
 * @param {number} month - 西曆月
 * @param {number} day - 西曆日
 * @returns {Object} 農曆資訊
 */
function getLunarInfo(year, month, day) {
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
