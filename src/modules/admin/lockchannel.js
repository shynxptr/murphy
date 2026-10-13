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
  name: "lockchannel",
  description: "Lock channel agar member biasa tidak bisa mengirim pesan (read-only).",
  aliases: ["lock", "readonly"],
  category: "admin",
  usage: "lockchannel [#channel1 #channel2 ...]\nTanpa argumen = lock channel saat ini.",
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
          SendMessages: false,
          SendMessagesInThreads: false,
          CreatePublicThreads: false,
          CreatePrivateThreads: false,
          AddReactions: false
        });

        results.push({ channel, success: true });
      } catch (error) {
        results.push({ channel, success: false, error: error.message });
      }
    }

    const locked = results.filter((entry) => entry.success);
    const failed = results.filter((entry) => !entry.success);

    const description = [
      locked.length ? `🔒 **Locked:** ${locked.map((entry) => `${entry.channel}`).join(", ")}` : null,
      failed.length ? `❌ **Gagal:** ${failed.map((entry) => `${entry.channel} — ${entry.error}`).join("\n")}` : null
    ].filter(Boolean).join("\n\n");

    const embed = new EmbedBuilder()
      .setColor(locked.length ? "#10b981" : "#ef4444")
      .setTitle("🔒 Lock Channel")
      .setDescription(description)
      .setFooter({ text: `${locked.length}/${results.length} channel berhasil di-lock` })
      .setTimestamp();

    await message.reply({ embeds: [embed] });
  }
};
