const http = require("node:http");
const fs = require("node:fs/promises");
const path = require("node:path");
const { renderIdCardBuffer } = require("../src/modules/idcard/idCardCard");
const {
  defaultLayout,
  normalizeLayout,
  readLayoutConfig,
  writeLayoutConfig,
  layoutPath
} = require("../src/modules/idcard/idCardLayout");

const port = Number.parseInt(process.env.IDCARD_LAYOUT_PORT || "3217", 10);
const htmlPath = path.join(__dirname, "..", "tools", "idcard-layout-dashboard.html");
const templatePath = path.join(__dirname, "..", "assets", "idcard.png");
const fontPath = path.join(__dirname, "..", "assets", "font.otf");

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8"
  });
  response.end(JSON.stringify(payload));
}

function sendText(response, statusCode, payload, contentType = "text/plain; charset=utf-8") {
  response.writeHead(statusCode, {
    "Content-Type": contentType
  });
  response.end(payload);
}

async function readRequestBody(request) {
  const chunks = [];

  for await (const chunk of request) {
    chunks.push(chunk);
  }

  return Buffer.concat(chunks).toString("utf8");
}

async function handler(request, response) {
  const url = new URL(request.url, `http://${request.headers.host || `127.0.0.1:${port}`}`);

  if (request.method === "GET" && url.pathname === "/") {
    const html = await fs.readFile(htmlPath, "utf8");
    return sendText(response, 200, html, "text/html; charset=utf-8");
  }

  if (request.method === "GET" && url.pathname === "/api/template") {
    const template = await fs.readFile(templatePath);
    response.writeHead(200, {
      "Content-Type": "image/png",
      "Cache-Control": "no-store"
    });
    response.end(template);
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/font") {
    const font = await fs.readFile(fontPath);
    response.writeHead(200, {
      "Content-Type": "font/otf",
      "Cache-Control": "no-store"
    });
    response.end(font);
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/layout") {
    return sendJson(response, 200, {
      layout: readLayoutConfig(),
      defaults: defaultLayout,
      layoutPath
    });
  }

  if (request.method === "POST" && url.pathname === "/api/layout") {
    try {
      const body = await readRequestBody(request);
      const payload = JSON.parse(body || "{}");
      const layout = writeLayoutConfig(payload.layout || {});
      return sendJson(response, 200, { ok: true, layout, layoutPath });
    } catch (error) {
      return sendJson(response, 400, { ok: false, error: error.message });
    }
  }

  if (request.method === "GET" && url.pathname === "/api/preview") {
    try {
      const currentLayout = readLayoutConfig();
      const previewData = normalizeLayout({
        previewData: {
          name: url.searchParams.get("name") || currentLayout.previewData.name,
          age: url.searchParams.get("age") || currentLayout.previewData.age,
          city: url.searchParams.get("city") || currentLayout.previewData.city,
          bio: url.searchParams.get("bio") || currentLayout.previewData.bio
        }
      }).previewData;

      const buffer = await renderIdCardBuffer(previewData);
      response.writeHead(200, {
        "Content-Type": "image/png",
        "Cache-Control": "no-store"
      });
      response.end(buffer);
      return;
    } catch (error) {
      return sendJson(response, 500, { ok: false, error: error.message });
    }
  }

  sendJson(response, 404, { ok: false, error: "Not found" });
}

const server = http.createServer((request, response) => {
  handler(request, response).catch((error) => {
    sendJson(response, 500, { ok: false, error: error.message });
  });
});

server.listen(port, "127.0.0.1", () => {
  console.log(`ID card layout dashboard running on http://127.0.0.1:${port}`);
  console.log(`Layout file: ${layoutPath}`);
});
