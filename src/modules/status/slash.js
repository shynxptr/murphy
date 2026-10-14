const { SlashCommandBuilder } = require("discord.js");
const { buildStatusSnapshot } = require("./statusSystem");
const { createStatusCard } = require("./statusCard");

module.exports = {
  name: "status",
  slashData: new SlashCommandBuilder()
    .setName("status")
    .setDescription("Lihat statistik server member dalam bentuk kartu")
    .setDMPermission(false)
    .addUserOption((option) =>
      option
        .setName("member")
        .setDescription("Member target")
        .setRequired(false)
    ),
  async executeSlash(interaction) {
    if (!interaction.inGuild()) {
      await interaction.reply({
        content: "Command ini hanya bisa dipakai di server.",
        ephemeral: true
      });
      return;
    }

    const targetUser = interaction.options.getUser("member") || interaction.user;
    const targetMember = interaction.options.getMember("member")
      || await interaction.guild.members.fetch(targetUser.id).catch(() => null);

    if (!targetMember || targetMember.user.bot) {
      await interaction.reply({
        content: "Member target tidak valid atau merupakan bot.",
        ephemeral: true
      });
      return;
    }

    await interaction.deferReply();

    const snapshot = buildStatusSnapshot(interaction.guild, targetMember);
    const card = await createStatusCard(snapshot);

    await interaction.editReply({ files: [card] });
  }
};
