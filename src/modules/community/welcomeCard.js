const { AttachmentBuilder } = require("discord.js");
const { Canvas, GlobalFonts, loadImage } = require("@napi-rs/canvas");
const fs = require("node:fs");
const path = require("node:path");

const headingFontRegistered = GlobalFonts.registerFromPath(path.join(__dirname, "..", "..", "..", "assets", "font-01.otf"), "Murphy Welcome");
const gothicFontRegistered = GlobalFonts.registerFromPath(path.join(__dirname, "..", "..", "..", "assets", "font.otf"), "Murphy Gothic");
const brandFontRegistered = GlobalFonts.registerFromPath(path.join(__dirname, "..", "..", "..", "assets", "Gothicha.ttf"), "Murphy Brand");
const semiboldFontRegistered = GlobalFonts.registerFromPath("C:\\Windows\\Fonts\\segoeuib.ttf", "Segoe UI");
const regularFontRegistered = GlobalFonts.registerFromPath("C:\\Windows\\Fonts\\segoeui.ttf", "Segoe UI Regular");
const assetsDirectory = path.join(__dirname, "..", "..", "..", "assets");
const preferredBackgroundCandidates = [
  path.join(assetsDirectory, "bannerwelcome.png"),
  path.join(assetsDirectory, "tes-bg.png"),
  path.join(assetsDirectory, "welcome-bg.jpg"),
  path.join(assetsDirectory, "welcome-bg.png"),
  path.join(assetsDirectory, "welcome-bg.webp")
];

function sanitizeHexColor(input, fallback = "#111111") {
  if (typeof input !== "string") {
    return fallback;
  }

  return /^#?[0-9a-fA-F]{6}$/.test(input)
    ? (input.startsWith("#") ? input : `#${input}`)
    : fallback;
}

function hexToRgba(hex, alpha) {
  const normalized = sanitizeHexColor(hex).replace("#", "");
  const red = Number.parseInt(normalized.slice(0, 2), 16);
  const green = Number.parseInt(normalized.slice(2, 4), 16);
  const blue = Number.parseInt(normalized.slice(4, 6), 16);

  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
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

function drawChromeText(context, text, x, y, fontSize, fontName, strokeWidth = 2) {
  context.font = `${fontSize}px "${fontName}"`;

  const chromeGrad = context.createLinearGradient(0, y - fontSize + 6, 0, y + 4);
  chromeGrad.addColorStop(0.0, "#ffffff");
  chromeGrad.addColorStop(0.25, "#f1f5f9");
  chromeGrad.addColorStop(0.48, "#cbd5e1");
  chromeGrad.addColorStop(0.50, "#475569");
  chromeGrad.addColorStop(0.52, "#1e293b");
  chromeGrad.addColorStop(0.75, "#94a3b8");
  chromeGrad.addColorStop(1.0, "#ffffff");

  context.shadowColor = "rgba(0, 0, 0, 0.85)";
  context.shadowBlur = 10;
  context.shadowOffsetY = 3;

  context.lineWidth = strokeWidth;
  context.strokeStyle = "rgba(15, 23, 42, 0.9)";
  context.strokeText(text, x, y);

  context.fillStyle = chromeGrad;
  context.fillText(text, x, y);

  context.shadowBlur = 0;
  context.shadowOffsetY = 0;
}

async function loadAvatar(member) {
  const avatarUrl = member.user.displayAvatarURL({
    extension: "png",
    forceStatic: true,
    size: 256
  });

  const response = await fetch(avatarUrl);

  if (!response.ok) {
    throw new Error(`Failed to fetch avatar: ${response.status}`);
  }

  const avatarBuffer = Buffer.from(await response.arrayBuffer());
  return loadImage(avatarBuffer);
}

function getBackgroundAssetPath() {
  const preferredAsset = preferredBackgroundCandidates.find((candidate) => fs.existsSync(candidate));

  if (preferredAsset) {
    return preferredAsset;
  }

  if (!fs.existsSync(assetsDirectory)) {
    return null;
  }

  const fallbackAsset = fs.readdirSync(assetsDirectory)
    .find((file) => /\.(png|jpe?g|webp)$/i.test(file));

  return fallbackAsset ? path.join(assetsDirectory, fallbackAsset) : null;
}

function getHeadlineFont() {
  if (headingFontRegistered) {
    return "Murphy Welcome";
  }

  return semiboldFontRegistered ? "Segoe UI" : "sans-serif";
}

function getBrandFont() {
  if (brandFontRegistered) {
    return "Murphy Brand";
  }

  return semiboldFontRegistered ? "Segoe UI" : "sans-serif";
}

function getBodyFont() {
  if (gothicFontRegistered) {
    return "Murphy Gothic";
  }

  return semiboldFontRegistered ? "Segoe UI" : "sans-serif";
}

function getRegularFont() {
  if (regularFontRegistered) {
    return "Segoe UI Regular";
  }

  return semiboldFontRegistered ? "Segoe UI" : "sans-serif";
}

async function drawBackgroundImage(context, width, height) {
  const backgroundAssetPath = getBackgroundAssetPath();

  if (!backgroundAssetPath) {
    return false;
  }

  const backgroundImage = await loadImage(backgroundAssetPath);
  context.drawImage(backgroundImage, 0, 0, width, height);

  const topOverlay = context.createLinearGradient(0, 0, 0, height);
  topOverlay.addColorStop(0, "rgba(8, 10, 12, 0.18)");
  topOverlay.addColorStop(0.58, "rgba(8, 10, 12, 0.12)");
  topOverlay.addColorStop(1, "rgba(8, 10, 12, 0.58)");
  context.fillStyle = topOverlay;
  context.fillRect(0, 0, width, height);

  const sideOverlay = context.createLinearGradient(0, 0, width, 0);
  sideOverlay.addColorStop(0, "rgba(10, 12, 14, 0.28)");
  sideOverlay.addColorStop(0.5, "rgba(10, 12, 14, 0.05)");
  sideOverlay.addColorStop(1, "rgba(10, 12, 14, 0.28)");
  context.fillStyle = sideOverlay;
  context.fillRect(0, 0, width, height);

  return true;
}

function drawBackground(context, width, height, accentColor, skipBaseFill = false) {
  if (!skipBaseFill) {
    const background = context.createLinearGradient(0, 0, width, height);
    background.addColorStop(0, "#0a0d11");
    background.addColorStop(0.45, "#141a20");
    background.addColorStop(1, "#090b0e");

    context.fillStyle = background;
    context.fillRect(0, 0, width, height);
  }

  const frameInset = 18;
  drawRoundedRect(context, frameInset, frameInset, width - frameInset * 2, height - frameInset * 2, 28);
  context.lineWidth = 2;
  context.strokeStyle = "rgba(108, 128, 152, 0.34)";
  context.stroke();

  drawRoundedRect(context, frameInset + 10, frameInset + 10, width - ((frameInset + 10) * 2), height - ((frameInset + 10) * 2), 22);
  context.lineWidth = 1;
  context.strokeStyle = "rgba(204, 217, 230, 0.10)";
  context.stroke();
}

function drawAvatarFallback(context, member, accentColor) {
  const fallbackColor = sanitizeHexColor(accentColor, "#111111");

  const fallbackGradient = context.createLinearGradient(544, 136, 656, 248);
  fallbackGradient.addColorStop(0, hexToRgba(fallbackColor, 0.85));
  fallbackGradient.addColorStop(1, "rgba(255, 255, 255, 0.14)");
  context.fillStyle = fallbackGradient;
  context.fillRect(544, 136, 112, 112);

  context.fillStyle = "#f3f3f3";
  context.font = `bold 54px "${semiboldFontRegistered ? "Segoe UI" : "sans-serif"}"`;
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(member.displayName.charAt(0).toUpperCase(), 600, 192);
  context.textAlign = "start";
  context.textBaseline = "alphabetic";
}

function clipAvatarCircle(context) {
  context.save();
  drawRoundedRect(context, 544, 136, 112, 112, 28);
  context.clip();
}

function restoreAvatarCircle(context) {
  context.restore();
}

async function createWelcomeCard(member, accentColor) {
  const width = 1200;
  const height = 420;
  const canvas = new Canvas(width, height);
  const context = canvas.getContext("2d");

  // 1. Draw base dark fill
  drawBackground(context, width, height, accentColor, false);

  // 2. Polaroid cutout window bounds (perfectly fitted inside polaroid frame)
  const holeX = 488;
  const holeY = 64;
  const holeWidth = 224;
  const holeHeight = 248;

  // 3. Render Avatar BEHIND bannerwelcome.png to fill the cutout window
  try {
    const avatar = await loadAvatar(member);
    context.drawImage(avatar, holeX, holeY, holeWidth, holeHeight);
  } catch (error) {
    console.error("Failed to render welcome avatar:", error);
    drawAvatarFallback(context, member, accentColor);
  }

  // 4. Subtle dark gradient overlay over top & bottom of avatar to ensure high text legibility
  const avatarDarkOverlay = context.createLinearGradient(0, holeY, 0, holeY + holeHeight);
  avatarDarkOverlay.addColorStop(0, "rgba(0, 0, 0, 0.55)");
  avatarDarkOverlay.addColorStop(0.35, "rgba(0, 0, 0, 0.10)");
  avatarDarkOverlay.addColorStop(0.65, "rgba(0, 0, 0, 0.10)");
  avatarDarkOverlay.addColorStop(1, "rgba(0, 0, 0, 0.65)");
  context.fillStyle = avatarDarkOverlay;
  context.fillRect(holeX, holeY, holeWidth, holeHeight);

  // 5. Draw bannerwelcome.png ON TOP of avatar
  await drawBackgroundImage(context, width, height);

  context.textAlign = "center";

  // Render Display Name with Chrome Metallic gradient effect
  drawChromeText(context, member.displayName.slice(0, 24), width / 2, 293, 44, getBodyFont(), 2.5);

  // Render #Member Count with Chrome Metallic gradient effect
  drawChromeText(context, `#Member ${member.guild.memberCount}`, width / 2, 356, 34, getBodyFont(), 2);

  context.textAlign = "start";

  return new AttachmentBuilder(await canvas.encode("png"), {
    name: "welcome-card.png"
  });
}

module.exports = {
  createWelcomeCard
};
