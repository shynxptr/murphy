const fs = require("node:fs");
const path = require("node:path");

const dataDirectory = path.join(__dirname, "..", "..", "data");
const dataFile = path.join(dataDirectory, "level-up-card-config.json");

const DEFAULT_LEVEL_UP_CARD_CONFIG = Object.freeze({
  width: 420,
  height: 120,
  borderRadius: 28,
  background: {
    baseStart: "#212529",
    baseMid: "#2a2f34",
    baseEnd: "#1a1e22",
    auraLeft: "rgba(84, 92, 104, 0.42)",
    auraRight: "rgba(128, 139, 150, 0.24)",
    border: "rgba(255,255,255,0.07)"
  },
  avatar: {
    x: 20,
    y: 15,
    size: 88,
    ringStart: "#d7dce0",
    ringEnd: "#6a7078",
    ringWidth: 4
  },
  title: {
    text: "Level-up!",
    centerX: 227,
    y: 53,
    size: 61,
    color: "#fffaf4"
  },
  levels: {
    centerX: 228,
    y: 98,
    size: 49,
    color: "#ece7df",
    separator: "\u2022"
  },
  badge: {
    enabled: true,
    text: "MURPHY",
    x: 332,
    y: 16,
    width: 75,
    height: 24,
    radius: 12,
    fill: "rgba(255,255,255,0.08)",
    border: "rgba(255,255,255,0.08)",
    textColor: "#d6dbe0",
    textSize: 16,
    textCenterX: 369,
    textCenterY: 28
  }
});

function ensureDataFile() {
  if (!fs.existsSync(dataDirectory)) {
    fs.mkdirSync(dataDirectory, { recursive: true });
  }

  if (!fs.existsSync(dataFile)) {
    fs.writeFileSync(dataFile, JSON.stringify(DEFAULT_LEVEL_UP_CARD_CONFIG, null, 2));
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

function normalizeLevelUpCardConfig(input = {}) {
  const merged = mergeDeep(DEFAULT_LEVEL_UP_CARD_CONFIG, input);

  return {
    width: clampNumber(merged.width, DEFAULT_LEVEL_UP_CARD_CONFIG.width, 280, 1200),
    height: clampNumber(merged.height, DEFAULT_LEVEL_UP_CARD_CONFIG.height, 90, 600),
    borderRadius: clampNumber(merged.borderRadius, DEFAULT_LEVEL_UP_CARD_CONFIG.borderRadius, 0, 80),
    background: {
      baseStart: clampColor(merged.background?.baseStart, DEFAULT_LEVEL_UP_CARD_CONFIG.background.baseStart),
      baseMid: clampColor(merged.background?.baseMid, DEFAULT_LEVEL_UP_CARD_CONFIG.background.baseMid),
      baseEnd: clampColor(merged.background?.baseEnd, DEFAULT_LEVEL_UP_CARD_CONFIG.background.baseEnd),
      auraLeft: clampColor(merged.background?.auraLeft, DEFAULT_LEVEL_UP_CARD_CONFIG.background.auraLeft),
      auraRight: clampColor(merged.background?.auraRight, DEFAULT_LEVEL_UP_CARD_CONFIG.background.auraRight),
      border: clampColor(merged.background?.border, DEFAULT_LEVEL_UP_CARD_CONFIG.background.border)
    },
    avatar: {
      x: clampNumber(merged.avatar?.x, DEFAULT_LEVEL_UP_CARD_CONFIG.avatar.x, 0, 1000),
      y: clampNumber(merged.avatar?.y, DEFAULT_LEVEL_UP_CARD_CONFIG.avatar.y, 0, 1000),
      size: clampNumber(merged.avatar?.size, DEFAULT_LEVEL_UP_CARD_CONFIG.avatar.size, 20, 400),
      ringStart: clampColor(merged.avatar?.ringStart, DEFAULT_LEVEL_UP_CARD_CONFIG.avatar.ringStart),
      ringEnd: clampColor(merged.avatar?.ringEnd, DEFAULT_LEVEL_UP_CARD_CONFIG.avatar.ringEnd),
      ringWidth: clampNumber(merged.avatar?.ringWidth, DEFAULT_LEVEL_UP_CARD_CONFIG.avatar.ringWidth, 0, 20)
    },
    title: {
      text: String(merged.title?.text || DEFAULT_LEVEL_UP_CARD_CONFIG.title.text).slice(0, 40),
      centerX: clampNumber(merged.title?.centerX, DEFAULT_LEVEL_UP_CARD_CONFIG.title.centerX, 0, 1500),
      y: clampNumber(merged.title?.y, DEFAULT_LEVEL_UP_CARD_CONFIG.title.y, 0, 1000),
      size: clampNumber(merged.title?.size, DEFAULT_LEVEL_UP_CARD_CONFIG.title.size, 10, 140),
      color: clampColor(merged.title?.color, DEFAULT_LEVEL_UP_CARD_CONFIG.title.color)
    },
    levels: {
      centerX: clampNumber(merged.levels?.centerX, DEFAULT_LEVEL_UP_CARD_CONFIG.levels.centerX, 0, 1500),
      y: clampNumber(merged.levels?.y, DEFAULT_LEVEL_UP_CARD_CONFIG.levels.y, 0, 1000),
      size: clampNumber(merged.levels?.size, DEFAULT_LEVEL_UP_CARD_CONFIG.levels.size, 10, 140),
      color: clampColor(merged.levels?.color, DEFAULT_LEVEL_UP_CARD_CONFIG.levels.color),
      separator: String(merged.levels?.separator || DEFAULT_LEVEL_UP_CARD_CONFIG.levels.separator).slice(0, 4) || "\u2022"
    },
    badge: {
      enabled: Boolean(merged.badge?.enabled),
      text: String(merged.badge?.text || DEFAULT_LEVEL_UP_CARD_CONFIG.badge.text).slice(0, 20),
      x: clampNumber(merged.badge?.x, DEFAULT_LEVEL_UP_CARD_CONFIG.badge.x, 0, 1500),
      y: clampNumber(merged.badge?.y, DEFAULT_LEVEL_UP_CARD_CONFIG.badge.y, 0, 1000),
      width: clampNumber(merged.badge?.width, DEFAULT_LEVEL_UP_CARD_CONFIG.badge.width, 20, 400),
      height: clampNumber(merged.badge?.height, DEFAULT_LEVEL_UP_CARD_CONFIG.badge.height, 16, 120),
      radius: clampNumber(merged.badge?.radius, DEFAULT_LEVEL_UP_CARD_CONFIG.badge.radius, 0, 60),
      fill: clampColor(merged.badge?.fill, DEFAULT_LEVEL_UP_CARD_CONFIG.badge.fill),
      border: clampColor(merged.badge?.border, DEFAULT_LEVEL_UP_CARD_CONFIG.badge.border),
      textColor: clampColor(merged.badge?.textColor, DEFAULT_LEVEL_UP_CARD_CONFIG.badge.textColor),
      textSize: clampNumber(merged.badge?.textSize, DEFAULT_LEVEL_UP_CARD_CONFIG.badge.textSize, 8, 48),
      textCenterX: clampNumber(merged.badge?.textCenterX, DEFAULT_LEVEL_UP_CARD_CONFIG.badge.textCenterX, 0, 1500),
      textCenterY: clampNumber(merged.badge?.textCenterY, DEFAULT_LEVEL_UP_CARD_CONFIG.badge.textCenterY, 0, 1000)
    }
  };
}

function getLevelUpCardConfig() {
  ensureDataFile();

  try {
    const raw = fs.readFileSync(dataFile, "utf8");
    return normalizeLevelUpCardConfig(JSON.parse(raw));
  } catch {
    return normalizeLevelUpCardConfig(DEFAULT_LEVEL_UP_CARD_CONFIG);
  }
}

function saveLevelUpCardConfig(config) {
  ensureDataFile();
  const normalized = normalizeLevelUpCardConfig(config);
  fs.writeFileSync(dataFile, JSON.stringify(normalized, null, 2));
  return normalized;
}

function resetLevelUpCardConfig() {
  return saveLevelUpCardConfig(DEFAULT_LEVEL_UP_CARD_CONFIG);
}

module.exports = {
  DEFAULT_LEVEL_UP_CARD_CONFIG,
  getLevelUpCardConfig,
  normalizeLevelUpCardConfig,
  resetLevelUpCardConfig,
  saveLevelUpCardConfig
};
