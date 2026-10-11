const path = require("node:path");
const { AttachmentBuilder } = require("discord.js");
const { Canvas, GlobalFonts, loadImage } = require("@napi-rs/canvas");
const { formatDurationShort } = require("./profileSystem");

const displayFontRegistered = GlobalFonts.registerFromPath(
  path.resolve(__dirname, "..", "..", "..", "assets", "font.otf"),
  "Murphy Display"
);
const regularFontRegistered = GlobalFonts.registerFromPath("C:\\Windows\\Fonts\\segoeui.ttf", "Segoe UI");
const boldFontRegistered = GlobalFonts.registerFromPath("C:\\Windows\\Fonts\\segoeuib.ttf", "Segoe UI Bold");

function getBodyFont(weight = "normal") {
  if (weight === "bold" && boldFontRegistered) {
    return "Segoe UI Bold";
  }

  return regularFontRegistered ? "Segoe UI" : "sans-serif";
}

function getDisplayFont() {
  return displayFontRegistered ? "Murphy Display" : getBodyFont("bold");
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

function wrapText(context, text, maxWidth, maxLines = 3) {
  const tokens = String(text || "").split(/\s+/).filter(Boolean);

  if (!tokens.length) {
    return [];
  }

  const lines = [];
  let current = tokens.shift();

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    const nextValue = `${current} ${token}`;

    if (context.measureText(nextValue).width <= maxWidth) {
      current = nextValue;
      continue;
    }

    lines.push(current);
    current = token;

    if (lines.length >= maxLines - 1) {
      const remainder = [current, ...tokens.slice(index + 1)].join(" ");
      let finalLine = remainder;

      while (finalLine.length > 1 && context.measureText(finalLine).width > maxWidth) {
        finalLine = `${finalLine.slice(0, -1).trim()}...`;
      }

      lines.push(finalLine);
      return lines.slice(0, maxLines);
    }
  }

  if (current) {
    let finalLine = current;

    while (finalLine.length > 1 && context.measureText(finalLine).width > maxWidth) {
      finalLine = `${finalLine.slice(0, -1).trim()}...`;
    }

    lines.push(finalLine);
  }

  return lines.slice(0, maxLines);
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

async function loadThemeBackground(theme) {
  const relativePath = String(theme?.backgroundAsset || "").trim();

  if (!relativePath) {
    return null;
  }

  const absolutePath = path.resolve(__dirname, "..", "..", "..", "assets", relativePath);

  try {
    return await loadImage(absolutePath);
  } catch {
    return null;
  }
}

function drawBackground(context, width, height, theme, backgroundImage = null) {
  if (backgroundImage) {
    context.imageSmoothingEnabled = true;
    context.save();
    context.globalAlpha = 1;
    context.drawImage(backgroundImage, 0, 0, width, height);
    context.restore();

    return;
  }

  const baseGradient = context.createLinearGradient(0, 0, width, height);
  baseGradient.addColorStop(0, theme.palette.baseStart);
  baseGradient.addColorStop(1, theme.palette.baseEnd);
  context.fillStyle = baseGradient;
  context.fillRect(0, 0, width, height);
}

function drawShell(context, width, height, theme) {
  context.fillStyle = theme.shellFill || "rgba(14, 17, 20, 0.78)";
  drawRoundedRect(context, 28, 28, width - 56, height - 56, 30);
  context.fill();

  context.strokeStyle = "rgba(255,255,255,0.06)";
  context.lineWidth = 1.2;
  drawRoundedRect(context, 28, 28, width - 56, height - 56, 30);
  context.stroke();

  context.fillStyle = theme.palette.accent;
  drawRoundedRect(context, 46, 46, 4, height - 92, 2);
  context.fill();
}

function drawPanel(context, x, y, width, height, theme, strong = false) {
  context.fillStyle = strong ? theme.palette.panelStrong : theme.palette.panel;
  drawRoundedRect(context, x, y, width, height, 24);
  context.fill();
  context.strokeStyle = theme.palette.line;
  context.lineWidth = 1;
  drawRoundedRect(context, x, y, width, height, 24);
  context.stroke();
}

function drawAvatar(context, avatar, member, theme) {
  const x = 72;
  const y = 68;
  const size = 116;
  const radius = 28;

  context.save();
  drawRoundedRect(context, x, y, size, size, radius);
  context.clip();

  if (avatar) {
    context.drawImage(avatar, x, y, size, size);
  } else {
    const fallback = context.createLinearGradient(x, y, x + size, y + size);
    fallback.addColorStop(0, theme.palette.accent);
    fallback.addColorStop(1, "rgba(255,255,255,0.08)");
    context.fillStyle = fallback;
    context.fillRect(x, y, size, size);
    context.fillStyle = "#ffffff";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.font = `52px "${getDisplayFont()}"`;
    context.fillText((member.displayName || member.user.username).charAt(0).toUpperCase(), x + (size / 2), y + (size / 2) + 6);
    context.textAlign = "start";
    context.textBaseline = "alphabetic";
  }

  context.restore();

  context.strokeStyle = theme.palette.accent;
  context.lineWidth = 2;
  drawRoundedRect(context, x, y, size, size, radius);
  context.stroke();
}

function drawChip(context, x, y, label, theme, wide = false) {
  context.font = `15px "${getBodyFont("bold")}"`;
  const width = Math.max(wide ? 150 : 110, context.measureText(label).width + 28);
  context.fillStyle = theme.palette.accentSoft;
  drawRoundedRect(context, x, y, width, 34, 17);
  context.fill();
  context.strokeStyle = theme.palette.line;
  drawRoundedRect(context, x, y, width, 34, 17);
  context.stroke();
  context.fillStyle = theme.palette.textPrimary;
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(label, x + (width / 2), y + 18);
  context.textAlign = "start";
  context.textBaseline = "alphabetic";
  return width;
}

function drawHeader(context, snapshot) {
  const { member, theme, title, levelInfo, metrics } = snapshot;
  const displayName = member.displayName || member.user.username;

  context.fillStyle = theme.palette.textPrimary;
  context.font = `44px "${getDisplayFont()}"`;
  context.fillText(fitText(context, displayName, 460), 214, 108);

  context.fillStyle = theme.palette.textSecondary;
  context.font = `20px "${getBodyFont()}"`;
  context.fillText(`@${fitText(context, member.user.username, 260)}`, 216, 146);

  context.fillStyle = theme.palette.textMuted;
  context.font = `17px "${getBodyFont()}"`;
  context.fillText(`Masuk Murphy sejak ${metrics.joinedAtLabel}`, 216, 176);

  const titleWidth = drawChip(context, 214, 194, title.label, theme, true);
  drawChip(context, 228 + titleWidth, 194, `${levelInfo.code} ${levelInfo.name}`, theme, true);

  const visibleBadges = snapshot.badges.slice(0, 3);
  const totalBadgeWidth = visibleBadges.reduce((sum, badge) => {
    context.font = `15px "${getBodyFont("bold")}"`;
    return sum + Math.max(110, context.measureText(badge.label).width + 28);
  }, 0) + (Math.max(0, visibleBadges.length - 1) * 10);
  let badgeX = 1108 - totalBadgeWidth;

  visibleBadges.forEach((badge, index) => {
    const width = drawChip(context, badgeX, 82, badge.label, theme);
    badgeX += width + (index < visibleBadges.length - 1 ? 10 : 0);
  });
}

function drawMetricCard(context, x, y, width, height, label, value, caption, theme) {
  drawPanel(context, x, y, width, height, theme);
  context.fillStyle = theme.palette.textMuted;
  context.font = `14px "${getBodyFont("bold")}"`;
  context.fillText(label.toUpperCase(), x + 22, y + 28);

  context.fillStyle = theme.palette.textPrimary;
  context.font = `30px "${getDisplayFont()}"`;
  context.fillText(fitText(context, value, width - 44), x + 22, y + 68);

  context.fillStyle = theme.palette.textSecondary;
  context.font = `15px "${getBodyFont()}"`;
  context.fillText(fitText(context, caption, width - 44), x + 22, y + height - 18);
}

function drawStatsRow(context, snapshot) {
  const { metrics, levelInfo, theme } = snapshot;
  const y = 262;
  const width = 316;
  const height = 112;
  const gap = 18;

  drawMetricCard(
    context,
    72,
    y,
    width,
    height,
    "Level Tier",
    `${levelInfo.name}`,
    `Tier ${levelInfo.code} | Level ${levelInfo.level}`,
    theme
  );

  drawMetricCard(
    context,
    72 + width + gap,
    y,
    width,
    height,
    "Chat",
    `${metrics.totalMessages.toLocaleString("id-ID")}`,
    metrics.chatRank ? `Rank chat #${metrics.chatRank}` : "Belum masuk rank chat",
    theme
  );

  drawMetricCard(
    context,
    72 + ((width + gap) * 2),
    y,
    width,
    height,
    "Voice",
    formatDurationShort(metrics.voiceTotalMs),
    metrics.voiceRank ? `Rank voice #${metrics.voiceRank}` : "Belum masuk rank voice",
    theme
  );
}

function drawListPanel(context, x, y, width, height, title, entries, emptyLabel, theme, formatter) {
  drawPanel(context, x, y, width, height, theme);
  context.fillStyle = theme.palette.textPrimary;
  context.font = `24px "${getDisplayFont()}"`;
  context.fillText(title, x + 22, y + 36);

  if (!entries.length) {
    context.fillStyle = theme.palette.textMuted;
    context.font = `15px "${getBodyFont()}"`;
    const emptyLines = wrapText(context, emptyLabel, width - 44, 3);
    emptyLines.forEach((line, index) => {
      context.fillText(line, x + 22, y + 72 + (index * 18));
    });
    return;
  }

  entries.forEach((entry, index) => {
    const rowY = y + 68 + (index * 23);
    context.fillStyle = index === 0 ? theme.palette.accent : theme.palette.textSecondary;
    context.font = `16px "${getBodyFont("bold")}"`;
    context.fillText(`${index + 1}.`, x + 22, rowY);

    context.fillStyle = theme.palette.textPrimary;
    context.font = `16px "${getBodyFont()}"`;
    context.fillText(fitText(context, formatter(entry), width - 74), x + 54, rowY);
  });
}

function drawBioPanel(context, snapshot) {
  const { metrics, theme } = snapshot;
  const x = 72;
  const y = 622;
  const width = 1036;
  const height = 86;

  drawPanel(context, x, y, width, height, theme, true);
  context.fillStyle = theme.palette.textPrimary;
  context.font = `24px "${getDisplayFont()}"`;
  context.fillText("Bio", x + 22, y + 34);

  context.fillStyle = theme.palette.textSecondary;
  context.font = `16px "${getBodyFont()}"`;
  const lines = wrapText(
    context,
    metrics.bio || "Belum ada bio. Pakai `f profile bio <teks>` atau `/profile set-bio` buat isi profilmu.",
    width - 44,
    2
  );

  lines.forEach((line, index) => {
    context.fillText(line, x + 22, y + 60 + (index * 18));
  });
}

function drawFooter(context, snapshot) {
  const { metrics, theme } = snapshot;
  context.fillStyle = theme.palette.textMuted;
  context.font = `14px "${getBodyFont()}"`;
  context.fillText(`Top friend dihitung dari akumulasi voice bareng. Lagu favorit terisi ${metrics.favoriteSongs.length}/${metrics.favoriteSongLimit}.`, 72, 734);
  context.textAlign = "right";
  context.fillText("Murphy Profile Card", 1108, 734);
  context.textAlign = "start";
}

async function createProfileCard(snapshot) {
  const width = 1180;
  const height = 760;
  const canvas = new Canvas(width, height);
  const context = canvas.getContext("2d");
  const avatar = await loadAvatarImage(snapshot.member).catch(() => null);
  const backgroundImage = await loadThemeBackground(snapshot.theme);

  drawBackground(context, width, height, snapshot.theme, backgroundImage);
  drawShell(context, width, height, snapshot.theme);
  drawAvatar(context, avatar, snapshot.member, snapshot.theme);
  drawHeader(context, snapshot);
  drawStatsRow(context, snapshot);

  drawListPanel(
    context,
    72,
    398,
    330,
    198,
    "Top Friends",
    snapshot.metrics.topFriends,
    "Belum ada cukup data voice bareng untuk ditampilkan.",
    snapshot.theme,
    (entry) => `${entry.displayName} | ${formatDurationShort(entry.totalMs)}`
  );

  drawListPanel(
    context,
    425,
    398,
    330,
    198,
    "Streak Partners",
    snapshot.metrics.streakPartners || [],
    "Belum ada pasangan streak aktif yang tercatat.",
    snapshot.theme,
    (entry) => `${entry.displayName} | ${entry.currentStreak}d (${entry.bestStreak})`
  );

  drawListPanel(
    context,
    778,
    398,
    330,
    198,
    "Favorite Songs",
    snapshot.metrics.favoriteSongs,
    "Belum ada lagu favorit. Pakai `f profile song add` untuk isi.",
    snapshot.theme,
    (entry) => entry
  );

  drawBioPanel(context, snapshot);
  drawFooter(context, snapshot);

  return new AttachmentBuilder(await canvas.encode("png"), {
    name: "murphy-profile-card.png"
  });
}

module.exports = {
  createProfileCard
};
