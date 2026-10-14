const { AttachmentBuilder } = require("discord.js");
const { Canvas, GlobalFonts, loadImage } = require("@napi-rs/canvas");
const path = require("node:path");

const regularFontRegistered = GlobalFonts.registerFromPath("C:\\Windows\\Fonts\\segoeui.ttf", "Segoe UI");
const boldFontRegistered = GlobalFonts.registerFromPath("C:\\Windows\\Fonts\\segoeuib.ttf", "Segoe UI Bold");

function getFont(weight = "normal") {
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
  if (context.measureText(text).width <= maxWidth) return text;
  let trimmed = text;
  while (trimmed.length > 1 && context.measureText(`${trimmed}...`).width > maxWidth) {
    trimmed = trimmed.slice(0, -1);
  }
  return `${trimmed}...`;
}

async function loadRemoteImage(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to fetch image: ${response.status}`);
  return loadImage(Buffer.from(await response.arrayBuffer()));
}

async function loadAvatarImage(member) {
  const avatarUrl = member.user.displayAvatarURL({ extension: "png", forceStatic: true, size: 512 });
  return loadRemoteImage(avatarUrl);
}

function formatDuration(totalMs) {
  const ms = Math.max(0, totalMs || 0);
  const totalMinutes = Math.floor(ms / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours <= 0) return `${minutes}m`;
  return `${hours}h ${minutes}m`;
}

function drawBackground(context, width, height) {
  const gradient = context.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, "#1a1d21");
  gradient.addColorStop(1, "#111316");
  context.fillStyle = gradient;
  drawRoundedRect(context, 0, 0, width, height, 24);
  context.fill();

  context.strokeStyle = "rgba(255,255,255,0.08)";
  context.lineWidth = 1;
  drawRoundedRect(context, 0.5, 0.5, width - 1, height - 1, 24);
  context.stroke();
}

function drawPanel(context, x, y, width, height) {
  context.fillStyle = "rgba(255,255,255,0.04)";
  drawRoundedRect(context, x, y, width, height, 18);
  context.fill();
  context.strokeStyle = "rgba(255,255,255,0.06)";
  context.lineWidth = 1;
  drawRoundedRect(context, x, y, width, height, 18);
  context.stroke();
}

function drawAvatar(context, avatar, member, x, y, size) {
  context.save();
  drawRoundedRect(context, x, y, size, size, 20);
  context.clip();
  if (avatar) {
    context.drawImage(avatar, x, y, size, size);
  } else {
    const fallback = context.createLinearGradient(x, y, x + size, y + size);
    fallback.addColorStop(0, "#5865f2");
    fallback.addColorStop(1, "#3a3f4b");
    context.fillStyle = fallback;
    context.fillRect(x, y, size, size);
    context.fillStyle = "#ffffff";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.font = `bold ${Math.round(size * 0.4)}px "${getFont("bold")}"`;
    context.fillText((member.displayName || member.user.username).charAt(0).toUpperCase(), x + size / 2, y + size / 2);
    context.textAlign = "start";
    context.textBaseline = "alphabetic";
  }
  context.restore();

  context.strokeStyle = "rgba(255,255,255,0.2)";
  context.lineWidth = 2;
  drawRoundedRect(context, x, y, size, size, 20);
  context.stroke();
}

function drawSectionTitle(context, x, y, title) {
  context.fillStyle = "#ffffff";
  context.font = `bold 20px "${getFont("bold")}"`;
  context.fillText(title, x, y);
}

function drawStatRow(context, x, y, label, value) {
  context.fillStyle = "rgba(255,255,255,0.55)";
  context.font = `14px "${getFont()}"`;
  context.fillText(label, x, y);
  context.fillStyle = "#ffffff";
  context.font = `bold 16px "${getFont("bold")}"`;
  context.textAlign = "right";
  context.fillText(value, x + 220, y);
  context.textAlign = "start";
}

function drawStatChips(context, x, y, stats) {
  const chipWidth = 110;
  const chipHeight = 54;
  const gap = 12;

  stats.forEach((stat, index) => {
    const cx = x + index * (chipWidth + gap);
    drawPanel(context, cx, y, chipWidth, chipHeight);
    context.fillStyle = "rgba(255,255,255,0.5)";
    context.font = `11px "${getFont()}"`;
    context.textAlign = "center";
    context.fillText(stat.label, cx + chipWidth / 2, y + 18);
    context.fillStyle = "#ffffff";
    context.font = `bold 16px "${getFont("bold")}"`;
    context.fillText(stat.value, cx + chipWidth / 2, y + 40);
    context.textAlign = "start";
  });
}

function drawListPanel(context, x, y, width, height, title, entries, emptyLabel) {
  drawPanel(context, x, y, width, height);
  drawSectionTitle(context, x + 18, y + 30, title);

  if (!entries.length) {
    context.fillStyle = "rgba(255,255,255,0.4)";
    context.font = `13px "${getFont()}"`;
    context.fillText(emptyLabel, x + 18, y + 58);
    return;
  }

  entries.forEach((entry, index) => {
    const rowY = y + 56 + index * 24;
    context.fillStyle = index === 0 ? "#f0f0f0" : "rgba(255,255,255,0.7)";
    context.font = `14px "${getFont("bold")}"`;
    context.fillText(`${index + 1}.`, x + 18, rowY);
    context.font = `14px "${getFont()}"`;
    const name = fitText(context, `#${entry.name}`, width - 120);
    context.fillText(name, x + 38, rowY);
    context.font = `bold 14px "${getFont("bold")}"`;
    context.textAlign = "right";
    context.fillText(entry.value, x + width - 18, rowY);
    context.textAlign = "start";
  });
}

async function createStatusCard(snapshot) {
  const width = 860;
  const height = 1040;
  const canvas = new Canvas(width, height);
  const context = canvas.getContext("2d");
  const avatar = await loadAvatarImage(snapshot.member).catch(() => null);

  drawBackground(context, width, height);

  // Header
  const headerX = 42;
  const headerY = 42;
  const headerW = width - 84;
  const headerH = 180;
  drawPanel(context, headerX, headerY, headerW, headerH);
  drawAvatar(context, avatar, snapshot.member, headerX + 24, headerY + 24, 132);

  context.fillStyle = "#ffffff";
  context.font = `bold 32px "${getFont("bold")}"`;
  context.fillText(snapshot.userInfo.nickname, headerX + 176, headerY + 58);

  context.fillStyle = "rgba(255,255,255,0.55)";
  context.font = `16px "${getFont()}"`;
  context.fillText(`@${snapshot.userInfo.username}`, headerX + 176, headerY + 86);

  context.font = `13px "${getFont()}"`;
  context.fillText(`ID: ${snapshot.userInfo.userId}`, headerX + 176, headerY + 112);
  context.fillText(`Akun dibuat: ${snapshot.userInfo.createdAtLabel}`, headerX + 176, headerY + 134);
  context.fillText(`Bergabung server: ${snapshot.userInfo.joinedAtLabel}`, headerX + 176, headerY + 156);

  // Messages section
  let sectionY = headerY + headerH + 22;
  drawSectionTitle(context, headerX, sectionY, "Messages");
  drawStatChips(context, headerX, sectionY + 22, [
    { label: "Total", value: snapshot.messages.total.toLocaleString("id-ID") },
    { label: "24 Jam", value: snapshot.messages.hours24.toLocaleString("id-ID") },
    { label: "7 Hari", value: snapshot.messages.days7.toLocaleString("id-ID") },
    { label: "30 Hari", value: snapshot.messages.days30.toLocaleString("id-ID") }
  ]);

  if (snapshot.messages.rank) {
    context.fillStyle = "rgba(255,255,255,0.5)";
    context.font = `13px "${getFont()}"`;
    context.fillText(`Rank chat server: #${snapshot.messages.rank}`, headerX + 4 * 122 + 24, sectionY + 50);
  }

  // Most active text channels
  sectionY += 110;
  drawListPanel(
    context,
    headerX,
    sectionY,
    width - 84,
    170,
    "Most Active Text Channels",
    snapshot.topTextChannels.map((c) => ({ name: c.name, value: `${c.messages.toLocaleString("id-ID")} pesan` })),
    "Belum ada data channel."
  );

  // Voice section
  sectionY += 196;
  drawSectionTitle(context, headerX, sectionY, "Voice");
  drawStatChips(context, headerX, sectionY + 22, [
    { label: "Total", value: formatDuration(snapshot.voice.totalMs) },
    { label: "24 Jam", value: formatDuration(snapshot.voice.hours24) },
    { label: "7 Hari", value: formatDuration(snapshot.voice.days7) },
    { label: "30 Hari", value: formatDuration(snapshot.voice.days30) }
  ]);

  if (snapshot.voice.rank) {
    context.fillStyle = "rgba(255,255,255,0.5)";
    context.font = `13px "${getFont()}"`;
    context.fillText(`Rank voice server: #${snapshot.voice.rank}`, headerX + 4 * 122 + 24, sectionY + 50);
  }

  // Most active voice channels
  sectionY += 110;
  drawListPanel(
    context,
    headerX,
    sectionY,
    width - 84,
    170,
    "Most Active Voice Channels",
    snapshot.topVoiceChannels.map((c) => ({ name: c.name, value: formatDuration(c.totalMs) })),
    "Belum ada data channel."
  );

  // Quick Links
  sectionY += 196;
  drawPanel(context, headerX, sectionY, width - 84, 70);
  drawSectionTitle(context, headerX + 18, sectionY + 26, "Quick Links");
  context.fillStyle = "#5865f2";
  context.font = `14px "${getFont("bold")}"`;
  context.fillText("Murphy Server Status", headerX + 18, sectionY + 54);

  return new AttachmentBuilder(await canvas.encode("png"), {
    name: "murphy-status-card.png"
  });
}

module.exports = {
  createStatusCard
};
