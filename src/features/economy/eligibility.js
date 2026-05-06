const { coinSystem, welfareSystem } = require("../../config");

const DAY_MS = 24 * 60 * 60 * 1000;

const getMinServerTenureDays = () =>
  coinSystem?.eligibility?.minServerTenureDays ?? 7;

const getMinAccountAgeDays = () =>
  welfareSystem?.minAccountAgeDays ?? 30;

const checkServerTenure = (member) => {
  const minDays = getMinServerTenureDays();
  if (!minDays || minDays <= 0) return { ok: true };
  const joinedAt = member?.joinedTimestamp;
  if (!joinedAt) {
    return {
      ok: false,
      reason: "no_join_data",
      minDays,
      remainingDays: minDays,
      message: `🕒 找不到你的入伺時間，請稍後再試。`,
    };
  }
  const ageDays = (Date.now() - joinedAt) / DAY_MS;
  if (ageDays >= minDays) return { ok: true };
  const eligibleEpoch = Math.floor((joinedAt + minDays * DAY_MS) / 1000);
  return {
    ok: false,
    reason: "server_tenure",
    minDays,
    remainingDays: minDays - ageDays,
    eligibleEpoch,
    message:
      `🕒 加入伺服器需滿 **${minDays}** 天才能使用金幣系統。\n` +
      `可使用時間：<t:${eligibleEpoch}:R>（<t:${eligibleEpoch}:f>）`,
  };
};

const checkAccountAge = (user) => {
  const minDays = getMinAccountAgeDays();
  if (!minDays || minDays <= 0) return { ok: true };
  const createdAt = user?.createdTimestamp;
  if (!createdAt) {
    return {
      ok: false,
      reason: "no_account_data",
      minDays,
      remainingDays: minDays,
      message: `🕒 找不到你的帳號建立時間，請稍後再試。`,
    };
  }
  const ageDays = (Date.now() - createdAt) / DAY_MS;
  if (ageDays >= minDays) return { ok: true };
  const eligibleEpoch = Math.floor((createdAt + minDays * DAY_MS) / 1000);
  return {
    ok: false,
    reason: "account_age",
    minDays,
    remainingDays: minDays - ageDays,
    eligibleEpoch,
    message:
      `🕒 Discord 帳號需建立滿 **${minDays}** 天才能領取救濟金。\n` +
      `可領取時間：<t:${eligibleEpoch}:R>（<t:${eligibleEpoch}:f>）`,
  };
};

module.exports = {
  checkServerTenure,
  checkAccountAge,
};
