const { MessageFlags } = require("discord.js");
const {
  CLOSE_TICKET_BUTTON_ID,
  createTicketChannel,
  closeTicketChannel,
  handleTicketClaimButton,
  handleTicketApproveButton,
  TICKET_TYPE_PREFIX,
  VERIF_CLAIM_BUTTON_ID,
  VERIF_APPROVE_BUTTON_ID
} = require("../modules/tickets/ticketSystem");
const {
  handleTicketFeedbackButton,
  handleTicketFeedbackModalSubmit
} = require("../modules/tickets/ticketFeedbackSystem");
const {
  buildNewConfessionModal,
  buildReplyConfessionModal,
  CONFESSION_NEW_BUTTON_ID,
  CONFESSION_NEW_MODAL_ID,
  CONFESSION_REPLY_MODAL_PREFIX,
  CONFESSION_REPLY_PREFIX,
  publishConfessionReply,
  publishNewConfession
} = require("../modules/confessions/confessionSystem");
const {
  buildNameRequestModal,
  handleNameRequestDecision,
  NAME_REQUEST_APPROVE_PREFIX,
  NAME_REQUEST_BUTTON_ID,
  NAME_REQUEST_MODAL_ID,
  NAME_REQUEST_REJECT_PREFIX,
  submitNameRequest
} = require("../modules/name-requests/nameRequestSystem");
const {
  STAFF_RECRUITMENT_BUTTON_ID,
  STAFF_RECRUITMENT_MODAL_ID,
  buildStaffRecruitmentModal,
  submitStaffRecruitment
} = require("../modules/staff-recruitment/staffRecruitmentSystem");
const {
  buildQuoteModal,
  publishQuoteFromInteraction,
  QUOTE_CREATE_BUTTON_ID,
  QUOTE_CREATE_MODAL_ID
} = require("../modules/general/quote");
const {
  handleModerationButton,
  handleModerationModalSubmit
} = require("../modules/moderation/moderationSystem");
const {
  handleRolePanelButton,
  handleRolePanelSelect
} = require("../modules/reaction-roles/reactionRoleSystem");
const {
  isCommandBlockedInGeneralChannel
} = require("../modules/leaderboards/leaderboardSystem");
const {
  handleTempVoiceButton,
  handleTempVoiceModalSubmit,
  handleTempVoiceSelectMenu
} = require("../modules/temp-voice/tempVoiceSystem");
const {
  handlePrivateRoomButton: handlePrivateRoomPanelButton
} = require("../modules/private-rooms/privateRoomSystem");
const {
  handleStickyModalSubmit
} = require("../modules/sticky/stickySystem");
const {
  handleSuggestionButton,
  handleSuggestionModalSubmit
} = require("../modules/suggestions/suggestionSystem");
const {
  handleDonationModalSubmit
} = require("../modules/donations/donationSystem");
const {
  handleCustomRoleButton,
  handleCustomRoleModalSubmit
} = require("../modules/custom-roles/customRoleSystem");
const {
  buildAdminAccessState,
  isProtectedSlashCommand,
  withScopedAdminAccess
} = require("../utils/adminAccess");
const { buildBotPermissionAccessState } = require("../utils/botPermissions");
const {
  buildAdminTargetsEmbed,
  buildInviteEmbed,
  getInviterMetrics
} = require("../modules/invites/inviteTracker");
const { handleVoicePingButton } = require("../modules/admin/sendvoicerules");
const { handleBoosterClaimButton } = require("../modules/community/boosterAnnounce");
const { handleClickRoleButton } = require("../modules/click-role/slash");
const { handleDutyButton } = require("../modules/staff-duty/slash");

module.exports = {
  name: "interactionCreate",
  async execute(interaction, client) {
    if (interaction.isChatInputCommand()) {
      if (interaction.guildId && isCommandBlockedInGeneralChannel(interaction.guildId, interaction.channelId, client)) {
        await interaction.reply({
          content: "Command bot tidak bisa dipakai di channel general ini. Gunakan channel bot ya.",
          ephemeral: true
        }).catch(() => null);
        return;
      }

      const command = client.slashCommands.get(interaction.commandName);

      if (!command) {
        return;
      }

      try {
        if (command.botOwnerOnly) {
          const access = await buildAdminAccessState(interaction.member, client);

          if (!access.botOwner) {
            await interaction.reply({
              content: "Command ini hanya bisa dipakai oleh bot owner.",
              ephemeral: true
            }).catch(() => null);
            return;
          }
        } else if (command.requiredAccess) {
          const access = await buildBotPermissionAccessState(interaction.member, command.requiredAccess, client);

          if (!access.hasAccess) {
            await interaction.reply({
              content: `Kamu tidak punya akses bot \`${access.accessName}\` untuk memakai command ini.`,
              ephemeral: true
            }).catch(() => null);
            return;
          }
        } else if (isProtectedSlashCommand(command)) {
          const access = await buildAdminAccessState(interaction.member, client);

          if (!access.hasAccess) {
            await interaction.reply({
              content: "Command admin ini hanya bisa dipakai oleh admin yang sudah diset bot owner.",
              ephemeral: true
            }).catch(() => null);
            return;
          }
        }

        await withScopedAdminAccess(interaction.member, client, async () => {
          await command.executeSlash(interaction, client);
        });
      } catch (error) {
        console.error(`Failed to execute slash command "${interaction.commandName}":`, error);

        const payload = {
          content: "Terjadi error saat menjalankan slash command.",
          ephemeral: true
        };

        if (interaction.replied || interaction.deferred) {
          await interaction.followUp(payload).catch(() => null);
          return;
        }

        await interaction.reply(payload).catch(() => null);
      }

      return;
    }

    if (interaction.isStringSelectMenu()) {
      if (await handleTempVoiceSelectMenu(interaction, client)) {
        return;
      }

      if (await handleRolePanelSelect(interaction, client)) {
        return;
      }

      return;
    }

    if (interaction.isButton()) {
      if (await handleRolePanelButton(interaction, client)) {
        return;
      }

      if (await handleTicketFeedbackButton(interaction, client)) {
        return;
      }

      if (await handlePrivateRoomPanelButton(interaction, client)) {
        return;
      }

      if (await handleCustomRoleButton(interaction, client)) {
        return;
      }

      if (await handleSuggestionButton(interaction, client)) {
        return;
      }

      if (await handleTempVoiceButton(interaction, client)) {
        return;
      }

      if (await handleModerationButton(interaction, client)) {
        return;
      }

      if (await handleClickRoleButton(interaction, client)) {
        return;
      }

      if (await handleDutyButton(interaction, client)) {
        return;
      }

      if (interaction.customId === NAME_REQUEST_BUTTON_ID) {
        await interaction.showModal(buildNameRequestModal());
        return;
      }

      if (interaction.customId === STAFF_RECRUITMENT_BUTTON_ID) {
        await interaction.showModal(buildStaffRecruitmentModal());
        return;
      }

      if (interaction.customId.startsWith(NAME_REQUEST_APPROVE_PREFIX)) {
        await interaction.deferReply({ ephemeral: true });
        const requestId = interaction.customId.slice(NAME_REQUEST_APPROVE_PREFIX.length);
        const result = await handleNameRequestDecision(interaction, client, "approve", requestId);

        if (!result.ok) {
          await interaction.editReply(result.reason);
          return;
        }

        await interaction.editReply(`Request name #${result.request.id} berhasil di-approve.`);
        return;
      }

      if (interaction.customId.startsWith(NAME_REQUEST_REJECT_PREFIX)) {
        await interaction.deferReply({ ephemeral: true });
        const requestId = interaction.customId.slice(NAME_REQUEST_REJECT_PREFIX.length);
        const result = await handleNameRequestDecision(interaction, client, "reject", requestId);

        if (!result.ok) {
          await interaction.editReply(result.reason);
          return;
        }

        await interaction.editReply(`Request name #${result.request.id} berhasil di-reject.`);
        return;
      }

      if (interaction.customId === CONFESSION_NEW_BUTTON_ID) {
        await interaction.showModal(buildNewConfessionModal());
        return;
      }

      if (interaction.customId === QUOTE_CREATE_BUTTON_ID) {
        await interaction.showModal(buildQuoteModal());
        return;
      }

      if (interaction.customId.startsWith(CONFESSION_REPLY_PREFIX)) {
        const confessionId = interaction.customId.slice(CONFESSION_REPLY_PREFIX.length);
        await interaction.showModal(buildReplyConfessionModal(confessionId));
        return;
      }

      if (interaction.customId.startsWith(TICKET_TYPE_PREFIX)) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch(() => null);
        const result = await createTicketChannel(interaction, client, interaction.customId);

        if (!result.ok) {
          await interaction.editReply({
            content: result.reason
          }).catch(() => null);
          return;
        }

        await interaction.editReply({
          content: `Ticket berhasil dibuka di ${result.channel}.`
        }).catch(() => null);
        return;
      }

      if (interaction.customId === VERIF_CLAIM_BUTTON_ID) {
        await handleTicketClaimButton(interaction, client);
        return;
      }

      if (interaction.customId === VERIF_APPROVE_BUTTON_ID) {
        await handleTicketApproveButton(interaction, client);
        return;
      }

      if (interaction.customId === CLOSE_TICKET_BUTTON_ID) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch(() => null);
        const result = await closeTicketChannel(interaction, client);

        if (!result.ok) {
          await interaction.editReply(result.reason).catch(() => null);
          return;
        }
      }

      if (interaction.customId.startsWith("invite_refresh:")) {
        const targetUserId = interaction.customId.slice("invite_refresh:".length);
        let targetUser = client.users.cache.get(targetUserId);
        if (!targetUser) {
          targetUser = await client.users.fetch(targetUserId).catch(() => interaction.user);
        }
        const isSelf = targetUser.id === interaction.user.id;
        const metrics = getInviterMetrics(interaction.guild.id, targetUser.id);
        const embed = buildInviteEmbed(targetUser, metrics, isSelf);
        await interaction.update({ embeds: [embed] }).catch(() => null);
        return;
      }

      if (interaction.customId === "invite_targets_refresh") {
        const embed = await buildAdminTargetsEmbed(interaction.guild);
        await interaction.update({ embeds: [embed] }).catch(() => null);
        return;
      }

      if (await handleVoicePingButton(interaction)) {
        return;
      }

      if (await handleBoosterClaimButton(interaction, client)) {
        return;
      }

      return;
    }

    if (!interaction.isModalSubmit()) {
      return;
    }

    if (await handleTicketFeedbackModalSubmit(interaction, client)) {
      return;
    }

    if (await handleModerationModalSubmit(interaction, client)) {
      return;
    }

    if (await handleStickyModalSubmit(interaction, client)) {
      return;
    }

    if (await handleSuggestionModalSubmit(interaction, client)) {
      return;
    }

    if (await handleCustomRoleModalSubmit(interaction, client)) {
      return;
    }

    if (await handleDonationModalSubmit(interaction, client)) {
      return;
    }

    if (await handleTempVoiceModalSubmit(interaction, client)) {
      return;
    }

    if (interaction.customId === NAME_REQUEST_MODAL_ID) {
      const result = await submitNameRequest(interaction, client);

      if (!result.ok) {
        await interaction.reply({
          content: result.reason,
          ephemeral: true
        });
        return;
      }

      await interaction.reply({
        content: result.direct
          ? `Nama kamu berhasil diganti langsung lewat benefit level sebagai #${result.id}.`
          : `Request name berhasil dikirim sebagai #${result.id}.`,
        ephemeral: true
      });
      return;
    }

    if (interaction.customId === STAFF_RECRUITMENT_MODAL_ID) {
      const result = await submitStaffRecruitment(interaction, client);

      if (!result.ok) {
        await interaction.reply({
          content: result.reason,
          ephemeral: true
        });
        return;
      }

      await interaction.reply({
        content: "Form recruitment staff berhasil dikirim. Terima kasih sudah mendaftar.",
        ephemeral: true
      });
      return;
    }

    if (interaction.customId === CONFESSION_NEW_MODAL_ID) {
      const result = await publishNewConfession(interaction, client);

      if (!result.ok) {
        await interaction.reply({
          content: result.reason,
          ephemeral: true
        });
        return;
      }

      await interaction.reply({
        content: `Confession berhasil dikirim sebagai #${result.id}.`,
        ephemeral: true
      });
      return;
    }

    if (interaction.customId === QUOTE_CREATE_MODAL_ID) {
      const result = await publishQuoteFromInteraction(interaction);

      if (!result.ok) {
        await interaction.reply({
          content: result.reason,
          ephemeral: true
        });
        return;
      }

      await interaction.reply({
        content: "Quote berhasil dikirim.",
        ephemeral: true
      });
      return;
    }

    if (interaction.customId.startsWith(CONFESSION_REPLY_MODAL_PREFIX)) {
      const confessionId = interaction.customId.slice(CONFESSION_REPLY_MODAL_PREFIX.length);
      const result = await publishConfessionReply(interaction, client, confessionId);

      if (!result.ok) {
        await interaction.reply({
          content: result.reason,
          ephemeral: true
        });
        return;
      }

      await interaction.reply({
        content: `Balasan anonim berhasil dikirim ke thread confession #${result.parentId}.`,
        ephemeral: true
      });
    }
  }
};
