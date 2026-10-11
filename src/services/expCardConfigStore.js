const fs = require("node:fs");
const path = require("node:path");

const dataDirectory = path.join(__dirname, "..", "..", "data");
const dataFile = path.join(dataDirectory, "exp-card-config.json");

const DEFAULT_EXP_CARD_CONFIG = Object.freeze({
  width: 600,
  height: 112,
  borderRadius: 24,
  background: {
    baseStart: "#262a2f",
    baseEnd: "#2f343a",
    border: "rgba(255,255,255,0.06)",
    accentGlow: "rgba(147, 163, 178, 0.16)"
  },
  avatar: {
    x: 12,
    y: 8,
    size: 92,
    radius: 14
  },
  username: {
    x: 120,
    y: 41,
    size: 36,
    color: "#f4f7fb"
  },
  xp: {
    textX: 301,
    y: 51,
    size: 23,
    color: "#e8edf2",
    suffix: "XP"
  },
  level: {
    x: 122,
    y: 82,
    size: 27,
    color: "#bcc4cc",
    prefix: "Lv :"
  },
  progress: {
    x: 240,
    y: 65,
    width: 336,
    height: 18,
    radius: 9,
    background: "rgba(255,255,255,0.07)",
    fillStart: "#232424",
    fillEnd: "#75a7e1",
    border: "rgba(255,255,255,0.08)"
  },
  badge: {
    enabled: true,
    text: "MURPHY",
    x: 512,
    y: 10,
    width: 74,
    height: 24,
    radius: 12,
    fill: "rgba(255,255,255,0.08)",
    border: "rgba(255,255,255,0.08)",
    textColor: "#d6dbe0",
    textSize: 14,
    textCenterX: 551,
    textCenterY: 22
  }
});

function ensureDataFile() {
  if (!fs.existsSync(dataDirectory)) {
    fs.mkdirSync(dataDirectory, { recursive: true });
  }

  if (!fs.existsSync(dataFile)) {
    fs.writeFileSync(dataFile, JSON.stringify(DEFAULT_EXP_CARD_CONFIG, null, 2));
  }
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function mergeDeep(base, patch) {
  if (!isPlainObject(base) || !isPlainObject(patch)) {
    return patch;
  }

  const output = { ...base };

  for (const [key, value] of Object.entries(patch)) {
    if (isPlainObject(value) && isPlainObject(base[key])) {
      output[key] = mergeDeep(base[key], value);
      continue;
    }

    output[key] = value;
  }

  return output;
}

function clampNumber(value, fallback, min = null, max = null) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  if (typeof min === "number" && parsed < min) {
    return min;
  }

  if (typeof max === "number" && parsed > max) {
    return max;
  }

  return parsed;
}

function clampColor(value, fallback) {
  const text = String(value || "").trim();
  return text ? text : fallback;
}

function normalizeExpCardConfig(input = {}) {
  const merged = mergeDeep(DEFAULT_EXP_CARD_CONFIG, input);

  return {
    width: clampNumber(merged.width, DEFAULT_EXP_CARD_CONFIG.width, 280, 1600),
    height: clampNumber(merged.height, DEFAULT_EXP_CARD_CONFIG.height, 72, 600),
    borderRadius: clampNumber(merged.borderRadius, DEFAULT_EXP_CARD_CONFIG.borderRadius, 0, 80),
    background: {
      baseStart: clampColor(merged.background?.baseStart, DEFAULT_EXP_CARD_CONFIG.background.baseStart),
      baseEnd: clampColor(merged.background?.baseEnd, DEFAULT_EXP_CARD_CONFIG.background.baseEnd),
      border: clampColor(merged.background?.border, DEFAULT_EXP_CARD_CONFIG.background.border),
      accentGlow: clampColor(merged.background?.accentGlow, DEFAULT_EXP_CARD_CONFIG.background.accentGlow)
    },
    avatar: {
      x: clampNumber(merged.avatar?.x, DEFAULT_EXP_CARD_CONFIG.avatar.x, 0, 1500),
      y: clampNumber(merged.avatar?.y, DEFAULT_EXP_CARD_CONFIG.avatar.y, 0, 1500),
      size: clampNumber(merged.avatar?.size, DEFAULT_EXP_CARD_CONFIG.avatar.size, 20, 500),
      radius: clampNumber(merged.avatar?.radius, DEFAULT_EXP_CARD_CONFIG.avatar.radius, 0, 120)
    },
    username: {
      x: clampNumber(merged.username?.x, DEFAULT_EXP_CARD_CONFIG.username.x, 0, 1500),
      y: clampNumber(merged.username?.y, DEFAULT_EXP_CARD_CONFIG.username.y, 0, 1500),
      size: clampNumber(merged.username?.size, DEFAULT_EXP_CARD_CONFIG.username.size, 8, 120),
      color: clampColor(merged.username?.color, DEFAULT_EXP_CARD_CONFIG.username.color)
    },
    xp: {
      textX: clampNumber(merged.xp?.textX, DEFAULT_EXP_CARD_CONFIG.xp.textX, 0, 1500),
      y: clampNumber(merged.xp?.y, DEFAULT_EXP_CARD_CONFIG.xp.y, 0, 1500),
      size: clampNumber(merged.xp?.size, DEFAULT_EXP_CARD_CONFIG.xp.size, 8, 120),
      color: clampColor(merged.xp?.color, DEFAULT_EXP_CARD_CONFIG.xp.color),
      suffix: String(merged.xp?.suffix || DEFAULT_EXP_CARD_CONFIG.xp.suffix).slice(0, 12)
    },
    level: {
      x: clampNumber(merged.level?.x, DEFAULT_EXP_CARD_CONFIG.level.x, 0, 1500),
      y: clampNumber(merged.level?.y, DEFAULT_EXP_CARD_CONFIG.level.y, 0, 1500),
      size: clampNumber(merged.level?.size, DEFAULT_EXP_CARD_CONFIG.level.size, 8, 120),
      color: clampColor(merged.level?.color, DEFAULT_EXP_CARD_CONFIG.level.color),
      prefix: String(merged.level?.prefix || DEFAULT_EXP_CARD_CONFIG.level.prefix).slice(0, 24)
    },
    progress: {
      x: clampNumber(merged.progress?.x, DEFAULT_EXP_CARD_CONFIG.progress.x, 0, 1500),
      y: clampNumber(merged.progress?.y, DEFAULT_EXP_CARD_CONFIG.progress.y, 0, 1500),
      width: clampNumber(merged.progress?.width, DEFAULT_EXP_CARD_CONFIG.progress.width, 10, 1500),
      height: clampNumber(merged.progress?.height, DEFAULT_EXP_CARD_CONFIG.progress.height, 4, 200),
      radius: clampNumber(merged.progress?.radius, DEFAULT_EXP_CARD_CONFIG.progress.radius, 0, 100),
      background: clampColor(merged.progress?.background, DEFAULT_EXP_CARD_CONFIG.progress.background),
      fillStart: clampColor(merged.progress?.fillStart, DEFAULT_EXP_CARD_CONFIG.progress.fillStart),
      fillEnd: clampColor(merged.progress?.fillEnd, DEFAULT_EXP_CARD_CONFIG.progress.fillEnd),
      border: clampColor(merged.progress?.border, DEFAULT_EXP_CARD_CONFIG.progress.border)
    },
    badge: {
      enabled: Boolean(merged.badge?.enabled),
      text: String(merged.badge?.text || DEFAULT_EXP_CARD_CONFIG.badge.text).slice(0, 20),
      x: clampNumber(merged.badge?.x, DEFAULT_EXP_CARD_CONFIG.badge.x, 0, 1500),
      y: clampNumber(merged.badge?.y, DEFAULT_EXP_CARD_CONFIG.badge.y, 0, 1000),
      width: clampNumber(merged.badge?.width, DEFAULT_EXP_CARD_CONFIG.badge.width, 20, 400),
      height: clampNumber(merged.badge?.height, DEFAULT_EXP_CARD_CONFIG.badge.height, 16, 120),
      radius: clampNumber(merged.badge?.radius, DEFAULT_EXP_CARD_CONFIG.badge.radius, 0, 60),
      fill: clampColor(merged.badge?.fill, DEFAULT_EXP_CARD_CONFIG.badge.fill),
      border: clampColor(merged.badge?.border, DEFAULT_EXP_CARD_CONFIG.badge.border),
      textColor: clampColor(merged.badge?.textColor, DEFAULT_EXP_CARD_CONFIG.badge.textColor),
      textSize: clampNumber(merged.badge?.textSize, DEFAULT_EXP_CARD_CONFIG.badge.textSize, 8, 48),
      textCenterX: clampNumber(merged.badge?.textCenterX, DEFAULT_EXP_CARD_CONFIG.badge.textCenterX, 0, 1500),
      textCenterY: clampNumber(merged.badge?.textCenterY, DEFAULT_EXP_CARD_CONFIG.badge.textCenterY, 0, 1000)
    }
  };
}

function getExpCardConfig() {
  ensureDataFile();

  try {
    const raw = fs.readFileSync(dataFile, "utf8");
    return normalizeExpCardConfig(JSON.parse(raw));
  } catch {
    return normalizeExpCardConfig(DEFAULT_EXP_CARD_CONFIG);
  }
}

function saveExpCardConfig(config) {
  ensureDataFile();
  const normalized = normalizeExpCardConfig(config);
  fs.writeFileSync(dataFile, JSON.stringify(normalized, null, 2));
  return normalized;
}

function resetExpCardConfig() {
  return saveExpCardConfig(DEFAULT_EXP_CARD_CONFIG);
}

module.exports = {
  DEFAULT_EXP_CARD_CONFIG,
  getExpCardConfig,
  normalizeExpCardConfig,
  resetExpCardConfig,
  saveExpCardConfig
};
