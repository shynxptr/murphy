const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  SlashCommandBuilder
} = require("discord.js");
const { buildAdminTargetsEmbed } = require("./inviteTracker");

module.exports = {
  name: "invitetargets",
  aliases: ["ftargetadmin", "targetadmin", "finvitetargets", "fadmininvites", "admininvites"],
  category: "admin",
  description: "Cek ringkasan pencapaian target harian invite seluruh staff/admin.",
  usage: "invitetargets",
  slashData: new SlashCommandBuilder()
    .setName("invitetargets")
    .setDescription("Lihat ringkasan capaian target harian invite seluruh staff/admin"),

  async execute(message, args, client) {
    const embed = await buildAdminTargetsEmbed(message.guild);
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("invite_targets_refresh")
        .setLabel("🔄 Refresh")
        .setStyle(ButtonStyle.Secondary)
    );

    return message.reply({
      embeds: [embed],
      components: [row]
    });
  },

  async executeSlash(interaction, client) {
    const embed = await buildAdminTargetsEmbed(interaction.guild);
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("invite_targets_refresh")
        .setLabel("🔄 Refresh")
        .setStyle(ButtonStyle.Secondary)
    );

    return interaction.reply({
      embeds: [embed],
      components: [row]
    });
  }
};
