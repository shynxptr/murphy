const { AttachmentBuilder } = require("discord.js");
const { Canvas, GlobalFonts, loadImage } = require("@napi-rs/canvas");

const regularFontRegistered = GlobalFonts.registerFromPath("C:\\Windows\\Fonts\\segoeui.ttf", "Segoe UI");
const boldFontRegistered = GlobalFonts.registerFromPath("C:\\Windows\\Fonts\\segoeuib.ttf", "Segoe UI Bold");

function getFontFamily(weight = "normal") {
  if (weight === "bold" && boldFontRegistered) {
    return "Segoe UI Bold";
  }

  return regularFontRegistered ? "Segoe UI" : "sans-serif";
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

async function loadAvatarImage(user) {
  const avatarUrl = user.displayAvatarURL({
    extension: "png",
    forceStatic: true,
    size: 512
  });

  return loadRemoteImage(avatarUrl);
}

function drawBackground(context, width, height, accentColor) {
  const baseGradient = context.createLinearGradient(0, 0, width, height);
  baseGradient.addColorStop(0, "#08090b");
  baseGradient.addColorStop(0.38, "#101114");
  baseGradient.addColorStop(1, "#060607");
  context.fillStyle = baseGradient;
  context.fillRect(0, 0, width, height);

  context.fillStyle = "rgba(255, 255, 255, 0.02)";
  drawRoundedRect(context, 18, 18, width - 36, height - 36, 28);
  context.fill();

  context.fillStyle = accentColor;
  drawRoundedRect(context, 54, 54, 6, height - 108, 3);
  context.fill();
}

function drawShell(context, width, height) {
  context.fillStyle = "rgba(11, 12, 14, 0.72)";
  drawRoundedRect(context, 28, 28, width - 56, height - 56, 24);
  context.fill();

  context.strokeStyle = "rgba(255, 255, 255, 0.07)";
  context.lineWidth = 1;
  drawRoundedRect(context, 28, 28, width - 56, height - 56, 24);
  context.stroke();
}

function drawHeader(context, config, entryCount) {
  context.fillStyle = "#ffffff";
  context.font = `bold 20px "${getFontFamily("bold")}"`;
  context.fillText(config.kicker || "MURPHY LEADERBOARD", 92, 92);

  context.font = `bold 38px "${getFontFamily("bold")}"`;
  context.fillText(fitText(context, config.title, 620), 92, 134);

  context.fillStyle = "#a0a7b1";
  context.font = `17px "${getFontFamily()}"`;
  context.fillText(fitText(context, config.subtitle, 780), 92, 165);

  const chips = [
    { label: `Entry ${entryCount}`, fill: "rgba(255,255,255,0.06)", border: "rgba(255,255,255,0.1)" },
    { label: config.updatedLabel, fill: "rgba(255,255,255,0.06)", border: "rgba(255,255,255,0.1)" }
  ];

  context.font = `bold 15px "${getFontFamily("bold")}"`;
  let chipX = 760;

  for (const chip of chips) {
    const width = Math.max(124, context.measureText(chip.label).width + 28);
    context.fillStyle = chip.fill;
    drawRoundedRect(context, chipX, 78, width, 34, 17);
    context.fill();
    context.strokeStyle = chip.border;
    context.lineWidth = 1;
    drawRoundedRect(context, chipX, 78, width, 34, 17);
    context.stroke();
    context.fillStyle = "#f8fafc";
    context.fillText(chip.label, chipX + 14, 100);
    chipX += width + 10;
  }

  context.strokeStyle = "rgba(255,255,255,0.07)";
  context.lineWidth = 1;
  context.beginPath();
  context.moveTo(92, 190);
  context.lineTo(1008, 190);
  context.stroke();
}

function drawRankBadge(context, x, y, rank) {
  const style = rank === 1
    ? { fill: "rgba(250, 204, 21, 0.16)", text: "#fde68a" }
    : rank === 2
      ? { fill: "rgba(226, 232, 240, 0.1)", text: "#e2e8f0" }
      : rank === 3
        ? { fill: "rgba(251, 146, 60, 0.14)", text: "#fdba74" }
        : { fill: "rgba(255, 255, 255, 0.06)", text: "#d4d4d8" };

  context.fillStyle = style.fill;
  drawRoundedRect(context, x, y, 56, 42, 14);
  context.fill();

  context.fillStyle = style.text;
  context.font = `bold 18px "${getFontFamily("bold")}"`;
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(`#${rank}`, x + 28, y + 22);
  context.textAlign = "start";
  context.textBaseline = "alphabetic";
}

function drawAvatar(context, avatar, x, y, size, fallbackLetter) {
  context.save();
  context.beginPath();
  context.arc(x + (size / 2), y + (size / 2), size / 2, 0, Math.PI * 2);
  context.closePath();
  context.clip();

  if (avatar) {
    context.drawImage(avatar, x, y, size, size);
  } else {
    const fallback = context.createLinearGradient(x, y, x + size, y + size);
    fallback.addColorStop(0, "#23252a");
    fallback.addColorStop(1, "#101114");
    context.fillStyle = fallback;
    context.fillRect(x, y, size, size);
    context.fillStyle = "#ffffff";
    context.font = `bold 22px "${getFontFamily("bold")}"`;
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(fallbackLetter, x + (size / 2), y + (size / 2) + 1);
    context.textAlign = "start";
    context.textBaseline = "alphabetic";
  }

  context.restore();

  context.strokeStyle = "rgba(255,255,255,0.14)";
  context.lineWidth = 2;
  context.beginPath();
  context.arc(x + (size / 2), y + (size / 2), (size / 2) - 1, 0, Math.PI * 2);
  context.stroke();
}

function getRowStyle(rank) {
  if (rank === 1) {
    return { fill: "rgba(250, 204, 21, 0.08)", border: "rgba(250, 204, 21, 0.2)" };
  }

  if (rank === 2) {
    return { fill: "rgba(226, 232, 240, 0.05)", border: "rgba(226, 232, 240, 0.14)" };
  }

  if (rank === 3) {
    return { fill: "rgba(251, 146, 60, 0.08)", border: "rgba(251, 146, 60, 0.18)" };
  }

  return { fill: "rgba(255,255,255,0.03)", border: "rgba(255,255,255,0.04)" };
}

function drawEntryRow(context, entry, index, avatar) {
  const rowX = 78;
  const rowY = 216 + (index * 58);
  const rowWidth = 930;
  const rowHeight = 48;
  const style = getRowStyle(entry.rank);

  context.fillStyle = style.fill;
  drawRoundedRect(context, rowX, rowY, rowWidth, rowHeight, 18);
  context.fill();
  context.strokeStyle = style.border;
  context.lineWidth = 1;
  drawRoundedRect(context, rowX, rowY, rowWidth, rowHeight, 18);
  context.stroke();

  drawRankBadge(context, rowX + 12, rowY + 3, entry.rank);
  drawAvatar(context, avatar, rowX + 86, rowY + 5, 38, (entry.name || "?").charAt(0).toUpperCase());

  context.fillStyle = "#f8fafc";
  context.font = `bold 20px "${getFontFamily("bold")}"`;
  context.fillText(fitText(context, entry.name, 350), rowX + 136, rowY + 23);

  context.fillStyle = "#9ea4ae";
  context.font = `14px "${getFontFamily()}"`;
  context.fillText(fitText(context, entry.handle, 280), rowX + 136, rowY + 41);

  context.fillStyle = "#ffffff";
  context.font = `bold 22px "${getFontFamily("bold")}"`;
  context.textAlign = "right";
  context.fillText(fitText(context, entry.primary, 180), rowX + 742, rowY + 31);
  context.textAlign = "start";

  context.fillStyle = "#b3b9c2";
  context.font = `14px "${getFontFamily()}"`;
  context.fillText(fitText(context, entry.secondary, 210), rowX + 770, rowY + 30);
}

function drawEmptyState(context, title, subtitle) {
  context.fillStyle = "#f5f6f7";
  context.font = `bold 30px "${getFontFamily("bold")}"`;
  context.textAlign = "center";
  context.fillText(title, 548, 420);

  context.fillStyle = "#98a0aa";
  context.font = `18px "${getFontFamily()}"`;
  context.fillText(subtitle, 548, 455);
  context.textAlign = "start";
}

function drawFooter(context, leftText, rightText) {
  context.strokeStyle = "rgba(255,255,255,0.06)";
  context.lineWidth = 1;
  context.beginPath();
  context.moveTo(78, 792);
  context.lineTo(1008, 792);
  context.stroke();

  context.fillStyle = "#c7ccd4";
  context.font = `15px "${getFontFamily()}"`;
  context.fillText(leftText, 90, 818);

  context.fillStyle = "#8f96a0";
  context.textAlign = "right";
  context.fillText(rightText, 1008, 818);
  context.textAlign = "start";
}

async function createLeaderboardCard(config) {
  const width = 1100;
  const height = 860;
  const canvas = new Canvas(width, height);
  const context = canvas.getContext("2d");
  const entries = config.entries || [];
  const avatars = await Promise.all(entries.map((entry) => loadAvatarImage(entry.user).catch(() => null)));

  drawBackground(context, width, height, config.accentColor || "#38bdf8");
  drawShell(context, width, height);
  drawHeader(context, config, entries.length);

  if (!entries.length) {
    drawEmptyState(
      context,
      config.emptyTitle || "Belum ada data leaderboard.",
      config.emptySubtitle || "Board ini akan terisi otomatis."
    );
  } else {
    entries.slice(0, 10).forEach((entry, index) => {
      drawEntryRow(context, entry, index, avatars[index]);
    });
  }

  drawFooter(
    context,
    config.footerLeft || "Murphy",
    config.footerRight || "Leaderboard Board"
  );

  return new AttachmentBuilder(await canvas.encode("png"), {
    name: config.fileName || "murphy-leaderboard.png"
  });
}

module.exports = {
  createLeaderboardCard
};
