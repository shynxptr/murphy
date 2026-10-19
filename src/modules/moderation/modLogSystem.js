const { ChannelType, EmbedBuilder } = require("discord.js");
const { getGuildSettings, updateGuildSettings } = require("../../services/guildConfigService");

// Kategori log moderasi & aktivitas yang didukung.
// key → dipakai sebagai property di settings.modLogChannels.
// label → dipakai untuk nama thread di forum + embed title.
const MOD_LOG_CATEGORIES = [
  { key: "mute", label: "Mute/Timeout" },
  { key: "kick", label: "Kick" },
  { key: "ban", label: "Ban/Unban" },
  { key: "warn", label: "Warn" },
  { key: "voiceMove", label: "Voice Move" },
  { key: "voiceState", label: "Voice Join/Leave" },
  { key: "channel", label: "Channel Create/Delete" }
];

const MOD_LOG_DEFAULTS = MOD_LOG_CATEGORIES.reduce((acc, cat) => {
  acc[cat.key] = "";
  return acc;
}, {});

function getModLogSettings(guildId) {
  return getGuildSettings(guildId, {
    moderation: {
      logChannels: MOD_LOG_DEFAULTS,
      logChannelId: ""
    }
  }).moderation;
}

function setModLogChannelForCategory(guildId, categoryKey, channelId) {
  return updateGuildSettings(guildId, (current) => ({
    ...current,
    moderation: {
      ...(current.moderation || {}),
      logChannels: {
        ...(current.moderation?.logChannels || MOD_LOG_DEFAULTS),
        [categoryKey]: channelId
      }
    }
  }));
}

function buildLogThreadName(categoryLabel) {
  return `[${categoryLabel}] — Mod Log`;
}

// Kirim embed ke thread yang sudah ada di forum. Kalau belum ada, buat thread baru
// dengan nama fix per kategori (mis. "[Mute/Timeout] — Mod Log").
// Semua log kategori yang sama bakal balas ke thread yang sama.
async function sendModLogToForum(guild, forumChannel, categoryLabel, embed) {
  const threadName = buildLogThreadName(categoryLabel);

  // Cari thread aktif dengan nama matching
  const existingThread = forumChannel.threads.cache.find(
    (thread) => thread.name === threadName && !thread.archived
  );

  if (existingThread) {
    await existingThread.send({ embeds: [embed] }).catch(() => null);
    return;
  }

  // Cari di archived threads juga
  const archivedThreads = await forumChannel.threads.fetchArchived({ limit: 100 }).catch(() => null);
  const archivedMatch = archivedThreads?.threads.find(
    (thread) => thread.name === threadName
  );

  if (archivedMatch) {
    if (archivedMatch.archived) {
      await archivedMatch.setArchived(false, "Mod log resume").catch(() => null);
    }
    await archivedMatch.send({ embeds: [embed] }).catch(() => null);
    return;
  }

  // Belum ada thread → buat baru
  await forumChannel.threads.create({
    name: threadName,
    message: { embeds: [embed] },
    appliedTags: []
  }).catch(() => null);
}

// Fungsi utama untuk dispatch log ke channel yang sesuai.
// categoryKey harus salah satu dari MOD_LOG_CATEGORIES.
async function sendModLog(guild, categoryKey, embed) {
  const settings = getModLogSettings(guild.id);
  const channelId = settings.logChannels?.[categoryKey];

  // Hanya pakai logChannels baru. Kalau ga diset, log ga dikirim.
  if (!channelId) {
    return;
  }

  const channel = guild.channels.cache.get(channelId)
    || await guild.channels.fetch(channelId).catch(() => null);

  if (!channel) {
    return;
  }

  const category = MOD_LOG_CATEGORIES.find((cat) => cat.key === categoryKey);

  if (!category) {
    return;
  }

  // Forum → kirim ke thread per kategori
  if (channel.type === ChannelType.GuildForum) {
    await sendModLogToForum(guild, channel, category.label, embed);
    return;
  }

  // Text channel → kirim embed langsung (fallback)
  if (channel.type === ChannelType.GuildText) {
    await channel.send({ embeds: [embed] }).catch(() => null);
  }
}

// Helper builder untuk embed log yang seragam.
// Payload: { title, description, color, fields: [{name, value, inline}], footerText }
function buildModLogEmbed({ title, description, color = "#111827", fields = [], footerText = "" }) {
  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(title)
    .setTimestamp();

  if (description) {
    embed.setDescription(description);
  }

  if (fields.length) {
    embed.addFields(fields);
  }

  if (footerText) {
    embed.setFooter({ text: footerText });
  }

  return embed;
}

module.exports = {
  MOD_LOG_CATEGORIES,
  buildModLogEmbed,
  getModLogSettings,
  sendModLog,
  setModLogChannelForCategory
};
