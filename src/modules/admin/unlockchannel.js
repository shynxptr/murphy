const { PermissionFlagsBits, ChannelType, EmbedBuilder } = require("discord.js");

function resolveChannels(message, args) {
  if (!args.length) {
    return [message.channel];
  }

  const channels = [];

  for (const arg of args) {
    const id = arg.replace(/[<#>]/g, "");
    const channel = message.guild.channels.cache.get(id);

    if (channel && channel.type === ChannelType.GuildText) {
      channels.push(channel);
    }
  }

  return channels;
}

module.exports = {
  name: "unlockchannel",
  description: "Unlock channel agar member biasa bisa mengirim pesan kembali.",
  aliases: ["unlock"],
  category: "admin",
  usage: "unlockchannel [#channel1 #channel2 ...]\nTanpa argumen = unlock channel saat ini.",
  async execute(message, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageChannels)) {
      await message.reply("Kamu butuh permission Manage Channels untuk command ini.");
      return;
    }

    const channels = resolveChannels(message, args);

    if (!channels.length) {
      await message.reply("Tidak ada channel teks valid yang ditemukan.");
      return;
    }

    const everyoneRole = message.guild.roles.everyone;
    const results = [];

    for (const channel of channels) {
      try {
        await channel.permissionOverwrites.edit(everyoneRole, {
          SendMessages: null,
          SendMessagesInThreads: null,
          CreatePublicThreads: null,
          CreatePrivateThreads: null,
          AddReactions: null
        });

        results.push({ channel, success: true });
      } catch (error) {
        results.push({ channel, success: false, error: error.message });
      }
    }

    const unlocked = results.filter((entry) => entry.success);
    const failed = results.filter((entry) => !entry.success);

    const description = [
      unlocked.length ? `🔓 **Unlocked:** ${unlocked.map((entry) => `${entry.channel}`).join(", ")}` : null,
      failed.length ? `❌ **Gagal:** ${failed.map((entry) => `${entry.channel} — ${entry.error}`).join("\n")}` : null
    ].filter(Boolean).join("\n\n");

    const embed = new EmbedBuilder()
      .setColor(unlocked.length ? "#10b981" : "#ef4444")
      .setTitle("🔓 Unlock Channel")
      .setDescription(description)
      .setFooter({ text: `${unlocked.length}/${results.length} channel berhasil di-unlock` })
      .setTimestamp();

    await message.reply({ embeds: [embed] });
  }
};
