const { ChannelType, EmbedBuilder, AttachmentBuilder } = require("discord.js");
const { getGuildSettings, updateGuildSettings } = require("./guildConfigService");

const TICKET_LOG_THREAD_NAME = "Ticket Log";
const TICKET_ARCHIVE_THREAD_NAME = "Ticket Archive";

function getTicketLogSettings(guildId) {
  const settings = getGuildSettings(guildId, {
    ticketLog: {
      channelId: ""
    }
  });

  return settings.ticketLog || { channelId: "" };
}

function setTicketLogChannel(guildId, channelId) {
  return updateGuildSettings(guildId, (current) => ({
    ...current,
    ticketLog: {
      ...(current.ticketLog || {}),
      channelId
    }
  }));
}

async function sendTicketLogToForum(guild, forumChannel, embed) {
  const existingThread = forumChannel.threads.cache.find(
    (thread) => thread.name === TICKET_LOG_THREAD_NAME && !thread.archived
  );

  if (existingThread) {
    await existingThread.send({ embeds: [embed] }).catch(() => null);
    return;
  }

  const archivedThreads = await forumChannel.threads.fetchArchived({ limit: 100 }).catch(() => null);
  const archivedMatch = archivedThreads?.threads.find(
    (thread) => thread.name === TICKET_LOG_THREAD_NAME
  );

  if (archivedMatch) {
    if (archivedMatch.archived) {
      await archivedMatch.setArchived(false, "Ticket log resume").catch(() => null);
    }
    await archivedMatch.send({ embeds: [embed] }).catch(() => null);
    return;
  }

  await forumChannel.threads.create({
    name: TICKET_LOG_THREAD_NAME,
    message: { embeds: [embed] },
    appliedTags: []
  }).catch(() => null);
}

async function sendTicketLog(guild, embed) {
  const settings = getTicketLogSettings(guild.id);
  const channelId = settings.channelId;

  if (!channelId) {
    return;
  }

  const channel = guild.channels.cache.get(channelId)
    || await guild.channels.fetch(channelId).catch(() => null);

  if (!channel) {
    return;
  }

  if (channel.type === ChannelType.GuildForum) {
    await sendTicketLogToForum(guild, channel, embed);
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

// Format timestamp Discord jadi readable lokal.
function formatTimestamp(date) {
  return date.toLocaleString("id-ID", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZone: "Asia/Jakarta"
  });
}

// Generate transcript .txt dari seluruh pesan di channel tiket.
// Pesan di-fetch dari paling lama ke paling baru, di-format jadi teks ringkas.
async function generateTicketTranscript(channel, options = {}) {
  const { ownerId = "", ticketTypeKey = "", ticketTypeLabel = "" } = options;

  const messages = [];
  let lastId = null;
  const limit = 100;

  // Fetch pesan dari paling lama (reverse pagination).
  while (true) {
    const fetched = await channel.messages.fetch({
      limit,
      ...(lastId ? { before: lastId } : {})
    }).catch(() => null);

    if (!fetched || fetched.size === 0) {
      break;
    }

    messages.push(...fetched.values());
    lastId = fetched.last().id;

    if (fetched.size < limit) {
      break;
    }
  }

  // Urutkan dari paling lama ke paling baru.
  messages.sort((a, b) => a.createdTimestamp - b.createdTimestamp);

  const now = new Date();
  const headerLines = [
    "=".repeat(60),
    "TICKET TRANSCRIPT",
    "=".repeat(60),
    `Channel    : #${channel.name}`,
    `Channel ID : ${channel.id}`,
    `Type       : ${ticketTypeLabel || ticketTypeKey || "unknown"}`,
    `Owner ID   : ${ownerId || "unknown"}`,
    `Closed At  : ${formatTimestamp(now)}`,
    `Messages   : ${messages.length}`,
    "=".repeat(60),
    ""
  ];

  const bodyLines = messages.map((msg) => {
    const time = formatTimestamp(msg.createdAt);
    const author = msg.author ? `${msg.author.tag} (${msg.author.id})` : "Unknown";
    let content = msg.content || "";

    // Attachments
    if (msg.attachments && msg.attachments.size > 0) {
      const attachmentList = [...msg.attachments.values()]
        .map((a) => `[attachment: ${a.name} (${a.url})]`)
        .join(" ");
      content = content ? `${content}\n  ${attachmentList}` : attachmentList;
    }

    // Embeds (cuma catat kalau ada embed supaya nggak panjang)
    if (msg.embeds && msg.embeds.length > 0) {
      const embedInfo = msg.embeds
        .map((e) => `[embed: ${e.title || e.description || "untitled"}]`)
        .join(" ");
      content = content ? `${content}\n  ${embedInfo}` : embedInfo;
    }

    return `[${time}] ${author}:\n${content || "(no text content)"}`;
  });

  const footerLines = [
    "",
    "=".repeat(60),
    "END OF TRANSCRIPT",
    "=".repeat(60)
  ];

  const fullText = [...headerLines, ...bodyLines, ...footerLines].join("\n");

  const safeChannelName = channel.name.replace(/[^a-z0-9-]/gi, "").slice(0, 20);
  const timestamp = now.toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const filename = `transcript-${safeChannelName}-${timestamp}.txt`;

  return {
    filename,
    content: fullText,
    messageCount: messages.length,
    attachment: new AttachmentBuilder(Buffer.from(fullText, "utf8"), { name: filename })
  };
}

// Kirim arsip tiket (embed ringkasan + transcript .txt) ke channel log tiket.
async function sendTicketArchive(guild, { channel, closedBy, ownerId, ticketTypeKey, ticketTypeLabel }) {
  const settings = getTicketLogSettings(guild.id);
  const logChannelId = settings.channelId;

  if (!logChannelId) {
    return null;
  }

  const logChannel = guild.channels.cache.get(logChannelId)
    || await guild.channels.fetch(logChannelId).catch(() => null);

  if (!logChannel) {
    return null;
  }

  // Generate transcript sebelum channel dihapus.
  let transcript = null;
  try {
    transcript = await generateTicketTranscript(channel, {
      ownerId,
      ticketTypeKey,
      ticketTypeLabel
    });
  } catch (error) {
    console.error("Failed to generate ticket transcript:", error);
  }

  const embed = buildTicketLogEmbed({
    title: "Ticket Archive",
    description: `Tiket **#${channel.name}** telah ditutup dan diarsipkan.`,
    color: "#6b7280",
    fields: [
      { name: "Channel", value: `\`${channel.name}\` (\`${channel.id}\`)`, inline: false },
      { name: "Type", value: `\`${ticketTypeLabel || ticketTypeKey || "unknown"}\``, inline: true },
      { name: "Closed By", value: closedBy ? `${closedBy.tag} (\`${closedBy.id}\`)` : "Unknown", inline: true },
      { name: "Owner ID", value: `\`${ownerId || "unknown"}\``, inline: true },
      { name: "Messages", value: transcript ? `\`${transcript.messageCount}\`` : "`failed to fetch`", inline: true }
    ],
    footerText: `Archive generated at ${new Date().toISOString()}`
  });

  const payload = { embeds: [embed] };

  if (transcript) {
    payload.files = [transcript.attachment];
  }

  // Kirim ke thread khusus "Ticket Archive" kalau forum, atau langsung kalau text channel.
  if (logChannel.type === ChannelType.GuildForum) {
    const existingThread = logChannel.threads.cache.find(
      (thread) => thread.name === TICKET_ARCHIVE_THREAD_NAME && !thread.archived
    );

    if (existingThread) {
      await existingThread.send(payload).catch(() => null);
      return transcript;
    }

    const archivedThreads = await logChannel.threads.fetchArchived({ limit: 100 }).catch(() => null);
    const archivedMatch = archivedThreads?.threads.find(
      (thread) => thread.name === TICKET_ARCHIVE_THREAD_NAME
    );

    if (archivedMatch) {
      if (archivedMatch.archived) {
        await archivedMatch.setArchived(false, "Ticket archive resume").catch(() => null);
      }
      await archivedMatch.send(payload).catch(() => null);
      return transcript;
    }

    await logChannel.threads.create({
      name: TICKET_ARCHIVE_THREAD_NAME,
      message: payload,
      appliedTags: []
    }).catch(() => null);

    return transcript;
  }

  if (logChannel.type === ChannelType.GuildText) {
    await logChannel.send(payload).catch(() => null);
  }

  return transcript;
}

module.exports = {
  buildTicketLogEmbed,
  generateTicketTranscript,
  getTicketLogSettings,
  sendTicketArchive,
  sendTicketLog,
  setTicketLogChannel
};
