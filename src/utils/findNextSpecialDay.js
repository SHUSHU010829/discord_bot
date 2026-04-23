const { DateTime } = require("luxon");

const calenderData = require("../data/calender.json");

/**
 * 找出當日之後第一個帶有 description 的日子，以及還有幾天。
 *
 * @param {DateTime} now
 * @param {string} timezone
 * @returns {{ nextSpecialDay: object|null, daysUntilSpecialDay: number|null }}
 */
function findNextSpecialDay(now, timezone) {
  const searchDate = now.toFormat("yyyyMMdd");

  if (!calenderData) {
    return { nextSpecialDay: null, daysUntilSpecialDay: null };
  }

  const sortedSpecialDays = calenderData
    .filter(
      (data) =>
        data.description &&
        data.description.trim() !== "" &&
        data.date > searchDate
    )
    .sort((a, b) => a.date.localeCompare(b.date));

  if (sortedSpecialDays.length === 0) {
    return { nextSpecialDay: null, daysUntilSpecialDay: null };
  }

  const nextSpecialDay = sortedSpecialDays[0];
  const specialDate = DateTime.fromFormat(nextSpecialDay.date, "yyyyMMdd", {
    zone: timezone,
  });
  const daysUntilSpecialDay = Math.ceil(specialDate.diff(now, "days").days);

  return { nextSpecialDay, daysUntilSpecialDay };
}

module.exports = findNextSpecialDay;
