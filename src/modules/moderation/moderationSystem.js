const { randomUUID } = require("node:crypto");
const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  EmbedBuilder,
  ModalBuilder,
  PermissionFlagsBits,
  TextInputBuilder,
  TextInputStyle
} = require("discord.js");
const { getGuildSettings, updateGuildSettings } = require("../../services/guildConfigService");
const { createCase, listCases, updateCases } = require("../../services/moderationStore");
const { sendModLog } = require("./modLogSystem");

const MOD_PANEL_PREFIX = "mod:panel:";
const MOD_MODAL_PREFIX = "mod:modal:";
const MOD_CONFIRM_PREFIX = "mod:confirm:";
const MOD_CANCEL_PREFIX = "mod:cancel:";
const MOD_REASON_INPUT_ID = "mod_reason";
const MOD_DURATION_INPUT_ID = "mod_duration";
const PENDING_ACTION_TTL_MS = 15 * 60 * 1000;

const ACTION_META = {
  warn: { label: "Warn", color: "#f59e0b", emoji: "⚠️" },
  timeout: { label: "Timeout", color: "#0ea5e9", emoji: "⏳" },
  untimeout: { label: "Remove Timeout", color: "#10b981", emoji: "✅" },
  kick: { label: "Kick", color: "#fb7185", emoji: "👢" },
  ban: { label: "Ban", color: "#ef4444", emoji: "🔨" },
  unban: { label: "Unban", color: "#22c55e", emoji: "🔓" },
  "clear-warnings": { label: "Clear Warnings", color: "#10b981", emoji: "🧹" },
  purge: { label: "Purge", color: "#8b5cf6", emoji: "🗑️" }
};

function getModerationSettings(guildId) {
  return getGuildSettings(guildId, {
    moderation: {
      logChannelId: ""
    }
  }).moderation;
}

function setModerationLogChannel(guildId, channelId) {
  return updateGuildSettings(guildId, (current) => ({
    ...current,
    moderation: {
      ...(current.moderation || {}),
      logChannelId: channelId
    }
  }));
}

function extractId(value) {
  return value ? value.replace(/[<@!#&>]/g, "") : "";
}

async function resolveMemberFromInput(guild, value) {
  const id = extractId(value);

  if (!id) {
    return null;
  }

  return guild.members.cache.get(id) || guild.members.fetch(id).catch(() => null);
}

async function resolveMemberFromMessage(message, value) {
  if (value) {
    return resolveMemberFromInput(message.guild, value);
  }

  if (!message.reference?.messageId) {
    return null;
  }

  const referencedMessage = await message.fetchReference().catch(() => null);

  if (!referencedMessage) {
    return null;
  }

  return message.guild.members.cache.get(referencedMessage.author.id)
    || message.guild.members.fetch(referencedMessage.author.id).catch(() => null);
}

function memberHasAnyPermission(member, permissions) {
  return permissions.some((permission) => member.permissions.has(permission));
}

function getPermissionError(action) {
  switch (action) {
    case "warn":
    case "timeout":
    case "untimeout":
    case "clear-warnings":
    case "cases":
    case "modpanel":
      return "Kamu butuh permission moderasi untuk aksi ini.";
    case "kick":
      return "Kamu butuh permission Kick Members untuk aksi ini.";
    case "ban":
    case "unban":
      return "Kamu butuh permission Ban Members untuk aksi ini.";
    case "purge":
      return "Kamu butuh permission Manage Messages untuk aksi ini.";
    default:
      return "Kamu tidak punya izin untuk aksi ini.";
  }
}

function ensureActionPermission(member, action) {
  if (!member) {
    return "Aksi ini hanya bisa dijalankan di server.";
  }

  if (member.permissions.has(PermissionFlagsBits.Administrator)) {
    return null;
  }

  const requirements = {
    modpanel: [PermissionFlagsBits.ModerateMembers, PermissionFlagsBits.ManageMessages, PermissionFlagsBits.ManageGuild],
    warn: [PermissionFlagsBits.ModerateMembers, PermissionFlagsBits.ManageMessages, PermissionFlagsBits.ManageGuild],
    cases: [PermissionFlagsBits.ModerateMembers, PermissionFlagsBits.KickMembers, PermissionFlagsBits.BanMembers],
    "clear-warnings": [PermissionFlagsBits.ModerateMembers, PermissionFlagsBits.ManageMessages, PermissionFlagsBits.ManageGuild],
    timeout: [PermissionFlagsBits.ModerateMembers, PermissionFlagsBits.ManageGuild],
    untimeout: [PermissionFlagsBits.ModerateMembers, PermissionFlagsBits.ManageGuild],
    kick: [PermissionFlagsBits.KickMembers, PermissionFlagsBits.ManageGuild],
    ban: [PermissionFlagsBits.BanMembers, PermissionFlagsBits.ManageGuild],
    unban: [PermissionFlagsBits.BanMembers, PermissionFlagsBits.ManageGuild],
    purge: [PermissionFlagsBits.ManageMessages, PermissionFlagsBits.ManageGuild]
  };

  const allowed = memberHasAnyPermission(member, requirements[action] || []);

  return allowed ? null : getPermissionError(action);
}

function validateTargetMember(action, actorMember, targetMember) {
  if (!targetMember) {
    return "Member target tidak ditemukan.";
  }

  if (actorMember.id === targetMember.id) {
    return "Kamu tidak bisa melakukan aksi moderasi ke dirimu sendiri.";
  }

  if (targetMember.guild.ownerId === targetMember.id) {
    return "Owner server tidak bisa dimoderasi lewat bot.";
  }

  if (
    actorMember.id !== targetMember.guild.ownerId
    && actorMember.roles.highest.comparePositionTo(targetMember.roles.highest) <= 0
  ) {
    return "Role target sama atau lebih tinggi dari role kamu.";
  }

  const botMember = targetMember.guild.members.me;

  if (
    botMember
    && botMember.id !== targetMember.guild.ownerId
    && botMember.roles.highest.comparePositionTo(targetMember.roles.highest) <= 0
  ) {
    return "Role bot lebih rendah dari target, jadi aksi ini tidak bisa dijalankan.";
  }

  if (action === "kick" && !targetMember.kickable) {
    return "Bot tidak bisa meng-kick member ini.";
  }

  if (action === "ban" && !targetMember.bannable) {
    return "Bot tidak bisa memban member ini.";
  }

  if ((action === "timeout" || action === "untimeout") && !targetMember.moderatable) {
    return "Bot tidak bisa mengatur timeout untuk member ini.";
  }

  return null;
}

function normalizeReason(value, fallback = "Tidak ada alasan yang diberikan.") {
  const normalized = value?.trim().replace(/\s+/g, " ") || "";
  return normalized || fallback;
}

function parseDuration(value) {
  const normalized = value?.toLowerCase().replace(/\s+/g, "") || "";

  if (!normalized) {
    return null;
  }

  let total = 0;
  let consumed = 0;
  const regex = /(\d+)([smhdw])/g;

  for (const match of normalized.matchAll(regex)) {
    const amount = Number.parseInt(match[1], 10);
    const unit = match[2];
    consumed += match[0].length;

    if (unit === "s") {
      total += amount * 1000;
    }

    if (unit === "m") {
      total += amount * 60 * 1000;
    }

    if (unit === "h") {
      total += amount * 60 * 60 * 1000;
    }

    if (unit === "d") {
      total += amount * 24 * 60 * 60 * 1000;
    }

    if (unit === "w") {
      total += amount * 7 * 24 * 60 * 60 * 1000;
    }
  }

  if (consumed !== normalized.length || total <= 0) {
    return null;
  }

  return total;
}

function formatDuration(durationMs) {
  const units = [
    { label: "w", value: 7 * 24 * 60 * 60 * 1000 },
    { label: "d", value: 24 * 60 * 60 * 1000 },
    { label: "h", value: 60 * 60 * 1000 },
    { label: "m", value: 60 * 1000 },
    { label: "s", value: 1000 }
  ];
  const parts = [];
  let current = durationMs;

  for (const unit of units) {
    if (current < unit.value) {
      continue;
    }

    const amount = Math.floor(current / unit.value);
    current -= amount * unit.value;
    parts.push(`${amount}${unit.label}`);
  }

  return parts.join(" ") || "0s";
}

function toTimestampTag(value, style = "R") {
  const timestamp = value instanceof Date ? value.getTime() : Number(value);

  if (!timestamp) {
    return "`-`";
  }

  return `<t:${Math.floor(timestamp / 1000)}:${style}>`;
}

function getActionMeta(action) {
  return ACTION_META[action] || {
    label: action,
    color: "#1f2937",
    emoji: "•"
  };
}

function buildTargetLabel(targetId, targetTag) {
  return targetId ? `<@${targetId}> (\`${targetTag || targetId}\`)` : targetTag || "`-`";
}

function getActiveWarnings(guildId, targetId) {
  return listCases((entry) =>
    entry.guildId === guildId
    && entry.targetId === targetId
    && entry.action === "warn"
    && entry.active !== false
  );
}

function getRecentCases(guildId, targetId, limit = 8) {
  return listCases((entry) => entry.guildId === guildId && entry.targetId === targetId).slice(0, limit);
}

function buildActionEmbed({
  action,
  title,
  targetId,
  targetTag,
  moderatorId,
  reason,
  caseId = null,
  durationMs = null,
  warningCount = null,
  count = null,
  avatarUrl = null,
  extraFields = []
}) {
  const meta = getActionMeta(action);
  const embed = new EmbedBuilder()
    .setColor(meta.color)
    .setTitle(`${meta.emoji} ${title}`)
    .addFields(
      {
        name: "Target",
        value: buildTargetLabel(targetId, targetTag),
        inline: true
      },
      {
        name: "Moderator",
        value: moderatorId ? `<@${moderatorId}>` : "`-`",
        inline: true
      },
      {
        name: "Reason",
        value: reason,
        inline: false
      }
    )
    .setTimestamp();

  if (avatarUrl) {
    embed.setThumbnail(avatarUrl);
  }

  if (caseId) {
    embed.addFields({
      name: "Case",
      value: `#${caseId}`,
      inline: true
    });
  }

  if (durationMs) {
    embed.addFields({
      name: "Duration",
      value: formatDuration(durationMs),
      inline: true
    });
  }

  if (typeof warningCount === "number") {
    embed.addFields({
      name: "Active Warnings",
      value: String(warningCount),
      inline: true
    });
  }

  if (typeof count === "number") {
    embed.addFields({
      name: "Affected",
      value: String(count),
      inline: true
    });
  }

  if (extraFields.length) {
    embed.addFields(...extraFields);
  }

  return embed;
}

function buildCasesEmbed(targetLabel, targetId, cases) {
  const description = cases.length
    ? cases.map((entry) => {
      const meta = getActionMeta(entry.action);
      const status = entry.active === false ? "closed" : "active";
      const duration = entry.durationMs ? ` • ${formatDuration(entry.durationMs)}` : "";

      return [
        `**#${entry.id}** ${meta.emoji} **${meta.label}** • ${toTimestampTag(new Date(entry.createdAt).getTime())}`,
        `Moderator: <@${entry.moderatorId}> • Status: \`${status}\`${duration}`,
        `Reason: ${entry.reason}`
      ].join("\n");
    }).join("\n\n")
    : "Belum ada riwayat moderasi untuk target ini.";

  return new EmbedBuilder()
    .setColor("#111827")
    .setTitle("📁 Moderation Cases")
    .setDescription(description)
    .addFields({
      name: "Target",
      value: targetId ? `${targetLabel}\n\`${targetId}\`` : targetLabel,
      inline: false
    })
    .setTimestamp();
}

function buildWarningsEmbed(member, warnings) {
  const warningLines = warnings.length
    ? warnings.map((entry) => [
      `**#${entry.id}** • ${toTimestampTag(new Date(entry.createdAt).getTime())}`,
      `Moderator: <@${entry.moderatorId}>`,
      `Reason: ${entry.reason}`
    ].join("\n")).join("\n\n")
    : "Member ini tidak punya warning aktif.";

  return new EmbedBuilder()
    .setColor("#f59e0b")
    .setTitle("⚠️ Active Warnings")
    .setDescription(warningLines)
    .addFields({
      name: "Target",
      value: `${member}\n\`${member.user.tag}\``,
      inline: false
    })
    .setThumbnail(member.displayAvatarURL({ size: 256 }))
    .setTimestamp();
}

function buildModerationPanel(member) {
  const activeWarnings = getActiveWarnings(member.guild.id, member.id);
  const recentCases = getRecentCases(member.guild.id, member.id, 3);
  const timeoutUntil = member.communicationDisabledUntilTimestamp
    ? `${toTimestampTag(member.communicationDisabledUntilTimestamp)}`
    : "`none`";
  const casePreview = recentCases.length
    ? recentCases.map((entry) => {
      const meta = getActionMeta(entry.action);
      return `#${entry.id} ${meta.emoji} ${meta.label} • ${toTimestampTag(new Date(entry.createdAt).getTime())}`;
    }).join("\n")
    : "Belum ada riwayat.";

  const embed = new EmbedBuilder()
    .setColor("#111827")
    .setTitle("Moderation Console")
    .setDescription(
      [
        `${member} siap dimoderasi lewat panel ini.`,
        `Tag: \`${member.user.tag}\``,
        `ID: \`${member.id}\``
      ].join("\n")
    )
    .addFields(
      {
        name: "Profile",
        value: [
          `Joined: ${toTimestampTag(member.joinedTimestamp)}`,
          `Created: ${toTimestampTag(member.user.createdTimestamp)}`
        ].join("\n"),
        inline: true
      },
      {
        name: "Status",
        value: [
          `Active warnings: **${activeWarnings.length}**`,
          `Timeout: ${timeoutUntil}`
        ].join("\n"),
        inline: true
      },
      {
        name: "Recent Cases",
        value: casePreview,
        inline: false
      }
    )
    .setThumbnail(member.displayAvatarURL({ size: 256 }))
    .setFooter({
      text: "Use the buttons below for quick moderation actions."
    })
    .setTimestamp();

  return {
    embeds: [embed],
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`${MOD_PANEL_PREFIX}warn:${member.id}`)
          .setLabel("Warn")
          .setEmoji("⚠️")
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId(`${MOD_PANEL_PREFIX}timeout:${member.id}`)
          .setLabel("Timeout")
          .setEmoji("⏳")
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId(`${MOD_PANEL_PREFIX}kick:${member.id}`)
          .setLabel("Kick")
          .setEmoji("👢")
          .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
          .setCustomId(`${MOD_PANEL_PREFIX}ban:${member.id}`)
          .setLabel("Ban")
          .setEmoji("🔨")
          .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
          .setCustomId(`${MOD_PANEL_PREFIX}cases:${member.id}`)
          .setLabel("Cases")
          .setEmoji("📁")
          .setStyle(ButtonStyle.Secondary)
      ),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`${MOD_PANEL_PREFIX}untimeout:${member.id}`)
          .setLabel("Remove Timeout")
          .setEmoji("✅")
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId(`${MOD_PANEL_PREFIX}clearwarns:${member.id}`)
          .setLabel("Clear Warns")
          .setEmoji("🧹")
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId(`${MOD_PANEL_PREFIX}refresh:${member.id}`)
          .setLabel("Refresh")
          .setEmoji("🔄")
          .setStyle(ButtonStyle.Secondary)
      )
    ]
  };
}

function buildActionModal(action, userId) {
  const meta = getActionMeta(action);
  const modal = new ModalBuilder()
    .setCustomId(`${MOD_MODAL_PREFIX}${action}:${userId}`)
    .setTitle(`${meta.label} Member`);

  if (action === "timeout") {
    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId(MOD_DURATION_INPUT_ID)
          .setLabel("Durasi timeout (contoh: 30m, 2h, 1d)")
          .setRequired(true)
          .setMaxLength(30)
          .setStyle(TextInputStyle.Short)
      )
    );
  }

  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId(MOD_REASON_INPUT_ID)
        .setLabel("Alasan")
        .setRequired(action !== "untimeout")
        .setMaxLength(300)
        .setStyle(TextInputStyle.Paragraph)
    )
  );

  return modal;
}

function ensurePendingActions(client) {
  if (!client.pendingModerationActions) {
    client.pendingModerationActions = new Map();
  }

  return client.pendingModerationActions;
}

function registerPendingAction(client, payload) {
  const token = randomUUID().split("-")[0];
  const store = ensurePendingActions(client);
  const record = {
    ...payload,
    token,
    createdAt: Date.now()
  };

  store.set(token, record);

  setTimeout(() => {
    const current = store.get(token);

    if (current?.createdAt === record.createdAt) {
      store.delete(token);
    }
  }, PENDING_ACTION_TTL_MS);

  return record;
}

function getPendingAction(client, token) {
  const store = ensurePendingActions(client);
  return store.get(token) || null;
}

function consumePendingAction(client, token) {
  const store = ensurePendingActions(client);
  const current = store.get(token) || null;

  if (current) {
    store.delete(token);
  }

  return current;
}

function buildConfirmationComponents(token, style = ButtonStyle.Danger) {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`${MOD_CONFIRM_PREFIX}${token}`)
        .setLabel("Confirm")
        .setStyle(style),
      new ButtonBuilder()
        .setCustomId(`${MOD_CANCEL_PREFIX}${token}`)
        .setLabel("Cancel")
        .setStyle(ButtonStyle.Secondary)
    )
  ];
}

function buildConfirmationEmbed(pending) {
  const meta = getActionMeta(pending.action);
  const detailLines = [
    `Action: **${meta.label}**`,
    pending.targetId ? `Target: <@${pending.targetId}>` : null,
    pending.count ? `Jumlah: **${pending.count}**` : null,
    pending.durationMs ? `Durasi: **${formatDuration(pending.durationMs)}**` : null,
    `Reason: ${pending.reason}`
  ].filter(Boolean);

  return new EmbedBuilder()
    .setColor(meta.color)
    .setTitle(`${meta.emoji} Confirm Moderation Action`)
    .setDescription(detailLines.join("\n"))
    .setFooter({
      text: "Confirm untuk menjalankan aksi, cancel untuk membatalkan."
    })
    .setTimestamp();
}

async function sendModerationLog(guild, client, embed) {
  // Deprecated: diganti oleh sendModLog (per kategori).
  // Dipertahankan untuk backward compat command lama yang belum diupdate.
  // Untuk log ke forum per kategori, pakai sendModLog(guild, categoryKey, embed).
  const settings = getModerationSettings(guild.id);

  if (!settings.logChannelId) {
    return;
  }

  const logChannel = await guild.channels.fetch(settings.logChannelId).catch(() => null);

  if (!logChannel || logChannel.type !== ChannelType.GuildText) {
    return;
  }

  await logChannel.send({
    embeds: [embed]
  }).catch(() => null);
}

function createCaseEntryPayload(action, moderator, target, reason, overrides = {}) {
  return {
    guildId: target.guild.id,
    action,
    targetId: target.id,
    targetTag: target.user.tag,
    targetDisplayName: target.displayName,
    moderatorId: moderator.id,
    moderatorTag: moderator.tag,
    reason,
    active: overrides.active ?? false,
    createdAt: new Date().toISOString(),
    ...overrides
  };
}

async function warnMember(targetMember, moderatorUser, reason, client) {
  const createdCase = createCase(createCaseEntryPayload("warn", moderatorUser, targetMember, reason, {
    active: true
  }));
  const activeWarnings = getActiveWarnings(targetMember.guild.id, targetMember.id).length;
  const embed = buildActionEmbed({
    action: "warn",
    title: "Warning Issued",
    targetId: targetMember.id,
    targetTag: targetMember.user.tag,
    moderatorId: moderatorUser.id,
    reason,
    caseId: createdCase.id,
    warningCount: activeWarnings,
    avatarUrl: targetMember.displayAvatarURL({ size: 256 })
  });

  await sendModLog(targetMember.guild, "warn", embed);

  return {
    caseEntry: createdCase,
    embed
  };
}

async function clearWarnings(targetMember, moderatorUser, reason, client) {
  const updatedWarnings = updateCases(
    (entry) =>
      entry.guildId === targetMember.guild.id
      && entry.targetId === targetMember.id
      && entry.action === "warn"
      && entry.active !== false,
    (entry) => ({
      ...entry,
      active: false,
      resolvedAt: new Date().toISOString(),
      resolvedBy: moderatorUser.id,
      resolveReason: reason
    })
  );

  if (!updatedWarnings.length) {
    return {
      ok: false,
      reason: "Member ini tidak punya warning aktif."
    };
  }

  const createdCase = createCase(createCaseEntryPayload("clear-warnings", moderatorUser, targetMember, reason, {
    count: updatedWarnings.length
  }));
  const embed = buildActionEmbed({
    action: "clear-warnings",
    title: "Warnings Cleared",
    targetId: targetMember.id,
    targetTag: targetMember.user.tag,
    moderatorId: moderatorUser.id,
    reason,
    caseId: createdCase.id,
    count: updatedWarnings.length,
    avatarUrl: targetMember.displayAvatarURL({ size: 256 })
  });

  await sendModLog(targetMember.guild, "warn", embed);

  return {
    ok: true,
    caseEntry: createdCase,
    embed
  };
}

async function timeoutMember(targetMember, moderatorUser, durationMs, reason, client) {
  await targetMember.timeout(durationMs, reason);

  updateCases(
    (entry) =>
      entry.guildId === targetMember.guild.id
      && entry.targetId === targetMember.id
      && entry.action === "timeout"
      && entry.active !== false,
    (entry) => ({
      ...entry,
      active: false
    })
  );

  const expiresAt = new Date(Date.now() + durationMs).toISOString();
  const createdCase = createCase(createCaseEntryPayload("timeout", moderatorUser, targetMember, reason, {
    active: true,
    durationMs,
    expiresAt
  }));
  const embed = buildActionEmbed({
    action: "timeout",
    title: "Member Timed Out",
    targetId: targetMember.id,
    targetTag: targetMember.user.tag,
    moderatorId: moderatorUser.id,
    reason,
    caseId: createdCase.id,
    durationMs,
    avatarUrl: targetMember.displayAvatarURL({ size: 256 }),
    extraFields: [
      {
        name: "Expires",
        value: toTimestampTag(new Date(expiresAt).getTime(), "f"),
        inline: true
      }
    ]
  });

  await sendModLog(targetMember.guild, "mute", embed);

  return {
    caseEntry: createdCase,
    embed
  };
}

async function removeTimeout(targetMember, moderatorUser, reason, client) {
  await targetMember.timeout(null, reason);

  updateCases(
    (entry) =>
      entry.guildId === targetMember.guild.id
      && entry.targetId === targetMember.id
      && entry.action === "timeout"
      && entry.active !== false,
    (entry) => ({
      ...entry,
      active: false,
      resolvedAt: new Date().toISOString(),
      resolvedBy: moderatorUser.id
    })
  );

  const createdCase = createCase(createCaseEntryPayload("untimeout", moderatorUser, targetMember, reason));
  const embed = buildActionEmbed({
    action: "untimeout",
    title: "Timeout Removed",
    targetId: targetMember.id,
    targetTag: targetMember.user.tag,
    moderatorId: moderatorUser.id,
    reason,
    caseId: createdCase.id,
    avatarUrl: targetMember.displayAvatarURL({ size: 256 })
  });

  await sendModLog(targetMember.guild, "mute", embed);

  return {
    caseEntry: createdCase,
    embed
  };
}

async function kickMember(targetMember, moderatorUser, reason, client) {
  const targetId = targetMember.id;
  const targetTag = targetMember.user.tag;
  const avatarUrl = targetMember.displayAvatarURL({ size: 256 });

  await targetMember.kick(reason);

  const createdCase = createCase({
    guildId: targetMember.guild.id,
    action: "kick",
    targetId,
    targetTag,
    targetDisplayName: targetMember.displayName,
    moderatorId: moderatorUser.id,
    moderatorTag: moderatorUser.tag,
    reason,
    active: false,
    createdAt: new Date().toISOString()
  });
  const embed = buildActionEmbed({
    action: "kick",
    title: "Member Kicked",
    targetId,
    targetTag,
    moderatorId: moderatorUser.id,
    reason,
    caseId: createdCase.id,
    avatarUrl
  });

  await sendModLog(targetMember.guild, "kick", embed);

  return {
    caseEntry: createdCase,
    embed
  };
}

async function banMember(targetMember, moderatorUser, reason, client) {
  const targetId = targetMember.id;
  const targetTag = targetMember.user.tag;
  const avatarUrl = targetMember.displayAvatarURL({ size: 256 });

  await targetMember.ban({
    reason,
    deleteMessageSeconds: 0
  });

  const createdCase = createCase({
    guildId: targetMember.guild.id,
    action: "ban",
    targetId,
    targetTag,
    targetDisplayName: targetMember.displayName,
    moderatorId: moderatorUser.id,
    moderatorTag: moderatorUser.tag,
    reason,
    active: false,
    createdAt: new Date().toISOString()
  });
  const embed = buildActionEmbed({
    action: "ban",
    title: "Member Banned",
    targetId,
    targetTag,
    moderatorId: moderatorUser.id,
    reason,
    caseId: createdCase.id,
    avatarUrl
  });

  await sendModLog(targetMember.guild, "ban", embed);

  return {
    caseEntry: createdCase,
    embed
  };
}

async function unbanUser(guild, userId, moderatorUser, reason, client) {
  const normalizedUserId = extractId(userId);

  if (!normalizedUserId) {
    return {
      ok: false,
      reason: "Masukkan user ID yang valid."
    };
  }

  const banEntry = await guild.bans.fetch(normalizedUserId).catch(() => null);

  if (!banEntry) {
    return {
      ok: false,
      reason: "User itu tidak sedang diban."
    };
  }

  await guild.members.unban(normalizedUserId, reason);

  const createdCase = createCase({
    guildId: guild.id,
    action: "unban",
    targetId: banEntry.user.id,
    targetTag: banEntry.user.tag,
    targetDisplayName: banEntry.user.username,
    moderatorId: moderatorUser.id,
    moderatorTag: moderatorUser.tag,
    reason,
    active: false,
    createdAt: new Date().toISOString()
  });
  const embed = buildActionEmbed({
    action: "unban",
    title: "User Unbanned",
    targetId: banEntry.user.id,
    targetTag: banEntry.user.tag,
    moderatorId: moderatorUser.id,
    reason,
    caseId: createdCase.id,
    avatarUrl: banEntry.user.displayAvatarURL({ size: 256 })
  });

  await sendModLog(guild, "ban", embed);

  return {
    ok: true,
    caseEntry: createdCase,
    embed
  };
}

function buildPurgeConfirmation(client, channel, amount, requesterId) {
  const pending = registerPendingAction(client, {
    action: "purge",
    channelId: channel.id,
    guildId: channel.guild.id,
    requesterId,
    count: amount,
    reason: `Bulk delete ${amount} messages in #${channel.name}.`
  });

  return {
    embeds: [buildConfirmationEmbed(pending)],
    components: buildConfirmationComponents(pending.token, ButtonStyle.Danger)
  };
}

async function executePendingAction(interaction, client, pending) {
  if (pending.action === "kick") {
    const member = await interaction.guild.members.fetch(pending.targetId).catch(() => null);

    if (!member) {
      return {
        ok: false,
        reason: "Member target sudah tidak ada di server."
      };
    }

    const result = await kickMember(member, interaction.user, pending.reason, client);
    return {
      ok: true,
      embed: result.embed
    };
  }

  if (pending.action === "ban") {
    const member = await interaction.guild.members.fetch(pending.targetId).catch(() => null);

    if (!member) {
      return {
        ok: false,
        reason: "Member target sudah tidak ada di server."
      };
    }

    const result = await banMember(member, interaction.user, pending.reason, client);
    return {
      ok: true,
      embed: result.embed
    };
  }

  if (pending.action === "clear-warnings") {
    const member = await interaction.guild.members.fetch(pending.targetId).catch(() => null);

    if (!member) {
      return {
        ok: false,
        reason: "Member target tidak ditemukan."
      };
    }

    const result = await clearWarnings(member, interaction.user, pending.reason, client);

    if (!result.ok) {
      return result;
    }

    return {
      ok: true,
      embed: result.embed
    };
  }

  if (pending.action === "purge") {
    const channel = await interaction.guild.channels.fetch(pending.channelId).catch(() => null);

    if (!channel || channel.id !== interaction.channelId || channel.type !== ChannelType.GuildText) {
      return {
        ok: false,
        reason: "Channel target purge tidak lagi tersedia."
      };
    }

    const targetMessages = await channel.messages.fetch({
      limit: pending.count,
      before: interaction.message.id
    }).catch(() => null);

    if (!targetMessages?.size) {
      return {
        ok: false,
        reason: "Tidak ada pesan yang bisa dihapus sebelum panel konfirmasi ini."
      };
    }

    const deleted = await channel.bulkDelete(targetMessages, true).catch(() => null);

    if (!deleted) {
      return {
        ok: false,
        reason: "Gagal menghapus pesan. Pastikan pesan masih baru dan bot punya izin."
      };
    }

    const embed = buildActionEmbed({
      action: "purge",
      title: "Messages Purged",
      targetId: null,
      targetTag: `#${channel.name}`,
      moderatorId: interaction.user.id,
      reason: pending.reason,
      count: deleted.size,
      extraFields: [
        {
          name: "Channel",
          value: `${channel}`,
          inline: true
        }
      ]
    });

    await sendModerationLog(interaction.guild, client, embed);

    return {
      ok: true,
      embed
    };
  }

  return {
    ok: false,
    reason: "Aksi moderasi pending tidak dikenali."
  };
}

async function handleConfirmButton(interaction, client, token) {
  const pending = getPendingAction(client, token);

  if (!pending) {
    await interaction.reply({
      content: "Aksi ini sudah kedaluwarsa atau sudah diproses.",
      ephemeral: true
    });
    return true;
  }

  if (pending.requesterId && interaction.user.id !== pending.requesterId) {
    await interaction.reply({
      content: "Hanya moderator yang membuat aksi ini yang bisa mengonfirmasinya.",
      ephemeral: true
    });
    return true;
  }

  consumePendingAction(client, token);

  const result = await executePendingAction(interaction, client, pending);

  if (!result.ok) {
    await interaction.update({
      embeds: [
        new EmbedBuilder()
          .setColor("#ef4444")
          .setTitle("Moderation Action Failed")
          .setDescription(result.reason)
          .setTimestamp()
      ],
      components: []
    });
    return true;
  }

  await interaction.update({
    embeds: [result.embed],
    components: []
  });

  return true;
}

async function handleCancelButton(interaction, client, token) {
  const pending = getPendingAction(client, token);

  if (!pending) {
    await interaction.reply({
      content: "Aksi ini sudah kedaluwarsa atau sudah selesai.",
      ephemeral: true
    });
    return true;
  }

  if (pending.requesterId && interaction.user.id !== pending.requesterId) {
    await interaction.reply({
      content: "Hanya moderator yang membuat aksi ini yang bisa membatalkannya.",
      ephemeral: true
    });
    return true;
  }

  consumePendingAction(client, token);

  await interaction.update({
    embeds: [
      new EmbedBuilder()
        .setColor("#6b7280")
        .setTitle("Moderation Action Cancelled")
        .setDescription("Aksi moderasi dibatalkan sebelum dijalankan.")
        .setTimestamp()
    ],
    components: []
  });

  return true;
}

async function handlePanelButton(interaction, client, action, targetId) {
  const mappedAction = action === "clearwarns" ? "clear-warnings" : action;
  const permissionKey = action === "refresh" ? "modpanel" : mappedAction;
  const permissionError = ensureActionPermission(interaction.member, permissionKey);

  if (permissionError && action !== "refresh") {
    await interaction.reply({
      content: permissionError,
      ephemeral: true
    });
    return true;
  }

  const targetMember = await interaction.guild.members.fetch(targetId).catch(() => null);

  if (!targetMember) {
    await interaction.reply({
      content: "Member target tidak ditemukan.",
      ephemeral: true
    });
    return true;
  }

  if (action === "cases") {
    await interaction.reply({
      embeds: [buildCasesEmbed(targetMember.user.tag, targetMember.id, getRecentCases(interaction.guildId, targetMember.id))],
      ephemeral: true
    });
    return true;
  }

  if (action === "refresh") {
    await interaction.update(buildModerationPanel(targetMember));
    return true;
  }

  if (action === "clearwarns") {
    const targetError = validateTargetMember("warn", interaction.member, targetMember);

    if (targetError) {
      await interaction.reply({
        content: targetError,
        ephemeral: true
      });
      return true;
    }

    const pending = registerPendingAction(client, {
      action: "clear-warnings",
      guildId: interaction.guildId,
      requesterId: interaction.user.id,
      targetId: targetMember.id,
      reason: "Warning dibersihkan dari moderation panel."
    });

    await interaction.reply({
      embeds: [buildConfirmationEmbed(pending)],
      components: buildConfirmationComponents(pending.token, ButtonStyle.Success),
      ephemeral: true
    });
    return true;
  }

  const targetError = validateTargetMember(mappedAction, interaction.member, targetMember);

  if (targetError) {
    await interaction.reply({
      content: targetError,
      ephemeral: true
    });
    return true;
  }

  await interaction.showModal(buildActionModal(action, targetMember.id));
  return true;
}

async function handleModerationButton(interaction, client) {
  if (!interaction.customId.startsWith("mod:")) {
    return false;
  }

  if (interaction.customId.startsWith(MOD_CONFIRM_PREFIX)) {
    return handleConfirmButton(interaction, client, interaction.customId.slice(MOD_CONFIRM_PREFIX.length));
  }

  if (interaction.customId.startsWith(MOD_CANCEL_PREFIX)) {
    return handleCancelButton(interaction, client, interaction.customId.slice(MOD_CANCEL_PREFIX.length));
  }

  if (interaction.customId.startsWith(MOD_PANEL_PREFIX)) {
    const payload = interaction.customId.slice(MOD_PANEL_PREFIX.length);
    const [action, targetId] = payload.split(":");
    return handlePanelButton(interaction, client, action, targetId);
  }

  return false;
}

async function handleModerationModalSubmit(interaction, client) {
  if (!interaction.customId.startsWith(MOD_MODAL_PREFIX)) {
    return false;
  }

  const payload = interaction.customId.slice(MOD_MODAL_PREFIX.length);
  const [action, targetId] = payload.split(":");
  const permissionError = ensureActionPermission(interaction.member, action);

  if (permissionError) {
    await interaction.reply({
      content: permissionError,
      ephemeral: true
    });
    return true;
  }

  const targetMember = await interaction.guild.members.fetch(targetId).catch(() => null);

  if (!targetMember) {
    await interaction.reply({
      content: "Member target tidak ditemukan.",
      ephemeral: true
    });
    return true;
  }

  const targetError = validateTargetMember(action, interaction.member, targetMember);

  if (targetError) {
    await interaction.reply({
      content: targetError,
      ephemeral: true
    });
    return true;
  }

  const reason = normalizeReason(
    interaction.fields.getTextInputValue(MOD_REASON_INPUT_ID),
    `Actioned from moderation panel by ${interaction.user.tag}.`
  );

  if (action === "warn") {
    const result = await warnMember(targetMember, interaction.user, reason, client);

    await interaction.reply({
      embeds: [result.embed],
      ephemeral: true
    });
    return true;
  }

  if (action === "timeout") {
    const durationValue = interaction.fields.getTextInputValue(MOD_DURATION_INPUT_ID);
    const durationMs = parseDuration(durationValue);
    const maxDurationMs = 28 * 24 * 60 * 60 * 1000;

    if (!durationMs || durationMs < 60 * 1000 || durationMs > maxDurationMs) {
      await interaction.reply({
        content: "Durasi timeout tidak valid. Gunakan format seperti `30m`, `2h`, atau `1d` dengan batas maksimal 28 hari.",
        ephemeral: true
      });
      return true;
    }

    const result = await timeoutMember(targetMember, interaction.user, durationMs, reason, client);

    await interaction.reply({
      embeds: [result.embed],
      ephemeral: true
    });
    return true;
  }

  if (action === "untimeout") {
    const result = await removeTimeout(targetMember, interaction.user, reason, client);

    await interaction.reply({
      embeds: [result.embed],
      ephemeral: true
    });
    return true;
  }

  if (action === "kick" || action === "ban") {
    const pending = registerPendingAction(client, {
      action,
      guildId: interaction.guildId,
      requesterId: interaction.user.id,
      targetId: targetMember.id,
      reason
    });

    await interaction.reply({
      embeds: [buildConfirmationEmbed(pending)],
      components: buildConfirmationComponents(pending.token, ButtonStyle.Danger),
      ephemeral: true
    });
    return true;
  }

  return false;
}

module.exports = {
  banMember,
  buildCasesEmbed,
  buildModerationPanel,
  buildPurgeConfirmation,
  buildWarningsEmbed,
  clearWarnings,
  ensureActionPermission,
  getActiveWarnings,
  getRecentCases,
  getModerationSettings,
  handleModerationButton,
  handleModerationModalSubmit,
  kickMember,
  parseDuration,
  removeTimeout,
  resolveMemberFromInput,
  resolveMemberFromMessage,
  setModerationLogChannel,
  timeoutMember,
  unbanUser,
  validateTargetMember,
  warnMember
};
