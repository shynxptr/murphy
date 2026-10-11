const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  EmbedBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle
} = require("discord.js");
const { getEffectiveGuildSettings } = require("../../utils/guildSettings");
const { getTicketType } = require("./ticketSystem");

const TICKET_FEEDBACK_BUTTON_PREFIX = "ticket-feedback:rate:";
const TICKET_FEEDBACK_MODAL_PREFIX = "ticket-feedback:modal:";

function getTicketOwnerId(channel) {
  return channel?.topic?.match(/^ticket-owner:(\d+)\|type:/)?.[1] || "";
}

function getTicketTypeKey(channel) {
  return channel?.topic?.match(/\|type:([^|]+)$/)?.[1] || "";
}

function buildFeedbackPromptEmbed(guild) {
  return new EmbedBuilder()
    .setColor("#111214")
    .setTitle("Terima Kasih Sudah Menggunakan Loket Murphy")
    .setDescription([
      "Terima kasih sudah menggunakan fitur tiket di Murphy.",
      "",
      "Kalau kamu puas dengan pelayanan staff atau admin yang membantu kamu, silakan beri rating lewat tombol di bawah ini.",
      "Nama staff/admin yang dinilai akan kamu isi sendiri di form feedback."
    ].join("\n"))
    .setFooter({
      text: `${guild.name} • Feedback Pelayanan`
    })
    .setTimestamp();
}

function buildFeedbackPromptRows() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`${TICKET_FEEDBACK_BUTTON_PREFIX}1`)
        .setLabel("1★")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`${TICKET_FEEDBACK_BUTTON_PREFIX}2`)
        .setLabel("2★")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`${TICKET_FEEDBACK_BUTTON_PREFIX}3`)
        .setLabel("3★")
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(`${TICKET_FEEDBACK_BUTTON_PREFIX}4`)
        .setLabel("4★")
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`${TICKET_FEEDBACK_BUTTON_PREFIX}5`)
        .setLabel("5★")
        .setStyle(ButtonStyle.Success)
    )
  ];
}

function buildFeedbackModal(rating) {
  const modal = new ModalBuilder()
    .setCustomId(`${TICKET_FEEDBACK_MODAL_PREFIX}${rating}`)
    .setTitle("Rating Pelayanan Loket");

  const staffInput = new TextInputBuilder()
    .setCustomId("staff_name")
    .setLabel("Nama Staff / Admin")
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(64)
    .setPlaceholder("Contoh: Kak Aruna");

  const feedbackInput = new TextInputBuilder()
    .setCustomId("feedback_text")
    .setLabel("Isi Feedback")
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(false)
    .setMaxLength(500)
    .setPlaceholder("Ceritakan pengalaman pelayanan yang kamu rasakan.");

  modal.addComponents(
    new ActionRowBuilder().addComponents(staffInput),
    new ActionRowBuilder().addComponents(feedbackInput)
  );

  return modal;
}

function buildStarRating(rating) {
  const safeRating = Math.min(5, Math.max(1, Number.parseInt(String(rating || 0), 10) || 0));
  return `${"★".repeat(safeRating)}${"☆".repeat(5 - safeRating)} (${safeRating}/5)`;
}

function buildFeedbackResultEmbed({ guild, author, ticketType, staffName, rating, feedback }) {
  return new EmbedBuilder()
    .setColor("#111214")
    .setTitle("Feedback Loket Murphy")
    .setDescription([
      "Terima kasih sudah menggunakan loket Murphy.",
      "",
      `**Nama Staff/Admin**`,
      staffName,
      "",
      `**Rating**`,
      buildStarRating(rating),
      "",
      `**Isi Feedback**`,
      feedback || "Tidak ada catatan tambahan.",
      "",
      `**Pengirim**`,
      `${author} (${author.tag})`,
      "",
      `**Jenis Loket**`,
      ticketType?.label || "Loket Umum"
    ].join("\n"))
    .setThumbnail(author.displayAvatarURL({
      extension: "png",
      forceStatic: true,
      size: 256
    }))
    .setFooter({
      text: `${guild.name} • Feedback Loket`
    })
    .setTimestamp();
}

async function sendTicketThanksPrompt(message, client) {
  await message.channel.send({
    embeds: [buildFeedbackPromptEmbed(message.guild, client)],
    components: buildFeedbackPromptRows()
  });
}

async function resolveFeedbackChannel(guild, client) {
  const { tickets } = getEffectiveGuildSettings(guild.id, client);
  const feedbackChannelId = tickets.feedbackChannelId || tickets.logChannelId || "";

  if (!feedbackChannelId) {
    return null;
  }

  const channel = guild.channels.cache.get(feedbackChannelId)
    || await guild.channels.fetch(feedbackChannelId).catch(() => null);

  if (!channel || channel.type !== ChannelType.GuildText) {
    return null;
  }

  return channel;
}

async function handleTicketFeedbackButton(interaction) {
  if (!interaction.customId.startsWith(TICKET_FEEDBACK_BUTTON_PREFIX)) {
    return false;
  }

  const ownerId = getTicketOwnerId(interaction.channel);

  if (!ownerId) {
    await interaction.reply({
      content: "Tombol feedback ini hanya bisa dipakai di ticket yang valid.",
      ephemeral: true
    }).catch(() => null);
    return true;
  }

  if (interaction.user.id !== ownerId) {
    await interaction.reply({
      content: "Hanya pemilik ticket yang bisa mengirim feedback pelayanan.",
      ephemeral: true
    }).catch(() => null);
    return true;
  }

  const rating = Number.parseInt(interaction.customId.slice(TICKET_FEEDBACK_BUTTON_PREFIX.length), 10);

  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    await interaction.reply({
      content: "Rating tidak valid.",
      ephemeral: true
    }).catch(() => null);
    return true;
  }

  await interaction.showModal(buildFeedbackModal(rating)).catch(async () => {
    await interaction.reply({
      content: "Gagal membuka form feedback. Coba lagi ya.",
      ephemeral: true
    }).catch(() => null);
  });
  return true;
}

async function handleTicketFeedbackModalSubmit(interaction, client) {
  if (!interaction.customId.startsWith(TICKET_FEEDBACK_MODAL_PREFIX)) {
    return false;
  }

  const ownerId = getTicketOwnerId(interaction.channel);

  if (!ownerId) {
    await interaction.reply({
      content: "Form feedback ini hanya bisa dipakai di ticket yang valid.",
      ephemeral: true
    }).catch(() => null);
    return true;
  }

  if (interaction.user.id !== ownerId) {
    await interaction.reply({
      content: "Hanya pemilik ticket yang bisa mengirim feedback pelayanan.",
      ephemeral: true
    }).catch(() => null);
    return true;
  }

  const rating = Number.parseInt(interaction.customId.slice(TICKET_FEEDBACK_MODAL_PREFIX.length), 10);

  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    await interaction.reply({
      content: "Rating tidak valid.",
      ephemeral: true
    }).catch(() => null);
    return true;
  }

  const staffName = interaction.fields.getTextInputValue("staff_name")?.trim() || "";
  const feedbackText = interaction.fields.getTextInputValue("feedback_text")?.trim() || "";

  if (!staffName) {
    await interaction.reply({
      content: "Nama staff/admin yang dinilai tidak boleh kosong.",
      ephemeral: true
    }).catch(() => null);
    return true;
  }

  const feedbackChannel = await resolveFeedbackChannel(interaction.guild, client);

  if (!feedbackChannel) {
    await interaction.reply({
      content: "Channel feedback ticket belum diatur atau tidak valid.",
      ephemeral: true
    }).catch(() => null);
    return true;
  }

  const ticketType = getTicketType(getTicketTypeKey(interaction.channel));

  await feedbackChannel.send({
    embeds: [buildFeedbackResultEmbed({
      guild: interaction.guild,
      author: interaction.user,
      ticketType,
      staffName,
      rating,
      feedback: feedbackText
    })]
  }).catch(async () => {
    await interaction.reply({
      content: "Gagal mengirim feedback ke channel publik. Cek permission bot di channel feedback.",
      ephemeral: true
    }).catch(() => null);
  });

  if (interaction.replied || interaction.deferred) {
    return true;
  }

  await interaction.reply({
    content: "Terima kasih, feedback kamu berhasil dikirim.",
    ephemeral: true
  }).catch(() => null);
  return true;
}

module.exports = {
  buildFeedbackPromptEmbed,
  buildFeedbackPromptRows,
  handleTicketFeedbackButton,
  handleTicketFeedbackModalSubmit,
  sendTicketThanksPrompt
};
