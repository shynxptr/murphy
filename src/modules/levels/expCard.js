const { AttachmentBuilder } = require("discord.js");
const { Canvas, GlobalFonts, loadImage } = require("@napi-rs/canvas");
const path = require("node:path");
const {
  getExpCardConfig,
  normalizeExpCardConfig
} = require("../../services/expCardConfigStore");

const assetsDirectory = path.join(__dirname, "..", "..", "..", "assets");
const customFontPath = path.join(assetsDirectory, "font.otf");
const obscuraBackgroundPath = path.join(assetsDirectory, "profile-obscura-bg.png");
const noctisBackgroundPath = path.join(assetsDirectory, "profile-noctis-bg.png");
const eclipseBackgroundPath = path.join(assetsDirectory, "profile-eclipse-bg.png");

const regularFontRegistered = GlobalFonts.registerFromPath(customFontPath, "Murphy Gothic");
const boldFontRegistered = GlobalFonts.registerFromPath(customFontPath, "Murphy Gothic Bold");
const fallbackRegularRegistered = GlobalFonts.registerFromPath("C:\\Windows\\Fonts\\segoeui.ttf", "Segoe UI");
const fallbackBoldRegistered = GlobalFonts.registerFromPath("C:\\Windows\\Fonts\\segoeuib.ttf", "Segoe UI Bold");

function getFontFamily(weight = "regular") {
  if (weight === "bold" && boldFontRegistered) {
    return "Murphy Gothic Bold";
  }

  if (regularFontRegistered) {
    return "Murphy Gothic";
  }

  if (weight === "bold" && fallbackBoldRegistered) {
    return "Segoe UI Bold";
  }

  if (fallbackRegularRegistered) {
    return "Segoe UI";
  }

  return "sans-serif";
}

function drawRoundedRect(context, x, y, width, height, radius) {
  context.beginPath();
  context.moveTo(x + radius, y);
  context.lineTo(x + width - radius, y);
  context.quadraticCurveTo(x + width, y, x + width, y + radius);
  context.lineTo(x + width, y + height - radius);
  context.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  context.lineTo(x + radius, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - radius);
  context.lineTo(x, y + radius);
  context.quadraticCurveTo(x, y, x + radius, y);
  context.closePath();
}

function fitText(context, value, maxWidth, fallback = "-") {
  const text = String(value || fallback);

  if (context.measureText(text).width <= maxWidth) {
    return text;
  }

  let trimmed = text;

  while (trimmed.length > 1 && context.measureText(`${trimmed}...`).width > maxWidth) {
    trimmed = trimmed.slice(0, -1);
  }

  return `${trimmed}...`;
}

function formatNumber(value) {
  return new Intl.NumberFormat("id-ID").format(Math.max(0, Number(value || 0)));
}

function getTierVisual(levelInfo) {
  const level = Number(levelInfo?.level || 0);

  if (level >= 5) {
    return "eclipse";
  }

  if (level >= 4) {
    return "noctis";
  }

  if (level >= 3) {
    return "obscura";
  }

  return "default";
}

async function loadRemoteImage(url) {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Failed to fetch image: ${response.status}`);
  }

  return loadImage(Buffer.from(await response.arrayBuffer()));
}

async function loadAvatarImage(member) {
  const avatarUrl = member.user.displayAvatarURL({
    extension: "png",
    forceStatic: true,
    size: 512
  });

  return loadRemoteImage(avatarUrl);
}

async function loadLocalImage(filePath) {
  try {
    return await loadImage(filePath);
  } catch {
    return null;
  }
}

function getRenderConfig(levelInfo, config) {
  const visual = getTierVisual(levelInfo);

  if (visual === "obscura") {
    return {
      ...config,
      background: {
        ...config.background,
        baseStart: "#08111a",
        baseEnd: "#04070b",
        border: "rgba(119, 231, 216, 0.14)",
        accentGlow: "rgba(119, 231, 216, 0.1)"
      },
      username: {
        ...config.username,
        color: "#f6fbff"
      },
      xp: {
        ...config.xp,
        color: "#d7edf1"
      },
      level: {
        ...config.level,
        color: "#b8c8d1"
      },
      progress: {
        ...config.progress,
        background: "rgba(255,255,255,0.08)",
        fillStart: "#143840",
        fillEnd: "#77e7d8",
        border: "rgba(119,231,216,0.16)"
      },
      badge: {
        ...config.badge,
        enabled: config.badge?.enabled !== false,
        text: "OBSCURA",
        fill: "rgba(119,231,216,0.12)",
        border: "rgba(119,231,216,0.16)",
        textColor: "#def7f4"
      }
    };
  }

  if (visual === "noctis") {
    return {
      ...config,
      background: {
        ...config.background,
        baseStart: "#0b1016",
        baseEnd: "#05080d",
        border: "rgba(143, 183, 255, 0.16)",
        accentGlow: "rgba(143, 183, 255, 0.12)"
      },
      username: {
        ...config.username,
        color: "#eff5fd"
      },
      xp: {
        ...config.xp,
        color: "#dce7f8"
      },
      level: {
        ...config.level,
        color: "#c1cfde"
      },
      progress: {
        ...config.progress,
        background: "rgba(255,255,255,0.09)",
        fillStart: "#22364f",
        fillEnd: "#8fb7ff",
        border: "rgba(143,183,255,0.18)"
      },
      badge: {
        ...config.badge,
        enabled: config.badge?.enabled !== false,
        text: "NOCTIS",
        fill: "rgba(143,183,255,0.12)",
        border: "rgba(143,183,255,0.18)",
        textColor: "#e0ebff"
      }
    };
  }

  if (visual === "eclipse") {
    return {
      ...config,
      background: {
        ...config.background,
        baseStart: "#140d10",
        baseEnd: "#050405",
        border: "rgba(216, 179, 106, 0.18)",
        accentGlow: "rgba(216, 179, 106, 0.12)"
      },
      username: {
        ...config.username,
        color: "#f7efe2"
      },
      xp: {
        ...config.xp,
        color: "#ecd8b0"
      },
      level: {
        ...config.level,
        color: "#d7c4a5"
      },
      progress: {
        ...config.progress,
        background: "rgba(255,255,255,0.08)",
        fillStart: "#6a1f29",
        fillEnd: "#d8b36a",
        border: "rgba(216,179,106,0.16)"
      },
      badge: {
        ...config.badge,
        enabled: config.badge?.enabled !== false,
        text: "ECLIPSE",
        fill: "rgba(216,179,106,0.14)",
        border: "rgba(216,179,106,0.2)",
        textColor: "#f0e2c4"
      }
    };
  }

  return config;
}

function getTierBackgroundPath(levelInfo) {
  const visual = getTierVisual(levelInfo);

  if (visual === "obscura") {
    return obscuraBackgroundPath;
  }

  if (visual === "noctis") {
    return noctisBackgroundPath;
  }

  if (visual === "eclipse") {
    return eclipseBackgroundPath;
  }

  return null;
}

function drawBackground(context, width, height, config, options = {}) {
  const gradient = context.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, config.background.baseStart);
  gradient.addColorStop(1, config.background.baseEnd);
  context.fillStyle = gradient;
  drawRoundedRect(context, 0, 0, width, height, config.borderRadius);
  context.fill();

  if (options.backgroundImage) {
    context.save();
    drawRoundedRect(context, 0, 0, width, height, config.borderRadius);
    context.clip();
    context.globalAlpha = options.backgroundOpacity ?? 0.42;
    context.drawImage(options.backgroundImage, 0, 0, width, height);
    context.restore();
  } else {
    context.save();
    context.filter = "blur(34px)";
    const glow = context.createRadialGradient(width - 120, height / 2, 12, width - 120, height / 2, 180);
    glow.addColorStop(0, config.background.accentGlow);
    glow.addColorStop(1, "rgba(0,0,0,0)");
    context.fillStyle = glow;
    context.fillRect(width - 280, -30, 320, height + 60);
    context.restore();
  }

  context.strokeStyle = config.background.border;
  context.lineWidth = 1;
  drawRoundedRect(context, 0.5, 0.5, width - 1, height - 1, config.borderRadius);
  context.stroke();
}

function drawAvatar(context, avatar, member, config) {
  const x = config.avatar.x;
  const y = config.avatar.y;
  const size = config.avatar.size;

  context.save();
  drawRoundedRect(context, x, y, size, size, config.avatar.radius);
  context.clip();

  if (avatar) {
    context.drawImage(avatar, x, y, size, size);
  } else {
    const fallback = context.createLinearGradient(x, y, x + size, y + size);
    fallback.addColorStop(0, "#4a4f55");
    fallback.addColorStop(1, "#262a2f");
    context.fillStyle = fallback;
    context.fillRect(x, y, size, size);
    context.fillStyle = "#f4f7fb";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.font = `bold ${Math.round(size * 0.44)}px "${getFontFamily("bold")}"`;
    context.fillText((member.displayName || member.user.username).charAt(0).toUpperCase(), x + (size / 2), y + (size / 2));
    context.textAlign = "start";
    context.textBaseline = "alphabetic";
  }

  context.restore();
}

function drawTexts(context, member, levelInfo, config) {
  context.fillStyle = config.username.color;
  context.font = `bold ${config.username.size}px "${getFontFamily("bold")}"`;
  context.textAlign = "start";
  context.fillText(
    fitText(context, member.displayName || member.user.username, config.progress.x - config.username.x - 18),
    config.username.x,
    config.username.y
  );

  context.fillStyle = config.xp.color;
  context.font = `${config.xp.size}px "${getFontFamily()}"`;
  context.textAlign = "right";
  context.fillText(`${formatNumber(levelInfo.xp)} ${config.xp.suffix}`, config.xp.textX, config.xp.y);

  context.fillStyle = config.level.color;
  context.font = `${config.level.size}px "${getFontFamily()}"`;
  context.textAlign = "start";
  context.fillText(`${config.level.prefix} ${levelInfo.level}`, config.level.x, config.level.y);
}

function drawBadge(context, config) {
  if (!config.badge?.enabled) {
    return;
  }

  context.fillStyle = config.badge.fill;
  drawRoundedRect(context, config.badge.x, config.badge.y, config.badge.width, config.badge.height, config.badge.radius);
  context.fill();

  context.strokeStyle = config.badge.border;
  context.lineWidth = 1;
  drawRoundedRect(context, config.badge.x, config.badge.y, config.badge.width, config.badge.height, config.badge.radius);
  context.stroke();

  context.fillStyle = config.badge.textColor;
  context.font = `bold ${config.badge.textSize}px "${getFontFamily("bold")}"`;
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(config.badge.text, config.badge.textCenterX, config.badge.textCenterY);
  context.textAlign = "start";
  context.textBaseline = "alphabetic";
}

function drawProgress(context, levelInfo, config) {
  const x = config.progress.x;
  const y = config.progress.y;
  const width = config.progress.width;
  const height = config.progress.height;
  const fillWidth = levelInfo.level >= 5
    ? width
    : Math.max(0, Math.round(width * Math.max(0, Math.min(1, levelInfo.progressRatio))));

  context.fillStyle = config.progress.background;
  drawRoundedRect(context, x, y, width, height, config.progress.radius);
  context.fill();

  if (fillWidth > 0) {
    const fill = context.createLinearGradient(x, y, x + width, y);
    fill.addColorStop(0, config.progress.fillStart);
    fill.addColorStop(1, config.progress.fillEnd);
    context.fillStyle = fill;
    drawRoundedRect(context, x, y, fillWidth, height, config.progress.radius);
    context.fill();
  }

  context.strokeStyle = config.progress.border;
  context.lineWidth = 1;
  drawRoundedRect(context, x, y, width, height, config.progress.radius);
  context.stroke();
}

async function createExpCard(member, levelInfo, configOverride = null) {
  const rawConfig = configOverride
    ? normalizeExpCardConfig(configOverride)
    : getExpCardConfig();
  const config = getRenderConfig(levelInfo, rawConfig);
  const canvas = new Canvas(config.width, config.height);
  const context = canvas.getContext("2d");
  const avatar = await loadAvatarImage(member).catch(() => null);
  const backgroundImagePath = getTierBackgroundPath(levelInfo);
  const backgroundImage = backgroundImagePath ? await loadLocalImage(backgroundImagePath) : null;
  const backgroundOpacity = backgroundImage ? 0.48 : undefined;

  drawBackground(context, config.width, config.height, config, {
    backgroundImage,
    backgroundOpacity
  });
  drawAvatar(context, avatar, member, config);
  drawTexts(context, member, levelInfo, config);
  drawBadge(context, config);
  drawProgress(context, levelInfo, config);

  return new AttachmentBuilder(await canvas.encode("png"), {
    name: "murphy-exp-card.png"
  });
}

module.exports = {
  createExpCard
};
