const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  ModalBuilder,
  PermissionFlagsBits,
  TextInputBuilder,
  TextInputStyle
} = require("discord.js");
const { createIdCardCard } = require("./idCardCard");
const { upsertIdCard } = require("../../services/idCardStore");
const { getGuildSettings, updateGuildSettings } = require("../../services/guildConfigService");

const ID_CARD_CREATE_BUTTON_ID = "idcard:create";
const ID_CARD_MODAL_ID = "idcard:modal";
const ID_CARD_REWARD_ROLE_ID = "1482710348380373123";
const ID_CARD_BIO_MAX_LENGTH = 200;
const ID_CARD_BIO_MAX_WORDS = 28;
const DEFAULT_ID_CARD_PANEL_SETTINGS = {
  channelId: "",
  messageId: "",
  lastBumpAt: "",
  cooldownSeconds: 30
};
const idCardPanelRefreshLocks = new Map();

function getIdCardPanelSettings(guildId) {
  const settings = getGuildSettings(guildId, {
    idCardPanel: DEFAULT_ID_CARD_PANEL_SETTINGS
  }).idCardPanel;

  return {
    ...DEFAULT_ID_CARD_PANEL_SETTINGS,
    ...(settings || {})
  };
}

function updateIdCardPanelSettings(guildId, updater) {
  return updateGuildSettings(guildId, (current) => {
    const nextSettings = updater({
      ...DEFAULT_ID_CARD_PANEL_SETTINGS,
      ...(current.idCardPanel || {})
    });

    return {
      ...current,
      idCardPanel: {
        ...DEFAULT_ID_CARD_PANEL_SETTINGS,
        ...(nextSettings || {})
      }
    };
  });
}

function clampPanelCooldown(value) {
  const parsed = Number.parseInt(String(value || DEFAULT_ID_CARD_PANEL_SETTINGS.cooldownSeconds), 10);

  if (!Number.isInteger(parsed)) {
    return DEFAULT_ID_CARD_PANEL_SETTINGS.cooldownSeconds;
  }

  return Math.max(10, Math.min(300, parsed));
}

function buildIdCardButtonRow() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(ID_CARD_CREATE_BUTTON_ID)
        .setLabel("Buat ID Card")
        .setStyle(ButtonStyle.Secondary)
    )
  ];
}

function buildPanelEmbed(guild) {
  return new EmbedBuilder()
    .setColor("#111214")
    .setTitle("Murphy ID Card")
    .setDescription([
      `Silakan ambil ID card untuk mendapatkan role <@&${ID_CARD_REWARD_ROLE_ID}>.`,
      "Klik tombol di bawah untuk membuat ID card kamu.",
      "Setiap user hanya bisa punya `1 ID card`.",
      "Data yang akan diisi: `Nama`, `Umur`, `Asal Kota`, dan `Bio`."
    ].join("\n"))
    .setFooter({
      text: `${guild.name} • Murphy`
    })
    .setTimestamp();
}

function buildIdCardModal() {
  const modal = new ModalBuilder()
    .setCustomId(ID_CARD_MODAL_ID)
    .setTitle("Buat ID Card");

  const nameInput = new TextInputBuilder()
    .setCustomId("name")
    .setLabel("Nama")
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(32);

  const ageInput = new TextInputBuilder()
    .setCustomId("age")
    .setLabel("Umur")
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(24);

  const cityInput = new TextInputBuilder()
    .setCustomId("city")
    .setLabel("Asal Kota")
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(32);

  const bioInput = new TextInputBuilder()
    .setCustomId("bio")
    .setLabel("Bio")
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(true)
    .setMaxLength(ID_CARD_BIO_MAX_LENGTH);

  modal.addComponents(
    new ActionRowBuilder().addComponents(nameInput),
    new ActionRowBuilder().addComponents(ageInput),
    new ActionRowBuilder().addComponents(cityInput),
    new ActionRowBuilder().addComponents(bioInput)
  );

  return modal;
}

function sanitizeValue(value, fallback) {
  const trimmed = String(value || "").trim();
  return trimmed || fallback;
}

function countWords(value) {
  return String(value || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .length;
}

function hasIdCardLimit(member) {
  if (!member) {
    return false;
  }

  return member.roles.cache.has(ID_CARD_REWARD_ROLE_ID);
}

async function grantIdCardRole(member) {
  const role = member.guild.roles.cache.get(ID_CARD_REWARD_ROLE_ID)
    || await member.guild.roles.fetch(ID_CARD_REWARD_ROLE_ID).catch(() => null);

  if (!role || member.roles.cache.has(role.id)) {
    return role || null;
  }

  const botMember = member.guild.members.me
    || await member.guild.members.fetchMe().catch(() => null);

  if (!botMember || role.position >= botMember.roles.highest.position) {
    console.warn("Failed to grant ID card role: role missing or above bot role.");
    return null;
  }

  await member.roles.add(role, "User completed ID card setup").catch((error) => {
    console.error("Failed to grant ID card role:", error);
  });

  return role;
}

async function refreshIdCardPanelMessage(client, guildId, channelId, options = {}) {
  if (!guildId || !channelId) {
    return {
      ok: false,
      reason: "Channel panel ID card tidak valid."
    };
  }

  const key = `${guildId}:${channelId}`;

  if (idCardPanelRefreshLocks.has(key)) {
    return idCardPanelRefreshLocks.get(key);
  }

  const task = (async () => {
    const settings = getIdCardPanelSettings(guildId);
    const cooldownMs = clampPanelCooldown(settings.cooldownSeconds) * 1000;
    const lastBumpAt = Number.parseInt(String(settings.lastBumpAt || "0"), 10) || 0;

    if (!options.force && lastBumpAt && (Date.now() - lastBumpAt) < cooldownMs) {
      return {
        ok: true,
        skipped: true
      };
    }

    const guild = client.guilds.cache.get(guildId)
      || await client.guilds.fetch(guildId).catch(() => null);

    if (!guild) {
      return {
        ok: false,
        reason: "Guild ID card tidak ditemukan."
      };
    }

    const channel = guild.channels.cache.get(channelId)
      || await guild.channels.fetch(channelId).catch(() => null);

    if (!channel || !channel.isTextBased()) {
      return {
        ok: false,
        reason: "Channel panel ID card tidak ditemukan."
      };
    }

    if (settings.messageId) {
      const oldMessage = await channel.messages.fetch(settings.messageId).catch(() => null);

      if (oldMessage) {
        await oldMessage.delete().catch(() => null);
      }
    }

    const sent = await channel.send({
      embeds: [buildPanelEmbed(guild)],
      components: buildIdCardButtonRow()
    }).catch((error) => {
      throw new Error(error.message || "Gagal mengirim panel ID card.");
    });

    updateIdCardPanelSettings(guildId, (current) => ({
      ...current,
      channelId,
      messageId: sent.id,
      lastBumpAt: String(Date.now())
    }));

    return {
      ok: true,
      message: sent
    };
  })().finally(() => {
    idCardPanelRefreshLocks.delete(key);
  });

  idCardPanelRefreshLocks.set(key, task);
  return task;
}

async function sendIdCardPanel(interaction) {
  const channel = interaction.options.getChannel("channel") || interaction.channel;
  const cooldownSeconds = clampPanelCooldown(interaction.options.getInteger("cooldown_seconds"));

  if (!channel || !channel.isTextBased()) {
    await interaction.reply({
      content: "Channel target harus berupa text channel yang bisa mengirim pesan.",
      ephemeral: true
    });
    return;
  }

  updateIdCardPanelSettings(interaction.guildId, (current) => ({
    ...current,
    channelId: channel.id,
    messageId: "",
    lastBumpAt: "0",
    cooldownSeconds
  }));

  const result = await refreshIdCardPanelMessage(interaction.client, interaction.guildId, channel.id, { force: true });

  if (!result.ok) {
    await interaction.reply({
      content: result.reason || "Gagal mengirim panel ID card.",
      ephemeral: true
    });
    return;
  }

  await interaction.reply({
    content: `Panel ID card sticky berhasil dikirim ke ${channel} dengan cooldown \`${cooldownSeconds}s\`.`,
    ephemeral: true
  });
}

async function handleIdCardButton(interaction) {
  if (interaction.customId !== ID_CARD_CREATE_BUTTON_ID) {
    return false;
  }

  if (!interaction.inGuild()) {
    await interaction.reply({
      content: "ID card hanya bisa dibuat di server.",
      ephemeral: true
    }).catch(() => null);
    return true;
  }

  const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);

  if (!member) {
    await interaction.reply({
      content: "Data member tidak ditemukan.",
      ephemeral: true
    }).catch(() => null);
    return true;
  }

  if (hasIdCardLimit(member)) {
    await interaction.reply({
      content: "Kamu sudah punya ID card. Satu user hanya bisa punya satu ID card.",
      ephemeral: true
    }).catch(() => null);
    return true;
  }

  await interaction.showModal(buildIdCardModal());
  return true;
}

async function handleIdCardModalSubmit(interaction) {
  if (interaction.customId !== ID_CARD_MODAL_ID) {
    return false;
  }

  if (!interaction.inGuild()) {
    await interaction.reply({
      content: "ID card hanya bisa dibuat di server.",
      ephemeral: true
    }).catch(() => null);
    return true;
  }

  const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);

  if (!member) {
    await interaction.reply({
      content: "Data member tidak ditemukan.",
      ephemeral: true
    }).catch(() => null);
    return true;
  }

  if (hasIdCardLimit(member)) {
    await interaction.reply({
      content: "Kamu sudah punya ID card. Satu user hanya bisa punya satu ID card.",
      ephemeral: true
    }).catch(() => null);
    return true;
  }

  const payload = {
    name: sanitizeValue(interaction.fields.getTextInputValue("name"), member.displayName || interaction.user.username),
    age: sanitizeValue(interaction.fields.getTextInputValue("age"), "-"),
    city: sanitizeValue(interaction.fields.getTextInputValue("city"), "-"),
    bio: sanitizeValue(interaction.fields.getTextInputValue("bio"), "-"),
    updatedAt: new Date().toISOString()
  };

  if (payload.bio.length > ID_CARD_BIO_MAX_LENGTH || countWords(payload.bio) > ID_CARD_BIO_MAX_WORDS) {
    await interaction.reply({
      content: `Bio terlalu panjang. Maksimal ${ID_CARD_BIO_MAX_WORDS} kata dan ${ID_CARD_BIO_MAX_LENGTH} karakter.`,
      ephemeral: true
    }).catch(() => null);
    return true;
  }

  await interaction.deferReply().catch(() => null);

  const card = await createIdCardCard({
    ...payload,
    avatarUrl: interaction.user.displayAvatarURL({
      extension: "png",
      forceStatic: true,
      size: 512
    }),
    fileName: `id-card-${interaction.user.id}.png`
  }).catch((error) => {
    console.error("Failed to render ID card:", error);
    return null;
  });

  if (!card) {
    await interaction.editReply({
      content: "Gagal membuat ID card."
    }).catch(() => null);
    return true;
  }

  upsertIdCard(interaction.guildId, interaction.user.id, payload);
  const grantedRole = await grantIdCardRole(member);
  const content = grantedRole
    ? `${interaction.user} berhasil membuat ID card dan mendapatkan role ${grantedRole}.`
    : `${interaction.user} berhasil membuat ID card.`;

  await interaction.editReply({
    content,
    files: [card],
    components: buildIdCardButtonRow()
  }).catch(() => null);

  return true;
}

async function handleIdCardPanelMessage(message, client) {
  if (!message.guild) {
    return false;
  }

  const settings = getIdCardPanelSettings(message.guild.id);

  if (!settings.channelId || settings.channelId !== message.channel.id) {
    return false;
  }

  const key = `${message.guild.id}:${message.channel.id}`;

  if (message.author?.id === client.user?.id) {
    if (settings.messageId && message.id === settings.messageId) {
      return false;
    }

    if (idCardPanelRefreshLocks.has(key)) {
      return false;
    }
  }

  const result = await refreshIdCardPanelMessage(client, message.guild.id, message.channel.id, { force: false });
  return Boolean(result.ok && !result.skipped);
}

function hasIdCardPanelPermission(member) {
  return member.permissions.has(PermissionFlagsBits.ManageGuild)
    || member.permissions.has(PermissionFlagsBits.ManageMessages);
}

module.exports = {
  ID_CARD_CREATE_BUTTON_ID,
  ID_CARD_MODAL_ID,
  buildIdCardButtonRow,
  buildIdCardModal,
  handleIdCardButton,
  handleIdCardPanelMessage,
  handleIdCardModalSubmit,
  hasIdCardPanelPermission,
  refreshIdCardPanelMessage,
  sendIdCardPanel
};
