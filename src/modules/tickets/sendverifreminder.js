const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  EmbedBuilder,
  PermissionFlagsBits,
  SlashCommandBuilder
} = require("discord.js");
const { resolveTextChannel } = require("../../utils/channelResolver");

const TICKET_CHANNEL_ID = "1542549784697638922";
const UNVERIFIED_GIRL_ROLE_ID = "1558510979380412446";
const VERIF_STAFF_ROLE_ID = "1558778004425932890";

function hasPermission(member) {
  if (!member) {
    return false;
  }

  if (member.id === member.guild?.ownerId) {
    return true;
  }

  if (member.permissions?.has(PermissionFlagsBits.Administrator)) {
    return true;
  }

  if (member.permissions?.has(PermissionFlagsBits.ManageGuild)) {
    return true;
  }

  if (member.permissions?.has(PermissionFlagsBits.ManageChannels)) {
    return true;
  }

  if (member.permissions?.has(PermissionFlagsBits.ManageMessages)) {
    return true;
  }

  if (member.roles?.cache?.has(VERIF_STAFF_ROLE_ID)) {
    return true;
  }

  return false;
}

function buildReminderPayload(guild, shouldPing) {
  const embed = new EmbedBuilder()
    .setColor("#f472b6")
    .setAuthor({
      name: "Murphy Verification",
      iconURL: guild.iconURL({ extension: "png" }) || undefined
    })
    .setDescription(
      [
        "halo. untuk menjaga kenyamanan dan menciptakan ruang yang aman bagi kita semua, kami perlu memastikan siapa saja yang menetap di murphy.",
        "",
        `bagi kamu yang belum terverifikasi (unverify girl), mari luangkan waktu sejenak. silakan buka tiket di <#${TICKET_CHANNEL_ID}> agar staf kami bisa menyapamu dan menyematkan role yang sesuai.`,
        "",
        "have u enjoy at murphy!"
      ].join("\n")
    )
    .setFooter({
      text: "Murphy Security & Verification",
      iconURL: guild.iconURL({ extension: "png" }) || undefined
    })
    .setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("ticket:type:verifikasi-girl")
      .setLabel("Buka Tiket Verifikasi")
      .setEmoji("🌸")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setStyle(ButtonStyle.Link)
      .setLabel("Ke Channel Tiket")
      .setEmoji("🎟️")
      .setURL(`https://discord.com/channels/${guild.id}/${TICKET_CHANNEL_ID}`)
  );

  const payload = {
    embeds: [embed],
    components: [row]
  };

  if (shouldPing) {
    payload.content = `<@&${UNVERIFIED_GIRL_ROLE_ID}>`;
    payload.allowedMentions = {
      roles: [UNVERIFIED_GIRL_ROLE_ID]
    };
  }

  return payload;
}

module.exports = {
  name: "sendverifreminder",
  description: "Kirim embed ajakan verifikasi untuk unverified girl.",
  aliases: ["remindverif", "verifreminder", "ajakverif"],
  category: "tickets",
  usage: "sendverifreminder [#channel] [--ping]",
  slashData: new SlashCommandBuilder()
    .setName("sendverifreminder")
    .setDescription("Kirim embed ajakan verifikasi untuk unverified girl.")
    .addChannelOption((option) =>
      option
        .setName("channel")
        .setDescription("Channel target pengiriman (opsional, default: channel saat ini)")
        .addChannelTypes(ChannelType.GuildText)
    )
    .addBooleanOption((option) =>
      option
        .setName("ping")
        .setDescription("Mention role Unverified Girl?")
    ),
  async execute(message, args, client) {
    if (!hasPermission(message.member)) {
      await message.reply("Kamu butuh permission staff untuk command ini.");
      return;
    }

    const channelArg = args.find((arg) => !/^(?:--ping|-p|ping)$/i.test(arg));
    const targetChannel = channelArg ? resolveTextChannel(message, channelArg) : message.channel;

    if (!targetChannel) {
      await message.reply("Channel tujuan tidak valid. Mention channel teks yang benar.");
      return;
    }

    const shouldPing = args.some((arg) => /^(?:--ping|-p|ping)$/i.test(arg));
    const payload = buildReminderPayload(message.guild, shouldPing);

    await targetChannel.send(payload);

    if (targetChannel.id !== message.channel.id) {
      await message.reply(`Pesan ajakan verifikasi berhasil dikirim ke ${targetChannel}.`);
    } else {
      await message.delete().catch(() => null);
    }
  },
  async executeSlash(interaction, client) {
    if (!hasPermission(interaction.member)) {
      await interaction.reply({
        content: "Kamu butuh permission staff untuk menjalankan command ini.",
        ephemeral: true
      });
      return;
    }

    const targetChannel = interaction.options.getChannel("channel") || interaction.channel;
    const shouldPing = Boolean(interaction.options.getBoolean("ping"));
    const payload = buildReminderPayload(interaction.guild, shouldPing);

    await targetChannel.send(payload);

    await interaction.reply({
      content: `Pesan ajakan verifikasi berhasil dikirim ke ${targetChannel}.`,
      ephemeral: true
    });
  }
};
