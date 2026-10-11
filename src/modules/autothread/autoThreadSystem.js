const {
  ChannelType,
  EmbedBuilder
} = require("discord.js");
const { getGuildSettings, updateGuildSettings } = require("../../services/guildConfigService");

const DEFAULT_AUTO_THREAD_SETTINGS = {
  channelIds: [],
  archiveDurationMinutes: 1440,
  promptText: "Tulis komentar di sini."
};

const MEDIA_ATTACHMENT_PATTERN = /\.(png|jpe?g|gif|webp|bmp|mp4|mov|webm|m4v|avi|mkv)$/i;
const URL_PATTERN = /https?:\/\/\S+/i;

function normalizeChannelIds(values) {
  return [...new Set((values || [])
    .map((value) => String(value || "").trim())
    .filter(Boolean))];
}

function getAutoThreadSettings(guildId) {
  const settings = getGuildSettings(guildId, {
    autoThread: DEFAULT_AUTO_THREAD_SETTINGS
  }).autoThread;

  return {
    ...DEFAULT_AUTO_THREAD_SETTINGS,
    ...(settings || {}),
    channelIds: normalizeChannelIds(settings?.channelIds)
  };
}

function updateAutoThreadSettings(guildId, updater) {
  return updateGuildSettings(guildId, (current) => {
    const nextSettings = updater({
      ...DEFAULT_AUTO_THREAD_SETTINGS,
      ...(current.autoThread || {}),
      channelIds: normalizeChannelIds(current.autoThread?.channelIds)
    });

    return {
      ...current,
      autoThread: {
        ...DEFAULT_AUTO_THREAD_SETTINGS,
        ...(nextSettings || {}),
        channelIds: normalizeChannelIds(nextSettings?.channelIds)
      }
    };
  });
}

function buildAutoThreadStatusEmbed(guild) {
  const settings = getAutoThreadSettings(guild.id);
  const channelLines = settings.channelIds.length
    ? settings.channelIds.map((channelId) => `- <#${channelId}>`).join("\n")
    : "- Belum ada channel";

  return new EmbedBuilder()
    .setColor("#111214")
    .setTitle("Auto Thread Media")
    .setDescription(
      [
        "Thread otomatis dibuat untuk post foto, video, atau link di channel yang kamu set.",
        "",
        `Pesan pembuka: **${settings.promptText}**`,
        `Auto archive: **${settings.archiveDurationMinutes} menit**`,
        "",
        "**Channel aktif:**",
        channelLines
      ].join("\n")
    )
    .setFooter({
      text: `${guild.name} • Auto Thread`
    });
}

function buildThreadName(message) {
  const baseName = (message.member?.displayName || message.author.username || "member").trim();
  return `Komentar • ${baseName}`.slice(0, 100);
}

function hasMediaAttachment(message) {
  return message.attachments.some((attachment) => {
    if (attachment.contentType?.startsWith("image/") || attachment.contentType?.startsWith("video/")) {
      return true;
    }

    return MEDIA_ATTACHMENT_PATTERN.test(attachment.name || attachment.url || "");
  });
}

function hasSupportedAutoThreadContent(message) {
  return hasMediaAttachment(message) || URL_PATTERN.test(message.content || "");
}

async function handleAutoThreadMessage(message, client) {
  if (!message.guild || !message.channel || message.author.bot) {
    return false;
  }

  if (
    message.channel.type !== ChannelType.GuildText &&
    message.channel.type !== ChannelType.GuildAnnouncement
  ) {
    return false;
  }

  if (message.hasThread || message.thread) {
    return false;
  }

  const settings = getAutoThreadSettings(message.guild.id);

  if (!settings.channelIds.includes(message.channel.id)) {
    return false;
  }

  if (!hasSupportedAutoThreadContent(message)) {
    return false;
  }

  try {
    const thread = await message.startThread({
      name: buildThreadName(message),
      autoArchiveDuration: settings.archiveDurationMinutes,
      reason: "Auto thread untuk komentar media/link"
    });

    await thread.send(settings.promptText).catch(() => null);
    return true;
  } catch (error) {
    console.error("Failed to create auto thread:", error);
    return false;
  }
}

module.exports = {
  buildAutoThreadStatusEmbed,
  getAutoThreadSettings,
  handleAutoThreadMessage,
  updateAutoThreadSettings
};
