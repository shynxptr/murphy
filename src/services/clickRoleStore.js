const fs = require("node:fs");
const path = require("node:path");

const dataDirectory = path.join(__dirname, "..", "..", "data");
const dataFile = path.join(dataDirectory, "click-roles.json");

function ensureStore() {
  if (!fs.existsSync(dataDirectory)) {
    fs.mkdirSync(dataDirectory, { recursive: true });
  }

  if (!fs.existsSync(dataFile)) {
    fs.writeFileSync(dataFile, `${JSON.stringify({ lastId: 0, panels: {} }, null, 2)}\n`, "utf8");
  }
}

function readStore() {
  ensureStore();

  try {
    const raw = fs.readFileSync(dataFile, "utf8");
    const parsed = JSON.parse(raw || "{}");

    return {
      lastId: parsed.lastId || 0,
      panels: parsed.panels || {}
    };
  } catch (error) {
    console.error("Failed to read click role store:", error);
    return { lastId: 0, panels: {} };
  }
}

function writeStore(store) {
  ensureStore();
  fs.writeFileSync(dataFile, `${JSON.stringify(store, null, 2)}\n`, "utf8");
}

function createPanel(entry) {
  const store = readStore();
  const nextId = store.lastId + 1;
  const id = String(nextId);

  store.lastId = nextId;
  store.panels[id] = {
    id,
    guildId: entry.guildId,
    channelId: entry.channelId || "",
    messageId: "",
    roleId: entry.roleId,
    roleLabel: entry.roleLabel || "Click to Get Role",
    roleEmoji: entry.roleEmoji || "",
    title: entry.title || "Claim Role",
    description: entry.description || "Klik tombol di bawah untuk mendapatkan role.",
    memberLimit: Math.max(0, Number(entry.memberLimit) || 0),
    color: entry.color || "#111827",
    createdAt: new Date().toISOString()
  };

  writeStore(store);
  return store.panels[id];
}

function getPanel(id) {
  const store = readStore();
  return store.panels[id] || null;
}

function updatePanel(id, updater) {
  const store = readStore();

  if (!store.panels[id]) {
    return null;
  }

  const updated = { ...store.panels[id], ...updater, updatedAt: new Date().toISOString() };
  store.panels[id] = updated;
  writeStore(store);
  return updated;
}

function deletePanel(id) {
  const store = readStore();

  if (!store.panels[id]) {
    return false;
  }

  delete store.panels[id];
  writeStore(store);
  return true;
}

function listPanels(matcher) {
  const store = readStore();
  const panels = Object.values(store.panels);
  return typeof matcher === "function" ? panels.filter(matcher) : panels;
}

module.exports = {
  createPanel,
  getPanel,
  updatePanel,
  deletePanel,
  listPanels
};
