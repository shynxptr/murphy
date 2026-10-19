const { ChannelType, PermissionFlagsBits, SlashCommandBuilder } = require("discord.js");
const {
  TICKET_LOG_CATEGORIES,
  getTicketLogSettings,
  setTicketLogChannelForCategory
} = require("../../services/ticketLogSystem");

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

const slashData = new SlashCommandBuilder()
  .setName("ticketlogchannel")
  .setDescription("Atur forum/text channel log per kategori tiket (open, close, claim, approve)")
  .setDMPermission(false)
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addSubcommand((sub) =>
    sub.setName("status").setDescription("Lihat semua channel log tiket yang sudah diset")
  )
  .addSubcommand((sub) =>
    sub
      .setName("set")
      .setDescription("Set channel log untuk kategori tiket tertentu")
      .addStringOption((opt) =>
        opt
          .setName("kategori")
          .setDescription("Kategori log tiket")
          .setRequired(true)
          .addChoices(TICKET_LOG_CATEGORIES.map((cat) => ({ name: cat.label, value: cat.key })))
      )
      .addChannelOption((opt) =>
        opt
          .setName("channel")
          .setDescription("Forum/Text channel target (kosongkan untuk clear)")
          .setRequired(false)
          .addChannelTypes(ChannelType.GuildForum, ChannelType.GuildText)
      )
  )
  .addSubcommand((sub) =>
    sub
      .setName("clear")
      .setDescription("Hapus channel log untuk kategori tiket tertentu")
      .addStringOption((opt) =>
        opt
          .setName("kategori")
          .setDescription("Kategori log tiket yang ingin di-clear")
          .setRequired(true)
          .addChoices(TICKET_LOG_CATEGORIES.map((cat) => ({ name: cat.label, value: cat.key })))
      )
  );

function buildStatusEmbed(guild) {
  const settings = getTicketLogSettings(guild.id);
  const lines = TICKET_LOG_CATEGORIES.map((cat) => {
    const channelId = settings.channels?.[cat.key];
    return `${cat.label}: ${channelId ? `<#${channelId}>` : "`none`"}`;
  }).join("\n");

  return {
    embeds: [
      {
        color: 0x111827,
        title: "Ticket Log Channels",
        description: lines || "`none`",
        timestamp: new Date().toISOString()
      }
    ]
  };
}

module.exports = {
  name: "ticketlogchannel",
  description: "Atur channel log per kategori tiket (open, close, claim, approve).",
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
      const categoryKey = interaction.options.getString("kategori", true);
      const channel = interaction.options.getChannel("channel");

      if (!channel) {
        setTicketLogChannelForCategory(interaction.guildId, categoryKey, "");
        const cat = TICKET_LOG_CATEGORIES.find((c) => c.key === categoryKey);
        await interaction.editReply(
          `Log channel untuk **${cat?.label || categoryKey}** dimatikan.`
        );
        return;
      }

      setTicketLogChannelForCategory(interaction.guildId, categoryKey, channel.id);
      const cat = TICKET_LOG_CATEGORIES.find((c) => c.key === categoryKey);
      const typeLabel = channel.type === ChannelType.GuildForum ? "Forum" : "Text";
      await interaction.editReply(
        `Log **${cat?.label || categoryKey}** diset ke ${channel} (${typeLabel} channel).\nSemua log kategori itu bakal masuk ke thread yang sama di channel itu.`
      );
      return;
    }

    if (sub === "clear") {
      const categoryKey = interaction.options.getString("kategori", true);
      setTicketLogChannelForCategory(interaction.guildId, categoryKey, "");
      const cat = TICKET_LOG_CATEGORIES.find((c) => c.key === categoryKey);
      await interaction.editReply(
        `Log channel untuk **${cat?.label || categoryKey}** berhasil dihapus.`
      );
      return;
    }

    await interaction.editReply("Subcommand tidak dikenali.");
  }
};
