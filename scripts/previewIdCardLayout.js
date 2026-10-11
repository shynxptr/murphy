const path = require("node:path");
const { writeIdCardPreviewFile } = require("../src/modules/idcard/idCardCard");

async function main() {
  const outputPath = path.join(__dirname, "..", "assets", "idcard-preview.png");

  await writeIdCardPreviewFile(outputPath, {
    name: "Sokaa",
    age: "20 Tahun",
    city: "Bandung",
    bio: "Suka ngobrol santai, dengerin musik malam, dan nemenin teman-teman di 404! Collective sampai larut sambil bikin suasana tetap hidup."
  });

  console.log(`Preview generated: ${outputPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
