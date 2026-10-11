const { PermissionFlagsBits, SlashCommandBuilder } = require("discord.js");
const {
  GAZECOIN_NAME,
  SHOP_ITEMS,
  buildShopBalanceEmbed,
  buildShopCatalogEmbed,
  ensureShopAccess,
  getGazecoinDisplay,
  getEconomySummary,
  grantCoinsToMember,
  hasShopAdminPermission,
  redeemShopItem
} = require("./shopSystem");
const { buildProfileSnapshot } = require("../profile/profileSystem");
const { getMemberLevelInfo } = require("../levels/levelSystem");

const slashData = new SlashCommandBuilder()
  .setName("shop")
  .setDescription(`Lihat saldo ${GAZECOIN_NAME} dan belanja reward Murphy`)
  .setDMPermission(false)
  .addSubcommand((subcommand) =>
    subcommand
      .setName("balance")
      .setDescription(`Lihat saldo ${GAZECOIN_NAME} milikmu atau member lain`)
      .addUserOption((option) =>
        option
          .setName("member")
          .setDescription("Member target")
          .setRequired(false)
      )
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName("catalog")
      .setDescription("Lihat katalog item shop yang tersedia")
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName("buy")
      .setDescription("Beli item dari shop")
      .addStringOption((option) => {
        let current = option
          .setName("item")
          .setDescription("Kode item shop")
          .setRequired(true);

        for (const item of SHOP_ITEMS) {
          current = current.addChoices({
            name: `${item.label} (${item.key})`,
            value: item.key
          });
        }

        return current;
      })
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName("grant")
      .setDescription(`Tambah ${GAZECOIN_NAME} ke member untuk admin/testing`)
      .addUserOption((option) =>
        option
          .setName("member")
          .setDescription("Member target")
          .setRequired(true)
      )
      .addIntegerOption((option) =>
        option
          .setName("amount")
          .setDescription(`Jumlah ${GAZECOIN_NAME}`)
          .setMinValue(1)
          .setRequired(true)
      )
  );

module.exports = {
  slashData,
  async executeSlash(interaction) {
    if (!interaction.inGuild()) {
      await interaction.reply({
        content: "Command ini hanya bisa dipakai di server.",
        ephemeral: true
      });
      return;
    }

    const subcommand = interaction.options.getSubcommand();

    if (subcommand === "grant") {
      const gazecoin = await getGazecoinDisplay(interaction.client);
      if (!hasShopAdminPermission(interaction.member)) {
        await interaction.reply({
          content: `Kamu butuh permission Manage Server untuk menambah ${GAZECOIN_NAME} member.`,
          ephemeral: true
        });
        return;
      }

      const targetUser = interaction.options.getUser("member", true);
      const targetMember = interaction.options.getMember("member")
        || await interaction.guild.members.fetch(targetUser.id).catch(() => null);

      if (!targetMember || targetMember.user.bot) {
        await interaction.reply({
          content: "Member target tidak valid atau merupakan bot.",
          ephemeral: true
        });
        return;
      }

      const result = grantCoinsToMember(
        interaction.guildId,
        targetMember.id,
        interaction.options.getInteger("amount", true)
      );

      await interaction.reply({
        content: result.ok
          ? `${gazecoin} Berhasil menambahkan ${GAZECOIN_NAME} untuk ${targetMember}. Saldo baru: **${result.entry.balance.toLocaleString("id-ID")} ${GAZECOIN_NAME}**.`
          : result.reason,
        ephemeral: true
      });
      return;
    }

    const access = ensureShopAccess(interaction.guildId, interaction.user.id, interaction.member);

    if (!access.ok) {
      await interaction.reply({
        content: access.reason,
        ephemeral: true
      });
      return;
    }

    if (subcommand === "catalog") {
      const snapshot = await buildProfileSnapshot(interaction.guild, interaction.member);
      const gazecoin = await getGazecoinDisplay(interaction.client);

      await interaction.reply({
        embeds: [buildShopCatalogEmbed(snapshot, gazecoin)],
        ephemeral: true
      });
      return;
    }

    if (subcommand === "balance") {
      const targetUser = interaction.options.getUser("member") || interaction.user;
      const targetMember = interaction.options.getMember("member")
        || await interaction.guild.members.fetch(targetUser.id).catch(() => null);

      if (!targetMember || targetMember.user.bot) {
        await interaction.reply({
          content: "Member target tidak valid atau merupakan bot.",
          ephemeral: true
        });
        return;
      }

      const targetLevel = getMemberLevelInfo(interaction.guildId, targetMember.id);

      if (!access.adminBypass && targetLevel.level < 4) {
        await interaction.reply({
          content: `Member itu belum membuka sistem ${GAZECOIN_NAME} dan shop karena masih di bawah Level 4.`,
          ephemeral: true
        });
        return;
      }

      const gazecoin = await getGazecoinDisplay(interaction.client);
      await interaction.reply({
        embeds: [buildShopBalanceEmbed(targetMember, targetLevel, getEconomySummary(interaction.guildId, targetMember.id), gazecoin)],
        ephemeral: true
      });
      return;
    }

    const result = await redeemShopItem(
      interaction.guild,
      interaction.member,
      interaction.options.getString("item", true).trim().toLowerCase()
    );

    await interaction.reply({
      content: result.ok ? result.message : result.reason,
      ephemeral: true
    });
  }
};
