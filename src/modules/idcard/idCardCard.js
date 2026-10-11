const fs = require("node:fs/promises");
const path = require("node:path");
const { AttachmentBuilder } = require("discord.js");
const { Canvas, GlobalFonts, loadImage } = require("@napi-rs/canvas");
const { readLayoutConfig } = require("./idCardLayout");

const assetsDirectory = path.join(__dirname, "..", "..", "..", "assets");
const templatePath = path.join(assetsDirectory, "idcard.png");
const customFontPath = path.join(assetsDirectory, "font.otf");

const customRegularRegistered = GlobalFonts.registerFromPath(customFontPath, "Murphy ID Font");
const customBoldRegistered = GlobalFonts.registerFromPath(customFontPath, "Murphy ID Font Bold");
const timesRegularRegistered = GlobalFonts.registerFromPath("C:\\Windows\\Fonts\\times.ttf", "Murphy Times");
const timesBoldRegistered = GlobalFonts.registerFromPath("C:\\Windows\\Fonts\\timesbd.ttf", "Murphy Times Bold");

function getFontFamily(weight = "regular") {
  if (weight === "bold" && customBoldRegistered) {
    return "Murphy ID Font Bold";
  }

  if (customRegularRegistered) {
    return "Murphy ID Font";
  }

  if (weight === "bold" && timesBoldRegistered) {
    return "Murphy Times Bold";
  }

  if (timesRegularRegistered) {
    return "Murphy Times";
  }

  return "serif";
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

function fitText(context, value, maxWidth, fallback = "-") {
  const text = String(value || fallback);

  if (context.measureText(text).width <= maxWidth) {
    return text;
  }

  let trimmed = text;

  while (trimmed.length > 1 && context.measureText(`${trimmed}...`).width > maxWidth) {
    trimmed = trimmed.slice(0, -1);
  }

  return `${trimmed}...`;
}

function wrapText(context, text, maxWidth) {
  const rawLines = String(text || "-").split(/\r?\n/);
  const lines = [];

  for (const rawLine of rawLines) {
    const tokens = rawLine.trim().split(/\s+/).filter(Boolean);

    if (!tokens.length) {
      lines.push("");
      continue;
    }

    let current = "";

    for (let token of tokens) {
      while (context.measureText(token).width > maxWidth && token.length > 1) {
        let sliceIdx = token.length - 1;
        while (sliceIdx > 1 && context.measureText(token.slice(0, sliceIdx)).width > maxWidth) {
          sliceIdx--;
        }
        const part = token.slice(0, sliceIdx);
        token = token.slice(sliceIdx);

        if (current) {
          lines.push(current);
          current = "";
        }
        lines.push(part);
      }

      if (!current) {
        current = token;
      } else {
        const nextValue = `${current} ${token}`;

        if (context.measureText(nextValue).width <= maxWidth) {
          current = nextValue;
        } else {
          lines.push(current);
          current = token;
        }
      }
    }

    if (current) {
      lines.push(current);
    }
  }

  return lines.length ? lines : ["-"];
}

function fitWrappedText(context, text, maxWidth, maxHeight, {
  startFontSize = 68,
  minFontSize = 42,
  lineHeightFactor = 1.25
} = {}) {
  const largestFont = Math.max(startFontSize, minFontSize);
  const smallestFont = Math.min(startFontSize, minFontSize);

  for (let size = largestFont; size >= smallestFont; size -= 1) {
    context.font = `${size}px "${getFontFamily()}"`;
    const lines = wrapText(context, text, maxWidth);
    const lineHeight = Math.round(size * lineHeightFactor);

    if ((lines.length * lineHeight) <= maxHeight) {
      return { fontSize: size, lines, lineHeight };
    }
  }

  context.font = `${smallestFont}px "${getFontFamily()}"`;
  const lines = wrapText(context, text, maxWidth);
  const lineHeight = Math.round(smallestFont * lineHeightFactor);
  const maxLines = Math.max(1, Math.floor(maxHeight / lineHeight));
  const limited = lines.slice(0, maxLines);

  if (lines.length > maxLines && limited.length) {
    let lastLine = limited[limited.length - 1];

    while (lastLine.length > 1 && context.measureText(`${lastLine}...`).width > maxWidth) {
      lastLine = lastLine.slice(0, -1);
    }

    limited[limited.length - 1] = `${lastLine}...`;
  }

  return { fontSize: smallestFont, lines: limited, lineHeight };
}

function drawPlaceholderPortrait(context, x, y, size, displayName) {
  const centerX = x + (size / 2);
  const centerY = y + (size / 2);
  const gradient = context.createRadialGradient(centerX, centerY - 12, 14, centerX, centerY, size / 2);
  gradient.addColorStop(0, "#6f6f73");
  gradient.addColorStop(0.55, "#3f4044");
  gradient.addColorStop(1, "#141416");
  context.fillStyle = gradient;
  context.fillRect(x, y, size, size);

  context.save();
  context.globalAlpha = 0.35;
  context.fillStyle = "rgba(255, 255, 255, 0.22)";
  context.beginPath();
  context.arc(centerX, centerY - 30, size * 0.2, 0, Math.PI * 2);
  context.fill();
  context.restore();

  context.fillStyle = "rgba(255, 255, 255, 0.18)";
  context.beginPath();
  context.ellipse(centerX, centerY + 80, size * 0.26, size * 0.22, 0, 0, Math.PI * 2);
  context.fill();

  context.fillStyle = "#f3f4f6";
  context.font = `bold ${Math.round(size * 0.22)}px "${getFontFamily("bold")}"`;
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText((displayName || "S").charAt(0).toUpperCase(), centerX, centerY);
  context.textAlign = "start";
  context.textBaseline = "alphabetic";
}

async function loadRemoteImage(url) {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Failed to fetch image: ${response.status}`);
  }

  return loadImage(Buffer.from(await response.arrayBuffer()));
}

async function resolveAvatarImage(options = {}) {
  if (options.avatarBuffer) {
    return loadImage(options.avatarBuffer);
  }

  if (options.avatarPath) {
    return loadImage(options.avatarPath);
  }

  if (options.avatarUrl) {
    return loadRemoteImage(options.avatarUrl);
  }

  return null;
}

function drawTemplateOverlay(context, template, layout, scaleX, scaleY) {
  const overlayCanvas = new Canvas(template.width, template.height);
  const overlayContext = overlayCanvas.getContext("2d");
  const holeCenterX = layout.mask.centerX * scaleX;
  const holeCenterY = layout.mask.centerY * scaleY;
  const holeRadius = layout.mask.radius * Math.min(scaleX, scaleY);

  overlayContext.drawImage(template, 0, 0, template.width, template.height);
  overlayContext.save();
  overlayContext.globalCompositeOperation = "destination-out";
  overlayContext.beginPath();
  overlayContext.arc(holeCenterX, holeCenterY, holeRadius, 0, Math.PI * 2);
  overlayContext.closePath();
  overlayContext.fill();
  overlayContext.restore();

  context.drawImage(overlayCanvas, 0, 0);
}

function templateHasTransparency(template) {
  const probeCanvas = new Canvas(template.width, template.height);
  const probeContext = probeCanvas.getContext("2d");
  probeContext.drawImage(template, 0, 0, template.width, template.height);
  const { data } = probeContext.getImageData(0, 0, template.width, template.height);

  for (let index = 3; index < data.length; index += 4) {
    if (data[index] < 255) {
      return true;
    }
  }

  return false;
}

function drawAvatarBehindTemplate(context, avatarImage, displayName, layout, scaleX, scaleY) {
  const photoX = layout.avatar.x * scaleX;
  const photoY = layout.avatar.y * scaleY;
  const photoSize = layout.avatar.size * Math.min(scaleX, scaleY);
  const photoCenterX = photoX + (photoSize / 2);
  const photoCenterY = photoY + (photoSize / 2);
  const photoRadius = layout.avatar.radius * Math.min(scaleX, scaleY);

  context.save();
  context.beginPath();
  context.arc(photoCenterX, photoCenterY, photoRadius, 0, Math.PI * 2);
  context.closePath();
  context.clip();

  if (avatarImage) {
    context.drawImage(avatarImage, photoX, photoY, photoSize, photoSize);
  } else {
    drawPlaceholderPortrait(context, photoX, photoY, photoSize, displayName);
  }

  context.restore();
}

function drawFieldValue(context, value, fieldLayout, scaleX, scaleY) {
  context.font = `${fieldLayout.fontSize * Math.min(scaleX, scaleY)}px "${getFontFamily()}"`;
  context.fillStyle = "#f3f4f6";
  context.shadowColor = "rgba(0, 0, 0, 0.82)";
  context.shadowBlur = 6 * Math.min(scaleX, scaleY);
  context.textBaseline = "top";
  context.fillText(
    fitText(context, value, fieldLayout.width * scaleX),
    fieldLayout.x * scaleX,
    fieldLayout.y * scaleY
  );
  context.shadowBlur = 0;
  context.textBaseline = "alphabetic";
}

function drawBio(context, value, bioLayout, scaleX, scaleY) {
  const x = bioLayout.x * scaleX;
  const y = bioLayout.y * scaleY;
  const width = bioLayout.width * scaleX;
  const height = bioLayout.height * scaleY;
  const { fontSize, lines, lineHeight } = fitWrappedText(context, value, width, height, {
    startFontSize: bioLayout.startFontSize * Math.min(scaleX, scaleY),
    minFontSize: bioLayout.minFontSize * Math.min(scaleX, scaleY),
    lineHeightFactor: bioLayout.lineHeightFactor
  });

  context.font = `${fontSize}px "${getFontFamily()}"`;
  context.fillStyle = "#ececec";
  context.shadowColor = "rgba(0, 0, 0, 0.75)";
  context.shadowBlur = 4 * Math.min(scaleX, scaleY);
  context.textBaseline = "top";

  let currentY = y;

  for (const line of lines) {
    context.fillText(line, x, currentY);
    currentY += lineHeight;
  }

  context.shadowBlur = 0;
  context.textBaseline = "alphabetic";
}

async function renderIdCardBuffer(options = {}) {
  const layout = readLayoutConfig();
  const template = await loadImage(templatePath);
  const canvas = new Canvas(template.width, template.height);
  const context = canvas.getContext("2d");
  const avatarImage = await resolveAvatarImage(options).catch(() => null);
  const scaleX = template.width / layout.template.width;
  const scaleY = template.height / layout.template.height;
  const useNativeTransparentTemplate = templateHasTransparency(template);

  drawAvatarBehindTemplate(context, avatarImage, options.name, layout, scaleX, scaleY);

  if (useNativeTransparentTemplate) {
    context.drawImage(template, 0, 0, template.width, template.height);
  } else {
    drawTemplateOverlay(context, template, layout, scaleX, scaleY);
  }

  drawFieldValue(context, options.name || layout.previewData.name || "Sokaa", layout.fields.name, scaleX, scaleY);
  drawFieldValue(context, options.age || layout.previewData.age || "20 Tahun", layout.fields.age, scaleX, scaleY);
  drawFieldValue(context, options.city || layout.previewData.city || "Jakarta", layout.fields.city, scaleX, scaleY);
  drawBio(
    context,
    options.bio || layout.previewData.bio || "Menetap di Murphy sambil ngobrol, dengerin musik, dan nemenin teman-teman sampai malam.",
    layout.fields.bio,
    scaleX,
    scaleY
  );

  return canvas.encode("png");
}

async function createIdCardCard(options = {}) {
  return new AttachmentBuilder(await renderIdCardBuffer(options), {
    name: options.fileName || "id-card-preview.png"
  });
}

async function writeIdCardPreviewFile(outputPath, options = {}) {
  const attachment = await createIdCardCard(options);
  await fs.writeFile(outputPath, attachment.attachment);
  return outputPath;
}

module.exports = {
  createIdCardCard,
  renderIdCardBuffer,
  writeIdCardPreviewFile,
  drawRoundedRect
};
