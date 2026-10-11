const {
  ensureProfileAccess,
  buildProfileCatalogEmbed,
  buildProfileSnapshot,
  updateProfileTheme,
  updateProfileTitle,
  updateProfileBio,
  addProfileFavoriteSong,
  removeProfileFavoriteSong,
  clearProfileFavoriteSongs
} = require("./profileSystem");
const { createProfileCard } = require("./profileCard");
const { resolveGuildMember } = require("../../utils/memberResolver");

module.exports = {
  name: "profile",
  aliases: ["pf", "profil"],
  category: "levels",
  description: "Lihat dan atur profile card Murphy.",
  usage: "profile [@member] | profile catalog | profile theme <key> | profile title <key> | profile bio <teks> | profile song <add|remove|clear>",
  async execute(message, args) {
    const firstArg = (args[0] || "").toLowerCase();
    const action = ["catalog", "theme", "title", "bio", "song", "view"].includes(firstArg) ? firstArg : "view";
    const access = ensureProfileAccess(message.guild.id, message.author.id, message.member);

    if (!access.ok) {
      await message.reply(access.reason);
      return;
    }

    if (action === "catalog") {
      const snapshot = await buildProfileSnapshot(message.guild, message.member);
      await message.reply({
        embeds: [buildProfileCatalogEmbed(snapshot.levelInfo)]
      });
      return;
    }

    if (action === "theme") {
      const themeKey = String(args[1] || "").trim().toLowerCase();

      if (!themeKey) {
        await message.reply("Gunakan `f profile theme <key>`.");
        return;
      }

      const snapshot = await buildProfileSnapshot(message.guild, message.member);
      const result = updateProfileTheme(message.guild.id, message.author.id, snapshot.levelInfo.level, themeKey);
      await message.reply(result.ok ? `Theme profile kamu diganti ke **${result.theme.label}**.` : result.reason);
      return;
    }

    if (action === "title") {
      const titleKey = String(args[1] || "").trim().toLowerCase();

      if (!titleKey) {
        await message.reply("Gunakan `f profile title <key>`.");
        return;
      }

      const snapshot = await buildProfileSnapshot(message.guild, message.member);
      const result = updateProfileTitle(message.guild.id, message.author.id, snapshot.levelInfo.level, titleKey);
      await message.reply(result.ok ? `Title profile kamu diganti ke **${result.title.label}**.` : result.reason);
      return;
    }

    if (action === "bio") {
      const bio = args.slice(1).join(" ").trim();
      const result = updateProfileBio(message.guild.id, message.author.id, bio);

      await message.reply(result.bio
        ? `Bio profile kamu diupdate ke:\n> ${result.bio}`
        : "Bio profile kamu berhasil dikosongkan.");
      return;
    }

    if (action === "song") {
      const mode = String(args[1] || "").trim().toLowerCase();
      const snapshot = await buildProfileSnapshot(message.guild, message.member);

      if (mode === "add") {
        const song = args.slice(2).join(" ").trim();
        const result = addProfileFavoriteSong(message.guild.id, message.author.id, snapshot.levelInfo.level, song);
        await message.reply(result.ok
          ? `Lagu favorit ditambahkan. Slot terpakai: ${result.songs.length}/${snapshot.metrics.favoriteSongLimit}.`
          : result.reason);
        return;
      }

      if (mode === "remove") {
        const target = args.slice(2).join(" ").trim();
        const result = removeProfileFavoriteSong(message.guild.id, message.author.id, snapshot.levelInfo.level, target);
        await message.reply(result.ok
          ? `Lagu favorit dihapus. Sisa slot terpakai: ${result.songs.length}/${snapshot.metrics.favoriteSongLimit}.`
          : result.reason);
        return;
      }

      if (mode === "clear") {
        clearProfileFavoriteSongs(message.guild.id, message.author.id);
        await message.reply("Semua lagu favorit di profile kamu berhasil dikosongkan.");
        return;
      }

      await message.reply([
        "Gunakan salah satu ini:",
        "`f profile song add <judul lagu>`",
        "`f profile song remove <nomor|judul lagu>`",
        "`f profile song clear`"
      ].join("\n"));
      return;
    }

    const targetToken = action === "view" && firstArg && firstArg !== "view"
      ? args[0]
      : action === "view" && args[1]
        ? args[1]
        : "";
    const targetMember = targetToken ? await resolveGuildMember(message.guild, targetToken) : message.member;

    const member = targetMember || message.member;
    const snapshot = await buildProfileSnapshot(message.guild, member);

    if (!access.adminBypass && snapshot.levelInfo.level < 3) {
      await message.reply("Member itu belum membuka benefit profile card karena masih di bawah Level 3.");
      return;
    }

    const card = await createProfileCard(snapshot);
    await message.reply({ files: [card] });
  }
};
