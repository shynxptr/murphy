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
const {
  clearPendingIconRequest,
  deleteCustomRoleRecord,
  deleteDonorGrant,
  deleteShopGrant,
  getCustomRoleRecord,
  getDonorGrant,
  getPendingIconRequest,
  getShopGrant,
  listCustomRoleRecords,
  listDonorGrants,
  listPendingIconRequests,
  listShopGrants,
  upsertCustomRoleRecord,
  upsertDonorGrant,
  upsertShopGrant,
  upsertPendingIconRequest
} = require("../../services/customRoleStore");
const { createTicketChannel } = require("../tickets/ticketSystem");

const CUSTOM_ROLE_CLAIM_BUTTON_ID = "custom-role:claim";
const CUSTOM_ROLE_FORM_BUTTON_ID = "custom-role:open-form";
const CUSTOM_ROLE_MODAL_CREATE_ID = "custom-role:modal:create";
const CUSTOM_ROLE_MODAL_EDIT_ID = "custom-role:modal:edit";
const CUSTOM_ROLE_ICON_WAIT_MS = 2 * 60 * 1000;
const DEFAULT_CUSTOMIZE_COOLDOWN_DAYS = 7;

const DEFAULT_CUSTOM_ROLE_SETTINGS = {
  donorRoleId: "",
  panelChannelId: "",
  panelMessageId: "",
  ticketCategoryId: "",
  anchorRoleId: "",
  customizeCooldownDays: DEFAULT_CUSTOMIZE_COOLDOWN_DAYS
};

function getCustomRoleSettings(guildId) {
  const settings = getGuildSettings(guildId, {
    customRoles: DEFAULT_CUSTOM_ROLE_SETTINGS
  }).customRoles;

  return {
    ...DEFAULT_CUSTOM_ROLE_SETTINGS,
    ...(settings || {})
  };
}

function updateCustomRoleSettings(guildId, updater) {
  return updateGuildSettings(guildId, (current) => {
    const nextSettings = updater({
      ...DEFAULT_CUSTOM_ROLE_SETTINGS,
      ...(current.customRoles || {})
    });

    return {
      ...current,
      customRoles: {
        ...DEFAULT_CUSTOM_ROLE_SETTINGS,
        ...(nextSettings || {})
      }
    };
  });
}

async function resolveInteractionMember(interaction) {
  if (!interaction.inGuild()) {
    return null;
  }

  const cached = interaction.guild.members.cache.get(interaction.user.id);

  if (cached) {
    return cached;
  }

  return interaction.guild.members.fetch(interaction.user.id).catch(() => null);
}

function hasCustomRoleAdminPermission(member) {
  return member.permissions.has(PermissionFlagsBits.ManageGuild)
    || member.permissions.has(PermissionFlagsBits.ManageRoles);
}

function buildErrorEmbed(description) {
  return new EmbedBuilder()
    .setColor("#ef4444")
    .setTitle("Custom Role Error")
    .setDescription(description)
    .setTimestamp();
}

function buildSuccessEmbed(title, description) {
  return new EmbedBuilder()
    .setColor("#111214")
    .setTitle(title)
    .setDescription(description)
    .setTimestamp();
}

function getGuildIconUrl(guild) {
  return guild.iconURL({
    extension: "png",
    forceStatic: true,
    size: 128
  }) || null;
}

function isServerBooster(member) {
  const premiumRoleId = member.guild.roles.premiumSubscriberRole?.id || "";
  return Boolean(
    member.premiumSinceTimestamp
    || (premiumRoleId && member.roles.cache.has(premiumRoleId))
  );
}

function getActiveGrantStatus(grant) {
  if (!grant?.expiresAt) {
    return {
      active: false,
      expired: true
    };
  }

  const expiresAt = new Date(grant.expiresAt).getTime();

  if (!Number.isFinite(expiresAt)) {
    return {
      active: false,
      expired: true
    };
  }

  return {
    active: expiresAt > Date.now(),
    expired: expiresAt <= Date.now(),
    expiresAt
  };
}

function getMemberDonorRoleIds(guildId, member) {
  const settings = getCustomRoleSettings(guildId);
  const grant = getDonorGrant(guildId, member.id);
  const donorRoleIds = new Set();

  if (settings.donorRoleId) {
    donorRoleIds.add(settings.donorRoleId);
  }

  if (grant?.roleId && getActiveGrantStatus(grant).active) {
    donorRoleIds.add(grant.roleId);
  }

  return [...donorRoleIds].filter(Boolean);
}

function hasDonorAccess(guildId, member) {
  const donorRoleIds = getMemberDonorRoleIds(guildId, member);
  return donorRoleIds.some((roleId) => member.roles.cache.has(roleId));
}

function hasShopAccess(guildId, member) {
  const grant = getShopGrant(guildId, member.id);
  return getActiveGrantStatus(grant).active;
}

function resolveMemberEntitlement(guildId, member) {
  const booster = isServerBooster(member);
  const donor = hasDonorAccess(guildId, member);
  const shop = hasShopAccess(guildId, member);

  return {
    eligible: booster || donor || shop,
    sourceType: booster ? "booster" : donor ? "donator" : shop ? "shop" : "",
    booster,
    donor,
    shop
  };
}

function isValidHexColor(input) {
  return /^#[0-9a-f]{6}$/i.test(String(input || "").trim());
}

function formatDays(days) {
  return `${new Intl.NumberFormat("id-ID").format(days)} hari`;
}

function formatDuration(ms) {
  const totalMinutes = Math.max(1, Math.ceil(ms / 60000));
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;

  if (days > 0) {
    return `${days}h ${hours}j`;
  }

  if (hours > 0) {
    return `${hours}j ${minutes}m`;
  }

  return `${minutes}m`;
}

function getCustomizeCooldownMs(record, guildId) {
  if (!record?.lastCustomizedAt) {
    return 0;
  }

  const settings = getCustomRoleSettings(guildId);
  const cooldownDays = Math.max(1, Number.parseInt(String(settings.customizeCooldownDays || DEFAULT_CUSTOMIZE_COOLDOWN_DAYS), 10) || DEFAULT_CUSTOMIZE_COOLDOWN_DAYS);
  const nextAllowedAt = new Date(record.lastCustomizedAt).getTime() + (cooldownDays * 24 * 60 * 60 * 1000);
  return Math.max(0, nextAllowedAt - Date.now());
}

function canUseRoleIcons(guild) {
  return guild.premiumTier >= 2 || guild.features.includes("ROLE_ICONS");
}

function canManageRole(guild, role) {
  return Boolean(role)
    && !role.managed
    && guild.members.me.roles.highest.comparePositionTo(role) > 0;
}

function canAssignRole(guild, role) {
  return canManageRole(guild, role);
}

async function resolveAnchorRole(guild) {
  const settings = getCustomRoleSettings(guild.id);
  const roleId = settings.anchorRoleId || "";

  if (!roleId) {
    return null;
  }

  return guild.roles.cache.get(roleId)
    || await guild.roles.fetch(roleId).catch(() => null);
}

async function positionCustomRole(guild, role) {
  const anchorRole = await resolveAnchorRole(guild);
  const maxManageablePosition = Math.max(1, guild.members.me.roles.highest.position - 1);
  const targetPosition = anchorRole
    ? Math.min(Math.max(1, anchorRole.position - 1), maxManageablePosition)
    : maxManageablePosition;

  await role.setPosition(targetPosition).catch(() => null);
}

function buildCustomRolePanelEmbed(guild) {
  return new EmbedBuilder()
    .setColor("#111214")
    .setTitle("Klaim Custom Role")
    .setDescription(
      [
        "Panel ini khusus untuk member yang punya akses **booster** atau **donatur**.",
        "Akses temporary dari shop Gazecoin juga akan ikut dikenali otomatis.",
        "",
        "**Aturan:**",
        "- Maksimal 1 custom role per user",
        `- Re-custom role maksimal 1x tiap ${DEFAULT_CUSTOMIZE_COOLDOWN_DAYS} hari`,
        "- Isi nama role dan 2 warna hex lewat modal",
        "- Icon role dikirim setelah modal, bukan di dalam modal",
        "- Kalau server belum boost level 2, icon role otomatis dilewati dulu"
      ].join("\n")
    )
    .setFooter({
      text: `${guild.name} - Murphy Custom Role`,
      iconURL: getGuildIconUrl(guild) || undefined
    })
    .setTimestamp();
}

function buildCustomRoleClaimRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(CUSTOM_ROLE_CLAIM_BUTTON_ID)
      .setLabel("Klaim Custom Role")
      .setStyle(ButtonStyle.Primary)
  );
}

function buildCustomRoleTicketEmbed(guild, member, state, entitlement) {
  const actionLabel = state.mode === "edit" ? "Kustomisasi Role" : "Buat Custom Role";
  const entitlementLabel = entitlement.sourceType === "booster"
    ? "Booster"
    : entitlement.sourceType === "donator"
      ? "Donatur"
      : entitlement.sourceType === "shop"
        ? "Shop Gazecoin Access"
      : "Tidak aktif";
  const iconStatus = canUseRoleIcons(guild)
    ? "Role icon aktif. Setelah modal, kirim gambar icon di ticket ini."
    : "Role icon masih nonaktif karena server belum boost level 2. Nanti otomatis bisa dipakai saat fitur server sudah terbuka.";

  return new EmbedBuilder()
    .setColor("#111214")
    .setTitle("Custom Role Ticket")
    .setDescription(
      [
        `${member}, tiket custom role kamu sudah siap.`,
        `Status akses: **${entitlementLabel}**`,
        `Mode saat ini: **${actionLabel}**`,
        "",
        iconStatus,
        "",
        state.cooldownMs > 0
          ? `Kamu baru bisa kustomisasi lagi dalam **${formatDuration(state.cooldownMs)}**.`
          : "Klik tombol di bawah untuk lanjut ke modal custom role."
      ].join("\n")
    )
    .setFooter({
      text: `${guild.name} - Murphy Custom Role`,
      iconURL: getGuildIconUrl(guild) || undefined
    })
    .setTimestamp();
}

function buildCustomRoleTicketRow(state) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(CUSTOM_ROLE_FORM_BUTTON_ID)
      .setLabel(state.mode === "edit" ? "Kustomisasi Role" : "Buat Role")
      .setStyle(state.cooldownMs > 0 ? ButtonStyle.Secondary : ButtonStyle.Primary)
      .setDisabled(state.cooldownMs > 0)
  );
}

function buildCustomRoleStatusEmbed(guild) {
  const settings = getCustomRoleSettings(guild.id);
  const grantCount = listDonorGrants(guild.id).filter((grant) => getActiveGrantStatus(grant).active).length;
  const customRoleCount = listCustomRoleRecords(guild.id).length;

  return new EmbedBuilder()
    .setColor("#111214")
    .setTitle("Custom Role Settings")
    .addFields(
      {
        name: "Role Donatur",
        value: settings.donorRoleId ? `<@&${settings.donorRoleId}>` : "Belum diatur",
        inline: false
      },
      {
        name: "Panel Klaim",
        value: settings.panelChannelId ? `<#${settings.panelChannelId}>` : "Belum pernah dikirim",
        inline: false
      },
      {
        name: "Kategori Ticket Custom Role",
        value: settings.ticketCategoryId ? `<#${settings.ticketCategoryId}>` : "Belum diatur (pakai kategori ticket umum)",
        inline: false
      },
      {
        name: "Anchor Role Posisi",
        value: settings.anchorRoleId ? `<@&${settings.anchorRoleId}>` : "Belum diatur (ikut posisi aman bot)",
        inline: false
      },
      {
        name: "Cooldown Kustomisasi",
        value: `${settings.customizeCooldownDays || DEFAULT_CUSTOMIZE_COOLDOWN_DAYS} hari`,
        inline: true
      },
      {
        name: "Grant Donatur Aktif",
        value: String(grantCount),
        inline: true
      },
      {
        name: "Custom Role Tercatat",
        value: String(customRoleCount),
        inline: true
      }
    )
    .setFooter({
      text: `${guild.name} - Murphy Custom Role`,
      iconURL: getGuildIconUrl(guild) || undefined
    })
    .setTimestamp();
}

function getTicketOwnerId(channel) {
  return channel.topic?.match(/^ticket-owner:(\d+)\|type:custom-role$/)?.[1] || "";
}

function isCustomRoleTicket(channel) {
  return channel.type === ChannelType.GuildText
    && channel.topic?.endsWith("|type:custom-role");
}

async function resolveStoredCustomRole(guild, userId) {
  const record = getCustomRoleRecord(guild.id, userId);

  if (!record?.roleId) {
    return {
      record: null,
      role: null
    };
  }

  const role = guild.roles.cache.get(record.roleId)
    || await guild.roles.fetch(record.roleId).catch(() => null);

  if (!role) {
    deleteCustomRoleRecord(guild.id, userId);
    return {
      record: null,
      role: null
    };
  }

  return {
    record,
    role
  };
}

function buildRoleModal(customId, existing = null) {
  const modal = new ModalBuilder()
    .setCustomId(customId)
    .setTitle(existing ? "Kustomisasi Custom Role" : "Buat Custom Role");

  const roleNameInput = new TextInputBuilder()
    .setCustomId("role_name")
    .setLabel("Nama Role")
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(32);

  const primaryColorInput = new TextInputBuilder()
    .setCustomId("primary_color")
    .setLabel("Hex Color 1")
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMinLength(7)
    .setMaxLength(7)
    .setPlaceholder("#ff0000");

  const secondaryColorInput = new TextInputBuilder()
    .setCustomId("secondary_color")
    .setLabel("Hex Color 2")
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMinLength(7)
    .setMaxLength(7)
    .setPlaceholder("#00ffcc");

  if (existing?.name) {
    roleNameInput.setValue(existing.name);
  }

  if (existing?.primaryColor) {
    primaryColorInput.setValue(existing.primaryColor);
  }

  if (existing?.secondaryColor) {
    secondaryColorInput.setValue(existing.secondaryColor);
  }

  modal.addComponents(
    new ActionRowBuilder().addComponents(roleNameInput),
    new ActionRowBuilder().addComponents(primaryColorInput),
    new ActionRowBuilder().addComponents(secondaryColorInput)
  );

  return modal;
}

function extractImageAttachment(message) {
  return message.attachments.find((attachment) => {
    if (attachment.contentType?.startsWith("image/")) {
      return true;
    }

    return /\.(png|jpe?g|gif|webp)$/i.test(attachment.name || attachment.url || "");
  }) || null;
}

async function fetchAttachmentBuffer(url) {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Failed to fetch icon attachment: ${response.status}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

async function ensurePendingRequestNotExpired(message, pending) {
  const expiresAt = new Date(pending.expiresAt).getTime();

  if (!Number.isFinite(expiresAt) || expiresAt > Date.now()) {
    return false;
  }

  clearPendingIconRequest(message.guild.id, message.author.id);
  await message.reply({
    embeds: [buildErrorEmbed("Waktu upload icon custom role sudah habis. Tekan tombol kustomisasi lagi kalau mau coba ulang.")]
  }).catch(() => null);

  return true;
}

function getNextGrantExpiry(currentGrant, days) {
  const now = Date.now();
  const currentExpiry = getActiveGrantStatus(currentGrant).active
    ? new Date(currentGrant.expiresAt).getTime()
    : now;
  return new Date(currentExpiry + (days * 24 * 60 * 60 * 1000)).toISOString();
}

function grantShopCustomRoleAccess(guildId, userId, days, grantedBy = "shop") {
  const currentGrant = getShopGrant(guildId, userId);
  const expiresAt = getNextGrantExpiry(currentGrant, days);

  const grant = upsertShopGrant(guildId, userId, {
    grantedBy,
    grantedAt: new Date().toISOString(),
    expiresAt
  });

  return {
    grant,
    expiresAt
  };
}

function revokeShopCustomRoleAccess(guildId, userId) {
  return deleteShopGrant(guildId, userId);
}

async function syncSingleDonorGrant(client, grant) {
  const guild = client.guilds.cache.get(grant.guildId)
    || await client.guilds.fetch(grant.guildId).catch(() => null);

  if (!guild) {
    deleteDonorGrant(grant.guildId, grant.userId);
    return;
  }

  const role = guild.roles.cache.get(grant.roleId)
    || await guild.roles.fetch(grant.roleId).catch(() => null);
  const member = guild.members.cache.get(grant.userId)
    || await guild.members.fetch(grant.userId).catch(() => null);
  const status = getActiveGrantStatus(grant);

  if (!member || !role) {
    if (status.expired) {
      deleteDonorGrant(grant.guildId, grant.userId);
    }

    return;
  }

  if (status.expired) {
    if (member.roles.cache.has(role.id) && canAssignRole(guild, role)) {
      await member.roles.remove(role, "Custom role donor grant expired").catch(() => null);
    }

    deleteDonorGrant(grant.guildId, grant.userId);
    return;
  }

  if (!member.roles.cache.has(role.id) && canAssignRole(guild, role)) {
    await member.roles.add(role, "Custom role donor grant active").catch(() => null);
  }
}

async function syncSingleShopGrant(client, grant) {
  const guild = client.guilds.cache.get(grant.guildId)
    || await client.guilds.fetch(grant.guildId).catch(() => null);

  if (!guild) {
    deleteShopGrant(grant.guildId, grant.userId);
    return;
  }

  const member = guild.members.cache.get(grant.userId)
    || await guild.members.fetch(grant.userId).catch(() => null);
  const status = getActiveGrantStatus(grant);

  if (!member || member.user.bot) {
    if (status.expired) {
      deleteShopGrant(grant.guildId, grant.userId);
    }

    return;
  }

  if (status.expired) {
    deleteShopGrant(grant.guildId, grant.userId);
    return;
  }
}

async function syncSingleCustomRoleRecord(client, record) {
  const guild = client.guilds.cache.get(record.guildId)
    || await client.guilds.fetch(record.guildId).catch(() => null);

  if (!guild) {
    deleteCustomRoleRecord(record.guildId, record.userId);
    clearPendingIconRequest(record.guildId, record.userId);
    return;
  }

  const member = guild.members.cache.get(record.userId)
    || await guild.members.fetch(record.userId).catch(() => null);
  const role = guild.roles.cache.get(record.roleId)
    || await guild.roles.fetch(record.roleId).catch(() => null);

  if (!member || !role) {
    if (role && canManageRole(guild, role)) {
      await role.delete("Cleaning stale custom role record").catch(() => null);
    }

    deleteCustomRoleRecord(record.guildId, record.userId);
    clearPendingIconRequest(record.guildId, record.userId);
    return;
  }

  const entitlement = resolveMemberEntitlement(record.guildId, member);

  if (!entitlement.eligible) {
    if (member.roles.cache.has(role.id) && canAssignRole(guild, role)) {
      await member.roles.remove(role, "Custom role access expired").catch(() => null);
    }

    if (canManageRole(guild, role)) {
      await role.delete("Custom role access expired").catch(() => null);
    }

    deleteCustomRoleRecord(record.guildId, record.userId);
    clearPendingIconRequest(record.guildId, record.userId);
    return;
  }

  if (!member.roles.cache.has(role.id) && canAssignRole(guild, role)) {
    await member.roles.add(role, "Restoring assigned custom role").catch(() => null);
  }

  upsertCustomRoleRecord(record.guildId, record.userId, {
    entitlementSource: entitlement.sourceType,
    updatedAt: new Date().toISOString()
  });
}

async function reconcileAllCustomRoleAccess(client) {
  const donorGrants = listDonorGrants();
  const shopGrants = listShopGrants();
  const customRoleRecords = listCustomRoleRecords();
  const pendingIconRequests = listPendingIconRequests();

  for (const grant of donorGrants) {
    await syncSingleDonorGrant(client, grant);
  }

  for (const grant of shopGrants) {
    await syncSingleShopGrant(client, grant);
  }

  for (const record of customRoleRecords) {
    await syncSingleCustomRoleRecord(client, record);
  }

  for (const pending of pendingIconRequests) {
    const expiresAt = new Date(pending.expiresAt).getTime();

    if (Number.isFinite(expiresAt) && expiresAt <= Date.now()) {
      clearPendingIconRequest(pending.guildId, pending.userId);
    }
  }
}

function startCustomRoleScheduler(client) {
  if (client.customRoleScheduler) {
    return;
  }

  const runSync = async () => {
    await reconcileAllCustomRoleAccess(client);
  };

  runSync().catch((error) => {
    console.error("Initial custom role sync failed:", error);
  });

  client.customRoleScheduler = setInterval(() => {
    runSync().catch((error) => {
      console.error("Scheduled custom role sync failed:", error);
    });
  }, 60 * 60 * 1000);

  if (typeof client.customRoleScheduler.unref === "function") {
    client.customRoleScheduler.unref();
  }
}

async function reconcileCustomRoleMember(member, client) {
  const grant = getDonorGrant(member.guild.id, member.id);
  const shopGrant = getShopGrant(member.guild.id, member.id);
  const record = getCustomRoleRecord(member.guild.id, member.id);

  if (grant) {
    await syncSingleDonorGrant(client, grant);
  }

  if (shopGrant) {
    await syncSingleShopGrant(client, shopGrant);
  }

  if (record) {
    await syncSingleCustomRoleRecord(client, record);
  }
}

async function sendCustomRolePanel(interaction) {
  const channel = interaction.options.getChannel("channel") || interaction.channel;

  if (!channel || channel.type !== ChannelType.GuildText) {
    await interaction.reply({
      embeds: [buildErrorEmbed("Panel custom role hanya bisa dikirim ke text channel biasa.")],
      ephemeral: true
    });
    return;
  }

  const sent = await channel.send({
    embeds: [buildCustomRolePanelEmbed(interaction.guild)],
    components: [buildCustomRoleClaimRow()]
  });

  updateCustomRoleSettings(interaction.guildId, (current) => ({
    ...current,
    panelChannelId: channel.id,
    panelMessageId: sent.id
  }));

  await interaction.reply({
    embeds: [buildSuccessEmbed("Custom Role Panel Sent", `Panel klaim custom role berhasil dikirim ke ${channel}.`)],
    ephemeral: true
  });
}

async function setDonatorRole(interaction) {
  const role = interaction.options.getRole("role", true);

  updateCustomRoleSettings(interaction.guildId, (current) => ({
    ...current,
    donorRoleId: role.id
  }));

  await interaction.reply({
    embeds: [buildSuccessEmbed("Donator Role Updated", `Role donatur custom role berhasil diatur ke ${role}.`)],
    ephemeral: true
  });
}

async function showCustomRoleStatus(interaction) {
  await interaction.reply({
    embeds: [buildCustomRoleStatusEmbed(interaction.guild)],
    ephemeral: true
  });
}

async function grantTemporaryDonatorRole(interaction) {
  const role = interaction.options.getRole("role", true);
  const member = interaction.options.getMember("member")
    || await interaction.guild.members.fetch(interaction.options.getUser("member", true).id).catch(() => null);
  const days = interaction.options.getInteger("days", true);

  if (!member) {
    await interaction.reply({
      embeds: [buildErrorEmbed("Member target tidak ditemukan di server.")],
      ephemeral: true
    });
    return;
  }

  if (member.user.bot) {
    await interaction.reply({
      embeds: [buildErrorEmbed("Role donatur sementara tidak bisa diberikan ke bot.")],
      ephemeral: true
    });
    return;
  }

  if (days <= 0) {
    await interaction.reply({
      embeds: [buildErrorEmbed("Jumlah hari harus lebih besar dari 0.")],
      ephemeral: true
    });
    return;
  }

  if (!canAssignRole(interaction.guild, role)) {
    await interaction.reply({
      embeds: [buildErrorEmbed("Role itu tidak bisa dikelola bot. Pastikan posisinya di bawah role bot dan bukan managed role.")],
      ephemeral: true
    });
    return;
  }

  updateCustomRoleSettings(interaction.guildId, (current) => ({
    ...current,
    donorRoleId: role.id
  }));

  await member.roles.add(role, `Temporary donor access granted by ${interaction.user.tag}`);

  const currentGrant = getDonorGrant(interaction.guildId, member.id);
  const expiresAt = getNextGrantExpiry(currentGrant, days);

  upsertDonorGrant(interaction.guildId, member.id, {
    roleId: role.id,
    grantedBy: interaction.user.id,
    grantedAt: new Date().toISOString(),
    expiresAt
  });

  await interaction.reply({
    embeds: [
      buildSuccessEmbed(
        "Donator Access Granted",
        [
          `${role} berhasil diberikan ke ${member}.`,
          `Durasi aktif: **${formatDays(days)}**`,
          `Expired: <t:${Math.floor(new Date(expiresAt).getTime() / 1000)}:F>`
        ].join("\n")
      )
    ],
    ephemeral: true
  });

  return {
    ok: true,
    member,
    role,
    days,
    expiresAt
  };
}

async function revokeTemporaryDonatorRole(interaction) {
  const member = interaction.options.getMember("member")
    || await interaction.guild.members.fetch(interaction.options.getUser("member", true).id).catch(() => null);

  if (!member) {
    await interaction.reply({
      embeds: [buildErrorEmbed("Member target tidak ditemukan di server.")],
      ephemeral: true
    });
    return;
  }

  const grant = getDonorGrant(interaction.guildId, member.id);
  const settings = getCustomRoleSettings(interaction.guildId);
  const roleId = grant?.roleId || settings.donorRoleId;
  const role = roleId
    ? interaction.guild.roles.cache.get(roleId) || await interaction.guild.roles.fetch(roleId).catch(() => null)
    : null;

  if (!role) {
    deleteDonorGrant(interaction.guildId, member.id);
    await interaction.reply({
      embeds: [buildErrorEmbed("Role donatur belum diatur atau sudah tidak ada.")],
      ephemeral: true
    });
    return;
  }

  if (member.roles.cache.has(role.id) && canAssignRole(interaction.guild, role)) {
    await member.roles.remove(role, `Temporary donor access revoked by ${interaction.user.tag}`).catch(() => null);
  }

  deleteDonorGrant(interaction.guildId, member.id);
  await reconcileCustomRoleMember(member, interaction.client);

  await interaction.reply({
    embeds: [buildSuccessEmbed("Donator Access Revoked", `Akses donatur sementara untuk ${member} berhasil dicabut.`)],
    ephemeral: true
  });

  return {
    ok: true,
    member,
    role
  };
}

async function claimCustomRole(interaction, client) {
  if (!interaction.inGuild()) {
    await interaction.reply({
      embeds: [buildErrorEmbed("Custom role hanya bisa diklaim di server.")],
      ephemeral: true
    }).catch(() => null);
    return true;
  }

  const member = await resolveInteractionMember(interaction);

  if (!member) {
    await interaction.reply({
      embeds: [buildErrorEmbed("Data member tidak bisa diambil. Coba lagi sebentar.")],
      ephemeral: true
    }).catch(() => null);
    return true;
  }

  const entitlement = resolveMemberEntitlement(interaction.guildId, member);

  if (!entitlement.eligible) {
    await interaction.reply({
      content: "Kamu belum punya akses booster, donatur, atau custom-role pass dari shop.",
      ephemeral: true
    }).catch(() => null);
    return true;
  }

  const customRoleSettings = getCustomRoleSettings(interaction.guildId);
  const result = await createTicketChannel(interaction, client, "custom-role", {
    categoryIdOverride: customRoleSettings.ticketCategoryId
  });

  if (!result.ok) {
    await interaction.reply({
      embeds: [buildErrorEmbed(result.reason)],
      ephemeral: true
    }).catch(() => null);
    return true;
  }

  const { record } = await resolveStoredCustomRole(interaction.guild, interaction.user.id);
  const state = {
    mode: record ? "edit" : "create",
    cooldownMs: getCustomizeCooldownMs(record, interaction.guildId)
  };

  await result.channel.send({
    embeds: [buildCustomRoleTicketEmbed(interaction.guild, interaction.user, state, entitlement)],
    components: [buildCustomRoleTicketRow(state)]
  }).catch(() => null);

  await interaction.reply({
    embeds: [buildSuccessEmbed("Ticket Dibuka", `Ticket custom role berhasil dibuat di ${result.channel}.`)],
    ephemeral: true
  }).catch(() => null);

  return true;
}

async function openCustomRoleForm(interaction) {
  if (!interaction.inGuild() || !isCustomRoleTicket(interaction.channel)) {
    await interaction.reply({
      embeds: [buildErrorEmbed("Tombol ini hanya bisa dipakai di ticket custom role.")],
      ephemeral: true
    }).catch(() => null);
    return true;
  }

  const ownerId = getTicketOwnerId(interaction.channel);

  if (interaction.user.id !== ownerId) {
    await interaction.reply({
      embeds: [buildErrorEmbed("Hanya pemilik ticket yang bisa mengisi custom role.")],
      ephemeral: true
    }).catch(() => null);
    return true;
  }

  const member = await resolveInteractionMember(interaction);

  if (!member) {
    await interaction.reply({
      embeds: [buildErrorEmbed("Data member tidak bisa diambil. Coba lagi sebentar.")],
      ephemeral: true
    }).catch(() => null);
    return true;
  }

  const entitlement = resolveMemberEntitlement(interaction.guildId, member);

  if (!entitlement.eligible) {
    await interaction.reply({
      content: "Kamu belum punya akses booster, donatur, atau custom-role pass dari shop.",
      ephemeral: true
    }).catch(() => null);
    return true;
  }

  const { record, role } = await resolveStoredCustomRole(interaction.guild, interaction.user.id);
  const cooldownMs = getCustomizeCooldownMs(record, interaction.guildId);

  if (record && role && cooldownMs > 0) {
    await interaction.reply({
      embeds: [buildErrorEmbed(`Kamu baru bisa kustomisasi lagi dalam ${formatDuration(cooldownMs)}.`)],
      ephemeral: true
    }).catch(() => null);
    return true;
  }

  try {
    await interaction.showModal(
      buildRoleModal(
        record && role ? CUSTOM_ROLE_MODAL_EDIT_ID : CUSTOM_ROLE_MODAL_CREATE_ID,
        record && role ? record : null
      )
    );
  } catch (error) {
    console.error("Failed to open custom role modal:", error);

    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        embeds: [buildErrorEmbed("Gagal membuka modal custom role. Coba tekan tombol sekali lagi.")],
        ephemeral: true
      }).catch(() => null);
    }
  }

  return true;
}

async function createManagedCustomRole(guild, member, data, entitlement) {
  const created = await guild.roles.create({
    name: data.name,
    colors: {
      primaryColor: data.primaryColor,
      secondaryColor: data.secondaryColor
    },
    reason: `Custom role created for ${member.user.tag} (${entitlement.sourceType})`
  });

  await positionCustomRole(guild, created);
  await member.roles.add(created, "Assign custom role");

  return created;
}

async function updateManagedCustomRole(role, data, member, entitlement) {
  const updated = await role.edit({
    name: data.name,
    colors: {
      primaryColor: data.primaryColor,
      secondaryColor: data.secondaryColor
    },
    reason: `Custom role updated for ${member.user.tag} (${entitlement.sourceType})`
  });

  await positionCustomRole(member.guild, updated);
  return updated;
}

async function submitCustomRoleModal(interaction, client, mode) {
  if (!interaction.inGuild() || !isCustomRoleTicket(interaction.channel)) {
    await interaction.reply({
      embeds: [buildErrorEmbed("Modal custom role hanya bisa dipakai di ticket custom role.")],
      ephemeral: true
    }).catch(() => null);
    return true;
  }

  const ownerId = getTicketOwnerId(interaction.channel);

  if (interaction.user.id !== ownerId) {
    await interaction.reply({
      embeds: [buildErrorEmbed("Hanya pemilik ticket yang bisa mengirim modal custom role.")],
      ephemeral: true
    }).catch(() => null);
    return true;
  }

  const member = await resolveInteractionMember(interaction);

  if (!member) {
    await interaction.reply({
      embeds: [buildErrorEmbed("Data member tidak bisa diambil. Coba lagi sebentar.")],
      ephemeral: true
    }).catch(() => null);
    return true;
  }

  const entitlement = resolveMemberEntitlement(interaction.guildId, member);

  if (!entitlement.eligible) {
    await interaction.reply({
      content: "Kamu belum punya akses booster, donatur, atau custom-role pass dari shop.",
      ephemeral: true
    }).catch(() => null);
    return true;
  }

  const roleName = interaction.fields.getTextInputValue("role_name")?.trim() || "";
  const primaryColor = interaction.fields.getTextInputValue("primary_color")?.trim() || "";
  const secondaryColor = interaction.fields.getTextInputValue("secondary_color")?.trim() || "";

  if (!roleName) {
    await interaction.reply({
      embeds: [buildErrorEmbed("Nama role tidak boleh kosong.")],
      ephemeral: true
    }).catch(() => null);
    return true;
  }

  if (!isValidHexColor(primaryColor) || !isValidHexColor(secondaryColor)) {
    await interaction.reply({
      embeds: [buildErrorEmbed("Kedua warna wajib format hex, contoh `#ff0000`.")],
      ephemeral: true
    }).catch(() => null);
    return true;
  }

  const { record, role } = await resolveStoredCustomRole(interaction.guild, interaction.user.id);

  if (mode === "edit" && (!record || !role)) {
    await interaction.reply({
      embeds: [buildErrorEmbed("Custom role lama tidak ditemukan. Coba buat ulang dari tombol tiket.")],
      ephemeral: true
    }).catch(() => null);
    return true;
  }

  if (mode === "edit") {
    const cooldownMs = getCustomizeCooldownMs(record, interaction.guildId);

    if (cooldownMs > 0) {
      await interaction.reply({
        embeds: [buildErrorEmbed(`Kamu baru bisa kustomisasi lagi dalam ${formatDuration(cooldownMs)}.`)],
        ephemeral: true
      }).catch(() => null);
      return true;
    }
  }

  await interaction.deferReply({ ephemeral: true }).catch(() => null);

  let managedRole = role;

  try {
    if (mode === "edit" && role) {
      managedRole = await updateManagedCustomRole(role, {
        name: roleName,
        primaryColor,
        secondaryColor
      }, member, entitlement);
    } else {
      managedRole = await createManagedCustomRole(interaction.guild, member, {
        name: roleName,
        primaryColor,
        secondaryColor
      }, entitlement);
    }
  } catch (error) {
    console.error("Failed to create or update custom role:", error);
    await interaction.editReply({
      embeds: [buildErrorEmbed("Gagal membuat atau mengubah custom role. Pastikan bot punya permission Manage Roles dan posisinya di atas role target.")]
    }).catch(() => null);
    return true;
  }

  upsertCustomRoleRecord(interaction.guildId, interaction.user.id, {
    roleId: managedRole.id,
    name: roleName,
    primaryColor,
    secondaryColor,
    entitlementSource: entitlement.sourceType,
    createdAt: record?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    lastCustomizedAt: new Date().toISOString(),
    lastTicketChannelId: interaction.channelId
  });

  clearPendingIconRequest(interaction.guildId, interaction.user.id);

  if (canUseRoleIcons(interaction.guild)) {
    upsertPendingIconRequest(interaction.guildId, interaction.user.id, {
      roleId: managedRole.id,
      ticketChannelId: interaction.channelId,
      requestedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + CUSTOM_ROLE_ICON_WAIT_MS).toISOString()
    });

    await interaction.channel.send({
      embeds: [
        buildSuccessEmbed(
          mode === "edit" ? "Role Updated" : "Role Created",
          [
            `${interaction.user}, custom role berhasil ${mode === "edit" ? "dikustomisasi" : "dibuat"}.`,
            "Sekarang kirim gambar icon role di ticket ini dalam 2 menit.",
            "Kalau ingin skip icon, ketik `skip`."
          ].join("\n")
        )
      ]
    }).catch(() => null);

    await interaction.editReply({
      embeds: [buildSuccessEmbed("Role Saved", "Data role sudah masuk. Lanjut kirim icon role di ticket ini ya.")]
    }).catch(() => null);
    return true;
  }

  await interaction.channel.send({
    embeds: [
      buildSuccessEmbed(
        mode === "edit" ? "Role Updated" : "Role Created",
        "Custom role berhasil disimpan. Icon role otomatis dilewati karena server belum mendukung role icon."
      )
    ]
  }).catch(() => null);

  await interaction.editReply({
    embeds: [buildSuccessEmbed("Role Saved", "Custom role berhasil disimpan. Icon dilewati dulu karena server belum level 2.")]
  }).catch(() => null);

  return true;
}

async function handleCustomRoleButton(interaction, client) {
  if (interaction.customId === CUSTOM_ROLE_CLAIM_BUTTON_ID) {
    return claimCustomRole(interaction, client);
  }

  if (interaction.customId === CUSTOM_ROLE_FORM_BUTTON_ID) {
    return openCustomRoleForm(interaction);
  }

  return false;
}

async function handleCustomRoleModalSubmit(interaction, client) {
  if (interaction.customId === CUSTOM_ROLE_MODAL_CREATE_ID) {
    return submitCustomRoleModal(interaction, client, "create");
  }

  if (interaction.customId === CUSTOM_ROLE_MODAL_EDIT_ID) {
    return submitCustomRoleModal(interaction, client, "edit");
  }

  return false;
}

async function handlePendingIconSkip(message) {
  clearPendingIconRequest(message.guild.id, message.author.id);

  if (message.deletable) {
    await message.delete().catch(() => null);
  }

  await message.channel.send({
    embeds: [buildSuccessEmbed("Icon Skipped", "Upload icon dilewati. Kamu bisa kustomisasi lagi nanti saat cooldown selesai.")]
  }).catch(() => null);
}

async function handleCustomRoleTicketMessage(message, client) {
  const pending = getPendingIconRequest(message.guild.id, message.author.id);

  if (!pending || pending.ticketChannelId !== message.channel.id) {
    return false;
  }

  if (await ensurePendingRequestNotExpired(message, pending)) {
    return true;
  }

  const content = message.content.trim().toLowerCase();

  if (content === "skip") {
    await handlePendingIconSkip(message);
    return true;
  }

  const attachment = extractImageAttachment(message);

  if (!attachment) {
    return false;
  }

  const { record, role } = await resolveStoredCustomRole(message.guild, message.author.id);

  if (!record || !role || role.id !== pending.roleId) {
    clearPendingIconRequest(message.guild.id, message.author.id);

    await message.reply({
      embeds: [buildErrorEmbed("Role custom tidak ditemukan lagi. Tekan tombol kustomisasi ulang kalau perlu.")]
    }).catch(() => null);
    return true;
  }

  if (!canUseRoleIcons(message.guild)) {
    clearPendingIconRequest(message.guild.id, message.author.id);
    await message.reply({
      embeds: [buildErrorEmbed("Server ini belum mendukung role icon. Icon otomatis dilewati dulu.")]
    }).catch(() => null);
    return true;
  }

  try {
    const buffer = await fetchAttachmentBuffer(attachment.proxyURL || attachment.url);
    await role.setIcon(buffer, `Custom role icon updated by ${message.author.tag}`);

    clearPendingIconRequest(message.guild.id, message.author.id);
    upsertCustomRoleRecord(message.guild.id, message.author.id, {
      updatedAt: new Date().toISOString(),
      iconUpdatedAt: new Date().toISOString()
    });

    if (message.deletable) {
      await message.delete().catch(() => null);
    }

    await message.channel.send({
      embeds: [buildSuccessEmbed("Icon Role Updated", "Icon custom role berhasil dipasang.")]
    }).catch(() => null);
  } catch (error) {
    console.error("Failed to update custom role icon:", error);
    await message.reply({
      embeds: [buildErrorEmbed("Gagal memasang icon role dari gambar itu. Kirim gambar lain atau ketik `skip`.")]
    }).catch(() => null);
  }

  return true;
}

module.exports = {
  CUSTOM_ROLE_CLAIM_BUTTON_ID,
  CUSTOM_ROLE_FORM_BUTTON_ID,
  DEFAULT_CUSTOM_ROLE_SETTINGS,
  getCustomRoleSettings,
  grantShopCustomRoleAccess,
  grantTemporaryDonatorRole,
  handleCustomRoleButton,
  handleCustomRoleModalSubmit,
  handleCustomRoleTicketMessage,
  hasCustomRoleAdminPermission,
  reconcileAllCustomRoleAccess,
  reconcileCustomRoleMember,
  revokeTemporaryDonatorRole,
  revokeShopCustomRoleAccess,
  resolveMemberEntitlement,
  sendCustomRolePanel,
  setDonatorRole,
  showCustomRoleStatus,
  updateCustomRoleSettings,
  startCustomRoleScheduler
};
