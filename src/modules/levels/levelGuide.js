const { AttachmentBuilder, EmbedBuilder } = require("discord.js");
const fs = require("node:fs/promises");
const path = require("node:path");

const INFOGRAPHIC_NAME = "infographic.png";
const INFOGRAPHIC_PATH = path.join(__dirname, "..", "..", "..", "assets", INFOGRAPHIC_NAME);

async function createLevelGuideAttachment() {
  const infographic = await fs.readFile(INFOGRAPHIC_PATH);
  return new AttachmentBuilder(infographic, { name: INFOGRAPHIC_NAME });
}

function buildLevelGuideEmbed() {
  return new EmbedBuilder()
    .setColor("#111214")
    .setTitle("Murphy Level Guide")
    .setDescription([
      "Naik level, buka benefit, dan bangun identitasmu di Murphy.",
      "",
      "Cek progresmu kapan saja dengan `f exp` dan `f profile`."
    ].join("\n"))
    .setImage(`attachment://${INFOGRAPHIC_NAME}`)
    .setFooter({
      text: "Veil • Shroud • Obscura • Noctis • Eclipse"
    });
}

async function createLevelGuidePayload() {
  return {
    embeds: [buildLevelGuideEmbed()],
    files: [await createLevelGuideAttachment()]
  };
}

module.exports = {
  createLevelGuidePayload
};
