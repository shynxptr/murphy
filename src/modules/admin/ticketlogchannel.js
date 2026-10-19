const { ChannelType, PermissionFlagsBits, SlashCommandBuilder } = require("discord.js");
const { getTicketLogSettings, setTicketLogChannel } = require("../../services/ticketLogSystem");

const TICKET_LOG_THREAD_NAME = "Ticket Log";

const slashData = new SlashCommandBuilder()
  .setName("ticketlogchannel")
  .setDescription("Atur forum/text channel log untuk tiket")
  .setDMPermission(false)
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addSubcommand((sub) =>
    sub.setName("status").setDescription("Lihat channel log tiket yang sudah diset")
  )
  .addSubcommand((sub) =>
    sub
      .setName("set")
      .setDescription("Set channel log tiket")
      .addChannelOption((opt) =>
        opt
          .setName("channel")
          .setDescription("Forum/Text channel target")
          .setRequired(true)
          .addChannelTypes(ChannelType.GuildForum, ChannelType.GuildText)
      )
  )
  .addSubcommand((sub) =>
    sub.setName("clear").setDescription("Hapus channel log tiket")
  );

function buildStatusEmbed(guild) {
  const settings = getTicketLogSettings(guild.id);
  const channelId = settings.channelId;

  return {
    embeds: [
      {
        color: 0x111827,
        title: "Ticket Log Channel",
        description: channelId
          ? `Channel log tiket: <#${channelId}>\n\nSemua log tiket (open, close, claim, approve) bakal masuk ke thread "${TICKET_LOG_THREAD_NAME}" di forum channel ini, atau langsung ke channel kalau text channel.`
          : "`Belum diset`\n\nGunakan `/ticketlogchannel set` untuk mengatur channel log tiket.",
        timestamp: new Date().toISOString()
      }
    ]
  };
}

module.exports = {
  name: "ticketlogchannel",
  description: "Atur forum/text channel log untuk tiket.",
  category: "admin",
  adminOnly: true,
  slashData,
  usage: "/ticketlogchannel <status|set|clear>",
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
      setTicketLogChannel(interaction.guildId, channel.id);

      const typeLabel = channel.type === ChannelType.GuildForum ? "Forum" : "Text";
      const note = channel.type === ChannelType.GuildForum
        ? "\nSemua log tiket bakal masuk ke satu thread di forum itu."
        : "\nLog tiket bakal dikirim langsung ke channel itu.";

      await interaction.editReply(
        `Ticket log channel diset ke ${channel} (${typeLabel} channel).${note}`
      );
      return;
    }

    if (sub === "clear") {
      setTicketLogChannel(interaction.guildId, "");
      await interaction.editReply("Ticket log channel berhasil dihapus.");
      return;
    }

    await interaction.editReply("Subcommand tidak dikenali.");
  }
};
