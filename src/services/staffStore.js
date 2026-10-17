const fs = require("node:fs");
const path = require("node:path");

const dataDirectory = path.join(__dirname, "..", "..", "data");
const dataFile = path.join(dataDirectory, "staff-duty.json");

const DEFAULT_SETTINGS = {
  staffRoleIds: [],
  onDutyRoleId: "",
  logChannelId: "",
  timezone: 7
};

const WEEKDAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];

function ensureStore() {
  if (!fs.existsSync(dataDirectory)) {
    fs.mkdirSync(dataDirectory, { recursive: true });
  }

  if (!fs.existsSync(dataFile)) {
    fs.writeFileSync(dataFile, `${JSON.stringify({ settings: {}, attendance: {}, schedules: {} }, null, 2)}\n`, "utf8");
  }
}

function readStore() {
  ensureStore();

  try {
    const raw = fs.readFileSync(dataFile, "utf8");
    const parsed = JSON.parse(raw || "{}");

    return {
      settings: parsed.settings || {},
      attendance: parsed.attendance || {},
      schedules: parsed.schedules || {}
    };
  } catch (error) {
    console.error("Failed to read staff duty store:", error);
    return { settings: {}, attendance: {}, schedules: {} };
  }
}

function writeStore(store) {
  ensureStore();
  fs.writeFileSync(dataFile, `${JSON.stringify(store, null, 2)}\n`, "utf8");
}

// === Settings ===

function getSettings(guildId) {
  const store = readStore();
  const s = store.settings[guildId] || {};
  return { ...DEFAULT_SETTINGS, ...s };
}

function updateSettings(guildId, updater) {
  const store = readStore();
  const current = { ...DEFAULT_SETTINGS, ...(store.settings[guildId] || {}) };
  const next = updater(current);
  store.settings[guildId] = next;
  writeStore(store);
  return next;
}

// === Attendance ===

function getUserKey(guildId, userId) {
  return `${guildId}:${userId}`;
}

function getTodayKey(timezone = 7) {
  const now = new Date();
  const local = new Date(now.getTime() + timezone * 3600000);
  return local.toISOString().slice(0, 10);
}

function getActiveAttendance(guildId, userId) {
  const store = readStore();
  const key = getUserKey(guildId, userId);
  const userRecords = store.attendance[key] || [];
  const today = getTodayKey(getSettings(guildId).timezone);
  return userRecords.find((r) => r.dateKey === today && !r.checkoutAt) || null;
}

function checkIn(guildId, userId) {
  const store = readStore();
  const key = getUserKey(guildId, userId);
  const settings = getSettings(guildId);
  const today = getTodayKey(settings.timezone);

  if (!store.attendance[key]) {
    store.attendance[key] = [];
  }

  // Cek apakah sudah check-in hari ini
  const existing = store.attendance[key].find(
    (r) => r.dateKey === today && !r.checkoutAt
  );

  if (existing) {
    return { ok: false, reason: "Kamu sudah check-in hari ini." };
  }

  store.attendance[key].push({
    dateKey: today,
    checkinAt: new Date().toISOString(),
    checkoutAt: null,
    durationMs: 0
  });

  writeStore(store);
  return { ok: true, checkinAt: new Date().toISOString() };
}

function checkOut(guildId, userId) {
  const store = readStore();
  const key = getUserKey(guildId, userId);
  const settings = getSettings(guildId);
  const today = getTodayKey(settings.timezone);

  if (!store.attendance[key]) {
    return { ok: false, reason: "Kamu belum check-in hari ini." };
  }

  const record = store.attendance[key].find(
    (r) => r.dateKey === today && !r.checkoutAt
  );

  if (!record) {
    return { ok: false, reason: "Kamu belum check-in hari ini." };
  }

  const now = new Date();
  record.checkoutAt = now.toISOString();
  record.durationMs = now.getTime() - new Date(record.checkinAt).getTime();

  writeStore(store);
  return { ok: true, checkoutAt: record.checkoutAt, durationMs: record.durationMs };
}

function getAttendanceRecords(guildId, userId, options = {}) {
  const store = readStore();
  const key = getUserKey(guildId, userId);
  const records = store.attendance[key] || [];

  let filtered = records;

  if (options.days) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - options.days);
    filtered = records.filter((r) => new Date(r.dateKey) >= cutoff);
  }

  return filtered;
}

function getAllAttendanceForGuild(guildId) {
  const store = readStore();
  const prefix = `${guildId}:`;
  const result = {};

  for (const [key, records] of Object.entries(store.attendance)) {
    if (key.startsWith(prefix)) {
      const userId = key.slice(prefix.length);
      result[userId] = records;
    }
  }

  return result;
}

// === Schedule ===

function getSchedule(guildId, userId) {
  const store = readStore();
  const key = getUserKey(guildId, userId);
  const schedule = store.schedules[key];

  if (!schedule) {
    return {};
  }

  return schedule;
}

function setDaySchedule(guildId, userId, day, startHour, endHour) {
  const store = readStore();
  const key = getUserKey(guildId, userId);

  if (!store.schedules[key]) {
    store.schedules[key] = {};
  }

  if (startHour === null || endHour === null) {
    // Libur
    store.schedules[key][day] = { off: true };
  } else {
    store.schedules[key][day] = {
      start: startHour,
      end: endHour
    };
  }

  writeStore(store);
  return store.schedules[key][day];
}

module.exports = {
  DEFAULT_SETTINGS,
  WEEKDAYS,
  getSettings,
  updateSettings,
  getTodayKey,
  getActiveAttendance,
  checkIn,
  checkOut,
  getAttendanceRecords,
  getAllAttendanceForGuild,
  getSchedule,
  setDaySchedule
};
