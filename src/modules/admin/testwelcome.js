const { PermissionFlagsBits } = require("discord.js");
const { resolveTextChannel } = require("../../utils/channelResolver");
const { sendWelcomeMessage, sendPublicWelcomeMessage } = require("../community/welcome");

module.exports = {
  name: "testwelcome",
  description: "Preview welcome message di channel target atau channel welcome aktif.",
  category: "admin",
  usage: "testwelcome [#channel]",
  async execute(message, args, client) {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
      await message.reply("Kamu butuh permission Manage Server untuk command ini.");
      return;
    }

    const targetChannel = args[0] ? resolveTextChannel(message, args[0]) : null;

    if (args[0] && !targetChannel) {
      await message.reply("Channel tidak valid. Kirim mention channel teks yang benar.");
      return;
    }

    const sent = await sendWelcomeMessage(message.member, client, targetChannel);

    if (!sent) {
      await message.reply("Welcome channel belum valid. Atur dulu dengan `sksetwelcome #channel`.");
      return;
    }

    await sendPublicWelcomeMessage(message.member, client);

    if (targetChannel) {
      await message.reply(`Preview welcome dikirim ke ${targetChannel}.`);
      return;
    }

    await message.reply("Preview welcome dikirim ke welcome channel aktif.");
  }
};
