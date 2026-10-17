const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  MessageFlags
} = require("discord.js");

const store = require("../../services/staffStore");
const {
  getSettings,
  updateSettings,
  getActiveAttendance,
  checkIn,
  checkOut,
  getAttendanceRecords,
  getAllAttendanceForGuild,
  getSchedule,
  setDaySchedule,
  getTodayKey,
  WEEKDAYS
} = store;

// === Helpers ===

function isStaffMember(member, settings) {
  if (!settings.staffRoleIds || settings.staffRoleIds.length === 0) {
    return false;
  }
  return settings.staffRoleIds.some((roleId) => member.roles.cache.has(roleId));
}

function getStaffSettings(guildId) {
  return getSettings(guildId);
}

function formatDuration(ms) {
  const totalMinutes = Math.floor(ms / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0) {
    return `${hours}j ${minutes}m`;
  }
  return `${minutes}m`;
}

function formatTime(isoString) {
  if (!isoString) return "-";
  const d = new Date(isoString);
  return d.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
}

function getDayName(dayKey) {
  const names = {
    monday: "Senin",
    tuesday: "Selasa",
    wednesday: "Rabu",
    thursday: "Kamis",
    friday: "Jumat",
    saturday: "Sabtu",
    sunday: "Minggu"
  };
  return names[dayKey] || dayKey;
}

function getCurrentDayKey(timezone = 7) {
  const now = new Date();
  const local = new Date(now.getTime() + timezone * 3600000);
  const dayIndex = local.getDay(); // 0=Sunday
  const dayMap = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
  return dayMap[dayIndex];
}

async function sendStaffLog(guild, settings, content) {
  if (!settings.logChannelId) return;
  const channel = guild.channels.cache.get(settings.logChannelId);
  if (!channel) return;
  await channel.send(content).catch(() => null);
}

// === Duty Toggle ===

async function toggleDuty(interaction, client) {
  const settings = getSettings(interaction.guildId);

  if (!isStaffMember(interaction.member, settings)) {
    await interaction.reply({
      content: "Kamu bukan staff. Hanya staff yang bisa toggle duty.",
      flags: MessageFlags.Ephemeral
    }).catch(() => null);
    return;
  }

  if (!settings.onDutyRoleId) {
    await interaction.reply({
      content: "On-Duty role belum diset. Admin bisa pakai `/staff setup create-onduty`.",
      flags: MessageFlags.Ephemeral
    }).catch(() => null);
    return;
  }

  const onDutyRole = interaction.guild.roles.cache.get(settings.onDutyRoleId);
  if (!onDutyRole) {
    await interaction.reply({
      content: "On-Duty role tidak ditemukan di server.",
      flags: MessageFlags.Ephemeral
    }).catch(() => null);
    return;
  }

  const hasRole = interaction.member.roles.cache.has(onDutyRole.id);

  try {
    if (!hasRole) {
      // On Duty
      await interaction.member.roles.add(onDutyRole);
      await interaction.reply({
        content: `Kamu sekarang **On Duty** ${onDutyRole}. Ticket/jobdesk akan diteruskan ke kamu.`,
        flags: MessageFlags.Ephemeral
      }).catch(() => null);
      await sendStaffLog(interaction.guild, settings, `🟢 **${interaction.user.tag}** sekarang **On Duty**.`);
    } else {
      // Off Duty
      await interaction.member.roles.remove(onDutyRole);
      await interaction.reply({
        content: `Kamu sekarang **Off Duty**. Sampai jumpa lagi!`,
        flags: MessageFlags.Ephemeral
      }).catch(() => null);
      await sendStaffLog(interaction.guild, settings, `🔴 **${interaction.user.tag}** sekarang **Off Duty**.`);
    }
  } catch {
    await interaction.reply({
      content: "Gagal mengubah duty. Pastikan posisi role bot lebih tinggi dari On-Duty role.",
      flags: MessageFlags.Ephemeral
    }).catch(() => null);
  }
}

// === Slash Command ===

const slashData = new SlashCommandBuilder()
  .setName("staff")
  .setDescription("Sistem staff: setup, duty, absen, schedule")
  .setDMPermission(false)
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  // Setup
  .addSubcommandGroup((group) =>
    group
      .setName("setup")
      .setDescription("Konfigurasi sistem staff")
      .addSubcommand((sub) =>
        sub
          .setName("roles")
          .setDescription("Set role yang dianggap staff")
          .addRoleOption((opt) =>
            opt.setName("role1").setDescription("Role staff 1").setRequired(true)
          )
          .addRoleOption((opt) =>
            opt.setName("role2").setDescription("Role staff 2 (opsional)")
          )
          .addRoleOption((opt) =>
            opt.setName("role3").setDescription("Role staff 3 (opsional)")
          )
      )
      .addSubcommand((sub) =>
        sub
          .setName("logchannel")
          .setDescription("Set channel untuk log duty & absensi")
          .addChannelOption((opt) =>
            opt
              .setName("channel")
              .setDescription("Channel log")
              .setRequired(true)
          )
      )
      .addSubcommand((sub) =>
        sub
          .setName("create-onduty")
          .setDescription("Auto-create role On-Duty")
      )
      .addSubcommand((sub) =>
        sub
          .setName("info")
          .setDescription("Lihat konfigurasi staff saat ini")
      )
  )
  // Absen
  .addSubcommandGroup((group) =>
    group
      .setName("absen")
      .setDescription("Sistem absensi staff")
      .addSubcommand((sub) => sub.setName("checkin").setDescription("Check-in absensi hari ini"))
      .addSubcommand((sub) => sub.setName("checkout").setDescription("Check-out absensi hari ini"))
      .addSubcommand((sub) =>
        sub
          .setName("status")
          .setDescription("Lihat status absensi kamu hari ini")
      )
      .addSubcommand((sub) =>
        sub
          .setName("report")
          .setDescription("Lihat rekap absensi")
          .addUserOption((opt) =>
            opt.setName("user").setDescription("Lihat absensi user tertentu (opsional)")
          )
          .addIntegerOption((opt) =>
            opt
              .setName("days")
              .setDescription("Jumlah hari ke belakang (default: 7)")
              .setMinValue(1)
              .setMaxValue(90)
          )
      )
  )
  // Schedule
  .addSubcommandGroup((group) =>
    group
      .setName("schedule")
      .setDescription("Atur jadwal kerja staff")
      .addSubcommand((sub) =>
        sub
          .setName("set")
          .setDescription("Set jadwal untuk hari tertentu")
          .addStringOption((opt) =>
            opt
              .setName("hari")
              .setDescription("Pilih hari")
              .setRequired(true)
              .addChoices(
                { name: "Senin", value: "monday" },
                { name: "Selasa", value: "tuesday" },
                { name: "Rabu", value: "wednesday" },
                { name: "Kamis", value: "thursday" },
                { name: "Jumat", value: "friday" },
                { name: "Sabtu", value: "saturday" },
                { name: "Minggu", value: "sunday" }
              )
          )
          .addIntegerOption((opt) =>
            opt
              .setName("start")
              .setDescription("Jam mulai (0-23), e.g. 9 untuk 09:00")
              .setRequired(false)
              .setMinValue(0)
              .setMaxValue(23)
          )
          .addIntegerOption((opt) =>
            opt
              .setName("end")
              .setDescription("Jam selesai (0-23), e.g. 17 untuk 17:00")
              .setRequired(false)
              .setMinValue(0)
              .setMaxValue(23)
          )
      )
      .addSubcommand((sub) => sub.setName("view").setDescription("Lihat jadwal kamu"))
  );

async function executeSlash(interaction, client) {
  if (!interaction.inGuild()) {
    await interaction.reply({ content: "Command ini hanya bisa dipakai di server.", flags: MessageFlags.Ephemeral });
    return;
  }

  const settings = getSettings(interaction.guildId);
  const subcommandGroup = interaction.options.getSubcommandGroup();
  const subcommand = interaction.options.getSubcommand();

  // === SETUP ===
  if (subcommandGroup === "setup") {
    // Admin only — sudah di-filter oleh defaultMemberPermissions
    await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch(() => null);

    if (subcommand === "roles") {
      const role1 = interaction.options.getRole("role1");
      const role2 = interaction.options.getRole("role2");
      const role3 = interaction.options.getRole("role3");

      const roleIds = [role1.id, role2?.id, role3?.id].filter(Boolean);

      updateSettings(interaction.guildId, (current) => ({
        ...current,
        staffRoleIds: roleIds
      }));

      await interaction.editReply(
        `Staff role(s) berhasil diset: ${roleIds.map((id) => `<@&${id}>`).join(", ")}`
      );
      return;
    }

    if (subcommand === "logchannel") {
      const channel = interaction.options.getChannel("channel");

      updateSettings(interaction.guildId, (current) => ({
        ...current,
        logChannelId: channel.id
      }));

      await interaction.editReply(`Log channel berhasil diset: ${channel}`);
      return;
    }

    if (subcommand === "create-onduty") {
      // Cek apakah sudah ada
      if (settings.onDutyRoleId) {
        const existing = interaction.guild.roles.cache.get(settings.onDutyRoleId);
        if (existing) {
          await interaction.editReply(`On-Duty role sudah ada: ${existing}`);
          return;
        }
      }

      // Auto-create
      try {
        const role = await interaction.guild.roles.create({
          name: "On Duty",
          color: 0x22c55e,
          reason: "Auto-created by Murphy staff setup"
        });

        updateSettings(interaction.guildId, (current) => ({
          ...current,
          onDutyRoleId: role.id
        }));

        await interaction.editReply(`On-Duty role berhasil dibuat: ${role}`);
      } catch {
        await interaction.editReply("Gagal membuat role. Pastikan bot punya permission Manage Roles.");
      }
      return;
    }

    if (subcommand === "info") {
      const embed = new EmbedBuilder()
        .setTitle("Staff System Configuration")
        .setColor("#111827")
        .addFields(
          {
            name: "Staff Role(s)",
            value: settings.staffRoleIds.length > 0
              ? settings.staffRoleIds.map((r) => `<@&${r}>`).join(", ")
              : "Belum diset",
            inline: false
          },
          {
            name: "On-Duty Role",
            value: settings.onDutyRoleId ? `<@&${settings.onDutyRoleId}>` : "Belum diset",
            inline: true
          },
          {
            name: "Log Channel",
            value: settings.logChannelId ? `<#${settings.logChannelId}>` : "Belum diset",
            inline: true
          },
          {
            name: "Timezone",
            value: `UTC+${settings.timezone}`,
            inline: true
          }
        );

      await interaction.editReply({ embeds: [embed] });
      return;
    }
  }

  // === ABSEN ===
  if (subcommandGroup === "absen") {
    // Cek apakah user adalah staff
    if (!isStaffMember(interaction.member, settings)) {
      await interaction.reply({
        content: "Kamu bukan staff. Hanya staff yang bisa absen.",
        flags: MessageFlags.Ephemeral
      }).catch(() => null);
      return;
    }

    if (subcommand === "checkin") {
      const result = checkIn(interaction.guildId, interaction.user.id);

      if (!result.ok) {
        await interaction.reply({ content: result.reason, flags: MessageFlags.Ephemeral }).catch(() => null);
        return;
      }

      const time = formatTime(result.checkinAt);
      await interaction.reply({
        content: `Check-in berhasil pukul ${time}. Selamat bekerja!`,
        flags: MessageFlags.Ephemeral
      }).catch(() => null);

      await sendStaffLog(interaction.guild, settings, `📝 **${interaction.user.tag}** check-in pukul ${time}.`);
      return;
    }

    if (subcommand === "checkout") {
      const result = checkOut(interaction.guildId, interaction.user.id);

      if (!result.ok) {
        await interaction.reply({ content: result.reason, flags: MessageFlags.Ephemeral }).catch(() => null);
        return;
      }

      const time = formatTime(result.checkoutAt);
      const duration = formatDuration(result.durationMs);
      await interaction.reply({
        content: `Check-out berhasil pukul ${time}. Total kerja: **${duration}**. Terima kasih!`,
        flags: MessageFlags.Ephemeral
      }).catch(() => null);

      await sendStaffLog(interaction.guild, settings, `📝 **${interaction.user.tag}** check-out pukul ${time} (kerja: ${duration}).`);
      return;
    }

    if (subcommand === "status") {
      const active = getActiveAttendance(interaction.guildId, interaction.user.id);
      const records = getAttendanceRecords(interaction.guildId, interaction.user.id, { days: 7 });

      const embed = new EmbedBuilder()
        .setTitle("Status Absensi Kamu")
        .setColor("#111827")
        .addFields(
          {
            name: "Hari Ini",
            value: active
              ? `Check-in: ${formatTime(active.checkinAt)} (masih aktif)`
              : "Belum check-in"
          },
          {
            name: "7 Hari Terakhir",
            value: `${records.length} hari hadir, total ${formatDuration(records.reduce((sum, r) => sum + (r.durationMs || 0), 0))}`
          }
        );

      await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral }).catch(() => null);
      return;
    }

    if (subcommand === "report") {
      const targetUser = interaction.options.getUser("user");
      const days = interaction.options.getInteger("days") || 7;

      // Kalau lihat absen orang lain, harus admin
      if (targetUser && targetUser.id !== interaction.user.id) {
        if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
          await interaction.reply({
            content: "Kamu butuh permission Manage Server untuk lihat absen orang lain.",
            flags: MessageFlags.Ephemeral
          }).catch(() => null);
          return;
        }
      }

      const userId = targetUser?.id || interaction.user.id;
      const records = getAttendanceRecords(interaction.guildId, userId, { days });

      if (records.length === 0) {
        await interaction.reply({
          content: `Tidak ada data absensi untuk <@${userId}> dalam ${days} hari terakhir.`,
          flags: MessageFlags.Ephemeral
        }).catch(() => null);
        return;
      }

      const totalMs = records.reduce((sum, r) => sum + (r.durationMs || 0), 0);
      const completedCount = records.filter((r) => r.checkoutAt).length;

      const lines = records.slice().reverse().map((r) => {
        const checkin = formatTime(r.checkinAt);
        const checkout = r.checkoutAt ? formatTime(r.checkoutAt) : "Aktif";
        const dur = r.durationMs ? formatDuration(r.durationMs) : "-";
        return `**${r.dateKey}** — ${checkin} → ${checkout} (${dur})`;
      });

      const embed = new EmbedBuilder()
        .setTitle(`Rekap Absensi - ${targetUser?.tag || interaction.user.tag}`)
        .setColor("#111827")
        .setDescription(lines.join("\n"))
        .addFields(
          { name: "Total Hari Hadir", value: String(records.length), inline: true },
          { name: "Total Jam Kerja", value: formatDuration(totalMs), inline: true },
          { name: "Sudah Checkout", value: `${completedCount}/${records.length}`, inline: true }
        )
        .setFooter({ text: `${days} hari terakhir` });

      await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral }).catch(() => null);
      return;
    }
  }

  // === SCHEDULE ===
  if (subcommandGroup === "schedule") {
    // Cek apakah user adalah staff
    if (!isStaffMember(interaction.member, settings)) {
      await interaction.reply({
        content: "Kamu bukan staff. Hanya staff yang bisa atur jadwal.",
        flags: MessageFlags.Ephemeral
      }).catch(() => null);
      return;
    }

    if (subcommand === "set") {
      const day = interaction.options.getString("hari");
      const startHour = interaction.options.getInteger("start");
      const endHour = interaction.options.getInteger("end");

      // Kalau tidak ada start & end → libur
      if (startHour === null && endHour === null) {
        setDaySchedule(interaction.guildId, interaction.user.id, day, null, null);
        await interaction.reply({
          content: `Jadwal **${getDayName(day)}** diset sebagai **Libur**.`,
          flags: MessageFlags.Ephemeral
        }).catch(() => null);
        return;
      }

      if (startHour === null || endHour === null) {
        await interaction.reply({
          content: "Isi kedua jam (start dan end) atau kosongkan keduanya untuk libur.",
          flags: MessageFlags.Ephemeral
        }).catch(() => null);
        return;
      }

      if (endHour <= startHour) {
        await interaction.reply({
          content: "Jam selesai harus lebih besar dari jam mulai.",
          flags: MessageFlags.Ephemeral
        }).catch(() => null);
        return;
      }

      setDaySchedule(interaction.guildId, interaction.user.id, day, startHour, endHour);

      const startStr = String(startHour).padStart(2, "0") + ":00";
      const endStr = String(endHour).padStart(2, "0") + ":00";
      await interaction.reply({
        content: `Jadwal **${getDayName(day)}** diset: ${startStr} - ${endStr}`,
        flags: MessageFlags.Ephemeral
      }).catch(() => null);
      return;
    }

    if (subcommand === "view") {
      const schedule = getSchedule(interaction.guildId, interaction.user.id);
      const today = getCurrentDayKey(settings.timezone);

      const lines = WEEKDAYS.map((day) => {
        const entry = schedule[day];
        const marker = day === today ? " ← hari ini" : "";

        if (!entry || entry.off) {
          return `**${getDayName(day)}**: Libur${marker}`;
        }

        const startStr = String(entry.start).padStart(2, "0") + ":00";
        const endStr = String(entry.end).padStart(2, "0") + ":00";
        return `**${getDayName(day)}**: ${startStr} - ${endStr}${marker}`;
      });

      const embed = new EmbedBuilder()
        .setTitle("Jadwal Kerja Kamu")
        .setColor("#111827")
        .setDescription(lines.join("\n"));

      await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral }).catch(() => null);
      return;
    }
  }
}

module.exports = {
  slashData,
  toggleDuty,
  executeSlash,
  isStaffMember,
  getStaffSettings
};
