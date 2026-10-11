const { EmbedBuilder } = require("discord.js");
const { getGuildSettings, updateGuildSettings } = require("../../services/guildConfigService");
const { MUSIC_BOTS } = require("./musicBotCatalog");

const DEFAULT_MUSIC_BOARD_SETTINGS = {
  channelId: "",
  messageId: "",
  temporaryResponseSeconds: 90
};

const AVAILABLE_ICON = "\u{1F7E2}";
const BUSY_ICON = "\u{1F534}";
const MUSIC_BOARD_PAGE_SIZE = 7;
const musicBoardRefreshes = new Map();

function getMusicBoardSettings(guildId) {
  const settings = getGuildSettings(guildId, {
    musicBoard: DEFAULT_MUSIC_BOARD_SETTINGS
  }).musicBoard;

  return {
    ...DEFAULT_MUSIC_BOARD_SETTINGS,
    ...settings
  };
}

function setMusicBoardChannel(guildId, channelId) {
  return updateGuildSettings(guildId, (current) => ({
    ...current,
    musicBoard: {
      ...DEFAULT_MUSIC_BOARD_SETTINGS,
      ...(current.musicBoard || {}),
      channelId,
      messageId: ""
    }
  }));
}

function updateMusicBoardState(guildId, patch) {
  return updateGuildSettings(guildId, (current) => ({
    ...current,
    musicBoard: {
      ...DEFAULT_MUSIC_BOARD_SETTINGS,
      ...(current.musicBoard || {}),
      ...patch
    }
  }));
}

function getTrackedMusicBotIds() {
  return new Set(MUSIC_BOTS.map((bot) => bot.botId));
}

async function resolveBotMember(guild, botId) {
  return guild.members.cache.get(botId) || guild.members.fetch(botId).catch(() => null);
}

function getGuildIconUrl(guild) {
  return guild.iconURL({
    extension: "png",
    forceStatic: true,
    size: 256
  }) || null;
}

function chunkEntries(entries, chunkSize) {
  const chunks = [];

  for (let index = 0; index < entries.length; index += chunkSize) {
    chunks.push(entries.slice(index, index + chunkSize));
  }

  return chunks;
}

function buildBoardEntryLine(entry) {
  const commandPart = entry.commandHint ? ` \`${entry.commandHint}\`` : "";
  const statusText = entry.voiceChannel ? entry.voiceChannel.toString() : "Tersedia";

  return `${entry.statusIcon} **${entry.label}**${commandPart}\n${entry.mention} - ${statusText}`;
}

function buildSectionFields(entries, options) {
  const chunks = chunkEntries(entries, MUSIC_BOARD_PAGE_SIZE);

  if (chunks.length === 0) {
    return [
      {
        name: options.title,
        value: options.emptyMessage,
        inline: false
      }
    ];
  }

  return chunks.map((chunk, index) => ({
    name: index === 0 ? options.title : "\u200b",
    value: chunk.map(buildBoardEntryLine).join("\n\n"),
    inline: false
  }));
}

function buildMusicBoardEmbed(guild, entries) {
  const guildIconUrl = getGuildIconUrl(guild) || undefined;
  const availableEntries = entries.filter((entry) => !entry.voiceChannel);
  const busyEntries = entries.filter((entry) => entry.voiceChannel);
  const fields = [
    ...buildSectionFields(availableEntries, {
      title: `${AVAILABLE_ICON} Tersedia`,
      emptyMessage: "Semua music bot sedang dipakai sekarang."
    }),
    ...buildSectionFields(busyEntries, {
      title: `${BUSY_ICON} Dipakai`,
      emptyMessage: "Tidak ada music bot yang sedang dipakai."
    })
  ];

  return new EmbedBuilder()
    .setColor("#22c55e")
    .setAuthor({
      name: "Murphy Music List",
      iconURL: guildIconUrl
    })
    .setDescription([
      `${AVAILABLE_ICON} **Tersedia:** ${availableEntries.length}`,
      `${BUSY_ICON} **Sedang Dipakai:** ${busyEntries.length}`,
      "",
      "Auto update saat music bot pindah voice."
    ].join("\n"))
    .addFields(fields)
    .setFooter({
      text: "Murphy | Music board auto update",
      iconURL: guildIconUrl
    })
    .setTimestamp();
}

async function buildMusicBoardEntries(guild) {
  const members = await Promise.all(MUSIC_BOTS.map((entry) => resolveBotMember(guild, entry.botId)));

  return MUSIC_BOTS.map((entry, index) => {
    const member = members[index];
    const voiceChannel = member?.voice?.channel || null;
    const mention = member ? member.toString() : `<@${entry.botId}>`;

    return {
      ...entry,
      mention,
      voiceChannel,
      statusIcon: voiceChannel ? BUSY_ICON : AVAILABLE_ICON
    };
  });
}

async function refreshMusicBoardForGuild(guild, options = {}) {
  if (musicBoardRefreshes.has(guild.id)) {
    return musicBoardRefreshes.get(guild.id);
  }

  const refreshPromise = (async () => {
    const settings = getMusicBoardSettings(guild.id);
    const channelId = settings.channelId;

    if (!channelId) {
      return false;
    }

    const channel = guild.channels.cache.get(channelId) || await guild.channels.fetch(channelId).catch(() => null);

    if (!channel?.isTextBased?.() || !channel.messages) {
      return false;
    }

    let boardMessage = null;

    if (settings.messageId) {
      boardMessage = await channel.messages.fetch(settings.messageId).catch(() => null);
    }

    const entries = await buildMusicBoardEntries(guild);
    const payload = {
      embeds: [buildMusicBoardEmbed(guild, entries)]
    };

    if (boardMessage) {
      await boardMessage.edit(payload).catch(() => null);
    } else {
      boardMessage = await channel.send(payload).catch(() => null);
    }

    if (!boardMessage) {
      return false;
    }

    updateMusicBoardState(guild.id, {
      messageId: boardMessage.id
    });

    return true;
  })().finally(() => {
    musicBoardRefreshes.delete(guild.id);
  });

  musicBoardRefreshes.set(guild.id, refreshPromise);
  return refreshPromise;
}

async function refreshAllMusicBoards(client) {
  const guilds = [...client.guilds.cache.values()];

  await Promise.allSettled(guilds.map(async (guild) => {
    try {
      await refreshMusicBoardForGuild(guild);
    } catch (error) {
      console.error(`Failed to refresh music board for guild ${guild.id}:`, error);
    }
  }));
}

async function handleMusicBoardVoiceState(oldState, newState) {
  const guild = newState.guild || oldState.guild;

  if (!guild) {
    return false;
  }

  const trackedIds = getTrackedMusicBotIds();
  const userId = newState.id || oldState.id;

  if (!trackedIds.has(userId)) {
    return false;
  }

  await refreshMusicBoardForGuild(guild).catch(() => null);
  return true;
}

module.exports = {
  getMusicBoardSettings,
  handleMusicBoardVoiceState,
  refreshAllMusicBoards,
  refreshMusicBoardForGuild,
  setMusicBoardChannel
};
