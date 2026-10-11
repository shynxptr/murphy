const fs = require("node:fs");
const path = require("node:path");
const { Canvas, GlobalFonts } = require("@napi-rs/canvas");

GlobalFonts.registerFromPath("C:\\Windows\\Fonts\\segoeui.ttf", "Segoe UI");
GlobalFonts.registerFromPath("C:\\Windows\\Fonts\\segoeuib.ttf", "Segoe UI Bold");

const outputDirectory = path.join(__dirname, "..", "assets", "temp-voice-emojis");
const emojiSize = 128;
const previewColumns = 5;
const previewRows = 3;
const cardWidth = 300;
const cardHeight = 96;
const previewGapX = 24;
const previewGapY = 18;
const previewPaddingX = 36;
const previewPaddingY = 42;
const previewWidth = (previewPaddingX * 2) + (previewColumns * cardWidth) + ((previewColumns - 1) * previewGapX);
const previewHeight = 170 + (previewRows * cardHeight) + ((previewRows - 1) * previewGapY) + previewPaddingY;

const ICONS = [
  { key: "name", label: "NAME", emojiName: "tv_name", accent: "#d4d7dd", draw: drawNameIcon },
  { key: "limit", label: "LIMIT", emojiName: "tv_limit", accent: "#d4d7dd", draw: drawLimitIcon },
  { key: "privacy", label: "PRIVACY", emojiName: "tv_privacy", accent: "#d4d7dd", draw: drawPrivacyIcon },
  { key: "waiting", label: "WAITING R.", emojiName: "tv_waiting", accent: "#f59e0b", draw: drawWaitingIcon },
  { key: "chat", label: "CHAT", emojiName: "tv_chat", accent: "#d4d7dd", draw: drawChatIcon },
  { key: "trust", label: "TRUST", emojiName: "tv_trust", accent: "#22c55e", draw: drawTrustIcon },
  { key: "untrust", label: "UNTRUST", emojiName: "tv_untrust", accent: "#f43f5e", draw: drawUntrustIcon },
  { key: "invite", label: "INVITE", emojiName: "tv_invite", accent: "#22c55e", draw: drawInviteIcon },
  { key: "kick", label: "KICK", emojiName: "tv_kick", accent: "#f43f5e", draw: drawKickIcon },
  { key: "region", label: "REGION", emojiName: "tv_region", accent: "#d4d7dd", draw: drawRegionIcon },
  { key: "block", label: "BLOCK", emojiName: "tv_block", accent: "#f43f5e", draw: drawBlockIcon },
  { key: "unblock", label: "UNBLOCK", emojiName: "tv_unblock", accent: "#a1a1aa", draw: drawUnblockIcon },
  { key: "claim", label: "CLAIM", emojiName: "tv_claim", accent: "#fbbf24", draw: drawClaimIcon },
  { key: "transfer", label: "TRANSFER", emojiName: "tv_transfer", accent: "#fb7185", draw: drawTransferIcon },
  { key: "delete", label: "DELETE", emojiName: "tv_delete", accent: "#f43f5e", draw: drawDeleteIcon }
];

function ensureDirectory(directory) {
  if (!fs.existsSync(directory)) {
    fs.mkdirSync(directory, { recursive: true });
  }
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

function drawStroke(context, color, lineWidth = 9) {
  context.strokeStyle = color;
  context.lineWidth = lineWidth;
  context.lineCap = "round";
  context.lineJoin = "round";
}

function drawCircleStroke(context, x, y, radius, color, lineWidth = 8) {
  drawStroke(context, color, lineWidth);
  context.beginPath();
  context.arc(x, y, radius, 0, Math.PI * 2);
  context.stroke();
}

function drawPlus(context, x, y, size, color, lineWidth = 7) {
  drawStroke(context, color, lineWidth);
  context.beginPath();
  context.moveTo(x - size, y);
  context.lineTo(x + size, y);
  context.moveTo(x, y - size);
  context.lineTo(x, y + size);
  context.stroke();
}

function drawMinus(context, x, y, size, color, lineWidth = 7) {
  drawStroke(context, color, lineWidth);
  context.beginPath();
  context.moveTo(x - size, y);
  context.lineTo(x + size, y);
  context.stroke();
}

function drawSlash(context, x1, y1, x2, y2, color, lineWidth = 8) {
  drawStroke(context, color, lineWidth);
  context.beginPath();
  context.moveTo(x1, y1);
  context.lineTo(x2, y2);
  context.stroke();
}

function drawPerson(context, x, y, scale, color) {
  context.fillStyle = color;
  context.beginPath();
  context.arc(x, y - (20 * scale), 14 * scale, 0, Math.PI * 2);
  context.fill();

  context.beginPath();
  context.moveTo(x - (20 * scale), y + (8 * scale));
  context.bezierCurveTo(
    x - (20 * scale), y - (8 * scale),
    x - (8 * scale), y - (16 * scale),
    x, y - (16 * scale)
  );
  context.bezierCurveTo(
    x + (8 * scale), y - (16 * scale),
    x + (20 * scale), y - (8 * scale),
    x + (20 * scale), y + (8 * scale)
  );
  context.lineTo(x + (20 * scale), y + (20 * scale));
  context.lineTo(x - (20 * scale), y + (20 * scale));
  context.closePath();
  context.fill();
}

function drawPhone(context, x, y, scale, color) {
  context.save();
  context.translate(x, y);
  context.rotate(-0.22);
  drawStroke(context, color, 9 * scale);
  context.beginPath();
  context.moveTo(-18 * scale, -24 * scale);
  context.bezierCurveTo(
    -10 * scale, -34 * scale,
    6 * scale, -34 * scale,
    16 * scale, -24 * scale
  );
  context.lineTo(22 * scale, -16 * scale);
  context.lineTo(4 * scale, 2 * scale);
  context.lineTo(-4 * scale, -6 * scale);
  context.lineTo(-22 * scale, 12 * scale);
  context.lineTo(-30 * scale, 4 * scale);
  context.bezierCurveTo(
    -40 * scale, -6 * scale,
    -40 * scale, -22 * scale,
    -30 * scale, -30 * scale
  );
  context.stroke();
  context.restore();
}

function drawShield(context, x, y, scale, color) {
  drawStroke(context, color, 8 * scale);
  context.beginPath();
  context.moveTo(x, y - (32 * scale));
  context.lineTo(x + (24 * scale), y - (20 * scale));
  context.lineTo(x + (20 * scale), y + (8 * scale));
  context.bezierCurveTo(
    x + (18 * scale), y + (22 * scale),
    x + (10 * scale), y + (34 * scale),
    x, y + (42 * scale)
  );
  context.bezierCurveTo(
    x - (10 * scale), y + (34 * scale),
    x - (18 * scale), y + (22 * scale),
    x - (20 * scale), y + (8 * scale)
  );
  context.lineTo(x - (24 * scale), y - (20 * scale));
  context.closePath();
  context.stroke();
}

function drawChatBubble(context, x, y, scale, color) {
  drawStroke(context, color, 8 * scale);
  context.beginPath();
  context.moveTo(x - (28 * scale), y - (12 * scale));
  context.quadraticCurveTo(x - (28 * scale), y - (28 * scale), x - (12 * scale), y - (28 * scale));
  context.lineTo(x + (18 * scale), y - (28 * scale));
  context.quadraticCurveTo(x + (34 * scale), y - (28 * scale), x + (34 * scale), y - (12 * scale));
  context.lineTo(x + (34 * scale), y + (10 * scale));
  context.quadraticCurveTo(x + (34 * scale), y + (26 * scale), x + (18 * scale), y + (26 * scale));
  context.lineTo(x - (2 * scale), y + (26 * scale));
  context.lineTo(x - (20 * scale), y + (38 * scale));
  context.lineTo(x - (16 * scale), y + (22 * scale));
  context.quadraticCurveTo(x - (28 * scale), y + (18 * scale), x - (28 * scale), y + (4 * scale));
  context.closePath();
  context.stroke();
}

function drawClock(context, x, y, scale, color) {
  drawCircleStroke(context, x, y, 30 * scale, color, 8 * scale);
  drawStroke(context, color, 8 * scale);
  context.beginPath();
  context.moveTo(x, y);
  context.lineTo(x, y - (18 * scale));
  context.moveTo(x, y);
  context.lineTo(x + (14 * scale), y + (10 * scale));
  context.stroke();
}

function drawGlobe(context, x, y, scale, color) {
  drawCircleStroke(context, x, y, 32 * scale, color, 8 * scale);
  drawStroke(context, color, 6 * scale);
  context.beginPath();
  context.moveTo(x - (32 * scale), y);
  context.lineTo(x + (32 * scale), y);
  context.moveTo(x, y - (32 * scale));
  context.lineTo(x, y + (32 * scale));
  context.moveTo(x - (22 * scale), y - (20 * scale));
  context.bezierCurveTo(x - (6 * scale), y - (8 * scale), x - (6 * scale), y + (8 * scale), x - (22 * scale), y + (20 * scale));
  context.moveTo(x + (22 * scale), y - (20 * scale));
  context.bezierCurveTo(x + (6 * scale), y - (8 * scale), x + (6 * scale), y + (8 * scale), x + (22 * scale), y + (20 * scale));
  context.stroke();
}

function drawCrown(context, x, y, scale, color) {
  context.fillStyle = color;
  context.beginPath();
  context.moveTo(x - (32 * scale), y + (18 * scale));
  context.lineTo(x - (26 * scale), y - (12 * scale));
  context.lineTo(x - (10 * scale), y + (2 * scale));
  context.lineTo(x, y - (26 * scale));
  context.lineTo(x + (10 * scale), y + (2 * scale));
  context.lineTo(x + (26 * scale), y - (12 * scale));
  context.lineTo(x + (32 * scale), y + (18 * scale));
  context.closePath();
  context.fill();

  context.fillRect(x - (30 * scale), y + (16 * scale), 60 * scale, 12 * scale);
}

function drawTrash(context, x, y, scale, color) {
  drawStroke(context, color, 8 * scale);
  context.beginPath();
  context.moveTo(x - (22 * scale), y - (12 * scale));
  context.lineTo(x + (22 * scale), y - (12 * scale));
  context.moveTo(x - (14 * scale), y - (24 * scale));
  context.lineTo(x + (14 * scale), y - (24 * scale));
  context.moveTo(x - (8 * scale), y - (30 * scale));
  context.lineTo(x + (8 * scale), y - (30 * scale));
  context.moveTo(x - (18 * scale), y - (12 * scale));
  context.lineTo(x - (14 * scale), y + (28 * scale));
  context.lineTo(x + (14 * scale), y + (28 * scale));
  context.lineTo(x + (18 * scale), y - (12 * scale));
  context.stroke();

  context.beginPath();
  context.moveTo(x - (8 * scale), y - (2 * scale));
  context.lineTo(x - (8 * scale), y + (18 * scale));
  context.moveTo(x, y - (2 * scale));
  context.lineTo(x, y + (18 * scale));
  context.moveTo(x + (8 * scale), y - (2 * scale));
  context.lineTo(x + (8 * scale), y + (18 * scale));
  context.stroke();
}

function drawArrow(context, x1, y1, x2, y2, color, lineWidth = 8) {
  drawStroke(context, color, lineWidth);
  context.beginPath();
  context.moveTo(x1, y1);
  context.lineTo(x2, y2);
  context.stroke();

  const angle = Math.atan2(y2 - y1, x2 - x1);
  const size = 12;
  context.beginPath();
  context.moveTo(x2, y2);
  context.lineTo(x2 - (Math.cos(angle - 0.6) * size), y2 - (Math.sin(angle - 0.6) * size));
  context.moveTo(x2, y2);
  context.lineTo(x2 - (Math.cos(angle + 0.6) * size), y2 - (Math.sin(angle + 0.6) * size));
  context.stroke();
}

function drawBaseEmojiCanvas(icon) {
  const canvas = new Canvas(emojiSize, emojiSize);
  const context = canvas.getContext("2d");
  icon.draw(context, icon.accent);
  return canvas;
}

function drawNameIcon(context, accent) {
  drawStroke(context, accent, 10);
  context.beginPath();
  context.moveTo(26, 26);
  context.lineTo(26, 102);
  context.moveTo(102, 26);
  context.lineTo(102, 102);
  context.moveTo(54, 20);
  context.lineTo(54, 108);
  context.moveTo(74, 20);
  context.lineTo(74, 108);
  context.stroke();
}

function drawLimitIcon(context, accent) {
  drawPerson(context, 46, 66, 1, accent);
  drawPerson(context, 80, 70, 0.86, accent);
}

function drawPrivacyIcon(context, accent) {
  drawShield(context, 64, 64, 1, accent);
  drawStroke(context, accent, 8);
  context.beginPath();
  context.arc(64, 62, 7, 0, Math.PI * 2);
  context.stroke();
  context.beginPath();
  context.moveTo(64, 68);
  context.lineTo(64, 82);
  context.stroke();
}

function drawWaitingIcon(context, accent) {
  drawClock(context, 64, 64, 1, accent);
}

function drawChatIcon(context, accent) {
  drawChatBubble(context, 62, 60, 1, accent);
}

function drawTrustIcon(context, accent) {
  drawPerson(context, 52, 60, 0.98, "#d4d7dd");
  drawCircleStroke(context, 92, 84, 17, accent, 5);
  drawPlus(context, 92, 84, 7, accent, 5);
}

function drawUntrustIcon(context, accent) {
  drawPerson(context, 50, 60, 0.98, "#d4d7dd");
  drawSlash(context, 24, 102, 102, 24, accent, 9);
}

function drawInviteIcon(context, accent) {
  drawPhone(context, 56, 62, 1, "#d4d7dd");
  drawCircleStroke(context, 92, 38, 14, accent, 5);
  drawPlus(context, 92, 38, 6, accent, 5);
}

function drawKickIcon(context, accent) {
  drawPhone(context, 56, 62, 1, "#d4d7dd");
  drawCircleStroke(context, 92, 38, 14, accent, 5);
  drawMinus(context, 92, 38, 6, accent, 5);
}

function drawRegionIcon(context, accent) {
  drawGlobe(context, 64, 64, 1, accent);
}

function drawBlockIcon(context, accent) {
  drawPerson(context, 50, 58, 0.96, "#d4d7dd");
  drawCircleStroke(context, 92, 84, 17, accent, 5);
  drawSlash(context, 81, 95, 103, 73, accent, 5);
}

function drawUnblockIcon(context, accent) {
  drawPerson(context, 50, 58, 0.96, "#d4d7dd");
  drawCircleStroke(context, 92, 84, 17, accent, 5);
  drawMinus(context, 92, 84, 6, accent, 5);
}

function drawClaimIcon(context, accent) {
  drawCrown(context, 64, 64, 1, accent);
}

function drawTransferIcon(context, accent) {
  drawCrown(context, 54, 70, 0.86, "#fbbf24");
  drawArrow(context, 70, 40, 98, 18, accent, 7);
}

function drawDeleteIcon(context, accent) {
  drawTrash(context, 64, 66, 1, accent);
}

async function renderEmoji(icon) {
  const canvas = drawBaseEmojiCanvas(icon);
  const filePath = path.join(outputDirectory, `${icon.key}.png`);
  fs.writeFileSync(filePath, await canvas.encode("png"));
}

function drawPreviewCard(context, icon, x, y, width, height) {
  const background = context.createLinearGradient(x, y, x + width, y + height);
  background.addColorStop(0, "#202329");
  background.addColorStop(1, "#191b21");
  context.fillStyle = background;
  drawRoundedRect(context, x, y, width, height, 20);
  context.fill();

  context.strokeStyle = "rgba(255,255,255,0.06)";
  context.lineWidth = 1;
  drawRoundedRect(context, x, y, width, height, 20);
  context.stroke();

  const emojiCanvas = drawBaseEmojiCanvas(icon);
  context.drawImage(emojiCanvas, x + 18, y + 16, 64, 64);

  context.fillStyle = "#f8fafc";
  context.font = "bold 22px Segoe UI Bold";
  context.fillText(icon.label, x + 92, y + 41);

  context.fillStyle = "#9ca3af";
  context.font = "16px Segoe UI";
  context.fillText(icon.emojiName, x + 92, y + 66);
}

async function renderPreviewSheet() {
  const canvas = new Canvas(previewWidth, previewHeight);
  const context = canvas.getContext("2d");
  const background = context.createLinearGradient(0, 0, previewWidth, previewHeight);
  background.addColorStop(0, "#0a0b0f");
  background.addColorStop(1, "#101216");
  context.fillStyle = background;
  context.fillRect(0, 0, previewWidth, previewHeight);

  context.fillStyle = "#f8fafc";
  context.font = "bold 40px Segoe UI Bold";
  context.fillText("404! Collective Temp Voice Emojis", previewPaddingX, 62);

  context.fillStyle = "#9ca3af";
  context.font = "20px Segoe UI";
  context.fillText("Preview set for icon-only Temp Voice buttons", previewPaddingX, 98);

  ICONS.forEach((icon, index) => {
    const column = index % previewColumns;
    const row = Math.floor(index / previewColumns);
    const x = previewPaddingX + (column * (cardWidth + previewGapX));
    const y = 132 + (row * (cardHeight + previewGapY));
    drawPreviewCard(context, icon, x, y, cardWidth, cardHeight);
  });

  fs.writeFileSync(path.join(outputDirectory, "preview.png"), await canvas.encode("png"));
}

function writeManifest() {
  const manifest = {
    generatedAt: new Date().toISOString(),
    note: "Upload these PNG files as Discord custom emoji for the Temp Voice icon-only control panel.",
    icons: ICONS.map((icon) => ({
      key: icon.key,
      label: icon.label,
      suggestedEmojiName: icon.emojiName,
      file: `${icon.key}.png`
    }))
  };

  fs.writeFileSync(
    path.join(outputDirectory, "manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
    "utf8"
  );
}

async function main() {
  ensureDirectory(outputDirectory);

  for (const icon of ICONS) {
    await renderEmoji(icon);
  }

  await renderPreviewSheet();
  writeManifest();

  console.log(`Generated ${ICONS.length} temp voice emoji assets in ${outputDirectory}`);
}

main().catch((error) => {
  console.error("Failed to generate temp voice emojis:", error);
  process.exitCode = 1;
});
