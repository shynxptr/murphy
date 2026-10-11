const { AttachmentBuilder } = require("discord.js");
const { Canvas, GlobalFonts, loadImage } = require("@napi-rs/canvas");

const fontRegistered = GlobalFonts.registerFromPath("C:\\Windows\\Fonts\\segoeui.ttf", "Segoe UI");
const boldFontRegistered = GlobalFonts.registerFromPath("C:\\Windows\\Fonts\\segoeuib.ttf", "Segoe UI Bold");

function getFontFamily(weight = "normal") {
  if (weight === "bold" && boldFontRegistered) {
    return "Segoe UI Bold";
  }

  return fontRegistered ? "Segoe UI" : "sans-serif";
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

function splitWordToFit(context, word, maxWidth) {
  if (context.measureText(word).width <= maxWidth) {
    return [word];
  }

  const segments = [];
  let current = "";

  for (const character of word) {
    const trial = `${current}${character}`;

    if (current && context.measureText(trial).width > maxWidth) {
      segments.push(current);
      current = character;
      continue;
    }

    current = trial;
  }

  if (current) {
    segments.push(current);
  }

  return segments;
}

function wrapText(context, text, maxWidth) {
  const words = text.split(/\s+/).filter(Boolean);
  const lines = [];
  let currentLine = "";

  for (const word of words) {
    const segments = splitWordToFit(context, word, maxWidth);

    for (const segment of segments) {
      const trialLine = currentLine ? `${currentLine} ${segment}` : segment;

      if (context.measureText(trialLine).width <= maxWidth) {
        currentLine = trialLine;
        continue;
      }

      if (currentLine) {
        lines.push(currentLine);
      }

      currentLine = segment;
    }
  }

  if (currentLine) {
    lines.push(currentLine);
  }

  return lines;
}

function fitQuoteLines(context, text, maxWidth, maxLines) {
  const normalized = text.replace(/\s+/g, " ").trim();
  const lines = wrapText(context, normalized, maxWidth);

  if (lines.length <= maxLines) {
    return lines;
  }

  const limited = lines.slice(0, maxLines);
  limited[maxLines - 1] = `${limited[maxLines - 1].replace(/[.,;:!?-]*$/, "")}...`;
  return limited;
}

function decorateQuoteLines(lines) {
  return lines.map((line, index) => {
    if (lines.length === 1) {
      return `" ${line} "`;
    }

    if (index === 0) {
      return `" ${line}`;
    }

    if (index === lines.length - 1) {
      return `${line} "`;
    }

    return line;
  });
}

function findQuoteLayout(context, quoteText, maxWidth, options = {}) {
  const normalized = quoteText.replace(/\s+/g, " ").trim();
  const maxLines = options.maxLines || 5;
  const maxHeight = options.maxHeight || 116;
  const maxFontSize = options.maxFontSize || 26;
  const minFontSize = options.minFontSize || 18;

  for (let fontSize = maxFontSize; fontSize >= minFontSize; fontSize -= 1) {
    context.font = `bold ${fontSize}px "${getFontFamily("bold")}"`;

    const lines = wrapText(context, normalized, maxWidth);
    const renderedLines = decorateQuoteLines(lines);
    const lineHeight = Math.round(fontSize * 1.2);
    const blockHeight = renderedLines.length * lineHeight;
    const widestLine = Math.max(...renderedLines.map((line) => context.measureText(line).width));

    if (renderedLines.length <= maxLines && blockHeight <= maxHeight && widestLine <= maxWidth) {
      return {
        fontSize,
        lineHeight,
        renderedLines
      };
    }
  }

  context.font = `bold ${minFontSize}px "${getFontFamily("bold")}"`;

  return {
    fontSize: minFontSize,
    lineHeight: Math.round(minFontSize * 1.2),
    renderedLines: decorateQuoteLines(fitQuoteLines(context, normalized, maxWidth, maxLines))
  };
}

async function loadAvatarImage(user) {
  const avatarUrl = user.displayAvatarURL({
    extension: "png",
    forceStatic: true,
    size: 512
  });

  const response = await fetch(avatarUrl);

  if (!response.ok) {
    throw new Error(`Failed to fetch avatar: ${response.status}`);
  }

  const avatarBuffer = Buffer.from(await response.arrayBuffer());
  return loadImage(avatarBuffer);
}

function drawBaseBackground(context, width, height) {
  const gradient = context.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, "#111111");
  gradient.addColorStop(0.5, "#191919");
  gradient.addColorStop(1, "#101010");
  context.fillStyle = gradient;
  context.fillRect(0, 0, width, height);
}

function drawAvatarBackground(context, avatar, width, height) {
  context.save();
  context.filter = "blur(34px)";
  context.globalAlpha = 0.92;
  context.drawImage(avatar, -40, -70, width + 120, height + 140);
  context.globalAlpha = 0.38;
  context.drawImage(avatar, width * 0.4, -10, width * 0.62, height * 1.06);
  context.restore();

  const darkOverlay = context.createLinearGradient(0, 0, width, 0);
  darkOverlay.addColorStop(0, "rgba(0, 0, 0, 0.44)");
  darkOverlay.addColorStop(0.45, "rgba(0, 0, 0, 0.28)");
  darkOverlay.addColorStop(1, "rgba(0, 0, 0, 0.44)");
  context.fillStyle = darkOverlay;
  context.fillRect(0, 0, width, height);
}

function drawPanels(context, width, height) {
  context.fillStyle = "rgba(10, 10, 10, 0.22)";
  drawRoundedRect(context, 18, 18, width - 36, height - 36, 16);
  context.fill();

  context.strokeStyle = "rgba(255, 255, 255, 0.06)";
  context.lineWidth = 1;
  drawRoundedRect(context, 18, 18, width - 36, height - 36, 16);
  context.stroke();

  context.fillStyle = "rgba(255, 255, 255, 0.02)";
  drawRoundedRect(context, 30, 30, width - 60, height - 60, 14);
  context.fill();

  context.strokeStyle = "rgba(255, 255, 255, 0.035)";
  context.lineWidth = 1;
  drawRoundedRect(context, 30, 30, width - 60, height - 60, 14);
  context.stroke();
}

function drawAvatarCard(context, avatar, fallbackLetter) {
  const avatarX = 58;
  const avatarY = 74;
  const avatarSize = 126;

  const frameGradient = context.createLinearGradient(avatarX - 10, avatarY - 10, avatarX + avatarSize + 10, avatarY + avatarSize + 10);
  frameGradient.addColorStop(0, "rgba(255, 255, 255, 0.10)");
  frameGradient.addColorStop(0.5, "rgba(255, 255, 255, 0.04)");
  frameGradient.addColorStop(1, "rgba(0, 0, 0, 0.10)");
  context.fillStyle = frameGradient;
  drawRoundedRect(context, avatarX - 10, avatarY - 10, avatarSize + 20, avatarSize + 20, 18);
  context.fill();

  context.save();
  drawRoundedRect(context, avatarX, avatarY, avatarSize, avatarSize, 16);
  context.clip();

  if (avatar) {
    context.drawImage(avatar, avatarX, avatarY, avatarSize, avatarSize);
  } else {
    const fallbackGradient = context.createLinearGradient(avatarX, avatarY, avatarX + avatarSize, avatarY + avatarSize);
    fallbackGradient.addColorStop(0, "#1d1d1d");
    fallbackGradient.addColorStop(1, "#090909");
    context.fillStyle = fallbackGradient;
    context.fillRect(avatarX, avatarY, avatarSize, avatarSize);
    context.fillStyle = "#f4f4f4";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.font = `bold 64px "${getFontFamily("bold")}"`;
    context.fillText(fallbackLetter, avatarX + (avatarSize / 2), avatarY + (avatarSize / 2) + 4);
    context.textAlign = "start";
    context.textBaseline = "alphabetic";
  }

  context.restore();

  context.strokeStyle = "rgba(255, 255, 255, 0.18)";
  context.lineWidth = 1;
  drawRoundedRect(context, avatarX, avatarY, avatarSize, avatarSize, 16);
  context.stroke();
}

function drawQuoteText(context, quoteText, displayName, username) {
  const panelX = 230;
  const panelWidth = 318;
  const centerX = panelX + (panelWidth / 2);
  const quoteWidth = 246;
  const quoteAreaTop = 74;
  const quoteAreaHeight = 112;
  const quoteLayout = findQuoteLayout(context, quoteText, quoteWidth, {
    maxLines: 5,
    maxHeight: quoteAreaHeight,
    maxFontSize: 26,
    minFontSize: 18
  });
  const quoteBlockHeight = quoteLayout.renderedLines.length * quoteLayout.lineHeight;
  const quoteStartY = quoteAreaTop + ((quoteAreaHeight - quoteBlockHeight) / 2) + (quoteLayout.lineHeight / 2);
  const quoteEndY = quoteStartY + ((quoteLayout.renderedLines.length - 1) * quoteLayout.lineHeight) + (quoteLayout.lineHeight / 2);

  context.fillStyle = "#f3f1ec";
  context.font = `bold ${quoteLayout.fontSize}px "${getFontFamily("bold")}"`;

  context.textAlign = "center";
  context.textBaseline = "middle";
  context.shadowColor = "rgba(255, 255, 255, 0.08)";
  context.shadowBlur = 10;

  quoteLayout.renderedLines.forEach((line, index) => {
    context.fillText(line, centerX, quoteStartY + (index * quoteLayout.lineHeight));
  });
  context.shadowBlur = 0;
  context.textBaseline = "alphabetic";

  context.strokeStyle = "rgba(255, 255, 255, 0.08)";
  context.lineWidth = 1;
  context.beginPath();
  context.moveTo(centerX - 28, quoteEndY + 18);
  context.lineTo(centerX + 28, quoteEndY + 18);
  context.stroke();

  context.fillStyle = "#c5c2bd";
  context.font = `bold 15px "${getFontFamily("bold")}"`;
  context.fillText(`- ${displayName.slice(0, 24)}`, centerX, quoteEndY + 44);

  context.fillStyle = "#8b8885";
  context.font = `13px "${getFontFamily()}"`;
  context.fillText(`@${username}`.slice(0, 28), centerX, quoteEndY + 64);

  context.textAlign = "start";
}

function drawWatermark(context, width, height) {
  context.fillStyle = "rgba(255, 255, 255, 0.18)";
  context.font = `9px "${getFontFamily()}"`;
  context.fillText("Murphy", width - 98, height - 20);
}

async function createQuoteCard(user, quoteText) {
  const width = 620;
  const height = 280;
  const canvas = new Canvas(width, height);
  const context = canvas.getContext("2d");
  const displayName = user.globalName || user.username;

  drawBaseBackground(context, width, height);

  let avatar = null;

  try {
    avatar = await loadAvatarImage(user);
    drawAvatarBackground(context, avatar, width, height);
  } catch (error) {
    console.error("Failed to load quote avatar:", error);
  }

  drawPanels(context, width, height);
  drawAvatarCard(context, avatar, displayName.charAt(0).toUpperCase());
  drawQuoteText(context, quoteText, displayName, user.username);
  drawWatermark(context, width, height);

  return new AttachmentBuilder(await canvas.encode("png"), {
    name: "murphy-quote.png"
  });
}

module.exports = {
  createQuoteCard
};
