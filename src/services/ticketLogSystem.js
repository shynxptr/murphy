const { ChannelType, EmbedBuilder } = require("discord.js");
const { getGuildSettings, updateGuildSettings } = require("../services/guildConfigService");

// Kategori log tiket yang didukung.
// key → dipakai sebagai property di settings.ticketLog.channels
// label → dipakai untuk nama thread di forum + embed title.
const TICKET_LOG_CATEGORIES = [
  { key: "open", label: "Ticket Opened" },
  { key: "close", label: "Ticket Closed" },
  { key: "claim", label: "Ticket Claimed" },
  { key: "approve", label: "Ticket Approved" }
];

const TICKET_LOG_DEFAULTS = TICKET_LOG_CATEGORIES.reduce((acc, cat) => {
  acc[cat.key] = "";
  return acc;
}, {});

function getTicketLogSettings(guildId) {
  const settings = getGuildSettings(guildId, {
    ticketLog: {
      channels: TICKET_LOG_DEFAULTS
    }
  });

  return settings.ticketLog || { channels: TICKET_LOG_DEFAULTS };
}

function setTicketLogChannelForCategory(guildId, categoryKey, channelId) {
  return updateGuildSettings(guildId, (current) => ({
    ...current,
    ticketLog: {
      ...(current.ticketLog || {}),
      channels: {
        ...TICKET_LOG_DEFAULTS,
        ...(current.ticketLog?.channels || {}),
        [categoryKey]: channelId
      }
    }
  }));
}

function buildLogThreadName(categoryLabel) {
  return `[${categoryLabel}] — Ticket Log`;
}

// Kirim embed ke thread yang sudah ada di forum. Kalau belum ada, buat thread baru.
async function sendTicketLogToForum(guild, forumChannel, categoryLabel, embed) {
  const threadName = buildLogThreadName(categoryLabel);

  const existingThread = forumChannel.threads.cache.find(
    (thread) => thread.name === threadName && !thread.archived
  );

  if (existingThread) {
    await existingThread.send({ embeds: [embed] }).catch(() => null);
    return;
  }

  const archivedThreads = await forumChannel.threads.fetchArchived({ limit: 100 }).catch(() => null);
  const archivedMatch = archivedThreads?.threads.find(
    (thread) => thread.name === threadName
  );

  if (archivedMatch) {
    if (archivedMatch.archived) {
      await archivedMatch.setArchived(false, "Ticket log resume").catch(() => null);
    }
    await archivedMatch.send({ embeds: [embed] }).catch(() => null);
    return;
  }

  await forumChannel.threads.create({
    name: threadName,
    message: { embeds: [embed] },
    appliedTags: []
  }).catch(() => null);
}

// Fungsi utama untuk dispatch log tiket ke channel yang sesuai.
async function sendTicketLog(guild, categoryKey, embed) {
  const settings = getTicketLogSettings(guild.id);
  const channelId = settings.channels?.[categoryKey];

  if (!channelId) {
    return;
  }

  const channel = guild.channels.cache.get(channelId)
    || await guild.channels.fetch(channelId).catch(() => null);

  if (!channel) {
    return;
  }

  const category = TICKET_LOG_CATEGORIES.find((cat) => cat.key === categoryKey);

  if (!category) {
    return;
  }

  if (channel.type === ChannelType.GuildForum) {
    await sendTicketLogToForum(guild, channel, category.label, embed);
    return;
  }

  if (channel.type === ChannelType.GuildText) {
    await channel.send({ embeds: [embed] }).catch(() => null);
  }
}

function buildTicketLogEmbed({ title, description, color = "#111827", fields = [], footerText = "" }) {
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
  TICKET_LOG_CATEGORIES,
  buildTicketLogEmbed,
  getTicketLogSettings,
  sendTicketLog,
  setTicketLogChannelForCategory
};
