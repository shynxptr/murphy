const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  MessageFlags
} = require("discord.js");
const { createWelcomeCard } = require("./welcomeCard");
const { createTicketChannel, TICKET_TYPE_PREFIX } = require("../tickets/ticketSystem");

const BOOSTER_CLAIM_BUTTON_ID = "booster:claim_benefit";
const BOOSTER_ANNOUNCE_CHANNEL_ID = "1542725776783310929";
const BOOSTER_ACCENT_COLOR = "#f47fff";

const BOOST_VARIANTS = [
  (member) => [
    `<a:mythic:1559246070511571108> **${member.displayName}** baru saja boost server ini!`,
    ``,
    `Terima kasih banyak atas support-mu, ${member}! 💜`,
    `Klik tombol di bawah untuk mengambil benefit booster kamu.`
  ].join("\n"),
  (member) => [
    `<a:yay:1559351693869580288> **${member.displayName}** baru aja boost Murphy!`,
    ``,
    `Makasih udah support server kita, ${member}! 🩷`,
    `Jangan lupa claim benefit kamu ya lewat tombol di bawah.`
  ].join("\n"),
  (member) => [
    `<a:cheart:1559350537273483274> Yeay! **${member.displayName}** boost server!`,
    ``,
    `${member}, kamu luar biasa! Terima kasih sudah mendukung Murphy. 💎`,
    `Segera klaim benefit booster kamu lewat tombol di bawah.`
  ].join("\n"),
  (member) => [
    `<a:wheart:1559350367748227162> **${member.displayName}** telah boost Murphy!`,
    ``,
    `${member} — terima kasih atas dukunganmu untuk server ini! ✨`,
    `Claim benefit kamu sekarang lewat tombol di bawah.`
  ].join("\n")
];

function pickVariant(member) {
  const fn = BOOST_VARIANTS[Math.floor(Math.random() * BOOST_VARIANTS.length)];
  return fn(member);
}

function buildBoostEmbed(member, boostCount, variantText) {
  const boostCountLine = boostCount > 0
    ? `Server kini memiliki **${boostCount}** boost aktif. 💎`
    : null;

  return new EmbedBuilder()
    .setColor(BOOSTER_ACCENT_COLOR)
    .setAuthor({
      name: "Murphy • Nitro Booster",
      iconURL: member.guild.iconURL({ extension: "png" }) || undefined
    })
    .setDescription(
      [
        variantText,
        ``,
        boostCountLine
      ].filter((line) => line !== null).join("\n")
    )
    .setImage("attachment://welcome-card.jpg")
    .setFooter({
      text: `Murphy Community • Terima kasih sudah mendukung kami 💜`
    })
    .setTimestamp();
}

function buildBoostRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(BOOSTER_CLAIM_BUTTON_ID)
      .setLabel("Claim Benefit")
      .setEmoji({ name: "Roles", id: "1559453664622415892", animated: true })
      .setStyle(ButtonStyle.Secondary)
  );
}

async function sendBoosterAnnounce(member, client) {
  const channel = await member.guild.channels.fetch(BOOSTER_ANNOUNCE_CHANNEL_ID).catch(() => null);

  if (!channel) {
    console.warn(`[BoosterAnnounce] Channel ${BOOSTER_ANNOUNCE_CHANNEL_ID} not found.`);
    return false;
  }

  const boostCount = member.guild.premiumSubscriptionCount || 0;
  const variantText = pickVariant(member);

  let welcomeCard;
  try {
    welcomeCard = await createWelcomeCard(member, BOOSTER_ACCENT_COLOR);
  } catch (error) {
    console.error("[BoosterAnnounce] Failed to create welcome card:", error);
  }

  const embed = buildBoostEmbed(member, boostCount, variantText);
  const row = buildBoostRow();

  await channel.send({
    embeds: [embed],
    files: welcomeCard ? [welcomeCard] : [],
    components: [row]
  });

  return true;
}

async function handleBoosterClaimButton(interaction, client) {
  if (interaction.customId !== BOOSTER_CLAIM_BUTTON_ID) {
    return false;
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch(() => null);

  // Cek apakah user adalah booster
  const member = interaction.member;
  const isPremiumSubscriber = member?.premiumSince !== null;

  if (!isPremiumSubscriber) {
    await interaction.editReply({
      content: "Benefit ini hanya untuk Nitro Booster server Murphy. Boost dulu ya! 💎"
    }).catch(() => null);
    return true;
  }

  // Buka tiket minta-role otomatis
  const fakeCustomId = `${TICKET_TYPE_PREFIX}minta-role`;
  const result = await createTicketChannel(
    { ...interaction, customId: fakeCustomId },
    client,
    fakeCustomId
  );

  if (!result.ok) {
    await interaction.editReply({
      content: result.reason
    }).catch(() => null);
    return true;
  }

  await interaction.editReply({
    content: `Ticket benefit booster berhasil dibuka di ${result.channel}! Sebutkan benefit apa yang ingin kamu klaim ya. 💜`
  }).catch(() => null);

  return true;
}

module.exports = {
  BOOSTER_CLAIM_BUTTON_ID,
  sendBoosterAnnounce,
  handleBoosterClaimButton
};
