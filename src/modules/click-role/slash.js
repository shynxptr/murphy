const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  MessageFlags
} = require("discord.js");

const store = require("../../services/clickRoleStore");
const {
  createPanel,
  getPanel,
  updatePanel,
  deletePanel,
  listPanels
} = store;

const CLICK_ROLE_BUTTON_PREFIX = "clickrole:btn:";

const slashData = new SlashCommandBuilder()
  .setName("clickrole")
  .setDescription("Buat panel click-to-get-role dengan limit member")
  .setDMPermission(false)
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
  .addSubcommand((sub) =>
    sub
      .setName("create")
      .setDescription("Buat panel click role baru")
      .addRoleOption((opt) =>
        opt.setName("role").setDescription("Role yang akan diberikan").setRequired(true)
      )
      .addIntegerOption((opt) =>
        opt
          .setName("limit")
          .setDescription("Jumlah maksimal member yang bisa dapat role (0 = tanpa limit)")
          .setRequired(true)
          .setMinValue(0)
      )
      .addChannelOption((opt) =>
        opt
          .setName("channel")
          .setDescription("Channel tempat panel dikirim (default: channel ini)")
          .addChannelTypes(ChannelType.GuildText)
      )
      .addStringOption((opt) =>
        opt.setName("title").setDescription("Judul panel (default: Claim Role)")
      )
      .addStringOption((opt) =>
        opt.setName("description").setDescription("Deskripsi panel")
      )
      .addStringOption((opt) =>
        opt.setName("button-label").setDescription("Label tombol (default: Click to Get Role)")
      )
      .addStringOption((opt) =>
        opt
          .setName("emoji")
          .setDescription("Emoji untuk tombol (default: tanpa emoji)")
      )
  )
  .addSubcommand((sub) =>
    sub
      .setName("delete")
      .setDescription("Hapus panel click role")
      .addStringOption((opt) =>
        opt
          .setName("id")
          .setDescription("ID panel yang ingin dihapus")
          .setRequired(true)
      )
  )
  .addSubcommand((sub) =>
    sub
      .setName("list")
      .setDescription("Lihat semua panel click role di server ini")
  );

async function deployPanelMessage(guild, panel, client) {
  const channel = guild.channels.cache.get(panel.channelId);

  if (!channel) {
    return null;
  }

  // Hapus pesan lama kalau ada
  if (panel.messageId) {
    await channel.messages.delete(panel.messageId).catch(() => null);
  }

  const embed = new EmbedBuilder()
    .setTitle(panel.title)
    .setDescription(panel.description)
    .setColor(panel.color)
    .addFields(
      { name: "Role", value: `<@&${panel.roleId}>`, inline: true },
      {
        name: "Slot",
        value: panel.memberLimit > 0 ? `0/${panel.memberLimit}` : "Unlimited",
        inline: true
      }
    )
    .setFooter({ text: `Panel ID: ${panel.id}` });

  const button = new ButtonBuilder()
    .setCustomId(`${CLICK_ROLE_BUTTON_PREFIX}${panel.id}`)
    .setLabel(panel.roleLabel)
    .setStyle(ButtonStyle.Secondary);

  if (panel.roleEmoji) {
    try {
      button.setEmoji(panel.roleEmoji);
    } catch {
      // emoji invalid, skip
    }
  }

  const row = new ActionRowBuilder().addComponents(button);

  const sentMessage = await channel.send({ embeds: [embed], components: [row] }).catch(() => null);

  if (sentMessage) {
    updatePanel(panel.id, { messageId: sentMessage.id });
  }

  return sentMessage;
}

async function refreshPanelMessage(guild, panel) {
  const channel = guild.channels.cache.get(panel.channelId);

  if (!channel || !panel.messageId) {
    return false;
  }

  const message = await channel.messages.fetch(panel.messageId).catch(() => null);

  if (!message) {
    return false;
  }

  const role = guild.roles.cache.get(panel.roleId);
  const currentCount = role ? role.members.size : 0;
  const slotText = panel.memberLimit > 0 ? `${currentCount}/${panel.memberLimit}` : "Unlimited";

  const embed = new EmbedBuilder()
    .setTitle(panel.title)
    .setDescription(panel.description)
    .setColor(panel.color)
    .addFields(
      { name: "Role", value: `<@&${panel.roleId}>`, inline: true },
      { name: "Slot", value: slotText, inline: true }
    )
    .setFooter({ text: `Panel ID: ${panel.id}` });

  const button = new ButtonBuilder()
    .setCustomId(`${CLICK_ROLE_BUTTON_PREFIX}${panel.id}`)
    .setLabel(panel.roleLabel)
    .setStyle(
      panel.memberLimit > 0 && currentCount >= panel.memberLimit
        ? ButtonStyle.Secondary
        : ButtonStyle.Secondary
    );

  if (panel.roleEmoji) {
    try {
      button.setEmoji(panel.roleEmoji);
    } catch {
      // emoji invalid, skip
    }
  }

  const row = new ActionRowBuilder().addComponents(button);

  await message.edit({ embeds: [embed], components: [row] }).catch(() => null);
  return true;
}

async function handleClickRoleButton(interaction, client) {
  if (!interaction.customId.startsWith(CLICK_ROLE_BUTTON_PREFIX)) {
    return false;
  }

  const panelId = interaction.customId.slice(CLICK_ROLE_BUTTON_PREFIX.length);
  const panel = getPanel(panelId);

  if (!panel || panel.guildId !== interaction.guildId) {
    await interaction.reply({
      content: "Panel ini sudah tidak aktif.",
      flags: MessageFlags.Ephemeral
    }).catch(() => null);
    return true;
  }

  const role = interaction.guild.roles.cache.get(panel.roleId);

  if (!role) {
    await interaction.reply({
      content: "Role tidak ditemukan. Hubungi admin ya.",
      flags: MessageFlags.Ephemeral
    }).catch(() => null);
    return true;
  }

  const member = interaction.member;

  // Kalau sudah punya role, jangan remove — kasih pesan saja
  if (member.roles.cache.has(role.id)) {
    await interaction.reply({
      content: `Kamu sudah punya role ${role}.`,
      flags: MessageFlags.Ephemeral
    }).catch(() => null);
    return true;
  }

  // Cek limit member
  if (panel.memberLimit > 0 && role.members.size >= panel.memberLimit) {
    await interaction.reply({
      content: `Maaf, slot untuk role ${role} sudah penuh (${role.members.size}/${panel.memberLimit}).`,
      flags: MessageFlags.Ephemeral
    }).catch(() => null);
    return true;
  }

  // Add role
  try {
    await member.roles.add(role);
  } catch {
    await interaction.reply({
      content: "Gagal menambahkan role. Pastikan posisi role bot lebih tinggi dari role target.",
      flags: MessageFlags.Ephemeral
    }).catch(() => null);
    return true;
  }

  await interaction.reply({
    content: `Selamat! Kamu mendapatkan role ${role}.`,
    flags: MessageFlags.Ephemeral
  }).catch(() => null);

  // Refresh panel untuk update slot count
  await refreshPanelMessage(interaction.guild, panel);

  return true;
}

module.exports = {
  slashData,
  CLICK_ROLE_BUTTON_PREFIX,
  handleClickRoleButton,
  deployPanelMessage,
  refreshPanelMessage,
  async executeSlash(interaction, client) {
    if (!interaction.inGuild()) {
      await interaction.reply({ content: "Command ini hanya bisa dipakai di server.", flags: MessageFlags.Ephemeral });
      return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch(() => null);

    const subcommand = interaction.options.getSubcommand();

    if (subcommand === "create") {
      const role = interaction.options.getRole("role");
      const limit = interaction.options.getInteger("limit");
      const channel = interaction.options.getChannel("channel") || interaction.channel;
      const title = interaction.options.getString("title");
      const description = interaction.options.getString("description");
      const buttonLabel = interaction.options.getString("button-label");
      const emoji = interaction.options.getString("emoji");

      // Validasi role manageability
      const botMember = interaction.guild.members.me;
      if (role.managed) {
        await interaction.editReply("Role ini managed oleh Discord/integration, tidak bisa dipakai.");
        return;
      }

      if (!role.editable || botMember.roles.highest.comparePositionTo(role) <= 0) {
        await interaction.editReply("Posisi role bot harus lebih tinggi dari role target. Atur ulang urutan role di server settings.");
        return;
      }

      const panel = createPanel({
        guildId: interaction.guildId,
        channelId: channel.id,
        roleId: role.id,
        roleLabel: buttonLabel || "Click to Get Role",
        roleEmoji: emoji || "",
        title: title || "Claim Role",
        description: description || "Klik tombol di bawah untuk mendapatkan role.",
        memberLimit: limit,
        color: "#111827"
      });

      const sent = await deployPanelMessage(interaction.guild, panel, client);

      if (!sent) {
        await interaction.editReply(`Gagal mengirim panel ke ${channel}. Pastikan bot punya akses ke channel tersebut.`);
        return;
      }

      await interaction.editReply(
        `Panel berhasil dibuat di ${channel}!\n` +
        `**Role:** ${role}\n` +
        `**Limit:** ${limit > 0 ? `${limit} member` : "Unlimited"}\n` +
        `**Panel ID:** ${panel.id}\n\n` +
        `Gunakan \`/clickrole list\` untuk melihat semua panel, atau \`/clickrole delete\` untuk hapus.`
      );
      return;
    }

    if (subcommand === "delete") {
      const id = interaction.options.getString("id");
      const panel = getPanel(id);

      if (!panel || panel.guildId !== interaction.guildId) {
        await interaction.editReply("Panel tidak ditemukan.");
        return;
      }

      // Hapus pesan panel
      if (panel.messageId) {
        const channel = interaction.guild.channels.cache.get(panel.channelId);
        if (channel) {
          await channel.messages.delete(panel.messageId).catch(() => null);
        }
      }

      deletePanel(id);
      await interaction.editReply(`Panel **${id}** berhasil dihapus.`);
      return;
    }

    if (subcommand === "list") {
      const panels = listPanels((p) => p.guildId === interaction.guildId);

      if (panels.length === 0) {
        await interaction.editReply("Belum ada panel click role di server ini.");
        return;
      }

      const lines = panels.map((p) => {
        const role = interaction.guild.roles.cache.get(p.roleId);
        const roleName = role ? role.name : "Role tidak ditemukan";
        const currentCount = role ? role.members.size : 0;
        const slot = p.memberLimit > 0 ? `${currentCount}/${p.memberLimit}` : "Unlimited";
        return `**ID: ${p.id}** — ${roleName} | Slot: ${slot} | <#${p.channelId}>`;
      });

      const embed = new EmbedBuilder()
        .setTitle("Click Role Panels")
        .setColor("#111827")
        .setDescription(lines.join("\n"));

      await interaction.editReply({ embeds: [embed] });
      return;
    }
  }
};
