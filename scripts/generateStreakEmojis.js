const fs = require("node:fs");
const path = require("node:path");
const { Canvas } = require("@napi-rs/canvas");

const outputDirectory = path.join(__dirname, "..", "assets", "streak-emojis");
const emojiSize = 128;
const previewWidth = 1440;
const previewHeight = 960;

const tiers = [
  {
    key: "ember",
    label: "Ember",
    range: "1-6",
    suggestedEmojiName: "streak_ember",
    colors: {
      glow: ["rgba(255, 122, 24, 0.56)", "rgba(255, 212, 90, 0.18)"],
      outer: "#ff7a18",
      outerShade: "#f24b13",
      inner: "#ffd45a",
      innerShade: "#fff1b1",
      spark: "#ffd27f",
      outline: "rgba(255, 255, 255, 0.08)"
    },
    sparkCount: 2,
    sparkScale: 0.9
  },
  {
    key: "blaze",
    label: "Blaze",
    range: "7-24",
    suggestedEmojiName: "streak_blaze",
    colors: {
      glow: ["rgba(255, 102, 20, 0.62)", "rgba(255, 190, 92, 0.22)"],
      outer: "#ff6614",
      outerShade: "#e63c12",
      inner: "#ffca57",
      innerShade: "#fff1b5",
      spark: "#ffcf85",
      outline: "rgba(255, 255, 255, 0.08)"
    },
    sparkCount: 3,
    sparkScale: 1
  },
  {
    key: "flare",
    label: "Flare",
    range: "25-49",
    suggestedEmojiName: "streak_flare",
    colors: {
      glow: ["rgba(255, 76, 17, 0.66)", "rgba(255, 171, 76, 0.24)"],
      outer: "#ff4c11",
      outerShade: "#d92f13",
      inner: "#ffbe55",
      innerShade: "#fff2b7",
      spark: "#ffd188",
      outline: "rgba(255, 255, 255, 0.1)"
    },
    sparkCount: 4,
    sparkScale: 1.05
  },
  {
    key: "goldfire",
    label: "Goldfire",
    range: "50-99",
    suggestedEmojiName: "streak_goldfire",
    colors: {
      glow: ["rgba(245, 158, 11, 0.66)", "rgba(253, 230, 138, 0.24)"],
      outer: "#f59e0b",
      outerShade: "#d97706",
      inner: "#fcd34d",
      innerShade: "#fff1b0",
      spark: "#fde68a",
      outline: "rgba(255, 255, 255, 0.12)"
    },
    sparkCount: 5,
    sparkScale: 1.1
  },
  {
    key: "bluefire",
    label: "Bluefire",
    range: "100-149",
    suggestedEmojiName: "streak_bluefire",
    colors: {
      glow: ["rgba(59, 130, 246, 0.62)", "rgba(147, 197, 253, 0.24)"],
      outer: "#3b82f6",
      outerShade: "#1d4ed8",
      inner: "#93c5fd",
      innerShade: "#eff6ff",
      spark: "#bfdbfe",
      outline: "rgba(255, 255, 255, 0.12)"
    },
    sparkCount: 5,
    sparkScale: 1.15
  },
  {
    key: "sapphire",
    label: "Sapphire",
    range: "150-249",
    suggestedEmojiName: "streak_sapphire",
    colors: {
      glow: ["rgba(37, 99, 235, 0.68)", "rgba(191, 219, 254, 0.24)"],
      outer: "#2563eb",
      outerShade: "#1e3a8a",
      inner: "#60a5fa",
      innerShade: "#eff6ff",
      spark: "#dbeafe",
      outline: "rgba(255, 255, 255, 0.13)"
    },
    sparkCount: 6,
    sparkScale: 1.18
  },
  {
    key: "soulfire",
    label: "Soulfire",
    range: "250-364",
    suggestedEmojiName: "streak_soulfire",
    colors: {
      glow: ["rgba(6, 182, 212, 0.68)", "rgba(165, 243, 252, 0.24)"],
      outer: "#06b6d4",
      outerShade: "#0f766e",
      inner: "#67e8f9",
      innerShade: "#ecfeff",
      spark: "#a5f3fc",
      outline: "rgba(255, 255, 255, 0.13)"
    },
    sparkCount: 7,
    sparkScale: 1.2
  },
  {
    key: "eternal",
    label: "Eternal",
    range: "365-499",
    suggestedEmojiName: "streak_eternal",
    colors: {
      glow: ["rgba(168, 85, 247, 0.7)", "rgba(221, 214, 254, 0.24)"],
      outer: "#a855f7",
      outerShade: "#6d28d9",
      inner: "#c4b5fd",
      innerShade: "#f5f3ff",
      spark: "#ddd6fe",
      outline: "rgba(255, 255, 255, 0.14)"
    },
    sparkCount: 8,
    sparkScale: 1.24
  },
  {
    key: "mythic",
    label: "Mythic",
    range: "500+",
    suggestedEmojiName: "streak_mythic",
    colors: {
      glow: ["rgba(236, 72, 153, 0.72)", "rgba(244, 114, 182, 0.18)"],
      outer: "#ec4899",
      outerShade: "#be185d",
      inner: "#f9a8d4",
      innerShade: "#fdf2f8",
      spark: "#fbcfe8",
      outline: "rgba(255, 255, 255, 0.15)"
    },
    sparkCount: 9,
    sparkScale: 1.28
  }
];

function ensureDirectory(directory) {
  if (!fs.existsSync(directory)) {
    fs.mkdirSync(directory, { recursive: true });
  }
}

function drawRoundedRect(context, x, y, width, height, radius) {
  context.beginPath();
  context.moveTo(x + radius, y);
  context.lineTo(x + width - radius, y);
  context.quadraticCurveTo(x + width, y, x + width, y + radius);
  context.lineTo(x + width, y + height - radius);
  context.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  context.lineTo(x + radius, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - radius);
  context.lineTo(x, y + radius);
  context.quadraticCurveTo(x, y, x + radius, y);
  context.closePath();
}

function drawFlamePath(context, centerX, centerY, scale) {
  context.beginPath();
  context.moveTo(centerX - (22 * scale), centerY + (47 * scale));
  context.bezierCurveTo(
    centerX - (43 * scale), centerY + (36 * scale),
    centerX - (52 * scale), centerY + (8 * scale),
    centerX - (34 * scale), centerY - (18 * scale)
  );
  context.bezierCurveTo(
    centerX - (12 * scale), centerY - (47 * scale),
    centerX - (2 * scale), centerY - (56 * scale),
    centerX + (4 * scale), centerY - (76 * scale)
  );
  context.bezierCurveTo(
    centerX + (18 * scale), centerY - (64 * scale),
    centerX + (36 * scale), centerY - (41 * scale),
    centerX + (40 * scale), centerY - (4 * scale)
  );
  context.bezierCurveTo(
    centerX + (48 * scale), centerY - (6 * scale),
    centerX + (54 * scale), centerY + (6 * scale),
    centerX + (56 * scale), centerY + (22 * scale)
  );
  context.bezierCurveTo(
    centerX + (60 * scale), centerY + (38 * scale),
    centerX + (48 * scale), centerY + (56 * scale),
    centerX + (28 * scale), centerY + (60 * scale)
  );
  context.bezierCurveTo(
    centerX + (13 * scale), centerY + (61 * scale),
    centerX - (4 * scale), centerY + (58 * scale),
    centerX - (22 * scale), centerY + (47 * scale)
  );
  context.closePath();
}

function drawOuterHighlightPath(context, centerX, centerY, scale) {
  context.beginPath();
  context.moveTo(centerX - (16 * scale), centerY + (39 * scale));
  context.bezierCurveTo(
    centerX - (28 * scale), centerY + (29 * scale),
    centerX - (31 * scale), centerY + (9 * scale),
    centerX - (18 * scale), centerY - (12 * scale)
  );
  context.bezierCurveTo(
    centerX - (7 * scale), centerY - (31 * scale),
    centerX - (1 * scale), centerY - (43 * scale),
    centerX + (2 * scale), centerY - (60 * scale)
  );
  context.bezierCurveTo(
    centerX + (11 * scale), centerY - (45 * scale),
    centerX + (18 * scale), centerY - (28 * scale),
    centerX + (15 * scale), centerY - (4 * scale)
  );
  context.bezierCurveTo(
    centerX + (11 * scale), centerY + (17 * scale),
    centerX - (1 * scale), centerY + (29 * scale),
    centerX - (16 * scale), centerY + (39 * scale)
  );
  context.closePath();
}

function drawInnerFlamePath(context, centerX, centerY, scale) {
  context.beginPath();
  context.moveTo(centerX + (2 * scale), centerY + (42 * scale));
  context.bezierCurveTo(
    centerX - (10 * scale), centerY + (33 * scale),
    centerX - (17 * scale), centerY + (15 * scale),
    centerX - (10 * scale), centerY - (2 * scale)
  );
  context.bezierCurveTo(
    centerX - (4 * scale), centerY - (20 * scale),
    centerX + (4 * scale), centerY - (34 * scale),
    centerX + (11 * scale), centerY - (44 * scale)
  );
  context.bezierCurveTo(
    centerX + (24 * scale), centerY - (29 * scale),
    centerX + (25 * scale), centerY - (5 * scale),
    centerX + (18 * scale), centerY + (13 * scale)
  );
  context.bezierCurveTo(
    centerX + (24 * scale), centerY + (21 * scale),
    centerX + (20 * scale), centerY + (34 * scale),
    centerX + (8 * scale), centerY + (42 * scale)
  );
  context.closePath();
}

function drawHotCorePath(context, centerX, centerY, scale) {
  context.beginPath();
  context.moveTo(centerX + (1 * scale), centerY + (30 * scale));
  context.bezierCurveTo(
    centerX - (7 * scale), centerY + (23 * scale),
    centerX - (9 * scale), centerY + (10 * scale),
    centerX - (4 * scale), centerY + (0 * scale)
  );
  context.bezierCurveTo(
    centerX - (1 * scale), centerY - (10 * scale),
    centerX + (3 * scale), centerY - (19 * scale),
    centerX + (7 * scale), centerY - (24 * scale)
  );
  context.bezierCurveTo(
    centerX + (14 * scale), centerY - (15 * scale),
    centerX + (15 * scale), centerY - (1 * scale),
    centerX + (11 * scale), centerY + (11 * scale)
  );
  context.bezierCurveTo(
    centerX + (15 * scale), centerY + (17 * scale),
    centerX + (12 * scale), centerY + (26 * scale),
    centerX + (4 * scale), centerY + (30 * scale)
  );
  context.closePath();
}

function drawGlow(context, centerX, centerY, scale, colors) {
  const glow = context.createRadialGradient(centerX, centerY + (5 * scale), 0, centerX, centerY + (6 * scale), 58 * scale);
  glow.addColorStop(0, colors.glow[0]);
  glow.addColorStop(0.48, colors.glow[1]);
  glow.addColorStop(1, "rgba(0, 0, 0, 0)");
  context.fillStyle = glow;
  context.beginPath();
  context.arc(centerX, centerY + (8 * scale), 58 * scale, 0, Math.PI * 2);
  context.fill();
}

function drawSparks(context, centerX, centerY, scale, tier) {
  const baseSparks = [
    { x: -26, y: -18, r: 5, a: 0.85 },
    { x: 23, y: -22, r: 4, a: 0.7 },
    { x: -34, y: 14, r: 3, a: 0.58 },
    { x: 31, y: 11, r: 4, a: 0.64 },
    { x: 0, y: -32, r: 3, a: 0.72 },
    { x: -13, y: 36, r: 3, a: 0.5 },
    { x: 17, y: 34, r: 3, a: 0.46 },
    { x: -4, y: 44, r: 2.5, a: 0.44 },
    { x: 9, y: -39, r: 2.5, a: 0.54 }
  ];

  context.save();
  context.fillStyle = tier.colors.spark;

  for (const spark of baseSparks.slice(0, tier.sparkCount)) {
    context.globalAlpha = spark.a;
    context.beginPath();
    context.arc(
      centerX + (spark.x * scale),
      centerY + (spark.y * scale),
      spark.r * scale * tier.sparkScale * 0.16,
      0,
      Math.PI * 2
    );
    context.fill();
  }

  context.restore();
}

function drawFlameEmoji(context, tier, x, y, size) {
  const scale = size / 128;
  const centerX = x + (size / 2);
  const centerY = y + (size / 2) + (6 * scale);

  drawGlow(context, centerX, centerY, scale, tier.colors);

  context.save();
  context.shadowColor = tier.colors.glow[0];
  context.shadowBlur = 18 * scale;
  context.shadowOffsetY = 8 * scale;

  const outerGradient = context.createLinearGradient(centerX, centerY - (48 * scale), centerX, centerY + (50 * scale));
  outerGradient.addColorStop(0, tier.colors.outer);
  outerGradient.addColorStop(0.58, tier.colors.outer);
  outerGradient.addColorStop(1, tier.colors.outerShade);
  context.fillStyle = outerGradient;
  drawFlamePath(context, centerX, centerY, scale);
  context.fill();
  context.restore();

  const outerHighlight = context.createLinearGradient(centerX - (20 * scale), centerY - (8 * scale), centerX + (2 * scale), centerY + (28 * scale));
  outerHighlight.addColorStop(0, "rgba(255, 189, 74, 0.82)");
  outerHighlight.addColorStop(1, "rgba(255, 189, 74, 0)");
  context.fillStyle = outerHighlight;
  drawOuterHighlightPath(context, centerX, centerY, scale);
  context.fill();

  const outlineGradient = context.createLinearGradient(centerX, centerY - (36 * scale), centerX, centerY + (40 * scale));
  outlineGradient.addColorStop(0, tier.colors.outline);
  outlineGradient.addColorStop(1, "rgba(255, 255, 255, 0.02)");
  context.strokeStyle = outlineGradient;
  context.lineWidth = 2.2 * scale;
  drawFlamePath(context, centerX, centerY, scale);
  context.stroke();

  const innerGradient = context.createLinearGradient(centerX, centerY - (22 * scale), centerX, centerY + (34 * scale));
  innerGradient.addColorStop(0, tier.colors.innerShade);
  innerGradient.addColorStop(1, tier.colors.inner);
  context.fillStyle = innerGradient;
  drawInnerFlamePath(context, centerX, centerY + (4 * scale), scale);
  context.fill();

  const hotCoreGradient = context.createLinearGradient(centerX, centerY - (2 * scale), centerX, centerY + (32 * scale));
  hotCoreGradient.addColorStop(0, "#fffdf3");
  hotCoreGradient.addColorStop(0.7, "rgba(255, 255, 255, 0.82)");
  hotCoreGradient.addColorStop(1, "rgba(255, 240, 200, 0.28)");
  context.fillStyle = hotCoreGradient;
  drawHotCorePath(context, centerX, centerY + (15 * scale), scale);
  context.fill();
}

async function renderEmoji(tier) {
  const canvas = new Canvas(emojiSize, emojiSize);
  const context = canvas.getContext("2d");
  drawFlameEmoji(context, tier, 0, 0, emojiSize);

  const filePath = path.join(outputDirectory, `${tier.key}.png`);
  fs.writeFileSync(filePath, await canvas.encode("png"));
}

function drawPreviewCard(context, tier, x, y, width, height) {
  const cardGradient = context.createLinearGradient(x, y, x + width, y + height);
  cardGradient.addColorStop(0, "#141414");
  cardGradient.addColorStop(1, "#101010");
  context.fillStyle = cardGradient;
  drawRoundedRect(context, x, y, width, height, 24);
  context.fill();

  context.strokeStyle = "rgba(255, 255, 255, 0.07)";
  context.lineWidth = 1;
  drawRoundedRect(context, x, y, width, height, 24);
  context.stroke();

  drawFlameEmoji(context, tier, x + 44, y + 28, 128);

  context.fillStyle = "#f5f5f5";
  context.font = "bold 28px Segoe UI";
  context.fillText(`${tier.label}`, x + 194, y + 62);

  context.fillStyle = "#a1a1aa";
  context.font = "20px Segoe UI";
  context.fillText(`Hari ${tier.range}`, x + 194, y + 94);

  context.fillStyle = "#d4d4d8";
  context.font = "18px Segoe UI";
  context.fillText(`Emoji: ${tier.suggestedEmojiName}`, x + 194, y + 132);
}

async function renderPreviewSheet() {
  const canvas = new Canvas(previewWidth, previewHeight);
  const context = canvas.getContext("2d");
  const background = context.createLinearGradient(0, 0, previewWidth, previewHeight);
  background.addColorStop(0, "#0b0b0c");
  background.addColorStop(1, "#121214");
  context.fillStyle = background;
  context.fillRect(0, 0, previewWidth, previewHeight);

  context.fillStyle = "#fafafa";
  context.font = "bold 42px Segoe UI";
  context.fillText("404! Collective Streak Emoji Tiers", 56, 72);

  context.fillStyle = "#a1a1aa";
  context.font = "22px Segoe UI";
  context.fillText("Preview set for Discord custom emoji upload and future streak notifications", 56, 112);

  const columns = 3;
  const gapX = 36;
  const gapY = 30;
  const cardWidth = 420;
  const cardHeight = 178;
  const startX = 56;
  const startY = 152;

  tiers.forEach((tier, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    const x = startX + (column * (cardWidth + gapX));
    const y = startY + (row * (cardHeight + gapY));
    drawPreviewCard(context, tier, x, y, cardWidth, cardHeight);
  });

  fs.writeFileSync(path.join(outputDirectory, "preview.png"), await canvas.encode("png"));
}

function writeManifest() {
  const manifest = {
    generatedAt: new Date().toISOString(),
    note: "Upload these PNG files as Discord custom emoji. The same assets can be reused in the streak notification canvas.",
    tiers: tiers.map((tier) => ({
      key: tier.key,
      label: tier.label,
      range: tier.range,
      suggestedEmojiName: tier.suggestedEmojiName,
      file: `${tier.key}.png`
    }))
  };

  fs.writeFileSync(
    path.join(outputDirectory, "manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
    "utf8"
  );
}

async function main() {
  ensureDirectory(outputDirectory);

  for (const tier of tiers) {
    await renderEmoji(tier);
  }

  await renderPreviewSheet();
  writeManifest();

  console.log(`Generated ${tiers.length} streak emoji assets in ${outputDirectory}`);
}

main().catch((error) => {
  console.error("Failed to generate streak emojis:", error);
  process.exitCode = 1;
});
