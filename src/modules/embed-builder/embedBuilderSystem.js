const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  EmbedBuilder
} = require("discord.js");

const MAX_EMBEDS = 10;
const MAX_FIELDS = 25;
const MAX_BUTTONS = 5;
const CHANNEL_CACHE_TTL_MS = 60 * 1000;
const CHANNEL_FETCH_CONCURRENCY = 4;

function sanitizeString(value, maxLength = 2000) {
  return String(value || "").trim().slice(0, maxLength);
}

function sanitizeSnowflake(value) {
  const raw = sanitizeString(value, 32);
  return /^\d{15,25}$/.test(raw) ? raw : "";
}

function sanitizeIsoDate(value) {
  const raw = String(value || "").trim();

  if (!raw) {
    return "";
  }

  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? "" : parsed.toISOString();
}

function normalizeEmbedTimestamp(rawEmbed = {}) {
  const mode = String(rawEmbed.timestampMode || "").trim().toLowerCase();
  const value = sanitizeIsoDate(rawEmbed.timestampValue ?? rawEmbed.timestamp);

  if (mode === "custom" && value) {
    return {
      timestampMode: "custom",
      timestampValue: value
    };
  }

  if (mode === "now") {
    return {
      timestampMode: "now",
      timestampValue: ""
    };
  }

  if (typeof rawEmbed.timestamp === "string" && value) {
    return {
      timestampMode: "custom",
      timestampValue: value
    };
  }

  if (rawEmbed.timestamp === true) {
    return {
      timestampMode: "now",
      timestampValue: ""
    };
  }

  return {
    timestampMode: "off",
    timestampValue: ""
  };
}

function isValidHttpUrl(value) {
  if (!value) {
    return false;
  }

  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function normalizeField(field) {
  return {
    name: sanitizeString(field?.name, 256),
    value: sanitizeString(field?.value, 1024),
    inline: Boolean(field?.inline)
  };
}

function normalizeButton(button) {
  return {
    label: sanitizeString(button?.label, 80),
    url: sanitizeString(button?.url, 1000)
  };
}

function normalizeSingleEmbed(rawEmbed = {}) {
  const fields = Array.isArray(rawEmbed.fields)
    ? rawEmbed.fields
      .map(normalizeField)
      .filter((field) => field.name && field.value)
      .slice(0, MAX_FIELDS)
    : [];
  const timestamp = normalizeEmbedTimestamp(rawEmbed);

  return {
    title: sanitizeString(rawEmbed.title, 256),
    description: sanitizeString(rawEmbed.description, 4000),
    color: sanitizeString(rawEmbed.color, 16) || "#111214",
    authorName: sanitizeString(rawEmbed.authorName, 256),
    authorIconUrl: sanitizeString(rawEmbed.authorIconUrl, 1000),
    authorUrl: sanitizeString(rawEmbed.authorUrl, 1000),
    thumbnailUrl: sanitizeString(rawEmbed.thumbnailUrl, 1000),
    imageUrl: sanitizeString(rawEmbed.imageUrl, 1000),
    footerText: sanitizeString(rawEmbed.footerText, 2048),
    footerIconUrl: sanitizeString(rawEmbed.footerIconUrl, 1000),
    timestampMode: timestamp.timestampMode,
    timestampValue: timestamp.timestampValue,
    fields
  };
}

function buildEmbedsArray(rawPayload = {}) {
  const candidateEmbeds = Array.isArray(rawPayload.embeds)
    ? rawPayload.embeds
    : rawPayload.embed
      ? [rawPayload.embed]
      : [];

  if (!candidateEmbeds.length) {
    return [normalizeSingleEmbed()];
  }

  const normalizedEmbeds = candidateEmbeds
    .map(normalizeSingleEmbed)
    .slice(0, MAX_EMBEDS);

  return normalizedEmbeds.length ? normalizedEmbeds : [normalizeSingleEmbed()];
}

function normalizeBuilderPayload(rawPayload = {}) {
  const buttons = Array.isArray(rawPayload?.buttons)
    ? rawPayload.buttons
      .map(normalizeButton)
      .filter((button) => button.label && isValidHttpUrl(button.url))
      .slice(0, MAX_BUTTONS)
    : [];

  const embeds = buildEmbedsArray(rawPayload);
  const targetMode = rawPayload.targetMode === "edit" ? "edit" : "send";
  const targetMessageId = sanitizeSnowflake(rawPayload.targetMessageId ?? rawPayload.messageId);

  return {
    channelId: sanitizeString(rawPayload.channelId, 32),
    threadName: sanitizeString(rawPayload.threadName || rawPayload.postTitle, 100),
    messageContent: sanitizeString(rawPayload.messageContent ?? rawPayload.content, 2000),
    targetMode,
    targetMessageId,
    embeds,
    buttons
  };
}

function hasEmbedContent(embedPayload) {
  return Boolean(
    embedPayload.title
    || embedPayload.description
    || embedPayload.authorName
    || embedPayload.footerText
    || embedPayload.thumbnailUrl
    || embedPayload.imageUrl
    || embedPayload.fields.length
    || embedPayload.timestampMode === "now"
    || embedPayload.timestampMode === "custom"
  );
}

function buildEmbedFromPayload(embedPayload) {
  const embed = new EmbedBuilder();
  const color = embedPayload.color;

  if (/^#?[0-9a-f]{6}$/i.test(color)) {
    embed.setColor(color.startsWith("#") ? color : `#${color}`);
  }

  if (embedPayload.title) {
    embed.setTitle(embedPayload.title);
  }

  if (embedPayload.description) {
    embed.setDescription(embedPayload.description);
  }

  if (embedPayload.authorName) {
    const author = {
      name: embedPayload.authorName
    };

    if (isValidHttpUrl(embedPayload.authorIconUrl)) {
      author.iconURL = embedPayload.authorIconUrl;
    }

    if (isValidHttpUrl(embedPayload.authorUrl)) {
      author.url = embedPayload.authorUrl;
    }

    embed.setAuthor(author);
  }

  if (embedPayload.footerText) {
    const footer = {
      text: embedPayload.footerText
    };

    if (isValidHttpUrl(embedPayload.footerIconUrl)) {
      footer.iconURL = embedPayload.footerIconUrl;
    }

    embed.setFooter(footer);
  }

  if (isValidHttpUrl(embedPayload.thumbnailUrl)) {
    embed.setThumbnail(embedPayload.thumbnailUrl);
  }

  if (isValidHttpUrl(embedPayload.imageUrl)) {
    embed.setImage(embedPayload.imageUrl);
  }

  if (embedPayload.fields.length) {
    embed.addFields(embedPayload.fields);
  }

  if (embedPayload.timestampMode === "custom" && embedPayload.timestampValue) {
    const timestampDate = new Date(embedPayload.timestampValue);
    if (!Number.isNaN(timestampDate.getTime())) {
      embed.setTimestamp(timestampDate);
    }
  } else if (embedPayload.timestampMode === "now") {
    embed.setTimestamp();
  }

  return embed;
}

function extractLinkButtonsFromComponents(components = []) {
  if (!Array.isArray(components)) {
    return [];
  }

  return components
    .flatMap((row) => Array.isArray(row?.components) ? row.components : [])
    .filter((component) => Number(component?.type) === 2 && Number(component?.style) === 5 && isValidHttpUrl(component?.url))
    .map((component) => ({
      label: sanitizeString(component.label || "Open Link", 80),
      url: sanitizeString(component.url, 1000)
    }))
    .slice(0, MAX_BUTTONS);
}

function buildButtonRows(buttons) {
  if (!buttons.length) {
    return [];
  }

  return [
    new ActionRowBuilder().addComponents(
      ...buttons.map((button) => new ButtonBuilder()
        .setLabel(button.label)
        .setStyle(ButtonStyle.Link)
        .setURL(button.url))
    )
  ];
}

function buildDiscordPayload(rawPayload) {
  const payload = normalizeBuilderPayload(rawPayload);
  const discordPayload = {};
  const builtEmbeds = payload.embeds
    .filter(hasEmbedContent)
    .map(buildEmbedFromPayload);

  if (payload.messageContent) {
    discordPayload.content = payload.messageContent;
  }

  if (builtEmbeds.length) {
    discordPayload.embeds = builtEmbeds;
  }

  if (payload.buttons.length) {
    discordPayload.components = buildButtonRows(payload.buttons);
  }

  if (!discordPayload.content && !discordPayload.embeds?.length) {
    throw new Error("Isi pesan kosong. Tambahkan content atau isi embed terlebih dulu.");
  }

  return {
    normalized: payload,
    discordPayload
  };
}

async function mapWithConcurrency(items, limit, mapper) {
  const results = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      results[currentIndex] = await mapper(items[currentIndex], currentIndex);
    }
  }

  const workerCount = Math.max(1, Math.min(limit, items.length));
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
}

async function getClientGuilds(client) {
  if (client.guilds.cache.size) {
    return [...client.guilds.cache.values()];
  }

  const fetchedGuilds = await client.guilds.fetch().catch(() => null);

  if (!fetchedGuilds?.size) {
    return [];
  }

  const resolvedGuilds = await Promise.all(
    [...fetchedGuilds.keys()].map((guildId) => client.guilds.fetch(guildId).catch(() => null))
  );

  return resolvedGuilds.filter(Boolean);
}

async function getGuildSelfMember(guild) {
  if (guild.members.me) {
    return guild.members.me;
  }

  if (!guild.client.user?.id) {
    return null;
  }

  if (typeof guild.members.fetchMe === "function") {
    return guild.members.fetchMe().catch(() => null);
  }

  return guild.members.fetch(guild.client.user.id).catch(() => null);
}

async function listGuildTextChannels(guild) {
  const selfMember = await getGuildSelfMember(guild);

  if (!selfMember) {
    return null;
  }

  const channelCollection = guild.channels.cache.size
    ? guild.channels.cache
    : await guild.channels.fetch().catch(() => null);

  if (!channelCollection) {
    return null;
  }

  const textChannels = [...channelCollection.values()]
    .filter((channel) => channel
      && !channel.isThread?.()
      && (channel.type === ChannelType.GuildText || channel.type === ChannelType.GuildAnnouncement)
      && channel.permissionsFor(selfMember)?.has(["ViewChannel", "SendMessages"]))
    .sort((left, right) => left.position - right.position);

  const forumChannels = [...channelCollection.values()]
    .filter((channel) => channel
      && channel.type === ChannelType.GuildForum
      && channel.permissionsFor(selfMember)?.has(["ViewChannel", "SendMessages"]))
    .sort((left, right) => left.position - right.position);

  const activeThreadsData = await guild.channels.fetchActiveThreads().catch(() => null);
  const activeThreads = activeThreadsData?.threads
    ? [...activeThreadsData.threads.values()]
        .filter((thread) => thread
          && thread.permissionsFor(selfMember)?.has(["ViewChannel", "SendMessages"]))
        .sort((left, right) => (right.createdTimestamp || 0) - (left.createdTimestamp || 0))
    : [];

  const combinedChannels = [
    ...textChannels.map((channel) => ({
      id: channel.id,
      name: channel.name,
      type: channel.type,
      category: "text"
    })),
    ...forumChannels.map((channel) => ({
      id: channel.id,
      name: channel.name,
      type: channel.type,
      category: "forum",
      isForum: true
    })),
    ...activeThreads.map((thread) => ({
      id: thread.id,
      name: `${thread.parent?.name ? `${thread.parent.name} › ` : ""}${thread.name}`,
      type: thread.type,
      category: "thread",
      isThread: true
    }))
  ];

  if (!combinedChannels.length) {
    return null;
  }

  return {
    guildId: guild.id,
    guildName: guild.name,
    channels: combinedChannels
  };
}

async function listAvailableTextChannels(client, options = {}) {
  if (!client?.isReady?.()) {
    return [];
  }

  const forceRefresh = Boolean(options.forceRefresh);
  const cached = client.embedBuilderChannelCache;

  if (!forceRefresh && cached?.value && Date.now() - cached.fetchedAt < CHANNEL_CACHE_TTL_MS) {
    return cached.value;
  }

  if (!forceRefresh && cached?.pending) {
    return cached.pending;
  }

  let pendingPromise = null;

  pendingPromise = (async () => {
    const guilds = await getClientGuilds(client);
    const entries = await mapWithConcurrency(guilds, CHANNEL_FETCH_CONCURRENCY, (guild) => listGuildTextChannels(guild));
    const value = entries
      .filter(Boolean)
      .sort((left, right) => left.guildName.localeCompare(right.guildName));

    client.embedBuilderChannelCache = {
      value,
      fetchedAt: Date.now(),
      pending: null
    };

    return value;
  })().catch((error) => {
    if (cached?.value) {
      return cached.value;
    }

    throw error;
  }).finally(() => {
    if (client.embedBuilderChannelCache?.pending === pendingPromise) {
      client.embedBuilderChannelCache.pending = null;
    }
  });

  client.embedBuilderChannelCache = {
    value: cached?.value || [],
    fetchedAt: cached?.fetchedAt || 0,
    pending: pendingPromise
  };

  return pendingPromise;
}

async function resolveTargetChannel(client, channelId) {
  const resolvedId = sanitizeSnowflake(channelId);

  if (!resolvedId) {
    throw new Error("Channel tujuan belum dipilih.");
  }

  const channel = client.channels.cache.get(resolvedId)
    || await client.channels.fetch(resolvedId).catch(() => null);

  if (!channel?.isTextBased?.() && channel?.type !== ChannelType.GuildForum) {
    throw new Error("Channel tujuan tidak valid atau bot tidak bisa mengaksesnya.");
  }

  return channel;
}

function mapMessageEmbedsToBuilderPayload(message) {
  return message.embeds
    .slice(0, MAX_EMBEDS)
    .map((embed) => normalizeSingleEmbed({
      title: embed.title,
      description: embed.description,
      color: typeof embed.color === "number" ? `#${embed.color.toString(16).padStart(6, "0")}` : "",
      authorName: embed.author?.name,
      authorIconUrl: embed.author?.iconURL,
      authorUrl: embed.author?.url,
      thumbnailUrl: embed.thumbnail?.url,
      imageUrl: embed.image?.url,
      footerText: embed.footer?.text,
      footerIconUrl: embed.footer?.iconURL,
      timestamp: embed.timestamp || false,
      fields: embed.fields || []
    }));
}

async function fetchBuilderMessage(client, rawPayload) {
  if (!client?.isReady?.()) {
    throw new Error("Bot belum siap. Coba lagi beberapa saat.");
  }

  const normalized = normalizeBuilderPayload(rawPayload);

  if (!normalized.targetMessageId) {
    throw new Error("Message ID atau link target belum valid.");
  }

  const channel = await resolveTargetChannel(client, normalized.channelId);

  if (!channel.messages?.fetch) {
    throw new Error("Channel tujuan tidak mendukung fetch message.");
  }

  const message = await channel.messages.fetch(normalized.targetMessageId).catch(() => null);

  if (!message) {
    throw new Error("Message target tidak ditemukan di channel tersebut.");
  }

  return {
    ok: true,
    messageId: message.id,
    channelId: channel.id,
    guildId: channel.guild?.id || "",
    jumpUrl: message.url,
    authorId: message.author?.id || "",
    payload: {
      channelId: channel.id,
      messageContent: sanitizeString(message.content, 2000),
      targetMode: "edit",
      targetMessageId: message.id,
      embeds: message.embeds.length ? mapMessageEmbedsToBuilderPayload(message) : [normalizeSingleEmbed()],
      buttons: extractLinkButtonsFromComponents(message.components)
    }
  };
}

async function sendBuilderMessage(client, rawPayload) {
  if (!client?.isReady?.()) {
    throw new Error("Bot belum siap. Coba lagi beberapa saat.");
  }

  const { normalized, discordPayload } = buildDiscordPayload(rawPayload);

  if (!normalized.channelId) {
    throw new Error("Channel tujuan belum dipilih.");
  }

  const channel = await resolveTargetChannel(client, normalized.channelId);

  if (channel.type !== ChannelType.GuildForum && !channel.send) {
    throw new Error("Channel tujuan tidak valid atau bot tidak bisa mengirim ke sana.");
  }

  if (normalized.targetMode === "edit") {
    if (channel.type === ChannelType.GuildForum) {
      throw new Error("Untuk mengedit postingan di Forum, silakan pilih postingan/thread tujuan dari daftar channel.");
    }

    if (!normalized.targetMessageId) {
      throw new Error("Mode edit butuh message ID atau message link yang valid.");
    }

    if (!channel.messages?.fetch) {
      throw new Error("Channel tujuan tidak mendukung edit message.");
    }

    const targetMessage = await channel.messages.fetch(normalized.targetMessageId).catch(() => null);

    if (!targetMessage) {
      throw new Error("Message target tidak ditemukan di channel yang dipilih.");
    }

    if (targetMessage.author?.id !== client.user?.id) {
      throw new Error("Bot hanya bisa mengedit pesan yang dikirim oleh bot ini sendiri.");
    }

    const editPayload = {
      content: discordPayload.content ?? "",
      embeds: discordPayload.embeds ?? [],
      components: discordPayload.components ?? []
    };
    const editedMessage = await targetMessage.edit(editPayload);

    return {
      ok: true,
      action: "edit",
      messageId: editedMessage.id,
      channelId: channel.id,
      guildId: channel.guild?.id || "",
      jumpUrl: editedMessage.url,
      normalized
    };
  }

  if (channel.type === ChannelType.GuildForum) {
    const postTitle = sanitizeString(
      normalized.threadName
      || normalized.embeds[0]?.title
      || normalized.messageContent?.slice(0, 80)
      || "Postingan Baru",
      100
    );

    const thread = await channel.threads.create({
      name: postTitle,
      message: discordPayload
    });

    return {
      ok: true,
      action: "forum_post",
      messageId: thread.lastMessageId || thread.id,
      channelId: thread.id,
      guildId: channel.guild?.id || "",
      jumpUrl: thread.url,
      normalized
    };
  }

  const sentMessage = await channel.send(discordPayload);

  return {
    ok: true,
    action: "send",
    messageId: sentMessage.id,
    channelId: channel.id,
    guildId: channel.guild?.id || "",
    jumpUrl: sentMessage.url,
    normalized
  };
}

module.exports = {
  MAX_BUTTONS,
  MAX_EMBEDS,
  MAX_FIELDS,
  buildDiscordPayload,
  fetchBuilderMessage,
  listAvailableTextChannels,
  normalizeBuilderPayload,
  sendBuilderMessage
};
