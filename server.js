const http = require("node:http");
const fs = require("node:fs/promises");
const path = require("node:path");
const { exec, execFile } = require("node:child_process");

const {
  ensureFolders,
  getInputImages,
  inputDir,
  outputDir,
  processAllImages,
} = require("./process-images");

const port = Number(process.env.PORT || 3768);
const publicDir = path.join(__dirname, "public");

let isProcessing = false;

const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
};

function sendJson(response, statusCode, data) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(JSON.stringify(data));
}

function openBrowser(url) {
  if (process.platform === "win32") {
    exec(`start "" "${url}"`);
    return;
  }

  if (process.platform === "darwin") {
    execFile("open", [url]);
    return;
  }

  execFile("xdg-open", [url]);
}

function openFolder(folderPath) {
  if (process.platform === "win32") {
    execFile("explorer.exe", [folderPath]);
    return;
  }

  if (process.platform === "darwin") {
    execFile("open", [folderPath]);
    return;
  }

  execFile("xdg-open", [folderPath]);
}

async function serveStatic(request, response) {
  const requestUrl = new URL(request.url, `http://${request.headers.host}`);
  const requestedPath = requestUrl.pathname === "/" ? "/index.html" : requestUrl.pathname;
  const safePath = path.normalize(decodeURIComponent(requestedPath)).replace(/^(\.\.[/\\])+/, "");
  const filePath = path.join(publicDir, safePath);

  if (!filePath.startsWith(publicDir)) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  try {
    const file = await fs.readFile(filePath);
    response.writeHead(200, {
      "Content-Type": contentTypes[path.extname(filePath)] || "application/octet-stream",
    });
    response.end(file);
  } catch {
    response.writeHead(404);
    response.end("Not found");
  }
}

async function handleApi(request, response) {
  const requestUrl = new URL(request.url, `http://${request.headers.host}`);

  if (request.method === "GET" && requestUrl.pathname === "/api/status") {
    await ensureFolders();
    const images = await getInputImages();
    sendJson(response, 200, {
      inputDir,
      outputDir,
      images,
      isProcessing,
    });
    return;
  }

  if (request.method === "POST" && requestUrl.pathname === "/api/process") {
    if (isProcessing) {
      sendJson(response, 409, { message: "正在处理，请稍等。" });
      return;
    }

    isProcessing = true;
    try {
      const summary = await processAllImages();
      sendJson(response, 200, summary);
    } catch (error) {
      sendJson(response, 500, { message: error.message });
    } finally {
      isProcessing = false;
    }
    return;
  }

  if (request.method === "POST" && requestUrl.pathname === "/api/open-folder") {
    const target = requestUrl.searchParams.get("target");
    if (target === "input") {
      await ensureFolders();
      openFolder(inputDir);
      sendJson(response, 200, { opened: inputDir });
      return;
    }

    if (target === "output") {
      await ensureFolders();
      openFolder(outputDir);
      sendJson(response, 200, { opened: outputDir });
      return;
    }

    sendJson(response, 400, { message: "Unknown folder target." });
    return;
  }

  sendJson(response, 404, { message: "Not found" });
}

const server = http.createServer((request, response) => {
  if (request.url.startsWith("/api/")) {
    handleApi(request, response);
    return;
  }

  serveStatic(request, response);
});

ensureFolders()
  .then(() => {
    server.listen(port, () => {
      const url = `http://localhost:${port}`;
      console.log(`Image Auto Processor GUI is running: ${url}`);
      openBrowser(url);
    });
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
