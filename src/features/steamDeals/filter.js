/**
 * Decide whether a (xiaoheihe + Steam) record should be pushed.
 *
 * Inputs:
 *   xhh   - record from xiaoheihe (already extracted)
 *   steam - data object from Steam appdetails (or null)
 *
 * Returns { ok: boolean, reason?: string }
 */
const shouldPush = (xhh, steam, filters = {}) => {
  const { skipIfNotInTw = true, alwaysPushIfLowest = true } = filters;

  if (!steam) {
    return skipIfNotInTw
      ? { ok: false, reason: "not-in-tw" }
      : { ok: true };
  }

  // 史低無條件推
  if (alwaysPushIfLowest && (xhh.isLowest || xhh.newLowest)) {
    if (!steam.price_overview) {
      return { ok: false, reason: "lowest-but-no-price" };
    }
    return { ok: true };
  }

  const price = steam.price_overview;
  if (!price) return { ok: false, reason: "no-price-overview" };

  if (!price.discount_percent || price.discount_percent <= 0) {
    return { ok: false, reason: "no-discount-on-tw-store" };
  }

  return { ok: true };
};

module.exports = { shouldPush };
