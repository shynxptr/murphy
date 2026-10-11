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
const { createEntry, getEntry, updateEntry } = require("../../services/confessionStore");

const CONFESSION_NEW_BUTTON_ID = "confession:new";
const CONFESSION_REPLY_PREFIX = "confession:reply:";
const CONFESSION_NEW_MODAL_ID = "confession:modal:new";
const CONFESSION_REPLY_MODAL_PREFIX = "confession:modal:reply:";
const CONFESSION_TO_INPUT_ID = "confession_to";
const CONFESSION_MESSAGE_INPUT_ID = "confession_message";
const CONFESSION_REPLY_INPUT_ID = "confession_reply_message";

function buildConfessionPanel(client, guildId) {
  const { confessions } = getEffectiveGuildSettings(guildId, client);

  return {
    embeds: [
      new EmbedBuilder()
        .setColor(confessions.accentColor)
        .setTitle("Murphy Confession")
        .setDescription(
          [
            "Gunakan tombol di bawah untuk mengirim confession secara anonim.",
            "Kamu juga bisa membalas confession lain secara anonim lewat thread yang tersedia."
          ].join("\n")
        )
    ],
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(CONFESSION_NEW_BUTTON_ID)
          .setLabel("Kirim Confession")
          .setStyle(ButtonStyle.Primary)
      )
    ]
  };
}

function buildReplyButton(confessionId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(CONFESSION_NEW_BUTTON_ID)
      .setLabel("Kirim Confession")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`${CONFESSION_REPLY_PREFIX}${confessionId}`)
      .setLabel("Balas Anonim")
      .setStyle(ButtonStyle.Secondary)
  );
}

function buildReplyOnlyButton(confessionId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`${CONFESSION_REPLY_PREFIX}${confessionId}`)
      .setLabel("Balas Anonim")
      .setStyle(ButtonStyle.Secondary)
  );
}

function buildNewConfessionModal() {
  return new ModalBuilder()
    .setCustomId(CONFESSION_NEW_MODAL_ID)
    .setTitle("Kirim Confession")
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId(CONFESSION_TO_INPUT_ID)
          .setLabel("Untuk siapa? (opsional)")
          .setRequired(false)
          .setMaxLength(100)
          .setStyle(TextInputStyle.Short)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId(CONFESSION_MESSAGE_INPUT_ID)
          .setLabel("Pesan confession")
          .setRequired(true)
          .setMaxLength(1500)
          .setStyle(TextInputStyle.Paragraph)
      )
    );
}

function buildReplyConfessionModal(confessionId) {
  return new ModalBuilder()
    .setCustomId(`${CONFESSION_REPLY_MODAL_PREFIX}${confessionId}`)
    .setTitle("Balas Confession Anonim")
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId(CONFESSION_REPLY_INPUT_ID)
          .setLabel("Pesan balasan anonim")
          .setRequired(true)
          .setMaxLength(1200)
          .setStyle(TextInputStyle.Paragraph)
      )
    );
}

function buildConfessionEmbed(entry, accentColor) {
  const lines = [];

  if (entry.target) {
    lines.push(`**To:** ${entry.target}`);
    lines.push("");
  }

  lines.push(entry.content);

  return new EmbedBuilder()
    .setColor(accentColor)
    .setTitle(`Confession #${entry.id}`)
    .setDescription(lines.join("\n"))
    .setFooter({
      text: "Anonim untuk publik"
    })
    .setTimestamp(new Date(entry.createdAt));
}

function buildConfessionReplyEmbed(entry, accentColor) {
  return new EmbedBuilder()
    .setColor(accentColor)
    .setTitle(`Balasan Anonim #${entry.id}`)
    .setDescription(entry.content)
    .setFooter({
      text: `Balasan untuk Confession #${entry.parentId}`
    })
    .setTimestamp(new Date(entry.createdAt));
}

function buildLogEmbed(entry, actionLabel) {
  return new EmbedBuilder()
    .setColor("#2b2b2b")
    .setTitle(`${actionLabel} Logged`)
    .setDescription(
      [
        `ID: **${entry.id}**`,
        entry.parentId ? `Parent ID: **${entry.parentId}**` : "Parent ID: `-`",
        `Author: <@${entry.authorId}>`,
        `Author ID: \`${entry.authorId}\``,
        `Type: **${entry.type}**`,
        entry.target ? `To: ${entry.target}` : "To: `-`",
        "",
        entry.content
      ].join("\n")
    )
    .setTimestamp(new Date(entry.createdAt));
}

async function sendConfessionLog(guild, client, entry, actionLabel) {
  const { confessions } = getEffectiveGuildSettings(guild.id, client);

  if (!confessions.logChannelId) {
    return;
  }

  const logChannel = await guild.channels.fetch(confessions.logChannelId).catch(() => null);

  if (!logChannel || logChannel.type !== ChannelType.GuildText) {
    return;
  }

  await logChannel.send({
    embeds: [buildLogEmbed(entry, actionLabel)]
  });
}

async function publishNewConfession(interaction, client) {
  const { confessions } = getEffectiveGuildSettings(interaction.guildId, client);

  if (!confessions.channelId) {
    return {
      ok: false,
      reason: "Channel confession belum diatur."
    };
  }

  const confessionChannel = await interaction.guild.channels.fetch(confessions.channelId).catch(() => null);

  if (!confessionChannel || confessionChannel.type !== ChannelType.GuildText) {
    return {
      ok: false,
      reason: "Channel confession tidak valid."
    };
  }

  const target = interaction.fields.getTextInputValue(CONFESSION_TO_INPUT_ID)?.trim() || "";
  const content = interaction.fields.getTextInputValue(CONFESSION_MESSAGE_INPUT_ID).trim();

  const entry = createEntry({
    guildId: interaction.guildId,
    authorId: interaction.user.id,
    authorTag: interaction.user.tag,
    type: "confession",
    target,
    content,
    createdAt: new Date().toISOString(),
    parentId: null,
    publicMessageId: "",
    threadId: ""
  });

  const sentMessage = await confessionChannel.send({
    embeds: [buildConfessionEmbed(entry, confessions.accentColor)],
    components: [buildReplyButton(entry.id)]
  });

  const updatedEntry = updateEntry(entry.id, (current) => ({
    ...current,
    publicMessageId: sentMessage.id
  }));

  await sendConfessionLog(interaction.guild, client, updatedEntry, "Confession");

  return {
    ok: true,
    id: updatedEntry.id
  };
}

async function publishConfessionReply(interaction, client, confessionId) {
  const { confessions } = getEffectiveGuildSettings(interaction.guildId, client);
  const parent = getEntry(confessionId);

  if (!parent) {
    return {
      ok: false,
      reason: "Confession utama tidak ditemukan."
    };
  }

  const replyContent = interaction.fields.getTextInputValue(CONFESSION_REPLY_INPUT_ID).trim();
  let thread = parent.threadId
    ? await interaction.guild.channels.fetch(parent.threadId).catch(() => null)
    : null;

  if (!thread) {
    const parentMessage = await interaction.guild.channels.fetch(confessions.channelId)
      .then((channel) => channel?.messages.fetch(parent.publicMessageId).catch(() => null))
      .catch(() => null);

    if (!parentMessage) {
      return {
        ok: false,
        reason: "Pesan confession utama tidak ditemukan."
      };
    }

    thread = await parentMessage.startThread({
      name: `confession-${parent.id}-reply`,
      autoArchiveDuration: 1440,
      reason: `Thread for confession #${parent.id}`
    });

    updateEntry(parent.id, (current) => ({
      ...current,
      threadId: thread.id
    }));
  }

  if (!thread.isThread()) {
    return {
      ok: false,
      reason: "Thread balasan confession tidak tersedia."
    };
  }

  const entry = createEntry({
    guildId: interaction.guildId,
    authorId: interaction.user.id,
    authorTag: interaction.user.tag,
    type: "reply",
    target: "",
    content: replyContent,
    createdAt: new Date().toISOString(),
    parentId: confessionId,
    publicMessageId: "",
    threadId: thread.id
  });

  const sentMessage = await thread.send({
    embeds: [buildConfessionReplyEmbed(entry, confessions.accentColor)],
    components: [buildReplyOnlyButton(confessionId)]
  });

  const updatedEntry = updateEntry(entry.id, (current) => ({
    ...current,
    publicMessageId: sentMessage.id
  }));

  await sendConfessionLog(interaction.guild, client, updatedEntry, "Confession Reply");

  return {
    ok: true,
    id: updatedEntry.id,
    parentId: confessionId
  };
}

module.exports = {
  CONFESSION_NEW_BUTTON_ID,
  CONFESSION_REPLY_MODAL_PREFIX,
  CONFESSION_REPLY_PREFIX,
  CONFESSION_NEW_MODAL_ID,
  buildConfessionPanel,
  buildNewConfessionModal,
  buildReplyConfessionModal,
  publishNewConfession,
  publishConfessionReply
};
