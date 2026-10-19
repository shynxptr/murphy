const {
  ChannelType,
  PermissionFlagsBits,
  SlashCommandBuilder
} = require("discord.js");
const { updateGuildSettings } = require("../../services/guildConfigService");
const { getEffectiveGuildSettings } = require("../../utils/guildSettings");

const slashData = new SlashCommandBuilder()
  .setName("setconfessionlog")
  .setDescription("Atur forum/text channel log untuk confession")
  .setDMPermission(false)
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addSubcommand((sub) =>
    sub.setName("status").setDescription("Lihat channel log confession yang sudah diset")
  )
  .addSubcommand((sub) =>
    sub
      .setName("set")
      .setDescription("Set channel log confession")
      .addChannelOption((opt) =>
        opt
          .setName("channel")
          .setDescription("Forum/Text channel target")
          .setRequired(true)
          .addChannelTypes(ChannelType.GuildForum, ChannelType.GuildText)
      )
  )
  .addSubcommand((sub) =>
    sub.setName("clear").setDescription("Hapus channel log confession")
  );

function buildStatusEmbed(guildId, client) {
  const { confessions } = getEffectiveGuildSettings(guildId, client);
  const channelId = confessions.logChannelId;
  const typeLabel = channelId ? "Diset" : "Belum diset";

  return {
    embeds: [
      {
        color: 0x111827,
        title: "Confession Log Channel",
        description: channelId
          ? `Channel log confession: <#${channelId}>\n\nUntuk forum channel, semua log bakal masuk ke thread per kategori (Confession / Confession Reply). Untuk text channel, log dikirim langsung.`
          : "`Belum diset`\n\nGunakan `/setconfessionlog set` untuk mengatur channel log confession.",
        timestamp: new Date().toISOString()
      }
    ]
  };
}

module.exports = {
  name: "setconfessionlog",
  description: "Atur forum/text channel log untuk confession.",
  category: "admin",
  adminOnly: true,
  slashData,
  usage: "/setconfessionlog <status|set|clear>",
  async executeSlash(interaction, client) {
    if (!interaction.inGuild()) {
      await interaction.reply({ content: "Command ini hanya bisa dipakai di server.", ephemeral: true });
      return;
    }

    await interaction.deferReply({ ephemeral: true });
    const sub = interaction.options.getSubcommand();

    if (sub === "status") {
      await interaction.editReply(buildStatusEmbed(interaction.guildId, client));
      return;
    }

    if (sub === "set") {
      const channel = interaction.options.getChannel("channel", true);

      updateGuildSettings(interaction.guildId, (current) => ({
        ...current,
        confessions: {
          ...client.config.confessions,
          ...(current.confessions || {}),
          logChannelId: channel.id
        }
      }));

      const typeLabel = channel.type === ChannelType.GuildForum ? "Forum" : "Text";
      const note = channel.type === ChannelType.GuildForum
        ? "\nSemua log confession bakal masuk ke thread per kategori (Confession / Confession Reply) di forum itu."
        : "\nLog confession bakal dikirim langsung ke channel itu.";

      await interaction.editReply(
        `Confession log channel diset ke ${channel} (${typeLabel} channel).${note}`
      );
      return;
    }

    if (sub === "clear") {
      updateGuildSettings(interaction.guildId, (current) => ({
        ...current,
        confessions: {
          ...client.config.confessions,
          ...(current.confessions || {}),
          logChannelId: ""
        }
      }));

      await interaction.editReply("Confession log channel berhasil dihapus.");
      return;
    }

    await interaction.editReply("Subcommand tidak dikenali.");
  }
};
