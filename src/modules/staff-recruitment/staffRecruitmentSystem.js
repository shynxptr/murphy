const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  EmbedBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle
} = require("discord.js");
const { getEffectiveGuildSettings } = require("../../utils/guildSettings");

const STAFF_RECRUITMENT_BUTTON_ID = "staffrecruitment:new";
const STAFF_RECRUITMENT_MODAL_ID = "staffrecruitment:modal:new";
const STAFF_RECRUITMENT_USERNAME_ID = "staffrecruitment_username";
const STAFF_RECRUITMENT_AGE_ID = "staffrecruitment_age";
const STAFF_RECRUITMENT_DIVISION_ID = "staffrecruitment_division";
const STAFF_RECRUITMENT_EXPERIENCE_ID = "staffrecruitment_experience";
const STAFF_RECRUITMENT_REASON_ID = "staffrecruitment_reason";

function buildStaffRecruitmentPanel(client, guildId) {
  const { staffRecruitment } = getEffectiveGuildSettings(guildId, client);

  return {
    embeds: [
      new EmbedBuilder()
        .setColor(staffRecruitment.accentColor)
        .setTitle("Recruitment Staff")
        .setDescription(
          [
            "Kalau kamu ingin bergabung sebagai bagian dari tim Murphy, isi form recruitment melalui tombol di bawah.",
            "Pastikan semua data diisi dengan jujur, jelas, dan rapi agar tim bisa meninjau pendaftaranmu dengan lebih mudah."
          ].join("\n")
        )
    ],
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(STAFF_RECRUITMENT_BUTTON_ID)
          .setLabel("Daftar Staff")
          .setStyle(ButtonStyle.Primary)
      )
    ]
  };
}

function buildStaffRecruitmentModal() {
  return new ModalBuilder()
    .setCustomId(STAFF_RECRUITMENT_MODAL_ID)
    .setTitle("Form Recruitment Staff")
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId(STAFF_RECRUITMENT_USERNAME_ID)
          .setLabel("Username / Nama Discord")
          .setRequired(true)
          .setMaxLength(64)
          .setStyle(TextInputStyle.Short)
          .setPlaceholder("Contoh: putrxx")
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId(STAFF_RECRUITMENT_AGE_ID)
          .setLabel("Umur")
          .setRequired(true)
          .setMaxLength(16)
          .setStyle(TextInputStyle.Short)
          .setPlaceholder("Contoh: 19")
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId(STAFF_RECRUITMENT_DIVISION_ID)
          .setLabel("Divisi yang Dipilih")
          .setRequired(true)
          .setMaxLength(100)
          .setStyle(TextInputStyle.Short)
          .setPlaceholder("Contoh: Moderator / PR / EO / Creative")
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId(STAFF_RECRUITMENT_EXPERIENCE_ID)
          .setLabel("Pengalaman (jika ada)")
          .setRequired(false)
          .setMaxLength(400)
          .setStyle(TextInputStyle.Paragraph)
          .setPlaceholder("Jelaskan pengalaman organisasi, staff server, desain, event, dll.")
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId(STAFF_RECRUITMENT_REASON_ID)
          .setLabel("Alasan Mendaftar")
          .setRequired(true)
          .setMaxLength(1000)
          .setStyle(TextInputStyle.Paragraph)
          .setPlaceholder("Jelaskan alasan kamu ingin bergabung menjadi staff Murphy.")
      )
    );
}

function buildStaffRecruitmentEmbed(interaction, payload) {
  return new EmbedBuilder()
    .setColor("#111214")
    .setTitle("Staff Recruitment Form")
    .setDescription(
      [
        `Pengirim: ${interaction.user}`,
        `User ID: \`${interaction.user.id}\``
      ].join("\n")
    )
    .addFields(
      {
        name: "Username / Nama Discord",
        value: payload.username,
        inline: false
      },
      {
        name: "Umur",
        value: payload.age,
        inline: true
      },
      {
        name: "Divisi yang Dipilih",
        value: payload.division,
        inline: true
      },
      {
        name: "Pengalaman",
        value: payload.experience || "`Tidak ada / belum diisi`",
        inline: false
      },
      {
        name: "Alasan Mendaftar",
        value: payload.reason,
        inline: false
      }
    )
    .setTimestamp();
}

async function submitStaffRecruitment(interaction, client) {
  const { staffRecruitment } = getEffectiveGuildSettings(interaction.guildId, client);

  if (!staffRecruitment.reviewChannelId) {
    return {
      ok: false,
      reason: "Channel review recruitment staff belum diatur."
    };
  }

  const reviewChannel = await interaction.guild.channels.fetch(staffRecruitment.reviewChannelId).catch(() => null);

  if (!reviewChannel || reviewChannel.type !== ChannelType.GuildText) {
    return {
      ok: false,
      reason: "Channel review recruitment staff tidak valid."
    };
  }

  const payload = {
    username: interaction.fields.getTextInputValue(STAFF_RECRUITMENT_USERNAME_ID)?.trim() || "",
    age: interaction.fields.getTextInputValue(STAFF_RECRUITMENT_AGE_ID)?.trim() || "",
    division: interaction.fields.getTextInputValue(STAFF_RECRUITMENT_DIVISION_ID)?.trim() || "",
    experience: interaction.fields.getTextInputValue(STAFF_RECRUITMENT_EXPERIENCE_ID)?.trim() || "",
    reason: interaction.fields.getTextInputValue(STAFF_RECRUITMENT_REASON_ID)?.trim() || ""
  };

  if (!payload.username || !payload.age || !payload.division || !payload.reason) {
    return {
      ok: false,
      reason: "Semua field wajib harus diisi dengan lengkap."
    };
  }

  await reviewChannel.send({
    embeds: [buildStaffRecruitmentEmbed(interaction, payload)]
  });

  return {
    ok: true
  };
}

module.exports = {
  STAFF_RECRUITMENT_BUTTON_ID,
  STAFF_RECRUITMENT_MODAL_ID,
  buildStaffRecruitmentModal,
  buildStaffRecruitmentPanel,
  submitStaffRecruitment
};
