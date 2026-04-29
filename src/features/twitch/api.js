require("colors");
const axios = require("axios");

const HELIX_BASE = "https://api.twitch.tv/helix";
const OAUTH_TOKEN_URL = "https://id.twitch.tv/oauth2/token";

let cachedToken = null;
let tokenExpiresAt = 0;

const getAccessToken = async () => {
  const clientId = process.env.TWITCH_CLIENT_ID;
  const clientSecret = process.env.TWITCH_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("TWITCH_CLIENT_ID / TWITCH_CLIENT_SECRET 未設定");
  }

  // 提早 60 秒續期，避免邊界過期
  if (cachedToken && Date.now() < tokenExpiresAt - 60_000) {
    return cachedToken;
  }

  const response = await axios.post(
    OAUTH_TOKEN_URL,
    null,
    {
      params: {
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: "client_credentials",
      },
      timeout: 10_000,
    }
  );

  const { access_token, expires_in } = response.data || {};
  if (!access_token) {
    throw new Error("Twitch OAuth 回傳沒有 access_token");
  }
  cachedToken = access_token;
  tokenExpiresAt = Date.now() + (expires_in || 3600) * 1000;
  return cachedToken;
};

const helix = async (endpoint, params) => {
  const token = await getAccessToken();
  const response = await axios.get(`${HELIX_BASE}${endpoint}`, {
    params,
    headers: {
      "Client-ID": process.env.TWITCH_CLIENT_ID,
      Authorization: `Bearer ${token}`,
    },
    timeout: 15_000,
  });
  return response.data;
};

const chunk = (arr, size) => {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
};

const fetchUsersByLogin = async (logins) => {
  const cleaned = [...new Set(logins.map((l) => String(l).trim().toLowerCase()).filter(Boolean))];
  if (cleaned.length === 0) return [];
  const all = [];
  for (const group of chunk(cleaned, 100)) {
    const params = new URLSearchParams();
    group.forEach((login) => params.append("login", login));
    const data = await helix(`/users?${params.toString()}`);
    if (Array.isArray(data?.data)) all.push(...data.data);
  }
  return all;
};

const fetchStreamsByLogin = async (logins) => {
  const cleaned = [...new Set(logins.map((l) => String(l).trim().toLowerCase()).filter(Boolean))];
  if (cleaned.length === 0) return [];
  const all = [];
  for (const group of chunk(cleaned, 100)) {
    const params = new URLSearchParams();
    group.forEach((login) => params.append("user_login", login));
    const data = await helix(`/streams?${params.toString()}`);
    if (Array.isArray(data?.data)) all.push(...data.data);
  }
  return all;
};

module.exports = {
  getAccessToken,
  fetchUsersByLogin,
  fetchStreamsByLogin,
};
