const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  EmbedBuilder,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder
} = require("discord.js");
const { resolveTextChannel } = require("../../utils/channelResolver");
const { hasConfiguredAdminAccess } = require("../../utils/adminAccess");

const VOICE_PING_ROLE_ID = "1558512827910717542";
const VOICE_PING_BUTTON_ID = "voice_ping_toggle_role";
const TICKET_CHANNEL_ID = "1542549784697638922";

function checkAdmin(member, client) {
  if (!member) return false;
  if (member.id === member.guild?.ownerId) return true;
  if (member.permissions?.has(PermissionFlagsBits.Administrator)) return true;
  if (member.permissions?.has(PermissionFlagsBits.ManageGuild)) return true;
  if (member.permissions?.has(PermissionFlagsBits.ManageChannels)) return true;
  return hasConfiguredAdminAccess(member, client);
}

function resolveReqMusicChannel(guild) {
  if (!guild?.channels?.cache) return "`💽・req-music`";
  for (const channel of guild.channels.cache.values()) {
    if (channel?.name && (channel.name.includes("req-music") || channel.name.includes("request-music"))) {
      return `<#${channel.id}>`;
    }
  }
  return "`💽・req-music`";
}

function buildVoiceRulesPayload(guild) {
  const reqMusicMention = resolveReqMusicChannel(guild);

  // Embed 1: VOICE RULES
  const rulesEmbed = new EmbedBuilder()
    .setColor("#2b2d31")
    .setAuthor({
      name: "Murphy • Voice Rules",
      iconURL: guild.iconURL({ extension: "png" }) || undefined
    })
    .setTitle("<a:music:1559450513479831572> VOICE RULES")
    .setDescription(
      [
        "*saat kamu terhubung ke ruang suara, kita berbagi ruang dan waktu yang sama. mari jaga kenyamanan obrolan dengan memperhatikan hal-hal berikut:*",
        "",
        "**1. Jaga Intonasi**",
        "Murphy adalah tempat yang tenang. Hindari berteriak, meniup mic, atau memutar musik dengan volume yang memecah ketenangan (*earrape*).",
        "",
        "**2. Sadari Sekitarmu**",
        "Jika lingkungan di tempatmu sedang riuh atau bising, tolong gunakan fitur *Push-to-Talk* atau *Mute* agar tidak mengganggu alur obrolan.",
        "",
        "**3. Hargai Percakapan**",
        "Biarkan orang lain menyelesaikan kalimatnya sebelum kamu menanggapi. Obrolan yang hangat lahir dari kebiasaan mendengarkan.",
        "",
        "**4. Hargai Privasi**",
        "Dilarang keras merekam obrolan, baik suara maupun layar (*screen record / stream snip*), tanpa izin dari semua orang yang ada di dalam ruangan tersebut.",
        "",
        "**5. Ruang yang Aman**",
        "Tidak ada toleransi untuk ujaran kebencian, pelecehan verbal, atau topik yang memojokkan member lain.",
        "",
        "━━━━━━━━━━━━━━━━━━━━━━━━━━",
        `> 💬 *jika seseorang membuatmu merasa tidak nyaman di dalam voice channel, jangan ragu untuk berpindah ruangan atau segera hubungi staf kami melalui tiket di <#${TICKET_CHANNEL_ID}>.*`
      ].join("\n")
    );

  // Embed 2: MURPHY MUSIC HELP
  const musicHelpEmbed = new EmbedBuilder()
    .setColor("#2b2d31")
    .setAuthor({
      name: "Murphy • Music Guide",
      iconURL: guild.iconURL({ extension: "png" }) || undefined
    })
    .setTitle("💽 MURPHY MUSIC HELP")
    .setDescription(
      [
        "**Cara menggunakan bot musik:**",
        "1. Masuk ke voice channel terlebih dahulu.",
        "2. Gunakan command untuk memutar musik.",
        `3. Untuk memasukkan command bisa di channel ${reqMusicMention} atau di voice chat pribadi.`,
        "",
        "**Bot Command :**",
        "",
        "<a:spotify:1559450125632274532> **Jockie Music**",
        "• `m!play (judul lagu / link)` → Memutar lagu",
        "• `m!pause` → Menjeda lagu",
        "• `m!resume` → Melanjutkan lagu",
        "• `m!skip` → Melewati lagu",
        "• `m!stop` → Menghentikan musik",
        "",
        "<:bot:1559451641730834512> **Bot Music Lain**",
        "• `/play (judul lagu / link)` → Memutar lagu",
        "• `/pause` → Menjeda lagu",
        "• `/resume` → Melanjutkan lagu",
        "• `/skip` → Melewati lagu",
        "• `/stop` → Menghentikan musik",
        "",
        "━━━━━━━━━━━━━━━━━━━━━━━━━━",
        "> <a:emoji_31:1559106957619757056> **Catatan:**",
        `> *Jika bot tidak merespon, coba gunakan perintah kembali. Jika masih error, silakan buat ticket help di <#${TICKET_CHANNEL_ID}> atau hubungi admin.*`
      ].join("\n")
    );

  // Embed 3: TOGGLE ROLE PING
  const togglePingEmbed = new EmbedBuilder()
    .setColor("#2b2d31")
    .setAuthor({
      name: "Murphy • Role Notification",
      iconURL: guild.iconURL({ extension: "png" }) || undefined
    })
    .setTitle("🔔 VOICE PING ROLE")
    .setDescription(
      [
        "Dapatkan notifikasi saat ada member lain yang ingin mengajak ngobrol, nongkrong, atau mabar di voice channel.",
        "",
        `Klik tombol **Voice Ping** di bawah untuk mengambil atau mencabut role <@&${VOICE_PING_ROLE_ID}>.`
      ].join("\n")
    )
    .setFooter({
      text: "Murphy Community • Saling menjaga, saling menghargai"
    });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(VOICE_PING_BUTTON_ID)
      .setLabel("Voice Ping")
      .setEmoji({ name: "emoji_136", id: "1559450353005502494", animated: true })
      .setStyle(ButtonStyle.Secondary)
  );

  return {
    embeds: [rulesEmbed, musicHelpEmbed, togglePingEmbed],
    components: [row]
  };
}

async function handleVoicePingButton(interaction) {
  if (interaction.customId !== VOICE_PING_BUTTON_ID) {
    return false;
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch(() => null);

  const member = interaction.member;
  if (!member) {
    await interaction.editReply("Gagal memproses interaksi.").catch(() => null);
    return true;
  }

  const role = interaction.guild.roles.cache.get(VOICE_PING_ROLE_ID);
  if (!role) {
    await interaction.editReply("Role Voice Ping tidak ditemukan di server ini.").catch(() => null);
    return true;
  }

  const hasRole = member.roles.cache.has(VOICE_PING_ROLE_ID);

  try {
    if (hasRole) {
      await member.roles.remove(VOICE_PING_ROLE_ID);
      await interaction.editReply({
        content: `🔕 Role <@&${VOICE_PING_ROLE_ID}> berhasil dicabut. Kamu tidak akan menerima notifikasi voice lagi.`
      }).catch(() => null);
    } else {
      await member.roles.add(VOICE_PING_ROLE_ID);
      await interaction.editReply({
        content: `🔔 Role <@&${VOICE_PING_ROLE_ID}> berhasil diberikan! Kamu akan mendapatkan notifikasi saat ada ajakan ngobrol di voice channel.`
      }).catch(() => null);
    }
  } catch (error) {
    console.error("Failed to toggle voice ping role:", error);
    await interaction.editReply({
      content: "Terjadi kendala saat mengubah role. Pastikan bot memiliki izin Manage Roles yang memadai."
    }).catch(() => null);
  }

  return true;
}

module.exports = {
  name: "sendvoicerules",
  aliases: ["voicerules", "fvoicerules", "fsendvoicerules"],
  category: "admin",
  description: "Kirim 3 embed Voice Rules, Music Help, dan Toggle Ping.",
  usage: "sendvoicerules [#channel]",
  VOICE_PING_BUTTON_ID,
  VOICE_PING_ROLE_ID,
  buildVoiceRulesPayload,
  handleVoicePingButton,
  slashData: new SlashCommandBuilder()
    .setName("sendvoicerules")
    .setDescription("Kirim 3 embed Voice Rules, Music Help, dan Toggle Ping")
    .addChannelOption((option) =>
      option
        .setName("channel")
        .setDescription("Channel tujuan untuk mengirim Voice Rules")
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
        .setRequired(false)
    ),

  async execute(message, args, client) {
    if (!checkAdmin(message.member, client)) {
      return message.reply("Kamu butuh akses Admin atau Manage Server untuk command ini.");
    }

    const channel = resolveTextChannel(message, args[0]) || message.channel;
    if (!channel) {
      return message.reply("Channel tidak valid.");
    }

    const payload = buildVoiceRulesPayload(message.guild);
    await channel.send(payload);

    if (channel.id !== message.channel.id) {
      await message.reply(`Voice Rules (3 embed) berhasil dikirim ke ${channel}.`);
    }
  },

  async executeSlash(interaction, client) {
    if (!checkAdmin(interaction.member, client)) {
      return interaction.reply({
        content: "Kamu butuh akses Admin atau Manage Server untuk command ini.",
        ephemeral: true
      });
    }

    const targetChannel = interaction.options.getChannel("channel") || interaction.channel;
    if (!targetChannel) {
      return interaction.reply({
        content: "Channel target tidak valid.",
        ephemeral: true
      });
    }

    const payload = buildVoiceRulesPayload(interaction.guild);
    await targetChannel.send(payload);

    return interaction.reply({
      content: `Voice Rules (3 embed) berhasil dikirim ke ${targetChannel}.`,
      ephemeral: true
    });
  }
};
