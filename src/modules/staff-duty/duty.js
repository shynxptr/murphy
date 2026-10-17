const { SlashCommandBuilder, MessageFlags } = require("discord.js");
const { toggleDuty, isStaffMember } = require("./slash");

const slashData = new SlashCommandBuilder()
  .setName("duty")
  .setDescription("Toggle status On Duty / Off Duty (staff only)")
  .setDMPermission(false);

async function executeSlash(interaction, client) {
  if (!interaction.inGuild()) {
    await interaction.reply({ content: "Command ini hanya bisa dipakai di server.", flags: MessageFlags.Ephemeral });
    return;
  }

  await toggleDuty(interaction, client);
}

module.exports = {
  slashData,
  executeSlash
};
