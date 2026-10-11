const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle
} = require("discord.js");
const { createQuoteCard } = require("./quoteCard");

const QUOTE_CREATE_BUTTON_ID = "quote:new";
const QUOTE_CREATE_MODAL_ID = "quote:modal:new";
const QUOTE_INPUT_ID = "quote:text";

function normalizeQuoteText(input) {
  return input.replace(/\s+/g, " ").trim();
}

function clipQuoteText(text) {
  if (text.length <= 220) {
    return text;
  }

  return `${text.slice(0, 217).trimEnd()}...`;
}

function buildQuoteModal() {
  return new ModalBuilder()
    .setCustomId(QUOTE_CREATE_MODAL_ID)
    .setTitle("Buat Quote")
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId(QUOTE_INPUT_ID)
          .setLabel("Isi quote")
          .setRequired(true)
          .setMaxLength(220)
          .setStyle(TextInputStyle.Paragraph)
      )
    );
}

function buildQuoteButtonRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(QUOTE_CREATE_BUTTON_ID)
      .setLabel("Add Quote")
      .setStyle(ButtonStyle.Secondary)
  );
}

function formatGeneratedAt(date = new Date()) {
  const formatter = new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });

  return formatter.format(date).replace(".", ":");
}

async function sendQuoteMessage(channel, sourceUser, quoteText, replyTarget = null) {
  const normalizedText = clipQuoteText(normalizeQuoteText(quoteText));
  const quoteCard = await createQuoteCard(sourceUser, normalizedText);
  const embed = new EmbedBuilder()
    .setColor("#111111")
    .setTitle("Quotes")
    .setDescription(`Made by <@${sourceUser.id}>`)
    .setImage("attachment://murphy-quote.png")
    .setFooter({
      text: `Generated | ${formatGeneratedAt()}`
    });

  const sentMessage = await channel.send({
    embeds: [embed],
    files: [quoteCard],
    components: [buildQuoteButtonRow()],
    reply: replyTarget ? { messageReference: replyTarget.id } : undefined
  });

  return sentMessage;
}

async function publishQuoteFromMessage(message, args) {
  let sourceUser = message.author;
  let quoteText = normalizeQuoteText(args.join(" "));

  if (message.reference?.messageId) {
    const referencedMessage = await message.fetchReference().catch(() => null);

    if (referencedMessage) {
      sourceUser = referencedMessage.author;
      quoteText = normalizeQuoteText(referencedMessage.content || quoteText);
    }
  }

  if (!quoteText) {
    await message.reply("Kirim teks quote atau reply pesan yang ingin dijadikan quote.");
    return;
  }

  await sendQuoteMessage(message.channel, sourceUser, quoteText, message);
}

async function publishQuoteFromInteraction(interaction) {
  const quoteText = interaction.fields.getTextInputValue(QUOTE_INPUT_ID).trim();

  if (!quoteText) {
    return {
      ok: false,
      reason: "Isi quote tidak boleh kosong."
    };
  }

  await sendQuoteMessage(interaction.channel, interaction.user, quoteText);

  return {
    ok: true
  };
}

module.exports = {
  QUOTE_CREATE_BUTTON_ID,
  QUOTE_CREATE_MODAL_ID,
  buildQuoteModal,
  name: "quote",
  description: "Buat quote image dari reply atau teks manual.",
  category: "general",
  usage: "quote [teks] atau reply pesan lalu ketik quote",
  async execute(message, args) {
    await publishQuoteFromMessage(message, args);
  },
  publishQuoteFromInteraction
};
