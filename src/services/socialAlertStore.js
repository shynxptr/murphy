const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const dataDirectory = path.join(__dirname, "..", "..", "data");
const dataFile = path.join(dataDirectory, "social-alerts.json");

function ensureStore() {
  if (!fs.existsSync(dataDirectory)) {
    fs.mkdirSync(dataDirectory, { recursive: true });
  }

  if (!fs.existsSync(dataFile)) {
    fs.writeFileSync(
      dataFile,
      `${JSON.stringify({ nextId: 1, feeds: {} }, null, 2)}\n`,
      "utf8"
    );
  }
}

function readStore() {
  ensureStore();

  try {
    const raw = fs.readFileSync(dataFile, "utf8");
    const parsed = JSON.parse(raw || "{}");

    return {
      nextId: Number.isInteger(parsed.nextId) && parsed.nextId > 0 ? parsed.nextId : 1,
      feeds: parsed.feeds && typeof parsed.feeds === "object" ? parsed.feeds : {}
    };
  } catch (error) {
    console.error("Failed to read social alert store:", error);
    return {
      nextId: 1,
      feeds: {}
    };
  }
}

function writeStore(store) {
  ensureStore();
  fs.writeFileSync(dataFile, `${JSON.stringify(store, null, 2)}\n`, "utf8");
}

function normalizeUsername(username) {
  return String(username || "")
    .trim()
    .replace(/^@+/, "")
    .replace(/\s+/g, "")
    .toLowerCase();
}

function generateSecretToken() {
  return crypto.randomBytes(16).toString("hex");
}

function listFeeds(filter) {
  const store = readStore();
  const entries = Object.values(store.feeds);
  return typeof filter === "function" ? entries.filter(filter) : entries;
}

function getGuildFeeds(guildId) {
  return listFeeds((feed) => feed.guildId === guildId);
}

function getFeedById(feedId) {
  const store = readStore();
  return store.feeds[String(feedId)] || null;
}

function getGuildFeed(guildId, feedId) {
  const feed = getFeedById(feedId);
  if (!feed || feed.guildId !== guildId) {
    return null;
  }
  return feed;
}

function findGuildFeedByAccount(guildId, platform, username) {
  const normalized = normalizeUsername(username);
  return listFeeds(
    (feed) =>
      feed.guildId === guildId
      && feed.platform === platform
      && normalizeUsername(feed.username) === normalized
  )[0] || null;
}

function findFeedBySecretToken(secretToken) {
  const token = String(secretToken || "").trim();
  if (!token) {
    return null;
  }
  return listFeeds((feed) => feed.secretToken === token)[0] || null;
}

function findFeedByWebhookId(webhookId) {
  const id = String(webhookId || "").trim();
  if (!id) {
    return null;
  }
  return listFeeds((feed) => feed.webhookId === id)[0] || null;
}

function upsertFeed(guildId, payload) {
  const store = readStore();
  const platform = String(payload.platform || "tiktok").toLowerCase();
  const username = normalizeUsername(payload.username);
  const existing = Object.values(store.feeds).find(
    (item) =>
      item.guildId === guildId
      && item.platform === platform
      && normalizeUsername(item.username) === username
  );

  const now = new Date().toISOString();

  if (existing) {
    const updated = {
      ...existing,
      ...payload,
      id: existing.id,
      guildId,
      platform,
      username,
      secretToken: existing.secretToken || generateSecretToken(),
      updatedAt: now
    };
    store.feeds[existing.id] = updated;
    writeStore(store);
    return updated;
  }

  const id = String(store.nextId++);
  const created = {
    id,
    guildId,
    platform,
    username,
    displayName: payload.displayName || username,
    avatarUrl: payload.avatarUrl || "",
    channelId: payload.channelId || "",
    roleId: payload.roleId || "",
    customMessage: payload.customMessage || "",
    watchLive: payload.watchLive !== undefined ? Boolean(payload.watchLive) : true,
    enabled: payload.enabled !== undefined ? Boolean(payload.enabled) : true,
    lastPostId: payload.lastPostId || "",
    lastPostUrl: payload.lastPostUrl || "",
    lastPostAt: payload.lastPostAt || "",
    isLive: Boolean(payload.isLive),
    lastLiveRoomId: payload.lastLiveRoomId || "",
    lastLiveAt: payload.lastLiveAt || "",
    webhookId: payload.webhookId || "",
    webhookToken: payload.webhookToken || "",
    webhookUrl: payload.webhookUrl || "",
    secretToken: payload.secretToken || generateSecretToken(),
    createdAt: now,
    updatedAt: now
  };

  store.feeds[id] = created;
  writeStore(store);
  return created;
}

function updateFeed(feedId, updater) {
  const store = readStore();
  const current = store.feeds[String(feedId)];

  if (!current) {
    return null;
  }

  const next = typeof updater === "function" ? updater(current) : { ...current, ...updater };
  store.feeds[String(feedId)] = {
    ...current,
    ...next,
    id: current.id,
    updatedAt: new Date().toISOString()
  };

  writeStore(store);
  return store.feeds[String(feedId)];
}

function deleteFeed(guildId, feedId) {
  const store = readStore();
  const current = store.feeds[String(feedId)];

  if (!current || current.guildId !== guildId) {
    return null;
  }

  delete store.feeds[String(feedId)];
  writeStore(store);
  return current;
}

module.exports = {
  deleteFeed,
  findFeedBySecretToken,
  findFeedByWebhookId,
  findGuildFeedByAccount,
  getFeedById,
  getGuildFeed,
  getGuildFeeds,
  listFeeds,
  normalizeUsername,
  updateFeed,
  upsertFeed
};

