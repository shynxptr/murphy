const { ChannelType, EmbedBuilder, AttachmentBuilder } = require("discord.js");
const fs = require("node:fs");
const path = require("node:path");
const { getEffectiveGuildSettings } = require("../../utils/guildSettings");
const { createWelcomeCard } = require("./welcomeCard");

function buildChannelLine(channelId, fallbackLabel) {
  return channelId ? `<#${channelId}>` : fallbackLabel;
}

function buildPublicWelcomeText(member, client) {
  const { welcome } = getEffectiveGuildSettings(member.guild.id, client);
  const rulesChannel = buildChannelLine(welcome.rulesChannelId, "`rules belum diatur`");
  const rolesChannel = "<#1558526617071128686>";

  const variants = [
    [
      `Halo ${member}! Selamat datang di **Murphy**! 🎉`,
      "Senang banget kamu bisa bergabung di sini. Biar makin seru, yuk langsung cek channel ini:",
      `✨ **Roles:** ${rolesChannel}`,
      `📜 **Rules:** ${rulesChannel}`,
      "",
      "**Semoga betah & happy chatting di sini ya! ✨**"
    ].join("\n"),
    [
      `Welcome to **Murphy**, ${member}! 👋`,
      "Halo! Selamat bergabung di komunitas kita. Biar makin akrab, yuk cek poin penting ini:",
      `🎭 **Pick Roles:** ${rolesChannel}`,
      `📋 **Baca Rules:** ${rulesChannel}`,
      "",
      "**Feel free to chat and make yourself at home! 💖**"
    ].join("\n"),
    [
      `Yoo ${member}! Selamat datang di **Murphy**! 🚀`,
      "Senang banget ada member baru yang join! Biar gak bingung, ini beberapa channel utama kita:",
      `📌 **Rules:** ${rulesChannel}`,
      `🎭 **Self Roles:** ${rolesChannel}`,
      "",
      "**Enjoy your stay and have fun! 🌟**"
    ].join("\n"),
    [
      `Yay, ada teman baru! Selamat datang di **Murphy**, ${member}! ✨`,
      "Yuk langsung seru-seruan bareng kita! Jangan lupa mampir ke channel ini ya:",
      `✨ **Roles:** ${rolesChannel}`,
      `📜 **Rules:** ${rulesChannel}`,
      "",
      "**Semoga nyaman dan betah di Murphy! 🎉**"
    ].join("\n"),
    [
      `Halo ${member}! Welcome to the **Murphy** family! ❤️`,
      "Terima kasih sudah bergabung bersama kami. Yuk mulai perjalananmu dari sini:",
      `🎭 **Roles:** ${rolesChannel}`,
      `📋 **Rules:** ${rulesChannel}`,
      "",
      "**Make yourself comfortable and enjoy the vibe! ✨**"
    ].join("\n")
  ];

  return variants[Math.floor(Math.random() * variants.length)];
}

function buildWelcomeEmbed(member, client) {
  const { welcome } = getEffectiveGuildSettings(member.guild.id, client);
  const rulesChannel = buildChannelLine(welcome.rulesChannelId, "`rules belum diatur`");
  const rolesChannel = "<#1558526617071128686>";

  return new EmbedBuilder()
    .setColor(welcome.accentColor)
    .setAuthor({
      name: "Murphy Welcome"
    })
    .setTitle("Welcome to Murphy! 🎉")
    .setDescription(
      [
        `Welcome, ${member}! We're super excited to have you here.`,
        "",
        `✨ Claim your roles in ${rolesChannel}`,
        `📜 Read our rules in ${rulesChannel}`,
        "",
        "Make yourself at home and enjoy your stay! ❤️"
      ].join("\n")
    )
    .setImage("attachment://welcome-card.png")
    .setFooter({
      text: `Member #${member.guild.memberCount}`
    })
    .setTimestamp();
}

async function sendWelcomeMessage(member, client, channelOverride = null) {
  const { welcome } = getEffectiveGuildSettings(member.guild.id, client);
  const targetChannel = channelOverride || await member.guild.channels.fetch(welcome.channelId).catch(() => null);

  if (!targetChannel || targetChannel.type !== ChannelType.GuildText) {
    return false;
  }

  const welcomeCard = await createWelcomeCard(member, welcome.accentColor);
  const embeds = [buildWelcomeEmbed(member, client)];
  const files = [welcomeCard];

  const gifPath = path.join(__dirname, "..", "..", "..", "assets", "bannergif.gif");
  if (fs.existsSync(gifPath)) {
    const gifAttachment = new AttachmentBuilder(gifPath, { name: "bannergif.gif" });
    const gifEmbed = new EmbedBuilder()
      .setColor(welcome.accentColor)
      .setImage("attachment://bannergif.gif");

    embeds.push(gifEmbed);
    files.push(gifAttachment);
  }

  await targetChannel.send({
    embeds,
    files
  });

  return true;
}

async function sendPublicWelcomeMessage(member, client) {
  const { welcome } = getEffectiveGuildSettings(member.guild.id, client);

  if (!welcome.publicChannelId) {
    return false;
  }

  const targetChannel = await member.guild.channels.fetch(welcome.publicChannelId).catch(() => null);

  if (!targetChannel || targetChannel.type !== ChannelType.GuildText) {
    return false;
  }

  await targetChannel.send({
    content: buildPublicWelcomeText(member, client)
  });

  return true;
}

module.exports = {
  buildWelcomeEmbed,
  buildPublicWelcomeText,
  sendWelcomeMessage,
  sendPublicWelcomeMessage
};
