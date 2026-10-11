const { createTemplateCommand } = require("./templateUtils");

module.exports = createTemplateCommand({
  name: "partnershiphelp",
  description: "Kirim bantuan singkat untuk alur ticket partnership.",
  title: "Bantuan Ticket Partnership",
  introLines: [
    "Halo, terima kasih sudah membuka ticket partnership.",
    "Sebelum pengajuan diproses, mohon pastikan server kamu sudah memenuhi syarat dasar partnership Murphy."
  ],
  formLines: [
    "Syarat utama partnership:",
    "- Minimal 500 member aktif",
    "- Member tidak termasuk bot",
    "- Bersedia melakukan promosi timbal balik",
    "- Tidak mengandung konten NSFW",
    "- Tidak melanggar ToS Discord",
    "",
    "Data yang perlu disiapkan:",
    "1. Nama server",
    "2. Jumlah member aktif",
    "3. Tema atau fokus komunitas",
    "4. Link invite server",
    "5. Tujuan partnership"
  ],
  closingLines: [
    "Kalau semua data sudah siap, silakan kirim langsung di ticket ini dan tim kami akan meninjau secepat mungkin."
  ]
});
