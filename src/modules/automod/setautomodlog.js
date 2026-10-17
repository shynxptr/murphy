const { PermissionFlagsBits } = require("discord.js");
const { resolveLogChannel } = require("../../utils/channelResolver");
const { setAutomodLogChannel } = require("./automodSystem");

function buildReply(color, title, description) {
  return {
    embeds: [
      {
        color,
        title,
        description,
        timestamp: new Date().toISOString()
      }
    ]
  };
}

module.exports = {
  name: "setautomodlog",
  description: "Set channel log yang sama untuk semua kategori automod (quick setup). Untuk set per kategori, pakai: automod logchannel <kategori> <#channel>",
  category: "admin",
  usage: "setautomodlog [#channel]",
  async execute(message, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
      await message.reply(buildReply(0xef4444, "Automod Error", "Kamu butuh permission Manage Server untuk command ini."));
      return;
    }

    const channel = resolveLogChannel(message, args[0]);

    if (!channel) {
      await message.reply(
        buildReply(
          0xef4444,
          "Automod Error",
          "Channel log tidak valid. Mention channel teks atau forum, atau jalankan di channel target."
        )
      );
      return;
    }

    setAutomodLogChannel(message.guild.id, channel.id);
    await message.reply(
      buildReply(
        0x10b981,
        "Automod Updated",
        `Log channel untuk semua kategori automod (antiInvite, antiLink, mentionLimit, badWords) diset ke ${channel}.\n\nUntuk atur forum per kategori secara terpisah, pakai: \`automod logchannel <kategori> <#channel>\``
      )
    );
  }
};
