const { PermissionFlagsBits } = require("discord.js");
const { resolveTextChannel } = require("../../utils/channelResolver");
const { replyWithTemporaryMessage } = require("../leaderboards/leaderboardSystem");
const {
  refreshMusicBoardForGuild,
  setMusicBoardChannel
} = require("../music/musicBoardSystem");

module.exports = {
  name: "setmusicboard",
  description: "Atur channel untuk Murphy Music List.",
  aliases: ["setmusicchannel", "setmusicboardchannel"],
  category: "admin",
  usage: "setmusicboard [#channel]",
  async execute(message, args, client) {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
      await replyWithTemporaryMessage(message, "Kamu butuh permission Manage Server untuk command ini.", client);
      return;
    }

    const channel = resolveTextChannel(message, args[0]);

    if (!channel) {
      await replyWithTemporaryMessage(
        message,
        "Channel music board tidak valid. Mention channel teks atau jalankan di channel target.",
        client
      );
      return;
    }

    setMusicBoardChannel(message.guild.id, channel.id);
    const refreshed = await refreshMusicBoardForGuild(message.guild, { force: true }).catch(() => false);

    await replyWithTemporaryMessage(
      message,
      refreshed
        ? `Music board diset ke ${channel} dan berhasil dikirim.`
        : `Music board diset ke ${channel}, tapi board belum sempat dikirim sekarang.`,
      client
    );
  }
};
