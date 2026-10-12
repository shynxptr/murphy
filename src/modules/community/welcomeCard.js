const { AttachmentBuilder } = require("discord.js");
const { Canvas, GlobalFonts, loadImage } = require("@napi-rs/canvas");
const fs = require("node:fs");
const path = require("node:path");

const headingFontRegistered = GlobalFonts.registerFromPath(path.join(__dirname, "..", "..", "..", "assets", "font-01.otf"), "Murphy Welcome");
const gothicFontRegistered = GlobalFonts.registerFromPath(path.join(__dirname, "..", "..", "..", "assets", "font.otf"), "Murphy Gothic");
const brandFontRegistered = GlobalFonts.registerFromPath(path.join(__dirname, "..", "..", "..", "assets", "Gothicha.ttf"), "Murphy Brand");
// Font Segoe UI hanya ada di Windows — di Linux VPS akan gracefully skip
const SEGOE_SEMIBOLD_PATH = "C:\\Windows\\Fonts\\segoeuib.ttf";
const SEGOE_REGULAR_PATH = "C:\\Windows\\Fonts\\segoeui.ttf";
const semiboldFontRegistered = fs.existsSync(SEGOE_SEMIBOLD_PATH)
  ? GlobalFonts.registerFromPath(SEGOE_SEMIBOLD_PATH, "Segoe UI")
  : false;
const regularFontRegistered = fs.existsSync(SEGOE_REGULAR_PATH)
  ? GlobalFonts.registerFromPath(SEGOE_REGULAR_PATH, "Segoe UI Regular")
  : false;
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
    size: 512
  });

  // Timeout 10 detik — mencegah hang di VPS jika CDN Discord lambat
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10_000);

  let response;
  try {
    response = await fetch(avatarUrl, { signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }

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

function drawAvatarFallback(context, member, accentColor, holeX, holeY, holeWidth, holeHeight) {
  const fallbackColor = sanitizeHexColor(accentColor, "#111111");

  const fallbackGradient = context.createLinearGradient(holeX, holeY, holeX + holeWidth, holeY + holeHeight);
  fallbackGradient.addColorStop(0, hexToRgba(fallbackColor, 0.85));
  fallbackGradient.addColorStop(1, "rgba(255, 255, 255, 0.14)");
  context.fillStyle = fallbackGradient;
  context.fillRect(holeX, holeY, holeWidth, holeHeight);

  context.fillStyle = "#f3f3f3";
  context.font = `bold ${Math.round(holeHeight * 0.35)}px "${semiboldFontRegistered ? "Segoe UI" : "sans-serif"}"`;
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(member.displayName.charAt(0).toUpperCase(), holeX + holeWidth / 2, holeY + holeHeight / 2);
  context.textAlign = "start";
  context.textBaseline = "alphabetic";
}

async function createWelcomeCard(member, accentColor) {
  const backgroundAssetPath = getBackgroundAssetPath();
  const backgroundImage = backgroundAssetPath ? await loadImage(backgroundAssetPath) : null;

  // Base dimensions based on banner (native: 3168 x 1344)
  const baseWidth = backgroundImage ? backgroundImage.width : 3168;
  const baseHeight = backgroundImage ? backgroundImage.height : 1344;
  const scale = 0.5;
  const width = Math.round(baseWidth * scale);
  const height = Math.round(baseHeight * scale);

  const canvas = new Canvas(width, height);
  const context = canvas.getContext("2d");

  // 1. Draw base dark fill
  context.fillStyle = "#0a0d11";
  context.fillRect(0, 0, width, height);

  // 2. Cutout window bounds inside polaroid frame:
  // Native coordinates: minX: 1355, minY: 405, maxX: 1816, maxY: 893
  // With slight 10px bleed behind frame borders to avoid gaps:
  const holeX = Math.round(1345 * scale);
  const holeY = Math.round(395 * scale);
  const holeWidth = Math.round(480 * scale);
  const holeHeight = Math.round(510 * scale);

  // 3. Render Avatar BEHIND bannerwelcome.png to fill the cutout window
  try {
    const avatar = await loadAvatar(member);
    const aspect = avatar.width / avatar.height;
    let drawW = holeWidth;
    let drawH = holeHeight;
    let drawX = holeX;
    let drawY = holeY;

    if (aspect > holeWidth / holeHeight) {
      drawW = holeHeight * aspect;
      drawX = holeX - (drawW - holeWidth) / 2;
    } else {
      drawH = holeWidth / aspect;
      drawY = holeY - (drawH - holeHeight) / 2;
    }

    context.save();
    context.beginPath();
    context.rect(holeX, holeY, holeWidth, holeHeight);
    context.clip();
    context.drawImage(avatar, drawX, drawY, drawW, drawH);

    // Dark filter / moody vignette over user profile
    const cx = holeX + holeWidth / 2;
    const cy = holeY + holeHeight / 2;
    const radius = Math.max(holeWidth, holeHeight) * 0.72;
    const darkFilter = context.createRadialGradient(cx, cy, radius * 0.15, cx, cy, radius);
    darkFilter.addColorStop(0, "rgba(8, 12, 18, 0.20)");
    darkFilter.addColorStop(0.7, "rgba(8, 12, 18, 0.42)");
    darkFilter.addColorStop(1, "rgba(8, 12, 18, 0.70)");
    context.fillStyle = darkFilter;
    context.fillRect(holeX, holeY, holeWidth, holeHeight);

    context.restore();
  } catch (error) {
    console.error("Failed to render welcome avatar:", error);
    drawAvatarFallback(context, member, accentColor, holeX, holeY, holeWidth, holeHeight);
  }

  // 4. Draw bannerwelcome.png ON TOP of avatar
  if (backgroundImage) {
    context.drawImage(backgroundImage, 0, 0, width, height);
  }

  return new AttachmentBuilder(await canvas.encode("png"), {
    name: "welcome-card.png"
  });
}

module.exports = {
  createWelcomeCard
};
