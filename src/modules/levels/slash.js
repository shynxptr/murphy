const {
  ChannelType,
  SlashCommandBuilder
} = require("discord.js");
const {
  LEVEL_MAX,
  LEVEL_MIN,
  buildLevelRoleStatusEmbed,
  buildLevelStatusEmbed,
  clampLevel,
  getMemberLevelInfo,
  hasLevelAdminPermission,
  setLevelAnnounceChannel,
  setLevelCadence,
  setLevelMinimumChatLength,
  setLevelRole,
  setLevelThreshold,
  setLevelXpReward,
  sendLevelUpTestNotification,
  syncLevelRolesForGuild,
  syncManualLevelForMember
} = require("./levelSystem");
const { createLevelGuidePayload } = require("./levelGuide");

function buildSettingsReply(interaction) {
  return {
    embeds: [buildLevelRoleStatusEmbed(interaction.guildId, interaction.client)],
    ephemeral: true
  };
}

const slashData = new SlashCommandBuilder()
  .setName("level")
  .setDescription("Lihat atau atur level member Murphy")
  .setDMPermission(false)
  .addSubcommand((subcommand) =>
    subcommand
      .setName("guide")
      .setDescription("Lihat panduan tier level dan benefit Murphy")
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName("status")
      .setDescription("Lihat status level member")
      .addUserOption((option) =>
        option
          .setName("member")
          .setDescription("Member target")
          .setRequired(false)
      )
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName("set")
      .setDescription("Atur tier level member")
      .addUserOption((option) =>
        option
          .setName("member")
          .setDescription("Member target")
          .setRequired(true)
      )
      .addIntegerOption((option) =>
        option
          .setName("value")
          .setDescription(`Level ${LEVEL_MIN}-${LEVEL_MAX}`)
          .setMinValue(LEVEL_MIN)
          .setMaxValue(LEVEL_MAX)
          .setRequired(true)
      )
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName("set-role")
      .setDescription("Atur atau kosongkan role untuk tier level tertentu")
      .addIntegerOption((option) =>
        option
          .setName("level")
          .setDescription(`Level ${LEVEL_MIN}-${LEVEL_MAX}`)
          .setMinValue(LEVEL_MIN)
          .setMaxValue(LEVEL_MAX)
          .setRequired(true)
      )
      .addRoleOption((option) =>
        option
          .setName("role")
          .setDescription("Role target, kosongkan untuk reset")
          .setRequired(false)
      )
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName("role-status")
      .setDescription("Lihat mapping role dan konfigurasi XP level")
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName("sync-roles")
      .setDescription("Sinkronkan role level untuk member atau seluruh server")
      .addUserOption((option) =>
        option
          .setName("member")
          .setDescription("Member target")
          .setRequired(false)
      )
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName("set-announce")
      .setDescription("Atur channel notifikasi level up")
      .addChannelOption((option) =>
        option
          .setName("channel")
          .setDescription("Channel target, kosongkan untuk reset ke auto")
          .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
          .setRequired(false)
      )
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName("set-threshold")
      .setDescription("Atur threshold XP untuk level tertentu")
      .addIntegerOption((option) =>
        option
          .setName("level")
          .setDescription("Target level 2-5")
          .setMinValue(2)
          .setMaxValue(LEVEL_MAX)
          .setRequired(true)
      )
      .addIntegerOption((option) =>
        option
          .setName("xp")
          .setDescription("Jumlah XP threshold")
          .setMinValue(0)
          .setRequired(true)
      )
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName("set-reward")
      .setDescription("Atur reward XP per sumber")
      .addStringOption((option) =>
        option
          .setName("source")
          .setDescription("Sumber XP")
          .addChoices(
            { name: "chat", value: "chat" },
            { name: "voice", value: "voice" },
            { name: "streak", value: "streak" }
          )
          .setRequired(true)
      )
      .addIntegerOption((option) =>
        option
          .setName("amount")
          .setDescription("Jumlah XP per reward")
          .setMinValue(0)
          .setRequired(true)
      )
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName("set-cadence")
      .setDescription("Atur interval reward XP untuk chat atau voice")
      .addStringOption((option) =>
        option
          .setName("target")
          .setDescription("Cadence target")
          .addChoices(
            { name: "chat", value: "chat" },
            { name: "voice", value: "voice" }
          )
          .setRequired(true)
      )
      .addIntegerOption((option) =>
        option
          .setName("minutes")
          .setDescription("Jumlah menit")
          .setMinValue(1)
          .setRequired(true)
      )
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName("set-min-length")
      .setDescription("Atur minimal karakter chat untuk dapat XP")
      .addIntegerOption((option) =>
        option
          .setName("value")
          .setDescription("Jumlah karakter")
          .setMinValue(0)
          .setRequired(true)
      )
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName("testup")
      .setDescription("Munculkan preview notifikasi level up")
      .addUserOption((option) =>
        option
          .setName("member")
          .setDescription("Member target")
          .setRequired(true)
      )
      .addIntegerOption((option) =>
        option
          .setName("level")
          .setDescription("Level target preview 2-5")
          .setMinValue(2)
          .setMaxValue(LEVEL_MAX)
          .setRequired(true)
      )
  );

module.exports = {
  slashData,
  async executeSlash(interaction) {
    if (!interaction.inGuild()) {
      await interaction.reply({
        content: "Command ini hanya bisa dipakai di server.",
        ephemeral: true
      });
      return;
    }

    const subcommand = interaction.options.getSubcommand();

    if (subcommand === "guide") {
      await interaction.deferReply();
      await interaction.editReply(await createLevelGuidePayload());
      return;
    }

    const targetUser = interaction.options.getUser("member") || interaction.user;
    const targetMember = interaction.options.getMember("member")
      || await interaction.guild.members.fetch(targetUser.id).catch(() => null);

    if (subcommand === "status") {
      const levelInfo = getMemberLevelInfo(interaction.guildId, targetUser.id, interaction.client);

      await interaction.reply({
        embeds: [buildLevelStatusEmbed(interaction.guild, targetMember || targetUser, levelInfo)],
        ephemeral: true
      });
      return;
    }

    if (subcommand === "role-status") {
      if (!hasLevelAdminPermission(interaction.member)) {
        await interaction.reply({
          content: "Kamu butuh permission Manage Server untuk melihat pengaturan level.",
          ephemeral: true
        });
        return;
      }

      await interaction.reply(buildSettingsReply(interaction));
      return;
    }

    if (!hasLevelAdminPermission(interaction.member)) {
      await interaction.reply({
        content: "Kamu butuh permission Manage Server untuk mengatur progression level.",
        ephemeral: true
      });
      return;
    }

    if (subcommand === "set-role") {
      const targetLevel = clampLevel(interaction.options.getInteger("level", true));
      const role = interaction.options.getRole("role");
      setLevelRole(interaction.guildId, targetLevel, role?.id || "");

      await interaction.reply(buildSettingsReply(interaction));
      return;
    }

    if (subcommand === "set-announce") {
      const channel = interaction.options.getChannel("channel");
      setLevelAnnounceChannel(interaction.guildId, channel?.id || "");

      await interaction.reply({
        content: channel
          ? `Channel notifikasi level up diset ke ${channel}.`
          : "Channel notifikasi level up direset ke mode auto.",
        ephemeral: true
      });
      return;
    }

    if (subcommand === "set-threshold") {
      const targetLevel = interaction.options.getInteger("level", true);
      const xp = interaction.options.getInteger("xp", true);
      const result = setLevelThreshold(interaction.guildId, targetLevel, xp, interaction.client);

      await interaction.reply(result.ok
        ? buildSettingsReply(interaction)
        : {
          content: result.reason,
          ephemeral: true
        });
      return;
    }

    if (subcommand === "set-reward") {
      const source = interaction.options.getString("source", true);
      const amount = interaction.options.getInteger("amount", true);
      const result = setLevelXpReward(interaction.guildId, source, amount);

      await interaction.reply(result.ok
        ? buildSettingsReply(interaction)
        : {
          content: result.reason,
          ephemeral: true
        });
      return;
    }

    if (subcommand === "set-cadence") {
      const target = interaction.options.getString("target", true);
      const minutes = interaction.options.getInteger("minutes", true);
      const result = setLevelCadence(interaction.guildId, target, minutes);

      await interaction.reply(result.ok
        ? buildSettingsReply(interaction)
        : {
          content: result.reason,
          ephemeral: true
        });
      return;
    }

    if (subcommand === "set-min-length") {
      setLevelMinimumChatLength(interaction.guildId, interaction.options.getInteger("value", true));

      await interaction.reply(buildSettingsReply(interaction));
      return;
    }

    if (subcommand === "sync-roles") {
      const member = interaction.options.getMember("member");
      const synced = await syncLevelRolesForGuild(interaction.guild, interaction.client, member?.id || "");

      await interaction.reply({
        content: member
          ? `Role level untuk ${member} berhasil disinkronkan.`
          : `Sinkronisasi role level selesai untuk ${synced} member.`,
        ephemeral: true
      });
      return;
    }

    if (subcommand === "testup") {
      const member = interaction.options.getMember("member")
        || await interaction.guild.members.fetch(interaction.options.getUser("member", true).id).catch(() => null);
      const targetLevel = clampLevel(interaction.options.getInteger("level", true));

      if (!member || member.user.bot) {
        await interaction.reply({
          content: "Member target tidak valid atau merupakan bot.",
          ephemeral: true
        });
        return;
      }

      const sent = await sendLevelUpTestNotification(
        interaction.guild,
        member,
        targetLevel,
        interaction.client,
        interaction.channelId
      );

      await interaction.reply({
        content: sent
          ? `Preview level-up untuk ${member} berhasil dikirim ke channel ini.`
          : "Gagal mengirim preview level-up. Cek permission bot di channel ini.",
        ephemeral: true
      });
      return;
    }

    if (!targetMember || targetMember.user.bot) {
      await interaction.reply({
        content: "Member target tidak valid atau merupakan bot.",
        ephemeral: true
      });
      return;
    }

    const nextLevel = clampLevel(interaction.options.getInteger("value", true));
    await syncManualLevelForMember(targetMember, nextLevel, interaction.client, {
      source: "manual"
    });

    const levelInfo = getMemberLevelInfo(interaction.guildId, targetMember.id, interaction.client);

    await interaction.reply({
      embeds: [buildLevelStatusEmbed(interaction.guild, targetMember, levelInfo)],
      ephemeral: true
    });
  }
};
