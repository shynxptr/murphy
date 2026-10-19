const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  EmbedBuilder,
  MessageFlags,
  parseEmoji,
  PermissionFlagsBits,
  StringSelectMenuBuilder
} = require("discord.js");
const {
  createPanel,
  deletePanel,
  getPanel,
  listPanels,
  updatePanel
} = require("../../services/reactionRoleStore");

const ROLE_PANEL_SELECT_PREFIX = "rolepanel:select:";
const ROLE_PANEL_BUTTON_PREFIX = "rolepanel:btn:";
const ROLE_PANEL_OPTION_LIMIT = 25;
const GAME_ROLE_PANEL_PRESET_KEY = "game-self-role";
const GAME_ROLE_PANEL_OPTIONS = [
  { emoji: "<:Roblox:1558554328917348514>", label: "Roblox", roleId: "1558554146838159381", description: "" },
  { emoji: "<:freefire:1558552954083217506>", label: "Free Fire", roleId: "1558551982137147483", description: "" },
  { emoji: "<:gtav:1558553707904237698>", label: "GTA V", roleId: "1558551703714922636", description: "" },
  { emoji: "<:hok:1558553735104299080>", label: "Honor Of Kings", roleId: "1558552233648595095", description: "" },
  { emoji: "<:mcgg:1558553762799292456>", label: "Magic Chess", roleId: "1558552131634593873", description: "" },
  { emoji: "<:ml:1558553805862207541>", label: "Mobile Legend", roleId: "1558552442566869023", description: "" },
  { emoji: "<:pubg:1558553855250272357>", label: "PUBG Mobile", roleId: "1558551795968770068", description: "" },
  { emoji: "<:valorant:1558553921746767893>", label: "Valorant", roleId: "1558551865506005113", description: "" }
];
const DOMISILI_ROLE_PANEL_PRESET_KEY = "domisili-self-role";
const DOMISILI_ROLE_PANEL_OPTIONS = [
  { emoji: "📍", label: "Jawa", roleId: "1558663018739540118", description: "" },
  { emoji: "📍", label: "Kalimantan", roleId: "1558664072227192862", description: "" },
  { emoji: "📍", label: "Sumatera", roleId: "1558664150727663647", description: "" },
  { emoji: "📍", label: "Sulawesi", roleId: "1558664337915383858", description: "" },
  { emoji: "📍", label: "Bali", roleId: "1558664455192182834", description: "" },
  { emoji: "📍", label: "Maluku", roleId: "1558664492236410900", description: "" },
  { emoji: "📍", label: "Papua", roleId: "1558664634393821194", description: "" },
  { emoji: "📍", label: "Bangka Belitung", roleId: "1558664691050356816", description: "" },
  { emoji: "📍", label: "Kepulauan Riau", roleId: "1558664752539111424", description: "" },
  { emoji: "🌐", label: "International", roleId: "1558664809082257558", description: "" }
];
const AGE_ROLE_PANEL_PRESET_KEY = "age-self-role";
const AGE_ROLE_PANEL_OPTIONS = [
  { emoji: "🌱", label: "18-", roleId: "1558668942279708722", description: "" },
  { emoji: "🔞", label: "18+", roleId: "1558668994997784586", description: "" }
];

function hasRolePanelPermission(member) {
  return member.permissions.has(PermissionFlagsBits.ManageGuild)
    || member.permissions.has(PermissionFlagsBits.ManageRoles)
    || member.permissions.has(PermissionFlagsBits.Administrator);
}

function extractRoleId(value) {
  return value ? value.replace(/[<@&>]/g, "") : "";
}

function normalizeText(value) {
  return value?.trim().replace(/\s+/g, " ") || "";
}

function isValidHttpUrl(value) {
  if (!value) {
    return false;
  }

  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch (error) {
    return false;
  }
}

function parseRoleOptionEmoji(value) {
  const normalized = normalizeText(value);

  if (!normalized) {
    return null;
  }

  const parsed = parseEmoji(normalized);

  if (!parsed?.name) {
    return null;
  }

  if (parsed.id) {
    return {
      id: parsed.id,
      name: parsed.name,
      animated: parsed.animated || false
    };
  }

  return {
    name: parsed.name
  };
}

function splitPipeSegments(value) {
  return value
    .split("|")
    .map((segment) => normalizeText(segment))
    .filter(Boolean);
}

function isRoleManageable(role, guild) {
  const botMember = guild.members.me;

  if (!role || !botMember) {
    return false;
  }

  return !role.managed && role.editable && botMember.roles.highest.comparePositionTo(role) > 0;
}

function createReactionRolePanel({
  guildId,
  channelId,
  mode,
  behavior = "sync",
  componentType = "select",
  title,
  description,
  placeholder,
  imageUrl = "",
  presetKey = "",
  presetTag = "",
  createdBy
}) {
  return createPanel({
    guildId,
    channelId,
    mode,
    behavior,
    componentType,
    title,
    description,
    placeholder,
    imageUrl,
    presetKey,
    presetTag,
    createdBy,
    messageId: "",
    options: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });
}

function getGuildPanels(guildId) {
  return listPanels((panel) => panel.guildId === guildId);
}

function getGuildPanel(guildId, panelId) {
  const panel = getPanel(panelId);

  if (!panel || panel.guildId !== guildId) {
    return null;
  }

  return panel;
}

function updateReactionRolePanel(guildId, panelId, updater) {
  const current = getGuildPanel(guildId, panelId);

  if (!current) {
    return null;
  }

  return updatePanel(panelId, (panel) => ({
    ...updater(panel),
    updatedAt: new Date().toISOString()
  }));
}

function deleteReactionRolePanel(guildId, panelId) {
  const panel = getGuildPanel(guildId, panelId);

  if (!panel) {
    return null;
  }

  return deletePanel(panelId);
}

function buildRoleSummary(panel, guild) {
  if (!panel.options.length) {
    return "Belum ada role yang ditambahkan ke panel ini.";
  }

  const summary = panel.options.map((option) => {
    const role = guild.roles.cache.get(option.roleId);
    const roleLabel = role ? `<@&${role.id}>` : `\`${option.roleId}\``;
    const description = option.description ? ` - ${option.description}` : "";
    const emoji = option.emoji ? `${option.emoji} ` : "";

    return `- ${emoji}${option.label}: ${roleLabel}${description}`;
  }).join("\n");

  if (summary.length <= 3000) {
    return summary;
  }

  return `${summary.slice(0, 2997).trimEnd()}...`;
}

function buildRolePanelMessage(panel, guild) {
  const isButton = panel.componentType === "button";
  const shouldShowSummary = !panel.hideSummary;
  const descriptionText = shouldShowSummary && panel.options.length
    ? [panel.description, "", buildRoleSummary(panel, guild)].join("\n").trim()
    : panel.description;

  const embed = new EmbedBuilder()
    .setColor("#111827")
    .setTitle(panel.title)
    .setDescription(descriptionText || "Pilih role kamu di bawah ini.")
    .setFooter({
      text: isButton
        ? (panel.mode === "single"
          ? "Mode: single select | Klik tombol untuk memilih role."
          : "Mode: button toggle | Klik tombol untuk mengambil atau melepas role.")
        : (panel.behavior === "toggle"
          ? "Mode toggle | Pilih role untuk ambil, pilih lagi untuk melepas."
          : panel.mode === "single"
            ? "Mode: single select"
            : "Mode: multi select | Pilih semua role yang ingin kamu simpan.")
    })
    .setTimestamp();

  if (panel.imageUrl) {
    embed.setImage(panel.imageUrl);
  }

  if (isButton) {
    const buttons = panel.options.map((option) => {
      const button = new ButtonBuilder()
        .setCustomId(`${ROLE_PANEL_BUTTON_PREFIX}${panel.id}:${option.roleId}`)
        .setLabel(option.label)
        .setStyle(ButtonStyle.Secondary);

      const emoji = option.emojiData || parseRoleOptionEmoji(option.emoji);
      if (emoji) {
        button.setEmoji(emoji);
      }

      return button;
    });

    let maxPerRow = 5;
    if (buttons.length === 6) maxPerRow = 3;
    else if (buttons.length === 7 || buttons.length === 8) maxPerRow = 4;

    const actionRows = [];
    for (let i = 0; i < buttons.length; i += maxPerRow) {
      actionRows.push(new ActionRowBuilder().addComponents(buttons.slice(i, i + maxPerRow)));
    }

    return {
      embeds: [embed],
      components: actionRows
    };
  }

  const menu = new StringSelectMenuBuilder()
    .setCustomId(`${ROLE_PANEL_SELECT_PREFIX}${panel.id}`)
    .setPlaceholder(panel.placeholder)
    .setMinValues(0)
    .setMaxValues(panel.mode === "single" ? 1 : Math.min(panel.options.length, ROLE_PANEL_OPTION_LIMIT))
    .addOptions(
      panel.options.map((option) => ({
        label: option.label,
        description: option.description || undefined,
        value: option.roleId,
        emoji: option.emojiData || parseRoleOptionEmoji(option.emoji) || undefined
      }))
    );

  return {
    embeds: [embed],
    components: [
      new ActionRowBuilder().addComponents(menu)
    ]
  };
}

async function syncRolePanelMessage(client, panel) {
  const guild = client.guilds.cache.get(panel.guildId) || await client.guilds.fetch(panel.guildId).catch(() => null);

  if (!guild) {
    return {
      ok: false,
      reason: "Guild untuk panel ini tidak ditemukan."
    };
  }

  if (!panel.options.length) {
    return {
      ok: false,
      reason: "Panel belum punya opsi role. Tambahkan role dulu sebelum deploy."
    };
  }

  const channel = guild.channels.cache.get(panel.channelId) || await guild.channels.fetch(panel.channelId).catch(() => null);

  if (!channel || !channel.isTextBased() || channel.isDMBased()) {
    return {
      ok: false,
      reason: "Channel panel tidak valid atau tidak dapat menerima pesan."
    };
  }

  const payload = buildRolePanelMessage(panel, guild);

  if (panel.messageId) {
    const existingMessage = await channel.messages.fetch(panel.messageId).catch(() => null);

    if (existingMessage) {
      await existingMessage.edit(payload);
      return {
        ok: true,
        panel
      };
    }
  }

  const sentMessage = await channel.send(payload);
  const updated = updatePanel(panel.id, (current) => ({
    ...current,
    messageId: sentMessage.id,
    updatedAt: new Date().toISOString()
  }));

  return {
    ok: true,
    panel: updated
  };
}

async function deleteRolePanelMessage(client, panel) {
  if (!panel.messageId) {
    return;
  }

  const guild = client.guilds.cache.get(panel.guildId) || await client.guilds.fetch(panel.guildId).catch(() => null);
  const channel = guild
    ? guild.channels.cache.get(panel.channelId) || await guild.channels.fetch(panel.channelId).catch(() => null)
    : null;

  if (!channel || !channel.isTextBased() || channel.isDMBased()) {
    return;
  }

  await channel.messages.delete(panel.messageId).catch(() => null);
}

function buildRolePanelsEmbed(guild, panels) {
  const description = panels.length
    ? panels.map((panel) => {
      const state = panel.messageId ? "deployed" : "draft";
      return [
        `**#${panel.id}** ${panel.title}`,
        `Mode: \`${panel.mode}\` | Behavior: \`${panel.behavior || "sync"}\` | Opsi: **${panel.options.length}** | Status: \`${state}\` | Banner: ${panel.imageUrl ? "`on`" : "`off`"}`,
        `Channel: <#${panel.channelId}>`
      ].join("\n");
    }).join("\n\n")
    : "Belum ada role panel di server ini.";

  return new EmbedBuilder()
    .setColor("#111827")
    .setTitle("Dropdown Role Panels")
    .setDescription(description)
    .setFooter({
      text: `${guild.name} role panel registry`
    })
    .setTimestamp();
}

function buildRolePanelDetailEmbed(guild, panel) {
  const embed = new EmbedBuilder()
    .setColor("#111827")
    .setTitle(`Role Panel #${panel.id}`)
    .setDescription(panel.description)
    .addFields(
      {
        name: "Title",
        value: panel.title,
        inline: false
      },
      {
        name: "Mode",
        value: `${panel.mode} / ${panel.behavior || "sync"}`,
        inline: true
      },
      {
        name: "Channel",
        value: `<#${panel.channelId}>`,
        inline: true
      },
      {
        name: "Placeholder",
        value: panel.placeholder,
        inline: false
      },
      {
        name: "Header Image",
        value: panel.imageUrl || "`none`",
        inline: false
      },
      {
        name: "Options",
        value: buildRoleSummary(panel, guild),
        inline: false
      }
    )
    .setTimestamp();

  if (panel.imageUrl) {
    embed.setImage(panel.imageUrl);
  }

  return embed;
}

function buildRoleAssignmentSummary(addedRoles, removedRoles) {
  const lines = [];

  if (addedRoles.length) {
    lines.push(`Ditambahkan: ${addedRoles.map((role) => `<@&${role.id}>`).join(", ")}`);
  }

  if (removedRoles.length) {
    lines.push(`Dilepas: ${removedRoles.map((role) => `<@&${role.id}>`).join(", ")}`);
  }

  if (!lines.length) {
    lines.push("Tidak ada perubahan role.");
  }

  return lines.join("\n");
}

async function handleRolePanelSelect(interaction) {
  if (!interaction.customId.startsWith(ROLE_PANEL_SELECT_PREFIX)) {
    return false;
  }

  const panelId = interaction.customId.slice(ROLE_PANEL_SELECT_PREFIX.length);
  const panel = getGuildPanel(interaction.guildId, panelId);

  if (!panel) {
    await interaction.reply({
      content: "Panel role ini tidak ditemukan lagi.",
      flags: MessageFlags.Ephemeral
    });
    return true;
  }

  const targetMember = interaction.guild.members.cache.get(interaction.user.id)
    || await interaction.guild.members.fetch(interaction.user.id).catch(() => null);

  if (!targetMember) {
    await interaction.reply({
      content: "Gagal membaca data member kamu. Coba lagi sebentar.",
      flags: MessageFlags.Ephemeral
    });
    return true;
  }

  const configuredRoleIds = panel.options.map((option) => option.roleId);
  const selectedRoleIds = interaction.values.filter((value) => configuredRoleIds.includes(value));

  if (!configuredRoleIds.every((id) => interaction.guild.roles.cache.has(id))) {
    await interaction.guild.roles.fetch().catch(() => null);
  }

  const missingRoleIds = configuredRoleIds.filter((roleId) => !interaction.guild.roles.cache.has(roleId));
  const involvedRoles = configuredRoleIds
    .map((roleId) => interaction.guild.roles.cache.get(roleId))
    .filter(Boolean);

  if (missingRoleIds.length) {
    await interaction.reply({
      content: [
        "Beberapa role di panel ini sudah tidak ada lagi.",
        `Role ID bermasalah: ${missingRoleIds.map((roleId) => `\`${roleId}\``).join(", ")}`
      ].join("\n"),
      flags: MessageFlags.Ephemeral
    });
    return true;
  }

  const unmanageableRoles = involvedRoles.filter((role) => !isRoleManageable(role, interaction.guild));

  if (unmanageableRoles.length) {
    await interaction.reply({
      content: [
        "Beberapa role di panel ini tidak bisa dikelola bot saat ini:",
        unmanageableRoles.map((role) => role.name).join(", ")
      ].join("\n"),
      flags: MessageFlags.Ephemeral
    });
    return true;
  }

  const toggleMode = panel.behavior === "toggle";
  const rolesToRemove = toggleMode
    ? involvedRoles.filter((role) => selectedRoleIds.includes(role.id) && targetMember.roles.cache.has(role.id))
    : involvedRoles.filter((role) =>
      targetMember.roles.cache.has(role.id) && !selectedRoleIds.includes(role.id)
    );
  const rolesToAdd = toggleMode
    ? involvedRoles.filter((role) => selectedRoleIds.includes(role.id) && !targetMember.roles.cache.has(role.id))
    : involvedRoles.filter((role) =>
      selectedRoleIds.includes(role.id) && !targetMember.roles.cache.has(role.id)
    );
  const removedRoles = [];
  const addedRoles = [];

  for (const role of rolesToRemove) {
    const removed = await targetMember.roles.remove(role).catch(() => null);

    if (removed) {
      removedRoles.push(role);
    }
  }

  for (const role of rolesToAdd) {
    const added = await targetMember.roles.add(role).catch(() => null);

    if (added) {
      addedRoles.push(role);
    }
  }

  await interaction.reply({
    embeds: [
      new EmbedBuilder()
        .setColor("#111827")
        .setTitle("Role Panel Updated")
        .setDescription(buildRoleAssignmentSummary(addedRoles, removedRoles))
        .setFooter({
          text: panel.behavior === "toggle"
            ? "Mode toggle: pilih role untuk ambil, pilih lagi role yang sama untuk melepas."
            : panel.mode === "multi"
              ? "Mode multi-select: pilih semua role yang ingin kamu simpan di panel ini."
              : "Mode single-select: hanya satu role dari panel ini yang bisa aktif."
        })
        .setTimestamp()
    ],
    flags: MessageFlags.Ephemeral
  });

  return true;
}

async function handleRolePanelButton(interaction) {
  if (!interaction.customId.startsWith(ROLE_PANEL_BUTTON_PREFIX)) {
    return false;
  }

  const parts = interaction.customId.slice(ROLE_PANEL_BUTTON_PREFIX.length).split(":");
  const panelId = parts[0];
  const roleId = parts[1];

  const panel = getGuildPanel(interaction.guildId, panelId);
  if (!panel) {
    await interaction.reply({
      content: "Panel role ini tidak ditemukan lagi.",
      flags: MessageFlags.Ephemeral
    });
    return true;
  }

  const targetMember = interaction.guild.members.cache.get(interaction.user.id)
    || await interaction.guild.members.fetch(interaction.user.id).catch(() => null);

  if (!targetMember) {
    await interaction.reply({
      content: "Gagal membaca data member kamu. Coba lagi sebentar.",
      flags: MessageFlags.Ephemeral
    });
    return true;
  }

  let role = interaction.guild.roles.cache.get(roleId);
  if (!role) {
    await interaction.guild.roles.fetch().catch(() => null);
    role = interaction.guild.roles.cache.get(roleId);
  }

  if (!role) {
    await interaction.reply({
      content: "Role untuk tombol ini sudah tidak ditemukan di server.",
      flags: MessageFlags.Ephemeral
    });
    return true;
  }

  if (!isRoleManageable(role, interaction.guild)) {
    await interaction.reply({
      content: `Role <@&${role.id}> tidak dapat dikelola oleh bot. Pastikan posisi role bot berada di atas role tersebut.`,
      flags: MessageFlags.Ephemeral
    });
    return true;
  }

  const hasRole = targetMember.roles.cache.has(role.id);
  const isSingle = panel.mode === "single";

  await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch(() => null);

  const addedRoles = [];
  const removedRoles = [];

  if (hasRole) {
    const removed = await targetMember.roles.remove(role).catch(() => null);
    if (removed) {
      removedRoles.push(role);
    }
  } else {
    if (isSingle) {
      const configuredRoleIds = panel.options.map((opt) => opt.roleId).filter((id) => id !== role.id);
      for (const otherId of configuredRoleIds) {
        if (targetMember.roles.cache.has(otherId)) {
          const otherRole = interaction.guild.roles.cache.get(otherId);
          if (otherRole) {
            const removed = await targetMember.roles.remove(otherRole).catch(() => null);
            if (removed) {
              removedRoles.push(otherRole);
            }
          }
        }
      }
    }

    const added = await targetMember.roles.add(role).catch(() => null);
    if (added) {
      addedRoles.push(role);
    }
  }

  await interaction.editReply({
    embeds: [
      new EmbedBuilder()
        .setColor("#111827")
        .setTitle("Role Updated")
        .setDescription(buildRoleAssignmentSummary(addedRoles, removedRoles))
        .setFooter({
          text: isSingle
            ? "Mode single: hanya satu role yang aktif."
            : "Mode toggle: tekan tombol lagi untuk melepas role."
        })
        .setTimestamp()
    ]
  }).catch(() => null);

  return true;
}

async function upsertGameRolePanel(guild, channelId) {
  const existing = getGuildPanels(guild.id).find((panel) => panel.presetKey === GAME_ROLE_PANEL_PRESET_KEY) || null;
  const missingRoles = [];
  const unmanageableRoles = [];
  const options = [];

  await guild.roles.fetch().catch(() => null);

  for (const entry of GAME_ROLE_PANEL_OPTIONS) {
    const role = guild.roles.cache.get(entry.roleId);

    if (!role) {
      missingRoles.push(entry.label);
      continue;
    }

    if (!isRoleManageable(role, guild)) {
      unmanageableRoles.push(role.name);
      continue;
    }

    options.push({
      roleId: role.id,
      label: entry.label,
      description: entry.description,
      emoji: entry.emoji,
      emojiData: parseRoleOptionEmoji(entry.emoji)
    });
  }

  if (missingRoles.length) {
    return {
      ok: false,
      reason: `Role game ini tidak ditemukan: ${missingRoles.join(", ")}`
    };
  }

  if (unmanageableRoles.length) {
    return {
      ok: false,
      reason: `Role game ini belum bisa dikelola bot: ${unmanageableRoles.join(", ")}`
    };
  }

  const payload = {
    guildId: guild.id,
    channelId,
    mode: "multi",
    behavior: "toggle",
    componentType: "button",
    title: "Game Self Role",
    description: [
      "Pilih role game kamu dengan menekan tombol di bawah.",
      "Klik lagi tombol yang sama untuk melepas role."
    ].join("\n"),
    placeholder: "Pilih game kamu di sini",
    presetKey: GAME_ROLE_PANEL_PRESET_KEY,
    presetTag: "game-self-role",
    options
  };

  if (!existing) {
    const created = createReactionRolePanel({
      ...payload,
      createdBy: guild.client.user?.id || "system"
    });

    return {
      ok: true,
      panel: updatePanel(created.id, (current) => ({
        ...current,
        options
      }))
    };
  }

  const updated = updateReactionRolePanel(guild.id, existing.id, (current) => ({
    ...current,
    ...payload,
    messageId: current.messageId || ""
  }));

  return {
    ok: true,
    panel: updated
  };
}

async function upsertDomisiliRolePanel(guild, channelId) {
  const existing = getGuildPanels(guild.id).find((panel) => panel.presetKey === DOMISILI_ROLE_PANEL_PRESET_KEY) || null;
  const missingRoles = [];
  const unmanageableRoles = [];
  const options = [];

  await guild.roles.fetch().catch(() => null);

  for (const entry of DOMISILI_ROLE_PANEL_OPTIONS) {
    const role = guild.roles.cache.get(entry.roleId);

    if (!role) {
      missingRoles.push(entry.label);
      continue;
    }

    if (!isRoleManageable(role, guild)) {
      unmanageableRoles.push(role.name);
      continue;
    }

    options.push({
      roleId: role.id,
      label: entry.label,
      description: entry.description,
      emoji: entry.emoji,
      emojiData: parseRoleOptionEmoji(entry.emoji)
    });
  }

  if (missingRoles.length) {
    return {
      ok: false,
      reason: `Role domisili ini tidak ditemukan: ${missingRoles.join(", ")}`
    };
  }

  if (unmanageableRoles.length) {
    return {
      ok: false,
      reason: `Role domisili ini belum bisa dikelola bot: ${unmanageableRoles.join(", ")}`
    };
  }

  const payload = {
    guildId: guild.id,
    channelId,
    mode: "single",
    behavior: "sync",
    componentType: "select",
    title: "Role Domisili",
    description: "Pilih role daerahmu di bawah ini.",
    placeholder: "Pilih role daerahmu",
    presetKey: DOMISILI_ROLE_PANEL_PRESET_KEY,
    presetTag: "domisili-self-role",
    options
  };

  if (!existing) {
    const created = createReactionRolePanel({
      ...payload,
      createdBy: guild.client.user?.id || "system"
    });

    return {
      ok: true,
      panel: updatePanel(created.id, (current) => ({
        ...current,
        options
      }))
    };
  }

  const updated = updateReactionRolePanel(guild.id, existing.id, (current) => ({
    ...current,
    ...payload,
    messageId: current.messageId || ""
  }));

  return {
    ok: true,
    panel: updated
  };
}

async function upsertAgeRolePanel(guild, channelId) {
  const existing = getGuildPanels(guild.id).find((panel) => panel.presetKey === AGE_ROLE_PANEL_PRESET_KEY) || null;
  const missingRoles = [];
  const unmanageableRoles = [];
  const options = [];

  await guild.roles.fetch().catch(() => null);

  for (const entry of AGE_ROLE_PANEL_OPTIONS) {
    const role = guild.roles.cache.get(entry.roleId);

    if (!role) {
      missingRoles.push(entry.label);
      continue;
    }

    if (!isRoleManageable(role, guild)) {
      unmanageableRoles.push(role.name);
      continue;
    }

    options.push({
      roleId: role.id,
      label: entry.label,
      description: entry.description,
      emoji: entry.emoji,
      emojiData: parseRoleOptionEmoji(entry.emoji)
    });
  }

  if (missingRoles.length) {
    return {
      ok: false,
      reason: `Role age ini tidak ditemukan: ${missingRoles.join(", ")}`
    };
  }

  if (unmanageableRoles.length) {
    return {
      ok: false,
      reason: `Role age ini belum bisa dikelola bot: ${unmanageableRoles.join(", ")}`
    };
  }

  const payload = {
    guildId: guild.id,
    channelId,
    mode: "single",
    behavior: "toggle",
    componentType: "button",
    hideSummary: true,
    title: "Age Role",
    description: "Pilih rentang usiamu dengan menekan tombol di bawah.",
    placeholder: "Pilih usia kamu",
    presetKey: AGE_ROLE_PANEL_PRESET_KEY,
    presetTag: "age-self-role",
    options
  };

  if (!existing) {
    const created = createReactionRolePanel({
      ...payload,
      createdBy: guild.client.user?.id || "system"
    });

    return {
      ok: true,
      panel: updatePanel(created.id, (current) => ({
        ...current,
        options
      }))
    };
  }

  const updated = updateReactionRolePanel(guild.id, existing.id, (current) => ({
    ...current,
    ...payload,
    messageId: current.messageId || ""
  }));

  return {
    ok: true,
    panel: updated
  };
}

module.exports = {
  AGE_ROLE_PANEL_PRESET_KEY,
  DOMISILI_ROLE_PANEL_PRESET_KEY,
  GAME_ROLE_PANEL_PRESET_KEY,
  ROLE_PANEL_BUTTON_PREFIX,
  ROLE_PANEL_OPTION_LIMIT,
  buildRolePanelDetailEmbed,
  buildRolePanelsEmbed,
  createReactionRolePanel,
  deleteReactionRolePanel,
  deleteRolePanelMessage,
  extractRoleId,
  getGuildPanel,
  getGuildPanels,
  handleRolePanelButton,
  handleRolePanelSelect,
  hasRolePanelPermission,
  isRoleManageable,
  isValidHttpUrl,
  normalizeText,
  parseRoleOptionEmoji,
  splitPipeSegments,
  syncRolePanelMessage,
  upsertAgeRolePanel,
  upsertDomisiliRolePanel,
  upsertGameRolePanel,
  updateReactionRolePanel
};
