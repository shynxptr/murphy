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

function drawBaseBackground(context, width, height) {
  const baseGradient = context.createLinearGradient(0, 0, width, height);
  baseGradient.addColorStop(0, "#080809");
  baseGradient.addColorStop(0.38, "#101114");
  baseGradient.addColorStop(1, "#070708");
  context.fillStyle = baseGradient;
  context.fillRect(0, 0, width, height);

  context.fillStyle = "rgba(255, 255, 255, 0.02)";
  drawRoundedRect(context, 18, 18, width - 36, height - 36, 26);
  context.fill();
}

function drawAvatarAtmosphere(context, avatar, width, height) {
  if (!avatar) {
    return;
  }

  context.save();
  context.filter = "blur(48px)";
  context.globalAlpha = 0.2;
  context.drawImage(avatar, -40, -20, width * 0.62, height * 0.96);
  context.globalAlpha = 0.12;
  context.drawImage(avatar, width * 0.42, height * 0.02, width * 0.52, height * 0.82);
  context.restore();

  const overlay = context.createLinearGradient(0, 0, width, 0);
  overlay.addColorStop(0, "rgba(0, 0, 0, 0.52)");
  overlay.addColorStop(0.5, "rgba(0, 0, 0, 0.34)");
  overlay.addColorStop(1, "rgba(0, 0, 0, 0.56)");
  context.fillStyle = overlay;
  context.fillRect(0, 0, width, height);
}

function drawShell(context, width, height) {
  context.fillStyle = "rgba(10, 10, 12, 0.66)";
  drawRoundedRect(context, 28, 28, width - 56, height - 56, 24);
  context.fill();

  context.strokeStyle = "rgba(255, 255, 255, 0.07)";
  context.lineWidth = 1;
  drawRoundedRect(context, 28, 28, width - 56, height - 56, 24);
  context.stroke();

  context.fillStyle = "rgba(255, 255, 255, 0.025)";
  drawRoundedRect(context, 44, 44, width - 88, 158, 22);
  context.fill();

  context.fillStyle = "rgba(255, 255, 255, 0.02)";
  drawRoundedRect(context, 44, 220, width - 88, height - 292, 22);
  context.fill();

  const accentGradient = context.createLinearGradient(0, 44, 0, height - 44);
  accentGradient.addColorStop(0, "#38bdf8");
  accentGradient.addColorStop(0.4, "#f97316");
  accentGradient.addColorStop(1, "#facc15");
  context.fillStyle = accentGradient;
  drawRoundedRect(context, 44, 44, 6, height - 88, 3);
  context.fill();
}

function drawProfileHeader(context, targetMember, metrics, avatar) {
  const profileX = 72;
  const profileY = 72;
  const profileSize = 96;
  const contentRight = 920;

  context.save();
  context.beginPath();
  context.arc(profileX + (profileSize / 2), profileY + (profileSize / 2), profileSize / 2, 0, Math.PI * 2);
  context.closePath();
  context.clip();

  if (avatar) {
    context.drawImage(avatar, profileX, profileY, profileSize, profileSize);
  } else {
    const fallback = context.createLinearGradient(profileX, profileY, profileX + profileSize, profileY + profileSize);
    fallback.addColorStop(0, "#202124");
    fallback.addColorStop(1, "#101113");
    context.fillStyle = fallback;
    context.fillRect(profileX, profileY, profileSize, profileSize);
    context.fillStyle = "#ffffff";
    context.font = `bold 42px "${getFontFamily("bold")}"`;
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText((targetMember.displayName || targetMember.user.username).charAt(0).toUpperCase(), profileX + (profileSize / 2), profileY + (profileSize / 2) + 2);
    context.textAlign = "start";
    context.textBaseline = "alphabetic";
  }

  context.restore();

  context.strokeStyle = "rgba(255, 255, 255, 0.88)";
  context.lineWidth = 4;
  context.beginPath();
  context.arc(profileX + (profileSize / 2), profileY + (profileSize / 2), (profileSize / 2) - 2, 0, Math.PI * 2);
  context.stroke();

  context.fillStyle = "#ffffff";
  context.font = `bold 17px "${getFontFamily("bold")}"`;
  context.fillText("MURPHY STREAK", 194, 88);

  context.fillStyle = "#f4f4f5";
  context.font = `bold 34px "${getFontFamily("bold")}"`;
  context.fillText(fitText(context, targetMember.displayName || targetMember.user.username, 380), 194, 128);

  context.fillStyle = "#c3c6cb";
  context.font = `18px "${getFontFamily()}"`;
  context.fillText(`@${fitText(context, targetMember.user.username, 180)}`, 194, 156);

  context.fillStyle = "#8b9098";
  context.font = `15px "${getFontFamily()}"`;
  context.fillText("Bond tracker yang nyala di server Murphy.", 194, 182);

  const chips = [
    { label: `Partner ${metrics.totalPartners}`, color: "rgba(56, 189, 248, 0.16)", border: "rgba(56, 189, 248, 0.35)" },
    { label: `Halaman ${metrics.page}/${metrics.totalPages}`, color: "rgba(249, 115, 22, 0.15)", border: "rgba(249, 115, 22, 0.32)" },
    { label: `Top ${metrics.topStreak}`, color: "rgba(250, 204, 21, 0.14)", border: "rgba(250, 204, 21, 0.28)" }
  ];

  context.font = `bold 15px "${getFontFamily("bold")}"`;
  const chipGap = 10;
  const chipWidths = chips.map((chip) => Math.max(98, context.measureText(chip.label).width + 28));
  const totalChipWidth = chipWidths.reduce((sum, width) => sum + width, 0) + (chipGap * (chipWidths.length - 1));
  let chipX = contentRight - totalChipWidth;

  for (const [index, chip] of chips.entries()) {
    const chipWidth = chipWidths[index];
    context.fillStyle = chip.color;
    drawRoundedRect(context, chipX, 78, chipWidth, 34, 17);
    context.fill();
    context.strokeStyle = chip.border;
    context.lineWidth = 1;
    drawRoundedRect(context, chipX, 78, chipWidth, 34, 17);
    context.stroke();
    context.fillStyle = "#f8fafc";
    context.fillText(chip.label, chipX + 14, 100);
    chipX += chipWidth + chipGap;
  }

  context.strokeStyle = "rgba(255, 255, 255, 0.08)";
  context.lineWidth = 1;
  context.beginPath();
  context.moveTo(194, 188);
  context.lineTo(contentRight, 188);
  context.stroke();
}

function drawStatusChip(context, x, y, width, height, completedToday) {
  const fill = completedToday ? "rgba(34, 197, 94, 0.18)" : "rgba(239, 68, 68, 0.16)";
  const border = completedToday ? "rgba(34, 197, 94, 0.32)" : "rgba(239, 68, 68, 0.3)";
  const label = completedToday ? "Nyala Hari Ini" : "Belum Nyala";

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

function drawRankBadge(context, x, y, rank) {
  const highlight = rank === 1
    ? { fill: "rgba(250, 204, 21, 0.18)", text: "#fde68a" }
    : rank === 2
      ? { fill: "rgba(148, 163, 184, 0.16)", text: "#e2e8f0" }
      : rank === 3
        ? { fill: "rgba(251, 146, 60, 0.16)", text: "#fdba74" }
        : { fill: "rgba(255, 255, 255, 0.06)", text: "#d4d4d8" };

  context.fillStyle = highlight.fill;
  drawRoundedRect(context, x, y, 54, 38, 14);
  context.fill();
  context.fillStyle = highlight.text;
  context.font = `bold 17px "${getFontFamily("bold")}"`;
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(`#${rank}`, x + 27, y + 20);
  context.textAlign = "start";
  context.textBaseline = "alphabetic";
}

function getTopRowStyle(rank) {
  if (rank === 1) {
    return {
      fill: "rgba(250, 204, 21, 0.085)",
      border: "rgba(250, 204, 21, 0.24)",
      glow: "rgba(250, 204, 21, 0.18)"
    };
  }

  if (rank === 2) {
    return {
      fill: "rgba(148, 163, 184, 0.07)",
      border: "rgba(203, 213, 225, 0.18)",
      glow: "rgba(148, 163, 184, 0.12)"
    };
  }

  if (rank === 3) {
    return {
      fill: "rgba(251, 146, 60, 0.08)",
      border: "rgba(251, 146, 60, 0.2)",
      glow: "rgba(251, 146, 60, 0.14)"
    };
  }

  return null;
}

function drawPartnerAvatar(context, avatar, x, y, size, fallbackLetter) {
  context.save();
  context.beginPath();
  context.arc(x + (size / 2), y + (size / 2), size / 2, 0, Math.PI * 2);
  context.closePath();
  context.clip();

  if (avatar) {
    context.drawImage(avatar, x, y, size, size);
  } else {
    const fallback = context.createLinearGradient(x, y, x + size, y + size);
    fallback.addColorStop(0, "#222327");
    fallback.addColorStop(1, "#0e1013");
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

  context.strokeStyle = "rgba(255, 255, 255, 0.14)";
  context.lineWidth = 2;
  context.beginPath();
  context.arc(x + (size / 2), y + (size / 2), (size / 2) - 1, 0, Math.PI * 2);
  context.stroke();
}

function drawEntryRow(context, entry, index, partnerAvatar, flameImage) {
  const rowX = 60;
  const rowY = 236 + (index * 64);
  const rowWidth = 860;
  const rowHeight = 56;
  const avatarX = rowX + 82;
  const nameX = rowX + 136;
  const statusWidth = 148;
  const statusX = rowX + rowWidth - statusWidth - 16;
  const bestX = statusX - 72;
  const flameX = bestX - 34;
  const streakValueX = flameX - 10;
  const currentStreakText = String(entry.currentStreak || 0);
  const bestStreakText = `(${entry.bestStreak || 0})`;
  const topRowStyle = getTopRowStyle(entry.rank);

  if (topRowStyle) {
    context.save();
    context.shadowColor = topRowStyle.glow;
    context.shadowBlur = 18;
    context.fillStyle = topRowStyle.fill;
    drawRoundedRect(context, rowX, rowY, rowWidth, rowHeight, 18);
    context.fill();
    context.restore();

    context.strokeStyle = topRowStyle.border;
    context.lineWidth = 1;
    drawRoundedRect(context, rowX, rowY, rowWidth, rowHeight, 18);
    context.stroke();
  } else {
    context.fillStyle = index % 2 === 0 ? "rgba(255, 255, 255, 0.03)" : "rgba(255, 255, 255, 0.018)";
    drawRoundedRect(context, rowX, rowY, rowWidth, rowHeight, 18);
    context.fill();
  }

  context.fillStyle = "rgba(255, 255, 255, 0.015)";
  drawRoundedRect(context, rowX, rowY, rowWidth, rowHeight, 18);
  context.fill();

  drawRankBadge(context, rowX + 14, rowY + 8, entry.rank);
  drawPartnerAvatar(
    context,
    partnerAvatar,
    avatarX,
    rowY + 7,
    42,
    (entry.partnerName || "?").charAt(0).toUpperCase()
  );

  context.fillStyle = "#f5f6f7";
  context.font = `bold 20px "${getFontFamily("bold")}"`;
  context.fillText(fitText(context, entry.partnerName, 290), nameX, rowY + 24);

  context.fillStyle = "#9ea4ae";
  context.font = `14px "${getFontFamily()}"`;
  context.fillText(fitText(context, entry.partnerHandle, 220), nameX, rowY + 43);

  context.fillStyle = "#ffffff";
  context.font = `bold 24px "${getFontFamily("bold")}"`;
  context.textAlign = "right";
  context.fillText(currentStreakText, streakValueX, rowY + 35);
  context.textAlign = "start";

  if (flameImage) {
    context.drawImage(flameImage, flameX, rowY + 14, 28, 28);
  }

  context.fillStyle = "#b2b8c2";
  context.font = `15px "${getFontFamily()}"`;
  context.fillText(bestStreakText, bestX, rowY + 34);

  drawStatusChip(context, statusX, rowY + 11, statusWidth, 34, entry.completedToday);
}

function drawEmptyState(context) {
  context.fillStyle = "#f7f7f7";
  context.font = `bold 28px "${getFontFamily("bold")}"`;
  context.textAlign = "center";
  context.fillText("Belum ada partner streak yang aktif.", 490, 376);

  context.fillStyle = "#9aa1ab";
  context.font = `18px "${getFontFamily()}"`;
  context.fillText("Mulai dari channel streak dengan format `streak @user`.", 490, 410);
  context.textAlign = "start";
}

function drawFooter(context, totalPartners) {
  context.fillStyle = "rgba(255, 255, 255, 0.06)";
  context.beginPath();
  context.moveTo(60, 680);
  context.lineTo(920, 680);
  context.strokeStyle = "rgba(255, 255, 255, 0.06)";
  context.lineWidth = 1;
  context.stroke();

  context.fillStyle = "#c5c9d1";
  context.font = `15px "${getFontFamily()}"`;
  context.fillText(`Total partner aktif: ${totalPartners}`, 72, 706);

  context.textAlign = "right";
  context.fillStyle = "#8f96a0";
  context.fillText("Murphy Bond Tracker", 920, 706);
  context.textAlign = "start";
}

async function createStreakInfoCard({ targetMember, entries, page, totalPages, totalPartners }) {
  const width = 980;
  const height = 750;
  const canvas = new Canvas(width, height);
  const context = canvas.getContext("2d");

  const topStreak = entries.length ? Math.max(...entries.map((entry) => entry.currentStreak || 0)) : 0;
  const allFlameAssets = [...new Set(entries.map((entry) => entry.tier.assetFile))];

  const [targetAvatar, ...loadedAssets] = await Promise.all([
    loadAvatarImage(targetMember.user).catch(() => null),
    ...allFlameAssets.map((assetFile) => loadTierFlameImage(assetFile).catch(() => null)),
    ...entries.map((entry) => loadAvatarImage(entry.partnerUser).catch(() => null))
  ]);

  const flameMap = new Map();
  const partnerAvatarMap = new Map();
  const assetCount = allFlameAssets.length;

  allFlameAssets.forEach((assetFile, index) => {
    flameMap.set(assetFile, loadedAssets[index]);
  });

  entries.forEach((entry, index) => {
    partnerAvatarMap.set(entry.partnerUser.id, loadedAssets[assetCount + index]);
  });

  drawBaseBackground(context, width, height);
  drawAvatarAtmosphere(context, targetAvatar, width, height);
  drawShell(context, width, height);
  drawProfileHeader(context, targetMember, {
    totalPartners,
    page,
    totalPages,
    topStreak
  }, targetAvatar);

  if (!entries.length) {
    drawEmptyState(context);
  } else {
    entries.forEach((entry, index) => {
      drawEntryRow(
        context,
        entry,
        index,
        partnerAvatarMap.get(entry.partnerUser.id) || null,
        flameMap.get(entry.tier.assetFile)
      );
    });
  }

  drawFooter(context, totalPartners);

  return new AttachmentBuilder(await canvas.encode("png"), {
    name: "murphy-infostreak.png"
  });
}

module.exports = {
  createStreakInfoCard
};
