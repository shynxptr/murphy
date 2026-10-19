const { PermissionFlagsBits, ChannelType, SlashCommandBuilder } = require("discord.js");
const { resolveTextChannel, resolveLogChannel } = require("../../utils/channelResolver");
const {
  addBadWord,
  addWhitelistChannel,
  addWhitelistRole,
  AUTOMOD_LOG_CATEGORIES,
  buildAutomodStatusEmbed,
  removeBadWord,
  removeWhitelistChannel,
  removeWhitelistRole,
  setAutomodLogChannelForCategory,
  setAutomodRuleEnabled,
  setMentionLimit
} = require("./automodSystem");

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

async function replyError(message, description) {
  await message.reply(buildReply(0xef4444, "Automod Error", description));
}

async function replySuccess(message, description) {
  await message.reply(buildReply(0x10b981, "Automod Updated", description));
}

function parseToggle(value) {
  const normalized = value?.toLowerCase();

  if (["on", "enable", "enabled"].includes(normalized)) {
    return true;
  }

  if (["off", "disable", "disabled"].includes(normalized)) {
    return false;
  }

  return null;
}

function resolveRole(message, input) {
  const roleId = input?.replace(/[<@&>]/g, "") || "";
  return roleId ? message.guild.roles.cache.get(roleId) || null : null;
}

const slashData = new SlashCommandBuilder()
  .setName("automod")
  .setDescription("Kelola Automod Lite (rules, bad words, whitelist, log channel)")
  .setDMPermission(false)
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addSubcommand((sub) =>
    sub.setName("status").setDescription("Lihat status semua rule dan konfigurasi automod")
  )
  .addSubcommand((sub) =>
    sub
      .setName("logchannel")
      .setDescription("Set forum/text channel log untuk kategori pelanggaran tertentu")
      .addStringOption((opt) =>
        opt
          .setName("kategori")
          .setDescription("Kategori pelanggaran")
          .setRequired(true)
          .addChoices(
            AUTOMOD_LOG_CATEGORIES.map((cat) => ({ name: cat.label, value: cat.key }))
          )
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
      .setName("antiinvite")
      .setDescription("Toggle rule Anti Invite (blokir discord.gg/xxx)")
      .addStringOption((opt) =>
        opt
          .setName("status")
          .setDescription("on atau off")
          .setRequired(true)
          .addChoices({ name: "on", value: "on" }, { name: "off", value: "off" })
      )
  )
  .addSubcommand((sub) =>
    sub
      .setName("antilink")
      .setDescription("Toggle rule Anti Link (blokir semua link eksternal)")
      .addStringOption((opt) =>
        opt
          .setName("status")
          .setDescription("on atau off")
          .setRequired(true)
          .addChoices({ name: "on", value: "on" }, { name: "off", value: "off" })
      )
  )
  .addSubcommand((sub) =>
    sub
      .setName("badwords")
      .setDescription("Toggle rule Bad Words")
      .addStringOption((opt) =>
        opt
          .setName("status")
          .setDescription("on atau off")
          .setRequired(true)
          .addChoices({ name: "on", value: "on" }, { name: "off", value: "off" })
      )
  )
  .addSubcommand((sub) =>
    sub
      .setName("addbadword")
      .setDescription("Tambah kata/frasa ke daftar bad words")
      .addStringOption((opt) =>
        opt.setName("kata").setDescription("Kata atau frasa yang ingin diblokir").setRequired(true)
      )
  )
  .addSubcommand((sub) =>
    sub
      .setName("removebadword")
      .setDescription("Hapus kata/frasa dari daftar bad words")
      .addStringOption((opt) =>
        opt.setName("kata").setDescription("Kata atau frasa yang ingin dihapus").setRequired(true)
      )
  )
  .addSubcommand((sub) =>
    sub
      .setName("mentionlimit")
      .setDescription("Atur batas maksimal mention per pesan")
      .addIntegerOption((opt) =>
        opt
          .setName("limit")
          .setDescription("Angka 1-25, atau 0 untuk off")
          .setRequired(true)
          .setMinValue(0)
          .setMaxValue(25)
      )
  )
  .addSubcommand((sub) =>
    sub.setName("listbadwords").setDescription("Lihat daftar bad words")
  )
  .addSubcommand((sub) =>
    sub
      .setName("whitelistchannel")
      .setDescription("Tambah/hapus channel dari whitelist automod")
      .addStringOption((opt) =>
        opt
          .setName("mode")
          .setDescription("add atau remove")
          .setRequired(true)
          .addChoices({ name: "add", value: "add" }, { name: "remove", value: "remove" })
      )
      .addChannelOption((opt) =>
        opt
          .setName("channel")
          .setDescription("Channel target")
          .setRequired(true)
          .addChannelTypes(ChannelType.GuildText)
      )
  )
  .addSubcommand((sub) =>
    sub
      .setName("whitelistrole")
      .setDescription("Tambah/hapus role dari whitelist automod")
      .addStringOption((opt) =>
        opt
          .setName("mode")
          .setDescription("add atau remove")
          .setRequired(true)
          .addChoices({ name: "add", value: "add" }, { name: "remove", value: "remove" })
      )
      .addRoleOption((opt) =>
        opt.setName("role").setDescription("Role target").setRequired(true)
      )
  );

module.exports = {
  name: "automod",
  description: "Kelola Automod Lite dengan state default off.",
  aliases: ["am"],
  category: "automod",
  slashData,
  usage: "automod [status|logchannel|antiinvite|antilink|badwords|addbadword|removebadword|mentionlimit|whitelistchannel|whitelistrole|listbadwords]",
  async execute(message, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
      await replyError(message, "Kamu butuh permission Manage Server untuk command ini.");
      return;
    }

    const action = args[0]?.toLowerCase() || "status";

    if (action === "status") {
      await message.reply({
        embeds: [buildAutomodStatusEmbed(message.guild)]
      });
      return;
    }

    if (action === "logchannel") {
      const categoryInput = args[1]?.toLowerCase();
      const channelInput = args[2];

      if (!categoryInput) {
        const list = AUTOMOD_LOG_CATEGORIES.map(
          (cat) => `- \`${cat.key}\` (Log ${cat.label})`
        ).join("\n");
        await replyError(
          message,
          [
            "Tentukan kategori log dan channel forum.",
            "",
            "Kategori yang tersedia:",
            list,
            "",
            "Contoh: `skautomod logchannel badwords #forum-badwords`",
            "Untuk clear: `skautomod logchannel badwords off`"
          ].join("\n")
        );
        return;
      }

      const category = AUTOMOD_LOG_CATEGORIES.find((cat) => cat.key === categoryInput);

      if (!category) {
        const list = AUTOMOD_LOG_CATEGORIES.map((cat) => `\`${cat.key}\``).join(", ");
        await replyError(
          message,
          `Kategori tidak valid. Pilih salah satu: ${list}.\nContoh: \`skautomod logchannel badwords #forum\``
        );
        return;
      }

      // Clear log channel untuk kategori ini
      if (["off", "disable", "disabled", "none", "clear"].includes(channelInput?.toLowerCase())) {
        setAutomodLogChannelForCategory(message.guild.id, category.key, "");
        await replySuccess(message, `Log channel untuk ${category.label} dimatikan.`);
        return;
      }

      const channel = resolveLogChannel(message, channelInput);

      if (!channel) {
        await replyError(
          message,
          "Channel log tidak valid. Mention forum channel atau jalankan di channel target."
        );
        return;
      }

      // Rekomendasi pakai forum, tapi text channel juga bisa
      if (channel.type !== ChannelType.GuildForum && channel.type !== ChannelType.GuildText) {
        await replyError(
          message,
          "Channel harus berupa Forum channel atau Text channel."
        );
        return;
      }

      setAutomodLogChannelForCategory(message.guild.id, category.key, channel.id);

      const channelTypeLabel = channel.type === ChannelType.GuildForum ? "Forum" : "Text";
      await replySuccess(
        message,
        `Log ${category.label} diset ke ${channel} (${channelTypeLabel} channel).\nSemua log ${category.label} bakal masuk ke thread yang sama di channel itu.`
      );
      return;
    }

    if (action === "antiinvite" || action === "invite") {
      const enabled = parseToggle(args[1]);

      if (enabled === null) {
        await replyError(message, "Gunakan `on` atau `off`.\nContoh: `skautomod antiinvite on`");
        return;
      }

      setAutomodRuleEnabled(message.guild.id, "antiInvite", enabled);
      await replySuccess(message, `Anti Invite diubah ke \`${enabled ? "on" : "off"}\`.`);
      return;
    }

    if (action === "antilink" || action === "link") {
      const enabled = parseToggle(args[1]);

      if (enabled === null) {
        await replyError(message, "Gunakan `on` atau `off`.\nContoh: `skautomod antilink on`");
        return;
      }

      setAutomodRuleEnabled(message.guild.id, "antiLink", enabled);
      await replySuccess(message, `Anti Link diubah ke \`${enabled ? "on" : "off"}\`.`);
      return;
    }

    if (action === "badwords") {
      const enabled = parseToggle(args[1]);

      if (enabled === null) {
        await replyError(message, "Gunakan `on` atau `off`.\nContoh: `skautomod badwords on`");
        return;
      }

      setAutomodRuleEnabled(message.guild.id, "badWords", enabled);
      await replySuccess(message, `Filter bad words diubah ke \`${enabled ? "on" : "off"}\`.`);
      return;
    }

    if (action === "mentionlimit") {
      const value = args[1]?.toLowerCase();

      if (!value) {
        await replyError(message, "Masukkan angka batas mention atau `off`.\nContoh: `skautomod mentionlimit 4`");
        return;
      }

      if (["off", "disable", "disabled"].includes(value)) {
        setMentionLimit(message.guild.id, 0);
        await replySuccess(message, "Mention limit dimatikan.");
        return;
      }

      const parsedLimit = Number.parseInt(value, 10);

      if (!Number.isInteger(parsedLimit) || parsedLimit < 1 || parsedLimit > 25) {
        await replyError(message, "Mention limit harus berupa angka 1-25 atau `off`.");
        return;
      }

      setMentionLimit(message.guild.id, parsedLimit);
      await replySuccess(message, `Mention limit diatur ke \`${parsedLimit}\`.`);
      return;
    }

    if (action === "addbadword") {
      const word = args.slice(1).join(" ").trim();

      if (!word) {
        await replyError(message, "Masukkan kata atau frasa yang ingin diblokir.\nContoh: `skautomod addbadword kata kasar`");
        return;
      }

      const result = addBadWord(message.guild.id, word);

      if (!result.ok) {
        await replyError(message, result.reason);
        return;
      }

      await replySuccess(message, `Bad word \`${word}\` berhasil ditambahkan.`);
      return;
    }

    if (action === "removebadword") {
      const word = args.slice(1).join(" ").trim();

      if (!word) {
        await replyError(message, "Masukkan kata atau frasa yang ingin dihapus.\nContoh: `skautomod removebadword kata kasar`");
        return;
      }

      const result = removeBadWord(message.guild.id, word);

      if (!result.ok) {
        await replyError(message, result.reason);
        return;
      }

      await replySuccess(message, `Bad word \`${word}\` berhasil dihapus.`);
      return;
    }

    if (action === "listbadwords") {
      const statusEmbed = buildAutomodStatusEmbed(message.guild);
      const fields = statusEmbed.data.fields?.filter((entry) => entry.name.startsWith("Bad Word List")) || [];
      const combined = fields.map((entry) => entry.value).join(", ");

      await message.reply(combined || "`none`");
      return;
    }


    if (action === "whitelistchannel") {
      const mode = args[1]?.toLowerCase();
      const channel = resolveTextChannel(message, args[2]);

      if (!["add", "remove"].includes(mode)) {
        await replyError(
          message,
          "Gunakan `add` atau `remove`.\nContoh: `skautomod whitelistchannel add #partnership`"
        );
        return;
      }

      if (!channel) {
        await replyError(message, "Channel target tidak valid. Mention text channel atau jalankan di channel target.");
        return;
      }

      const result = mode === "add"
        ? addWhitelistChannel(message.guild.id, channel.id)
        : removeWhitelistChannel(message.guild.id, channel.id);

      if (!result.ok) {
        await replyError(message, result.reason);
        return;
      }

      await replySuccess(
        message,
        `Channel ${channel} berhasil ${mode === "add" ? "ditambahkan ke" : "dihapus dari"} whitelist automod.`
      );
      return;
    }

    if (action === "whitelistrole") {
      const mode = args[1]?.toLowerCase();
      const role = resolveRole(message, args[2]);

      if (!["add", "remove"].includes(mode)) {
        await replyError(
          message,
          "Gunakan `add` atau `remove`.\nContoh: `skautomod whitelistrole add @Moderator`"
        );
        return;
      }

      if (!role) {
        await replyError(message, "Role target tidak valid. Mention role yang ingin diatur.");
        return;
      }

      const result = mode === "add"
        ? addWhitelistRole(message.guild.id, role.id)
        : removeWhitelistRole(message.guild.id, role.id);

      if (!result.ok) {
        await replyError(message, result.reason);
        return;
      }

      await replySuccess(
        message,
        `Role ${role} berhasil ${mode === "add" ? "ditambahkan ke" : "dihapus dari"} whitelist automod.`
      );
      return;
    }

    await replyError(
      message,
      [
        "Subcommand automod tidak dikenali.",
        "Gunakan salah satu ini:",
        "`skautomod status`",
        "`skautomod logchannel <kategori> [#forum|off]` — kategori: antiinvite, antilink, mentionlimit, badwords",
        "`skautomod antiinvite on|off`",
        "`skautomod antilink on|off`",
        "`skautomod badwords on|off`",
        "`skautomod addbadword <kata>`",
        "`skautomod removebadword <kata>`",
        "`skautomod listbadwords`",
        "`skautomod mentionlimit <angka|off>`",
        "`skautomod whitelistchannel add|remove [#channel]`",
        "`skautomod whitelistrole add|remove <@role>`"
      ].join("\n")
    );
  },
  async executeSlash(interaction) {
    if (!interaction.inGuild()) {
      await interaction.reply({ content: "Command ini hanya bisa dipakai di server.", ephemeral: true });
      return;
    }

    // Defer dulu supaya aman dari timeout (>3 detik) kalau proses sync file I/O lambat.
    await interaction.deferReply({ ephemeral: true });

    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guildId;

    if (sub === "status") {
      await interaction.editReply({
        embeds: [buildAutomodStatusEmbed(interaction.guild)]
      });
      return;
    }

    if (sub === "logchannel") {
      const categoryKey = interaction.options.getString("kategori", true);
      const channel = interaction.options.getChannel("channel");

      // Kalau channel ga diisi → clear log channel kategori itu
      if (!channel) {
        setAutomodLogChannelForCategory(guildId, categoryKey, "");
        const cat = AUTOMOD_LOG_CATEGORIES.find((c) => c.key === categoryKey);
        await interaction.editReply(
          `Log channel untuk **${cat?.label || categoryKey}** dimatikan.`
        );
        return;
      }

      setAutomodLogChannelForCategory(guildId, categoryKey, channel.id);
      const cat = AUTOMOD_LOG_CATEGORIES.find((c) => c.key === categoryKey);
      const typeLabel = channel.type === ChannelType.GuildForum ? "Forum" : "Text";
      await interaction.editReply(
        `Log **${cat?.label || categoryKey}** diset ke ${channel} (${typeLabel} channel).\nSemua log kategori itu bakal masuk ke thread yang sama di channel itu.`
      );
      return;
    }

    if (sub === "antiinvite") {
      const enabled = interaction.options.getString("status", true) === "on";
      setAutomodRuleEnabled(guildId, "antiInvite", enabled);
      await interaction.editReply(
        `Anti Invite diubah ke \`${enabled ? "on" : "off"}\`.`
      );
      return;
    }

    if (sub === "antilink") {
      const enabled = interaction.options.getString("status", true) === "on";
      setAutomodRuleEnabled(guildId, "antiLink", enabled);
      await interaction.editReply(
        `Anti Link diubah ke \`${enabled ? "on" : "off"}\`.`
      );
      return;
    }

    if (sub === "badwords") {
      const enabled = interaction.options.getString("status", true) === "on";
      setAutomodRuleEnabled(guildId, "badWords", enabled);
      await interaction.editReply(
        `Filter bad words diubah ke \`${enabled ? "on" : "off"}\`.`
      );
      return;
    }

    if (sub === "addbadword") {
      const word = interaction.options.getString("kata", true).trim();
      const result = addBadWord(guildId, word);

      if (!result.ok) {
        await interaction.editReply(result.reason);
        return;
      }

      await interaction.editReply(`Bad word \`${word}\` berhasil ditambahkan.`);
      return;
    }

    if (sub === "removebadword") {
      const word = interaction.options.getString("kata", true).trim();
      const result = removeBadWord(guildId, word);

      if (!result.ok) {
        await interaction.editReply(result.reason);
        return;
      }

      await interaction.editReply(`Bad word \`${word}\` berhasil dihapus.`);
      return;
    }

    if (sub === "mentionlimit") {
      const limit = interaction.options.getInteger("limit", true);
      setMentionLimit(guildId, limit);
      await interaction.editReply(
        limit > 0 ? `Mention limit diatur ke \`${limit}\`.` : "Mention limit dimatikan."
      );
      return;
    }

    if (sub === "listbadwords") {
      const statusEmbed = buildAutomodStatusEmbed(interaction.guild);
      const fields = statusEmbed.data.fields?.filter((entry) => entry.name.startsWith("Bad Word List")) || [];
      const combined = fields.map((entry) => entry.value).join(", ");

      await interaction.editReply(combined || "`none`");
      return;
    }

    if (sub === "whitelistchannel") {
      const mode = interaction.options.getString("mode", true);
      const channel = interaction.options.getChannel("channel", true);

      const result = mode === "add"
        ? addWhitelistChannel(guildId, channel.id)
        : removeWhitelistChannel(guildId, channel.id);

      if (!result.ok) {
        await interaction.editReply(result.reason);
        return;
      }

      await interaction.editReply(
        `Channel ${channel} berhasil ${mode === "add" ? "ditambahkan ke" : "dihapus dari"} whitelist automod.`
      );
      return;
    }

    if (sub === "whitelistrole") {
      const mode = interaction.options.getString("mode", true);
      const role = interaction.options.getRole("role", true);

      const result = mode === "add"
        ? addWhitelistRole(guildId, role.id)
        : removeWhitelistRole(guildId, role.id);

      if (!result.ok) {
        await interaction.editReply(result.reason);
        return;
      }

      await interaction.editReply(
        `Role ${role} berhasil ${mode === "add" ? "ditambahkan ke" : "dihapus dari"} whitelist automod.`
      );
      return;
    }

    await interaction.editReply("Subcommand tidak dikenali.");
  }
};
