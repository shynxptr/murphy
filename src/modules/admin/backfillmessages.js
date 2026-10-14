const { PermissionFlagsBits, ChannelType } = require("discord.js");
const { incrementChatCount } = require("../../services/leaderboardStore");
const { replyWithTemporaryMessage } = require("../leaderboards/leaderboardSystem");

module.exports = {
  name: "backfillmessages",
  description: "Hitung ulang pesan historis dari semua channel text (fetch dari Discord API).",
  aliases: ["backfillchat", "countmessages"],
  category: "admin",
  usage: "backfillmessages [limit-per-channel]",
  async execute(message, args, client) {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
      await replyWithTemporaryMessage(message, "Kamu butuh permission Manage Server untuk command ini.", client);
      return;
    }

    const limitPerChannel = Math.min(Math.max(Number.parseInt(args[0], 10) || 100, 1), 1000);

    const statusMsg = await message.reply({
      content: "Memulai backfill pesan... Ini bisa memakan waktu cukup lama. Tunggu ya."
    }).catch(() => null);

    const textChannels = message.guild.channels.cache.filter(
      (ch) => ch.type === ChannelType.GuildText && ch.viewable
    );

    const guildId = message.guild.id;
    let totalMessages = 0;
    let totalUsers = new Set();
    let channelsProcessed = 0;

    for (const channel of textChannels.values()) {
      try {
        let lastMessageId = undefined;
        let channelCount = 0;

        // Fetch pesan secara paginasi (100 per batch, max limitPerChannel)
        while (channelCount < limitPerChannel) {
          const fetchOptions = { limit: Math.min(100, limitPerChannel - channelCount) };
          if (lastMessageId) {
            fetchOptions.before = lastMessageId;
          }

          const messages = await channel.messages.fetch(fetchOptions).catch(() => null);

          if (!messages || messages.size === 0) {
            break;
          }

          for (const msg of messages.values()) {
            if (msg.author && !msg.author.bot) {
              incrementChatCount(guildId, msg.author.id, channel.id, 1);
              totalUsers.add(msg.author.id);
            }
          }

          channelCount += messages.size;
          totalMessages += messages.size;
          lastMessageId = messages.last()?.id;

          if (messages.size < 100) {
            break;
          }
        }

        channelsProcessed++;

        // Update status setiap 3 channel
        if (statusMsg && channelsProcessed % 3 === 0) {
          await statusMsg.edit({
            content: `Backfill progress: ${channelsProcessed}/${textChannels.size} channel diproses, ${totalMessages} pesan ditemukan...`
          }).catch(() => null);
        }
      } catch (error) {
        console.error(`[Backfill] Gagal fetch channel ${channel.name}:`, error);
      }
    }

    if (statusMsg) {
      await statusMsg.edit({
        content: `Backfill selesai! ${channelsProcessed} channel diproses, ${totalMessages} pesan dihitung dari ${totalUsers.size} user. Leaderboard & status card sekarang sudah termutakhirkan.`
      }).catch(() => null);
    }
  }
};
