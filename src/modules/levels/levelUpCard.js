const { AttachmentBuilder } = require("discord.js");
const { Canvas, GlobalFonts, loadImage } = require("@napi-rs/canvas");
const path = require("node:path");
const {
  getLevelUpCardConfig,
  normalizeLevelUpCardConfig
} = require("../../services/levelUpCardConfigStore");

const assetsDirectory = path.join(__dirname, "..", "..", "..", "assets");
const customFontPath = path.join(assetsDirectory, "font.otf");

const regularFontRegistered = GlobalFonts.registerFromPath(customFontPath, "Murphy Gothic");
const boldFontRegistered = GlobalFonts.registerFromPath(customFontPath, "Murphy Gothic Bold");

function getFontFamily(weight = "regular") {
  if (weight === "bold" && boldFontRegistered) {
    return "Murphy Gothic Bold";
  }

  if (regularFontRegistered) {
    return "Murphy Gothic";
  }

  return "serif";
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

function drawBackground(context, width, height, config) {
  const base = context.createLinearGradient(0, 0, width, height);
  base.addColorStop(0, config.background.baseStart);
  base.addColorStop(0.5, config.background.baseMid);
  base.addColorStop(1, config.background.baseEnd);
  context.fillStyle = base;
  drawRoundedRect(context, 0, 0, width, height, config.borderRadius);
  context.fill();

  context.save();
  context.filter = "blur(54px)";

  const auraLeft = context.createRadialGradient(160, 70, 18, 160, 70, 180);
  auraLeft.addColorStop(0, config.background.auraLeft);
  auraLeft.addColorStop(1, "rgba(0,0,0,0)");
  context.fillStyle = auraLeft;
  context.fillRect(-40, -40, 360, 260);

  const auraRight = context.createRadialGradient(width - 90, height - 30, 18, width - 90, height - 30, 180);
  auraRight.addColorStop(0, config.background.auraRight);
  auraRight.addColorStop(1, "rgba(0,0,0,0)");
  context.fillStyle = auraRight;
  context.fillRect(width - 320, height - 220, 340, 240);
  context.restore();

  context.strokeStyle = config.background.border;
  context.lineWidth = 1;
  drawRoundedRect(context, 0.5, 0.5, width - 1, height - 1, config.borderRadius);
  context.stroke();
}

function drawAvatar(context, avatar, member, config) {
  const x = config.avatar.x;
  const y = config.avatar.y;
  const size = config.avatar.size;
  const centerX = x + (size / 2);
  const centerY = y + (size / 2);

  context.save();
  context.beginPath();
  context.arc(centerX, centerY, size / 2, 0, Math.PI * 2);
  context.closePath();
  context.clip();

  if (avatar) {
    context.drawImage(avatar, x, y, size, size);
  } else {
    const fallback = context.createLinearGradient(x, y, x + size, y + size);
    fallback.addColorStop(0, "#5b1d2b");
    fallback.addColorStop(1, "#201014");
    context.fillStyle = fallback;
    context.fillRect(x, y, size, size);
    context.fillStyle = "#fff7ef";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.font = `bold 40px "${getFontFamily("bold")}"`;
    context.fillText((member.displayName || member.user.username).charAt(0).toUpperCase(), centerX, centerY + 2);
    context.textAlign = "start";
    context.textBaseline = "alphabetic";
  }

  context.restore();

  const ring = context.createLinearGradient(x, y, x + size, y + size);
  ring.addColorStop(0, config.avatar.ringStart);
  ring.addColorStop(1, config.avatar.ringEnd);
  context.strokeStyle = ring;
  context.lineWidth = config.avatar.ringWidth;
  context.beginPath();
  context.arc(centerX, centerY, (size / 2) - Math.max(2, config.avatar.ringWidth / 2), 0, Math.PI * 2);
  context.stroke();
}

function drawText(context, member, previousLevelInfo, nextLevelInfo, config) {
  context.fillStyle = config.title.color;
  context.font = `bold ${config.title.size}px "${getFontFamily("bold")}"`;
  context.textAlign = "center";
  context.fillText(config.title.text, config.title.centerX, config.title.y);

  context.fillStyle = config.levels.color;
  context.font = `bold ${config.levels.size}px "${getFontFamily("bold")}"`;
  context.fillText(`${previousLevelInfo.level} ${config.levels.separator} ${nextLevelInfo.level}`, config.levels.centerX, config.levels.y);

  if (config.badge.enabled) {
    context.fillStyle = config.badge.fill;
    drawRoundedRect(context, config.badge.x, config.badge.y, config.badge.width, config.badge.height, config.badge.radius);
    context.fill();
    context.strokeStyle = config.badge.border;
    drawRoundedRect(context, config.badge.x, config.badge.y, config.badge.width, config.badge.height, config.badge.radius);
    context.stroke();

    context.fillStyle = config.badge.textColor;
    context.font = `bold ${config.badge.textSize}px "${getFontFamily("bold")}"`;
    context.textBaseline = "middle";
    context.fillText(config.badge.text, config.badge.textCenterX, config.badge.textCenterY);
  }

  context.textAlign = "start";
  context.textBaseline = "alphabetic";
}

async function createLevelUpCard(member, previousLevelInfo, nextLevelInfo, configOverride = null) {
  const config = configOverride
    ? normalizeLevelUpCardConfig(configOverride)
    : getLevelUpCardConfig();
  const width = config.width;
  const height = config.height;
  const canvas = new Canvas(width, height);
  const context = canvas.getContext("2d");
  const avatar = await loadAvatarImage(member).catch(() => null);

  drawBackground(context, width, height, config);
  drawAvatar(context, avatar, member, config);
  drawText(context, member, previousLevelInfo, nextLevelInfo, config);

  return new AttachmentBuilder(await canvas.encode("png"), {
    name: "murphy-level-up.png"
  });
}

module.exports = {
  createLevelUpCard
};
