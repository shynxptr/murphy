const store = require("../../services/staffStore");
const {
  getSettings,
  checkOut,
  getActiveAttendance,
  getAllAttendanceForGuild
} = store;

function startStaffDutyScheduler(client) {
  // Jalankan setiap 1 jam
  const interval = setInterval(async () => {
    try {
      const guilds = [...client.guilds.cache.values()];

      for (const guild of guilds) {
        const settings = getSettings(guild.id);
        if (!settings.logChannelId) continue;

        // Cek jam sekarang (timezone-aware)
        const now = new Date();
        const local = new Date(now.getTime() + settings.timezone * 3600000);
        const localHour = local.getHours();
        const localMinute = local.getMinutes();

        // Pada jam 23:59 (00:59 waktu lokal), auto-checkout semua staff yang masih aktif
        if (localHour === 23 && localMinute >= 50) {
          const allAttendance = getAllAttendanceForGuild(guild.id);

          for (const [userId, records] of Object.entries(allAttendance)) {
            const active = records.find((r) => !r.checkoutAt);
            if (active) {
              const result = checkOut(guild.id, userId);

              if (result.ok) {
                // Coba kirim DM ke staff
                try {
                  const member = await guild.members.fetch(userId).catch(() => null);
                  if (member) {
                    await member.send(
                      `Hai ${member.user.username}, kamu lupa check-out. ` +
                      `Auto check-out dilakukan pukul ${new Date().toLocaleTimeString("id-ID", { timeZone: "UTC" })}. ` +
                      `Total kerja hari ini: ${Math.round(result.durationMs / 3600000)}j ${Math.round((result.durationMs % 3600000) / 60000)}m.`
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
                    `Auto checkout pada ${new Date().toLocaleTimeString("id-ID")}.`
                  ).catch(() => null);
                }
              }
            }
          }
        }
      }
    } catch (error) {
      console.error("[StaffDutyScheduler] Error:", error);
    }
  }, 60 * 60 * 1000); // 1 jam

  return interval;
}

module.exports = {
  startStaffDutyScheduler
};
