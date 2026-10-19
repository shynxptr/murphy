const { ChannelType, PermissionFlagsBits, SlashCommandBuilder } = require("discord.js");
const { getMsgDeleteLogSettings, setMsgDeleteLogChannel } = require("../../services/messageDeleteLogSystem");

const MSG_DELETE_LOG_THREAD_NAME = "Message Delete Log";

const slashData = new SlashCommandBuilder()
  .setName("msglogchannel")
  .setDescription("Atur forum/text channel log untuk pesan yang dihapus")
  .setDMPermission(false)
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addSubcommand((sub) =>
    sub.setName("status").setDescription("Lihat channel log hapus pesan yang sudah diset")
  )
  .addSubcommand((sub) =>
    sub
      .setName("set")
      .setDescription("Set channel log hapus pesan")
      .addChannelOption((opt) =>
        opt
          .setName("channel")
          .setDescription("Forum/Text channel target")
          .setRequired(true)
          .addChannelTypes(ChannelType.GuildForum, ChannelType.GuildText)
      )
  )
  .addSubcommand((sub) =>
    sub.setName("clear").setDescription("Hapus channel log hapus pesan")
  );

function buildStatusEmbed(guild) {
  const settings = getMsgDeleteLogSettings(guild.id);
  const channelId = settings.channelId;

  return {
    embeds: [
      {
        color: 0x111827,
        title: "Message Delete Log Channel",
        description: channelId
          ? `Channel log hapus pesan: <#${channelId}>\n\nSemua log pesan yang dihapus bakal masuk ke thread "${MSG_DELETE_LOG_THREAD_NAME}" di forum channel ini, atau langsung ke channel kalau text channel.`
          : "`Belum diset`\n\nGunakan `/msglogchannel set` untuk mengatur channel log hapus pesan.",
        timestamp: new Date().toISOString()
      }
    ]
  };
}

module.exports = {
  name: "msglogchannel",
  description: "Atur forum/text channel log untuk pesan yang dihapus.",
  category: "admin",
  adminOnly: true,
  slashData,
  usage: "/msglogchannel <status|set|clear>",
  async executeSlash(interaction) {
    if (!interaction.inGuild()) {
      await interaction.reply({ content: "Command ini hanya bisa dipakai di server.", ephemeral: true });
      return;
    }

    await interaction.deferReply({ ephemeral: true });
    const sub = interaction.options.getSubcommand();

    if (sub === "status") {
      await interaction.editReply(buildStatusEmbed(interaction.guild));
      return;
    }

    if (sub === "set") {
      const channel = interaction.options.getChannel("channel", true);
      setMsgDeleteLogChannel(interaction.guildId, channel.id);

      const typeLabel = channel.type === ChannelType.GuildForum ? "Forum" : "Text";
      const note = channel.type === ChannelType.GuildForum
        ? "\nSemua log pesan yang dihapus bakal masuk ke satu thread di forum itu."
        : "\nLog pesan yang dihapus bakal dikirim langsung ke channel itu.";

      await interaction.editReply(
        `Message delete log channel diset ke ${channel} (${typeLabel} channel).${note}`
      );
      return;
    }

    if (sub === "clear") {
      setMsgDeleteLogChannel(interaction.guildId, "");
      await interaction.editReply("Message delete log channel berhasil dihapus.");
      return;
    }

    await interaction.editReply("Subcommand tidak dikenali.");
  }
};
