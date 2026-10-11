const {
  ActionRowBuilder,
  EmbedBuilder,
  ModalBuilder,
  PermissionFlagsBits,
  TextInputBuilder,
  TextInputStyle
} = require("discord.js");
const { getGuildSettings, updateGuildSettings } = require("../../services/guildConfigService");
const {
  addDonatorValue,
  refreshDonatorBoardForGuild
} = require("../leaderboards/leaderboardSystem");

const DONATION_MODAL_PREFIX = "donation:modal:";
const DONATION_PENDING_IMAGE_MS = 2 * 60_000;
const DONATION_FEED_ROLE_ID = "1482710348380373123";
const DONATION_HEADER_EMOJI = "<a:emoji_5:1482701058533752943>";
const DONATION_FOOTER_EMOJI = "<a:emoji_12:1482702863644754021>";
const DONATION_RECEIVED_LABEL = "\u{1F4E5} Donation Received";
const DONATION_DONOR_LABEL = "\u{1F464}";
const DONATION_AMOUNT_LABEL = "\u{1F4B0}";
const DONATION_DATE_LABEL = "\u{1F4C5}";
const DONATION_NOTE_LABEL = "\u{270F}\u{FE0F}";
const DONATION_THANKS_LINE = `Terima kasih atas support-nya \u{1F90D}`;
const DONATION_NAME_INPUT_ID = "donation_donor_name";
const DONATION_AMOUNT_INPUT_ID = "donation_amount";
const DONATION_DATE_INPUT_ID = "donation_date";
const DONATION_NOTE_INPUT_ID = "donation_note";

const DEFAULT_DONATION_SETTINGS = {
  channelId: "",
  accentColor: "#f59e0b"
};

const pendingDonationImages = new Map();

function getDonationSettings(guildId) {
  const settings = getGuildSettings(guildId, {
    donations: DEFAULT_DONATION_SETTINGS
  }).donations;

  return {
    ...DEFAULT_DONATION_SETTINGS,
    ...(settings || {})
  };
}

function updateDonationSettings(guildId, updater) {
  return updateGuildSettings(guildId, (current) => {
    const nextSettings = updater({
      ...DEFAULT_DONATION_SETTINGS,
      ...(current.donations || {})
    });

    return {
      ...current,
      donations: {
        ...DEFAULT_DONATION_SETTINGS,
        ...(nextSettings || {})
      }
    };
  });
}

function hasDonationAdminPermission(member) {
  return member.permissions.has(PermissionFlagsBits.ManageGuild)
    || member.permissions.has(PermissionFlagsBits.ManageMessages);
}

function formatCurrency(value) {
  return `Rp ${new Intl.NumberFormat("id-ID").format(value)}`;
}

function parseAmount(raw) {
  const normalized = String(raw || "").replace(/[^\d]/g, "");
  return Number.parseInt(normalized, 10);
}

function getGuildIconUrl(guild) {
  return guild.iconURL({
    extension: "png",
    forceStatic: true,
    size: 128
  }) || null;
}

function isSupportedDonationChannel(channel) {
  return Boolean(channel?.isTextBased?.() && channel?.messages);
}

function buildErrorEmbed(description) {
  return new EmbedBuilder()
    .setColor("#ef4444")
    .setTitle("Donation Error")
    .setDescription(description)
    .setTimestamp();
}

function buildSuccessEmbed(title, description) {
  return new EmbedBuilder()
    .setColor("#111214")
    .setTitle(title)
    .setDescription(description)
    .setTimestamp();
}

function buildDonationStatusEmbed(guild) {
  const settings = getDonationSettings(guild.id);

  return new EmbedBuilder()
    .setColor(settings.accentColor)
    .setTitle("Donation Settings")
    .addFields(
      {
        name: "Channel Donasi",
        value: settings.channelId ? `<#${settings.channelId}>` : "Belum diatur",
        inline: false
      },
      {
        name: "Role Feed",
        value: `<@&${DONATION_FEED_ROLE_ID}>`,
        inline: false
      },
      {
        name: "Akses Admin",
        value: "Manage Server atau Manage Messages",
        inline: false
      }
    )
    .setFooter({
      text: `${guild.name} - Murphy Donation System`,
      iconURL: getGuildIconUrl(guild) || undefined
    })
    .setTimestamp();
}

function buildDonationModal(member = null) {
  const displayName = member?.displayName || member?.user?.globalName || member?.user?.username || "";
  const modal = new ModalBuilder()
    .setCustomId(`${DONATION_MODAL_PREFIX}${member?.id || "manual"}`)
    .setTitle("Catat Donasi");

  const donorNameInput = new TextInputBuilder()
    .setCustomId(DONATION_NAME_INPUT_ID)
    .setLabel("Nama Donatur (opsional)")
    .setStyle(TextInputStyle.Short)
    .setRequired(false)
    .setMaxLength(100);

  if (displayName) {
    donorNameInput.setValue(displayName.slice(0, 100));
  }

  const amountInput = new TextInputBuilder()
    .setCustomId(DONATION_AMOUNT_INPUT_ID)
    .setLabel("Nominal Donasi")
    .setPlaceholder("Contoh: 50000 atau Rp 50.000")
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(30);

  const dateInput = new TextInputBuilder()
    .setCustomId(DONATION_DATE_INPUT_ID)
    .setLabel("Tanggal (opsional)")
    .setPlaceholder("Contoh: 19/03/2026 atau kosongkan")
    .setStyle(TextInputStyle.Short)
    .setRequired(false)
    .setMaxLength(40);

  const noteInput = new TextInputBuilder()
    .setCustomId(DONATION_NOTE_INPUT_ID)
    .setLabel("Keterangan (opsional)")
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(false)
    .setMaxLength(800);

  modal.addComponents(
    new ActionRowBuilder().addComponents(donorNameInput),
    new ActionRowBuilder().addComponents(amountInput),
    new ActionRowBuilder().addComponents(dateInput),
    new ActionRowBuilder().addComponents(noteInput)
  );

  return modal;
}

function parseDonationModalId(customId) {
  if (!customId.startsWith(DONATION_MODAL_PREFIX)) {
    return null;
  }

  const donorId = customId.slice(DONATION_MODAL_PREFIX.length);

  return {
    donorId: donorId && donorId !== "manual" ? donorId : ""
  };
}

function parseDonationDate(raw) {
  const value = String(raw || "").trim();

  if (!value) {
    return new Date();
  }

  const normalized = value.replace(/\./g, "/").replace(/-/g, "/");
  const dayFirstMatch = normalized.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);

  if (dayFirstMatch) {
    const [, day, month, year] = dayFirstMatch;
    const parsed = new Date(Number(year), Number(month) - 1, Number(day), 12, 0, 0, 0);

    if (
      parsed.getFullYear() === Number(year)
      && parsed.getMonth() === (Number(month) - 1)
      && parsed.getDate() === Number(day)
    ) {
      return parsed;
    }
  }

  const isoMatch = normalized.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);

  if (isoMatch) {
    const [, year, month, day] = isoMatch;
    const parsed = new Date(Number(year), Number(month) - 1, Number(day), 12, 0, 0, 0);

    if (
      parsed.getFullYear() === Number(year)
      && parsed.getMonth() === (Number(month) - 1)
      && parsed.getDate() === Number(day)
    ) {
      return parsed;
    }
  }

  return null;
}

function formatDonationDate(date) {
  return new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric"
  }).format(date);
}

async function resolveDonationChannel(guild) {
  const settings = getDonationSettings(guild.id);

  if (!settings.channelId) {
    return null;
  }

  const channel = guild.channels.cache.get(settings.channelId)
    || await guild.channels.fetch(settings.channelId).catch(() => null);

  return isSupportedDonationChannel(channel) ? channel : null;
}

function buildDonationFeedEmbed(guild, data) {
  const embed = new EmbedBuilder()
    .setColor(getDonationSettings(guild.id).accentColor)
    .setDescription([
      `${DONATION_HEADER_EMOJI} **DONATION FEED - MURPHY**`,
      "",
      data.roleMention,
      DONATION_RECEIVED_LABEL,
      `${DONATION_DONOR_LABEL} ${data.donorMention || data.donorLabel}`,
      `${DONATION_AMOUNT_LABEL} ${formatCurrency(data.amount)}`,
      `${DONATION_DATE_LABEL} ${data.dateLabel}`,
      `${DONATION_NOTE_LABEL} ${data.note || "-"}`,
      "",
      DONATION_THANKS_LINE,
      `Kontribusi kalian membantu Murphy terus berkembang ${DONATION_FOOTER_EMOJI}`
    ].join("\n"))
    .setFooter({
      text: `${guild.name} - Donation Feed`,
      iconURL: getGuildIconUrl(guild) || undefined
    })
    .setTimestamp();

  if (data.imageUrl) {
    embed.setImage(data.imageUrl);
  }

  return embed;
}

function extractImageAttachment(message) {
  return message.attachments.find((attachment) => {
    if (attachment.contentType?.startsWith("image/")) {
      return true;
    }

    return /\.(png|jpe?g|gif|webp)$/i.test(attachment.name || attachment.url || "");
  }) || null;
}

async function waitForDonationImage(channel, userId) {
  if (!channel?.awaitMessages) {
    return {
      status: "unsupported",
      imageUrl: "",
      sourceMessage: null
    };
  }

  try {
    const collected = await channel.awaitMessages({
      filter: (message) => {
        if (message.author?.bot || message.author?.id !== userId) {
          return false;
        }

        if (extractImageAttachment(message)) {
          return true;
        }

        return message.content.trim().toLowerCase() === "skip";
      },
      max: 1,
      time: DONATION_PENDING_IMAGE_MS,
      errors: ["time"]
    });
    const collectedMessage = collected.first();

    if (!collectedMessage) {
      return {
        status: "timeout",
        imageUrl: "",
        sourceMessage: null
      };
    }

    const imageAttachment = extractImageAttachment(collectedMessage);

    if (!imageAttachment) {
      return {
        status: "skipped",
        imageUrl: "",
        sourceMessage: collectedMessage
      };
    }

    return {
      status: "image",
      imageUrl: imageAttachment.proxyURL || imageAttachment.url,
      sourceMessage: collectedMessage
    };
  } catch (error) {
    return {
      status: "timeout",
      imageUrl: "",
      sourceMessage: null
    };
  }
}

async function collectDonationImageDecision(channel, userId) {
  const firstAttempt = await waitForDonationImage(channel, userId);

  if (firstAttempt.status !== "timeout") {
    return firstAttempt;
  }

  const reminderMessage = await channel.send({
    content: `<@${userId}> belum ada gambar yang masuk. Kalau masih mau pakai foto, kirim gambar sekarang. Kalau tidak, ketik \`skip\` dalam 2 menit ini ya.`,
    allowedMentions: {
      parse: [],
      users: [userId]
    }
  }).catch(() => null);

  const secondAttempt = await waitForDonationImage(channel, userId);

  if (secondAttempt.status === "timeout") {
    return {
      status: "final-timeout",
      imageUrl: "",
      sourceMessage: null,
      reminderMessage
    };
  }

  return {
    ...secondAttempt,
    reminderMessage
  };
}

async function cleanupDonationPrompt(result) {
  if (result?.sourceMessage?.deletable) {
    await result.sourceMessage.delete().catch(() => null);
  }

  if (result?.reminderMessage?.deletable) {
    await result.reminderMessage.delete().catch(() => null);
  }
}

async function cleanupDonationPromptAfterTimeout(result) {
  if (result?.reminderMessage?.deletable) {
    await result.reminderMessage.delete().catch(() => null);
  }
}

async function setDonationChannel(interaction) {
  const channel = interaction.options.getChannel("channel", true);

  if (!isSupportedDonationChannel(channel)) {
    await interaction.reply({
      embeds: [buildErrorEmbed("Channel donasi harus berupa text channel yang bisa dipakai bot kirim pesan.")],
      ephemeral: true
    });
    return;
  }

  updateDonationSettings(interaction.guildId, (current) => ({
    ...current,
    channelId: channel.id
  }));

  await interaction.reply({
    embeds: [buildSuccessEmbed("Donation Channel Updated", `Channel donasi berhasil diatur ke ${channel}.`)],
    ephemeral: true
  });
}

async function showDonationSettings(interaction) {
  await interaction.reply({
    embeds: [buildDonationStatusEmbed(interaction.guild)],
    ephemeral: true
  });
}

async function openDonationModal(interaction) {
  const memberOption = interaction.options.getMember("member")
    || (interaction.options.getUser("member")
      ? await interaction.guild.members.fetch(interaction.options.getUser("member", true).id).catch(() => null)
      : null);

  await interaction.showModal(buildDonationModal(memberOption));
}

async function handleDonationModalSubmit(interaction, client) {
  const meta = parseDonationModalId(interaction.customId);

  if (!meta) {
    return false;
  }

  if (!interaction.inGuild()) {
    await interaction.reply({
      embeds: [buildErrorEmbed("Pencatatan donasi hanya bisa dipakai di server.")],
      ephemeral: true
    }).catch(() => null);
    return true;
  }

  if (!hasDonationAdminPermission(interaction.member)) {
    await interaction.reply({
      embeds: [buildErrorEmbed("Kamu tidak punya izin untuk mencatat donasi.")],
      ephemeral: true
    }).catch(() => null);
    return true;
  }

  await interaction.deferReply({ ephemeral: true }).catch(() => null);

  const pendingKey = `${interaction.guildId}:${interaction.user.id}`;

  if (pendingDonationImages.has(pendingKey)) {
    await interaction.editReply({
      embeds: [buildErrorEmbed("Masih ada pencatatan donasi yang sedang menunggu gambar dari kamu. Selesaikan dulu yang sebelumnya.")]
    }).catch(() => null);
    return true;
  }

  const targetChannel = await resolveDonationChannel(interaction.guild);

  if (!targetChannel) {
    await interaction.editReply({
      embeds: [buildErrorEmbed("Channel donasi belum diatur atau tidak valid. Jalankan `/donasi set-channel` dulu.")]
    }).catch(() => null);
    return true;
  }

  const amount = parseAmount(interaction.fields.getTextInputValue(DONATION_AMOUNT_INPUT_ID));
  const donorNameInput = interaction.fields.getTextInputValue(DONATION_NAME_INPUT_ID)?.trim() || "";
  const rawDate = interaction.fields.getTextInputValue(DONATION_DATE_INPUT_ID)?.trim() || "";
  const note = interaction.fields.getTextInputValue(DONATION_NOTE_INPUT_ID)?.trim() || "";

  if (!Number.isInteger(amount) || amount <= 0) {
    await interaction.editReply({
      embeds: [buildErrorEmbed("Nominal donasi harus berupa angka valid yang lebih besar dari 0.")]
    }).catch(() => null);
    return true;
  }

  const donationDate = parseDonationDate(rawDate);

  if (!donationDate) {
    await interaction.editReply({
      embeds: [buildErrorEmbed("Format tanggal tidak valid. Gunakan `dd/mm/yyyy`, `dd-mm-yyyy`, atau `yyyy-mm-dd`.")]
    }).catch(() => null);
    return true;
  }

  const donorMember = meta.donorId
    ? interaction.guild.members.cache.get(meta.donorId)
      || await interaction.guild.members.fetch(meta.donorId).catch(() => null)
    : null;
  const donorLabel = donorNameInput
    || donorMember?.displayName
    || donorMember?.user?.globalName
    || donorMember?.user?.username
    || "";

  if (!donorLabel) {
    await interaction.editReply({
      embeds: [buildErrorEmbed("Isi nama donatur atau jalankan `/donasi kirim member:@user` supaya target donor jelas.")]
    }).catch(() => null);
    return true;
  }

  pendingDonationImages.set(pendingKey, true);

  let imageWaitResult = {
    status: "unsupported",
    imageUrl: "",
    sourceMessage: null,
    reminderMessage: null
  };
  let sentMessage = null;

  try {
    await interaction.editReply({
      embeds: [
        buildSuccessEmbed(
          "Waiting For Image",
          [
            "Kirim 1 gambar di channel ini dalam 2 menit untuk dipasang ke donation feed.",
            "Kalau tidak mau pakai gambar, ketik `skip`.",
            "Kalau 2 menit pertama lewat, bot akan mention kamu untuk konfirmasi lagi."
          ].join("\n")
        )
      ]
    }).catch(() => null);

    imageWaitResult = await collectDonationImageDecision(interaction.channel, interaction.user.id);

    sentMessage = await targetChannel.send({
      embeds: [
        buildDonationFeedEmbed(interaction.guild, {
          roleMention: `<@&${DONATION_FEED_ROLE_ID}>`,
          donorLabel,
          donorMention: donorMember ? `<@${donorMember.id}>` : "",
          amount,
          dateLabel: formatDonationDate(donationDate),
          note,
          imageUrl: imageWaitResult.imageUrl
        })
      ],
      allowedMentions: {
        parse: [],
        roles: [],
        users: []
      }
    }).catch((error) => {
      console.error("Failed to send donation log message:", error);
      return null;
    });
  } finally {
    pendingDonationImages.delete(pendingKey);
  }

  if (!sentMessage) {
    await interaction.editReply({
      embeds: [buildErrorEmbed("Gagal mengirim pencatatan donasi ke channel target.")]
    }).catch(() => null);
    return true;
  }

  if (["image", "skipped"].includes(imageWaitResult.status)) {
    await cleanupDonationPrompt(imageWaitResult);
  } else if (imageWaitResult.status === "final-timeout") {
    await cleanupDonationPromptAfterTimeout(imageWaitResult);
  }

  let updatedDonator = null;
  let refreshedBoard = false;

  if (donorMember) {
    updatedDonator = addDonatorValue(interaction.guildId, donorMember.id, amount);
    refreshedBoard = await refreshDonatorBoardForGuild(interaction.guild, client).catch(() => false);
  }

  const responseLines = [
    `Pencatatan donasi berhasil dikirim ke ${targetChannel}.`,
    `[Buka pesan donasi](${sentMessage.url})`
  ];

  if (imageWaitResult.status === "image") {
    responseLines.push("Gambar berhasil dipasang ke donation feed.");
  } else if (imageWaitResult.status === "skipped") {
    responseLines.push("Donation feed dikirim tanpa gambar karena kamu memilih `skip`.");
  } else if (imageWaitResult.status === "timeout") {
    responseLines.push("Donation feed dikirim tanpa gambar setelah timeout awal.");
  } else if (imageWaitResult.status === "final-timeout") {
    responseLines.push("Donation feed dikirim tanpa gambar karena setelah pengingat kedua tetap belum ada gambar atau `skip`.");
  } else if (imageWaitResult.status === "unsupported") {
    responseLines.push("Channel ini tidak mendukung penantian gambar, jadi donation feed dikirim tanpa gambar.");
  }

  if (updatedDonator) {
    responseLines.push(`Total donasi untuk <@${donorMember.id}> sekarang **${formatCurrency(updatedDonator.amount || 0)}**.`);

    if (!refreshedBoard) {
      responseLines.push("Panel top donatur belum ikut diperbarui. Pastikan channel leaderboard sudah diset kalau kamu ingin board auto-refresh.");
    }
  } else {
    responseLines.push("Top donatur tidak diupdate otomatis karena donor belum ditautkan ke member server.");
  }

  await interaction.editReply({
    embeds: [buildSuccessEmbed("Donation Logged", responseLines.join("\n"))]
  }).catch(() => null);

  return true;
}

module.exports = {
  DEFAULT_DONATION_SETTINGS,
  getDonationSettings,
  handleDonationModalSubmit,
  hasDonationAdminPermission,
  openDonationModal,
  setDonationChannel,
  showDonationSettings
};
