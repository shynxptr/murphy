const { PermissionFlagsBits } = require("discord.js");
const { replyWithTemporaryMessage } = require("../leaderboards/leaderboardSystem");
const { refreshMusicBoardForGuild } = require("../music/musicBoardSystem");

module.exports = {
  name: "refreshmusicboard",
  description: "Paksa refresh Murphy Music List.",
  aliases: ["updatemusicboard", "musicboardrefresh"],
  category: "admin",
  usage: "refreshmusicboard",
  async execute(message, args, client) {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
      await replyWithTemporaryMessage(message, "Kamu butuh permission Manage Server untuk command ini.", client);
      return;
    }

    const refreshed = await refreshMusicBoardForGuild(message.guild, { force: true }).catch(() => false);

    await replyWithTemporaryMessage(
      message,
      refreshed
        ? "Music board berhasil diperbarui."
        : "Music board belum bisa diperbarui. Pastikan channel music board sudah diset.",
      client
    );
  }
};
