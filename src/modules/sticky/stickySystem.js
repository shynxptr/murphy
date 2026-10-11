const {
  ActionRowBuilder,
  ChannelType,
  EmbedBuilder,
  ModalBuilder,
  PermissionFlagsBits,
  SlashCommandBuilder,
  TextInputBuilder,
  TextInputStyle
} = require("discord.js");
const {
  deleteSticky,
  getSticky,
  listStickies,
  upsertSticky
} = require("../../services/stickyStore");

const DEFAULT_STICKY_TITLE = "Murphy Sticky Note";
const DEFAULT_COOLDOWN_SECONDS = 20;
const MIN_COOLDOWN_SECONDS = 5;
const MAX_COOLDOWN_SECONDS = 300;
const STICKY_MODAL_PREFIX = "sticky:modal:";
const refreshLocks = new Map();

function clampCooldown(value) {
  const parsed = Number.parseInt(String(value || DEFAULT_COOLDOWN_SECONDS), 10);

  if (!Number.isInteger(parsed)) {
    return DEFAULT_COOLDOWN_SECONDS;
  }

  return Math.max(MIN_COOLDOWN_SECONDS, Math.min(MAX_COOLDOWN_SECONDS, parsed));
}

function hasStickyPermission(member) {
  return member.permissions.has(PermissionFlagsBits.ManageMessages)
    || member.permissions.has(PermissionFlagsBits.ManageGuild);
}

function buildStickyEmbed(guild, sticky) {
  const iconURL = guild.iconURL({
    extension: "png",
    forceStatic: true,
    size: 128
  });

  return new EmbedBuilder()
    .setColor("#111214")
    .setAuthor({
      name: "Murphy Sticky",
      iconURL: iconURL || undefined
    })
    .setTitle(sticky.title || DEFAULT_STICKY_TITLE)
    .setDescription(sticky.content)
    .setFooter({
      text: `Auto refresh • Cooldown ${sticky.cooldownSeconds}s`
    })
    .setTimestamp();
}

function buildSuccessEmbed(title, description) {
  return new EmbedBuilder()
    .setColor("#111214")
    .setTitle(title)
    .setDescription(description)
    .setTimestamp();
}

function buildErrorEmbed(description) {
  return new EmbedBuilder()
    .setColor("#ef4444")
    .setTitle("Sticky Error")
    .setDescription(description)
    .setTimestamp();
}

function buildStickyListEmbed(guild, entries) {
  const embed = new EmbedBuilder()
    .setColor("#111214")
    .setTitle("Sticky Notes")
    .setFooter({
      text: `${guild.name} • Murphy Sticky`
    })
    .setTimestamp();

  if (!entries.length) {
    embed.setDescription("Belum ada sticky note aktif di server ini.");
    return embed;
  }

  embed.setDescription(entries.map((entry) => (
    [
      `**<#${entry.channelId}>**`,
      `Title: ${entry.title || DEFAULT_STICKY_TITLE}`,
      `Cooldown: \`${entry.cooldownSeconds}s\``,
      `Message: ${entry.messageId ? "aktif" : "belum terkirim"}`
    ].join("\n")
  )).join("\n\n"));

  return embed;
}

function buildStickyModal(customId, existing = null) {
  const modal = new ModalBuilder()
    .setCustomId(customId)
    .setTitle(existing ? "Edit Sticky Note" : "Buat Sticky Note");

  const titleInput = new TextInputBuilder()
    .setCustomId("title")
    .setLabel("Judul Sticky")
    .setStyle(TextInputStyle.Short)
    .setRequired(false)
    .setMaxLength(100)
    .setValue(existing?.title || "");

  const contentInput = new TextInputBuilder()
    .setCustomId("content")
    .setLabel("Isi Sticky")
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(true)
    .setMaxLength(1800)
    .setValue(existing?.content || "");

  modal.addComponents(
    new ActionRowBuilder().addComponents(titleInput),
    new ActionRowBuilder().addComponents(contentInput)
  );

  return modal;
}

function makeModalId(mode, channelId, cooldownSeconds) {
  return `${STICKY_MODAL_PREFIX}${mode}:${channelId}:${clampCooldown(cooldownSeconds)}`;
}

function parseModalId(customId) {
  if (!customId.startsWith(STICKY_MODAL_PREFIX)) {
    return null;
  }

  const raw = customId.slice(STICKY_MODAL_PREFIX.length).split(":");

  if (raw.length < 3) {
    return null;
  }

  return {
    mode: raw[0],
    channelId: raw[1],
    cooldownSeconds: clampCooldown(raw[2])
  };
}

async function deleteStickyMessage(client, sticky) {
  if (!sticky?.channelId || !sticky?.messageId) {
    return;
  }

  const channel = await client.channels.fetch(sticky.channelId).catch(() => null);

  if (!channel || !channel.isTextBased()) {
    return;
  }

  const existingMessage = await channel.messages.fetch(sticky.messageId).catch(() => null);

  if (existingMessage) {
    await existingMessage.delete().catch(() => null);
  }
}

async function refreshStickyMessage(client, sticky, options = {}) {
  if (!sticky?.guildId || !sticky?.channelId) {
    return {
      ok: false,
      reason: "Sticky tidak valid."
    };
  }

  const key = `${sticky.guildId}:${sticky.channelId}`;

  if (refreshLocks.has(key)) {
    return refreshLocks.get(key);
  }

  const task = (async () => {
    const latest = getSticky(sticky.guildId, sticky.channelId) || sticky;
    const now = Date.now();
    const lastBumpAt = Number.parseInt(String(latest.lastBumpAt || "0"), 10) || 0;
    const cooldownMs = clampCooldown(latest.cooldownSeconds) * 1000;

    if (!options.force && lastBumpAt && (now - lastBumpAt) < cooldownMs) {
      return {
        ok: true,
        skipped: true,
        sticky: latest
      };
    }

    const guild = client.guilds.cache.get(latest.guildId)
      || await client.guilds.fetch(latest.guildId).catch(() => null);

    if (!guild) {
      return {
        ok: false,
        reason: "Guild sticky tidak ditemukan."
      };
    }

    const channel = guild.channels.cache.get(latest.channelId)
      || await guild.channels.fetch(latest.channelId).catch(() => null);

    if (!channel || !channel.isTextBased()) {
      return {
        ok: false,
        reason: "Channel sticky tidak ditemukan."
      };
    }

    if (latest.messageId) {
      const oldMessage = await channel.messages.fetch(latest.messageId).catch(() => null);

      if (oldMessage) {
        await oldMessage.delete().catch(() => null);
      }
    }

    const sent = await channel.send({
      embeds: [buildStickyEmbed(guild, latest)]
    }).catch((error) => {
      throw new Error(error.message || "Gagal mengirim sticky message.");
    });

    const updated = upsertSticky(latest.guildId, latest.channelId, {
      ...latest,
      messageId: sent.id,
      lastBumpAt: String(Date.now())
    });

    return {
      ok: true,
      sticky: updated,
      message: sent
    };
  })()
    .finally(() => {
      refreshLocks.delete(key);
    });

  refreshLocks.set(key, task);
  return task;
}

async function openStickyCreateModal(interaction) {
  const channel = interaction.options.getChannel("channel", true);

  if (channel.type !== ChannelType.GuildText) {
    await interaction.reply({
      embeds: [buildErrorEmbed("Sticky note hanya bisa dipasang di text channel biasa.")],
      ephemeral: true
    });
    return;
  }

  const cooldownSeconds = clampCooldown(interaction.options.getInteger("cooldown_seconds"));
  await interaction.showModal(buildStickyModal(
    makeModalId("create", channel.id, cooldownSeconds)
  ));
}

async function openStickyEditModal(interaction) {
  const channel = interaction.options.getChannel("channel", true);
  const sticky = getSticky(interaction.guildId, channel.id);

  if (!sticky) {
    await interaction.reply({
      embeds: [buildErrorEmbed("Belum ada sticky note aktif di channel itu.")],
      ephemeral: true
    });
    return;
  }

  const cooldownOption = interaction.options.getInteger("cooldown_seconds");
  const cooldownSeconds = clampCooldown(cooldownOption || sticky.cooldownSeconds);

  await interaction.showModal(buildStickyModal(
    makeModalId("edit", channel.id, cooldownSeconds),
    sticky
  ));
}

async function removeStickyNote(interaction, client) {
  const channel = interaction.options.getChannel("channel", true);
  const sticky = deleteSticky(interaction.guildId, channel.id);

  if (!sticky) {
    await interaction.reply({
      embeds: [buildErrorEmbed("Tidak ada sticky note aktif di channel itu.")],
      ephemeral: true
    });
    return;
  }

  await deleteStickyMessage(client, sticky);

  await interaction.reply({
    embeds: [buildSuccessEmbed("Sticky Removed", `Sticky note di ${channel} berhasil dihapus.`)],
    ephemeral: true
  });
}

async function resendStickyNote(interaction, client) {
  const channel = interaction.options.getChannel("channel", true);
  const sticky = getSticky(interaction.guildId, channel.id);

  if (!sticky) {
    await interaction.reply({
      embeds: [buildErrorEmbed("Tidak ada sticky note aktif di channel itu.")],
      ephemeral: true
    });
    return;
  }

  const result = await refreshStickyMessage(client, sticky, { force: true });

  if (!result.ok) {
    await interaction.reply({
      embeds: [buildErrorEmbed(result.reason || "Gagal mengirim ulang sticky note.")],
      ephemeral: true
    });
    return;
  }

  await interaction.reply({
    embeds: [buildSuccessEmbed("Sticky Resent", `Sticky note di ${channel} berhasil di-refresh.`)],
    ephemeral: true
  });
}

async function listStickyNotes(interaction) {
  const entries = listStickies((entry) => entry.guildId === interaction.guildId);

  await interaction.reply({
    embeds: [buildStickyListEmbed(interaction.guild, entries)],
    ephemeral: true
  });
}

async function handleStickyModalSubmit(interaction, client) {
  const meta = parseModalId(interaction.customId);

  if (!meta) {
    return false;
  }

  if (!interaction.inGuild()) {
    await interaction.reply({
      embeds: [buildErrorEmbed("Sticky note hanya bisa diatur di server.")],
      ephemeral: true
    }).catch(() => null);
    return true;
  }

  if (!hasStickyPermission(interaction.member)) {
    await interaction.reply({
      embeds: [buildErrorEmbed("Kamu tidak punya izin untuk mengatur sticky note.")],
      ephemeral: true
    }).catch(() => null);
    return true;
  }

  const channel = interaction.guild.channels.cache.get(meta.channelId)
    || await interaction.guild.channels.fetch(meta.channelId).catch(() => null);

  if (!channel || channel.type !== ChannelType.GuildText) {
    await interaction.reply({
      embeds: [buildErrorEmbed("Channel sticky tidak ditemukan atau bukan text channel.")],
      ephemeral: true
    }).catch(() => null);
    return true;
  }

  const content = interaction.fields.getTextInputValue("content")?.trim();
  const title = interaction.fields.getTextInputValue("title")?.trim() || DEFAULT_STICKY_TITLE;

  if (!content) {
    await interaction.reply({
      embeds: [buildErrorEmbed("Isi sticky note tidak boleh kosong.")],
      ephemeral: true
    }).catch(() => null);
    return true;
  }

  const current = getSticky(interaction.guildId, channel.id);

  if (meta.mode === "edit" && !current) {
    await interaction.reply({
      embeds: [buildErrorEmbed("Sticky note di channel itu sudah tidak ada.")],
      ephemeral: true
    }).catch(() => null);
    return true;
  }

  upsertSticky(interaction.guildId, channel.id, {
    title,
    content,
    cooldownSeconds: meta.cooldownSeconds,
    createdBy: current?.createdBy || interaction.user.id,
    updatedBy: interaction.user.id,
    createdAt: current?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    messageId: current?.messageId || "",
    lastBumpAt: "0"
  });

  const result = await refreshStickyMessage(client, getSticky(interaction.guildId, channel.id), { force: true });

  if (!result.ok) {
    await interaction.reply({
      embeds: [buildErrorEmbed(result.reason || "Gagal mengirim sticky note.")],
      ephemeral: true
    }).catch(() => null);
    return true;
  }

  await interaction.reply({
    embeds: [
      buildSuccessEmbed(
        meta.mode === "edit" ? "Sticky Updated" : "Sticky Created",
        `Sticky note di ${channel} aktif dengan cooldown \`${meta.cooldownSeconds}s\`.`
      )
    ],
    ephemeral: true
  }).catch(() => null);

  return true;
}

async function handleStickyMessage(message, client) {
  const sticky = getSticky(message.guild.id, message.channel.id);

  if (!sticky) {
    return false;
  }

  const key = `${sticky.guildId}:${sticky.channelId}`;

  if (message.author?.id === client.user?.id) {
    if (sticky.messageId && message.id === sticky.messageId) {
      return false;
    }

    if (refreshLocks.has(key)) {
      return false;
    }
  }

  const result = await refreshStickyMessage(client, sticky, { force: false });
  return Boolean(result.ok && !result.skipped);
}

const slashData = new SlashCommandBuilder()
  .setName("sticky")
  .setDescription("Kelola sticky note modern per channel")
  .setDMPermission(false)
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
  .addSubcommand((subcommand) =>
    subcommand
      .setName("create")
      .setDescription("Buat sticky note baru untuk satu text channel")
      .addChannelOption((option) =>
        option
          .setName("channel")
          .setDescription("Channel target sticky")
          .addChannelTypes(ChannelType.GuildText)
          .setRequired(true)
      )
      .addIntegerOption((option) =>
        option
          .setName("cooldown_seconds")
          .setDescription("Cooldown refresh sticky dalam detik")
          .setMinValue(MIN_COOLDOWN_SECONDS)
          .setMaxValue(MAX_COOLDOWN_SECONDS)
          .setRequired(false)
      )
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName("edit")
      .setDescription("Edit sticky note yang sudah ada")
      .addChannelOption((option) =>
        option
          .setName("channel")
          .setDescription("Channel target sticky")
          .addChannelTypes(ChannelType.GuildText)
          .setRequired(true)
      )
      .addIntegerOption((option) =>
        option
          .setName("cooldown_seconds")
          .setDescription("Cooldown refresh sticky dalam detik")
          .setMinValue(MIN_COOLDOWN_SECONDS)
          .setMaxValue(MAX_COOLDOWN_SECONDS)
          .setRequired(false)
      )
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName("remove")
      .setDescription("Hapus sticky note dari channel")
      .addChannelOption((option) =>
        option
          .setName("channel")
          .setDescription("Channel target sticky")
          .addChannelTypes(ChannelType.GuildText)
          .setRequired(true)
      )
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName("resend")
      .setDescription("Paksa kirim ulang sticky note di channel")
      .addChannelOption((option) =>
        option
          .setName("channel")
          .setDescription("Channel target sticky")
          .addChannelTypes(ChannelType.GuildText)
          .setRequired(true)
      )
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName("list")
      .setDescription("Lihat daftar sticky note aktif di server")
  );

async function executeSlash(interaction, client) {
  if (!interaction.inGuild()) {
    await interaction.reply({
      embeds: [buildErrorEmbed("Command sticky hanya bisa dipakai di server.")],
      ephemeral: true
    });
    return;
  }

  if (!hasStickyPermission(interaction.member)) {
    await interaction.reply({
      embeds: [buildErrorEmbed("Kamu butuh permission Manage Messages atau Manage Server.")],
      ephemeral: true
    });
    return;
  }

  const subcommand = interaction.options.getSubcommand();

  if (subcommand === "create") {
    await openStickyCreateModal(interaction);
    return;
  }

  if (subcommand === "edit") {
    await openStickyEditModal(interaction);
    return;
  }

  if (subcommand === "remove") {
    await removeStickyNote(interaction, client);
    return;
  }

  if (subcommand === "resend") {
    await resendStickyNote(interaction, client);
    return;
  }

  if (subcommand === "list") {
    await listStickyNotes(interaction);
  }
}

module.exports = {
  DEFAULT_COOLDOWN_SECONDS,
  buildStickyEmbed,
  executeSlash,
  handleStickyMessage,
  handleStickyModalSubmit,
  hasStickyPermission,
  refreshStickyMessage,
  slashData
};
