const store = require("../../services/staffStore");
const {
  getSettings,
  checkOut,
  getAllAttendanceForGuild
} = store;

function startStaffDutyScheduler(client) {
  // Jalankan setiap 5 menit agar window 23:50-23:59 selalu tertangkap
  const interval = setInterval(async () => {
    try {
      const guilds = [...client.guilds.cache.values()];

      for (const guild of guilds) {
        const settings = getSettings(guild.id);
        if (!settings.logChannelId) continue;

        // Cek jam sekarang (timezone-aware menggunakan UTC getter karena sudah ditambah offset)
        const now = new Date();
        const local = new Date(now.getTime() + settings.timezone * 3600000);
        const localHour = local.getUTCHours();
        const localMinute = local.getUTCMinutes();
        const todayKey = local.toISOString().slice(0, 10);
        const isEndOfDayWindow = localHour === 23 && localMinute >= 50;
        const localTimeLabel = `${String(localHour).padStart(2, "0")}:${String(localMinute).padStart(2, "0")}`;

        const allAttendance = getAllAttendanceForGuild(guild.id);

        for (const [userId, records] of Object.entries(allAttendance)) {
          // Auto-checkout pada jam 23:50-23:59 waktu lokal, atau jika ada sesi menggantung dari hari sebelumnya
          const active = records.find((r) => !r.checkoutAt && (isEndOfDayWindow || r.dateKey < todayKey));
          if (active) {
            const result = checkOut(guild.id, userId);

            if (result.ok) {
              // Coba kirim DM ke staff
              try {
                const member = await guild.members.fetch(userId).catch(() => null);
                if (member) {
                  await member.send(
                    `Hai ${member.user.username}, kamu lupa check-out. ` +
                    `Auto check-out dilakukan pukul ${localTimeLabel}. ` +
                    `Total kerja hari ini: ${Math.floor(result.durationMs / 3600000)}j ${Math.floor((result.durationMs % 3600000) / 60000)}m.`
                  ).catch(() => null);
                }
              } catch {
                // ignore DM error
              }

              // Log ke channel
              const channel = guild.channels.cache.get(settings.logChannelId);
              if (channel) {
                await channel.send(
                  `⚙️ **Auto Checkout** — <@${userId}> lupa check-out. ` +
                  `Auto checkout pada ${localTimeLabel}.`
                ).catch(() => null);
              }
            }
          }
        }
      }
    } catch (error) {
      console.error("[StaffDutyScheduler] Error:", error);
    }
  }, 5 * 60 * 1000); // 5 menit

  return interval;
}

module.exports = {
  startStaffDutyScheduler
};
