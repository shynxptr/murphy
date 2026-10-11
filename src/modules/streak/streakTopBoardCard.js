const path = require("node:path");
const { AttachmentBuilder } = require("discord.js");
const { Canvas, GlobalFonts, loadImage } = require("@napi-rs/canvas");

const regularFontRegistered = GlobalFonts.registerFromPath("C:\\Windows\\Fonts\\segoeui.ttf", "Segoe UI");
const boldFontRegistered = GlobalFonts.registerFromPath("C:\\Windows\\Fonts\\segoeuib.ttf", "Segoe UI Bold");
const assetsDirectory = path.join(__dirname, "..", "..", "..", "assets", "streak-emojis");

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

async function loadTierFlameImage(assetFile) {
  return loadImage(path.join(assetsDirectory, assetFile));
}

function formatUpdatedAt(timezone) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date());
}

function drawBackground(context, width, height) {
  const baseGradient = context.createLinearGradient(0, 0, width, height);
  baseGradient.addColorStop(0, "#09090b");
  baseGradient.addColorStop(0.4, "#111214");
  baseGradient.addColorStop(1, "#060607");
  context.fillStyle = baseGradient;
  context.fillRect(0, 0, width, height);

  context.fillStyle = "rgba(255, 255, 255, 0.02)";
  drawRoundedRect(context, 18, 18, width - 36, height - 36, 28);
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

  const accentGradient = context.createLinearGradient(54, 58, 54, height - 58);
  accentGradient.addColorStop(0, "#fb7185");
  accentGradient.addColorStop(0.4, "#f97316");
  accentGradient.addColorStop(1, "#38bdf8");
  context.fillStyle = accentGradient;
  drawRoundedRect(context, 54, 58, 6, height - 116, 3);
  context.fill();
}

function drawHeader(context, guildName, totalPairs, timezone) {
  context.fillStyle = "#ffffff";
  context.font = `bold 20px "${getFontFamily("bold")}"`;
  context.fillText("MURPHY TOP STREAK", 92, 92);

  context.font = `bold 38px "${getFontFamily("bold")}"`;
  context.fillText(fitText(context, guildName || "Murphy", 500), 92, 134);

  context.fillStyle = "#a0a7b1";
  context.font = `17px "${getFontFamily()}"`;
  context.fillText("Top pasangan streak server yang diperbarui otomatis setiap hari.", 92, 165);

  const chips = [
    { label: `Total Pair ${totalPairs}`, fill: "rgba(56, 189, 248, 0.16)", border: "rgba(56, 189, 248, 0.3)" },
    { label: `Updated ${formatUpdatedAt(timezone)}`, fill: "rgba(249, 115, 22, 0.16)", border: "rgba(249, 115, 22, 0.3)" }
  ];

  context.font = `bold 15px "${getFontFamily("bold")}"`;
  let chipX = 720;

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

  context.strokeStyle = "rgba(255, 255, 255, 0.07)";
  context.lineWidth = 1;
  context.beginPath();
  context.moveTo(92, 190);
  context.lineTo(988, 190);
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
    fallback.addColorStop(0, "#24262a");
    fallback.addColorStop(1, "#111214");
    context.fillStyle = fallback;
    context.fillRect(x, y, size, size);
    context.fillStyle = "#ffffff";
    context.font = `bold 24px "${getFontFamily("bold")}"`;
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(fallbackLetter, x + (size / 2), y + (size / 2) + 1);
    context.textAlign = "start";
    context.textBaseline = "alphabetic";
  }

  context.restore();

  context.strokeStyle = "rgba(255, 255, 255, 0.14)";
  context.lineWidth = 2;
  context.beginPath();
  context.arc(x + (size / 2), y + (size / 2), (size / 2) - 1, 0, Math.PI * 2);
  context.stroke();
}

function drawStatusChip(context, x, y, completedToday) {
  const width = 134;
  const height = 34;
  const label = completedToday ? "Nyala Hari Ini" : "Belum Nyala";
  const fill = completedToday ? "rgba(34, 197, 94, 0.18)" : "rgba(239, 68, 68, 0.16)";
  const border = completedToday ? "rgba(34, 197, 94, 0.3)" : "rgba(239, 68, 68, 0.28)";

  context.fillStyle = fill;
  drawRoundedRect(context, x, y, width, height, 16);
  context.fill();
  context.strokeStyle = border;
  context.lineWidth = 1;
  drawRoundedRect(context, x, y, width, height, 16);
  context.stroke();

  context.fillStyle = completedToday ? "#bbf7d0" : "#fecaca";
  context.font = `bold 14px "${getFontFamily("bold")}"`;
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(label, x + (width / 2), y + (height / 2) + 1);
  context.textAlign = "start";
  context.textBaseline = "alphabetic";
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

  return { fill: "rgba(255, 255, 255, 0.03)", border: "rgba(255, 255, 255, 0.04)" };
}

function drawEntryRow(context, entry, index, leftAvatar, rightAvatar, flameImage) {
  const rowX = 78;
  const rowY = 216 + (index * 56);
  const rowWidth = 930;
  const rowHeight = 46;
  const style = getRowStyle(entry.rank);

  context.fillStyle = style.fill;
  drawRoundedRect(context, rowX, rowY, rowWidth, rowHeight, 18);
  context.fill();
  context.strokeStyle = style.border;
  context.lineWidth = 1;
  drawRoundedRect(context, rowX, rowY, rowWidth, rowHeight, 18);
  context.stroke();

  drawRankBadge(context, rowX + 12, rowY + 2, entry.rank);
  drawAvatar(context, leftAvatar, rowX + 84, rowY + 4, 38, (entry.leftName || "?").charAt(0).toUpperCase());
  drawAvatar(context, rightAvatar, rowX + 252, rowY + 4, 38, (entry.rightName || "?").charAt(0).toUpperCase());

  context.fillStyle = "#f8fafc";
  context.font = `bold 18px "${getFontFamily("bold")}"`;
  context.fillText(fitText(context, entry.leftName, 132), rowX + 128, rowY + 22);
  context.fillStyle = "#c7ccd4";
  context.font = `bold 16px "${getFontFamily("bold")}"`;
  context.fillText("&", rowX + 226, rowY + 22);
  context.fillStyle = "#f8fafc";
  context.font = `bold 18px "${getFontFamily("bold")}"`;
  context.fillText(fitText(context, entry.rightName, 132), rowX + 296, rowY + 22);

  context.fillStyle = "#99a1ab";
  context.font = `13px "${getFontFamily()}"`;
  context.fillText(`@${fitText(context, entry.leftHandle, 110)}`, rowX + 128, rowY + 39);
  context.fillText(`@${fitText(context, entry.rightHandle, 110)}`, rowX + 296, rowY + 39);

  if (flameImage) {
    context.drawImage(flameImage, rowX + 612, rowY + 8, 28, 28);
  }

  context.fillStyle = "#ffffff";
  context.font = `bold 24px "${getFontFamily("bold")}"`;
  context.textAlign = "right";
  context.fillText(String(entry.currentStreak || 0), rowX + 606, rowY + 31);
  context.textAlign = "start";

  context.fillStyle = "#b3b9c2";
  context.font = `14px "${getFontFamily()}"`;
  context.fillText(`Best ${entry.bestStreak || 0}`, rowX + 652, rowY + 30);

  drawStatusChip(context, rowX + rowWidth - 148, rowY + 6, entry.completedToday);
}

function drawEmptyState(context) {
  context.fillStyle = "#f5f6f7";
  context.font = `bold 30px "${getFontFamily("bold")}"`;
  context.textAlign = "center";
  context.fillText("Belum ada pasangan streak aktif.", 548, 420);

  context.fillStyle = "#98a0aa";
  context.font = `18px "${getFontFamily()}"`;
  context.fillText("Board ini akan terisi setelah member mulai streak.", 548, 455);
  context.textAlign = "start";
}

function drawFooter(context) {
  context.strokeStyle = "rgba(255, 255, 255, 0.06)";
  context.lineWidth = 1;
  context.beginPath();
  context.moveTo(78, 792);
  context.lineTo(1008, 792);
  context.stroke();

  context.fillStyle = "#c7ccd4";
  context.font = `15px "${getFontFamily()}"`;
  context.fillText("Murphy", 90, 818);

  context.fillStyle = "#8f96a0";
  context.textAlign = "right";
  context.fillText("Top Streak Board", 1008, 818);
  context.textAlign = "start";
}

async function createStreakTopBoardCard({ guild, entries, timezone, totalPairs }) {
  const width = 1100;
  const height = 860;
  const canvas = new Canvas(width, height);
  const context = canvas.getContext("2d");

  const flameAssets = [...new Set(entries.map((entry) => entry.tier.assetFile))];
  const avatarUsers = entries.flatMap((entry) => [entry.leftUser, entry.rightUser]);

  const loadedAssets = await Promise.all([
    ...flameAssets.map((assetFile) => loadTierFlameImage(assetFile).catch(() => null)),
    ...avatarUsers.map((user) => loadAvatarImage(user).catch(() => null))
  ]);

  const flameMap = new Map();
  const avatarMap = new Map();

  flameAssets.forEach((assetFile, index) => {
    flameMap.set(assetFile, loadedAssets[index]);
  });

  avatarUsers.forEach((user, index) => {
    avatarMap.set(user.id, loadedAssets[flameAssets.length + index]);
  });

  drawBackground(context, width, height);
  drawShell(context, width, height);
  drawHeader(context, guild.name, totalPairs, timezone);

  if (!entries.length) {
    drawEmptyState(context);
  } else {
    entries.forEach((entry, index) => {
      drawEntryRow(
        context,
        entry,
        index,
        avatarMap.get(entry.leftUser.id) || null,
        avatarMap.get(entry.rightUser.id) || null,
        flameMap.get(entry.tier.assetFile) || null
      );
    });
  }

  drawFooter(context);

  return new AttachmentBuilder(await canvas.encode("png"), {
    name: "murphy-top-streak.png"
  });
}

module.exports = {
  createStreakTopBoardCard
};
