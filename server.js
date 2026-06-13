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

const translateLanguages = [
  { code: "en", label: "英语" },
  { code: "de", label: "德语" },
  { code: "es", label: "西班牙语" },
  { code: "fr", label: "法语" },
  { code: "it", label: "意大利语" },
  { code: "pt", label: "葡萄牙语" },
  { code: "ru", label: "俄语" },
  { code: "ja", label: "日语" },
  { code: "ar", label: "阿拉伯语" },
  { code: "ko", label: "韩语" },
  { code: "tr", label: "土耳其语" },
  { code: "th", label: "泰语" },
  { code: "vi", label: "越南语" },
  { code: "nl", label: "荷兰语" },
  { code: "id", label: "印度尼西亚语" },
  { code: "he", label: "希伯来语" },
  { code: "hi", label: "印地语" },
  { code: "zh-CN", label: "中文" },
];

const supportedTranslateLanguages = new Set(
  translateLanguages.map((language) => language.code),
);

const myMemoryLanguageMap = {
  "zh-CN": "zh-CN",
  en: "en",
  de: "de",
  es: "es",
  fr: "fr",
  it: "it",
  pt: "pt",
  ru: "ru",
  ja: "ja",
  ar: "ar",
  ko: "ko",
  tr: "tr",
  th: "th",
  vi: "vi",
  nl: "nl",
  id: "id",
  he: "he",
  hi: "hi",
};

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

function readRequestBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";

    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > 50000) {
        request.destroy();
        reject(new Error("Text is too long."));
      }
    });

    request.on("end", () => resolve(body));
    request.on("error", reject);
  });
}

async function translateText(text, targetLanguage) {
  try {
    return await translateWithGoogle(text, targetLanguage);
  } catch {
    return translateWithMyMemory(text, targetLanguage);
  }
}

async function translateWithGoogle(text, targetLanguage) {
  const apiUrl = new URL("https://translate.googleapis.com/translate_a/single");
  apiUrl.searchParams.set("client", "gtx");
  apiUrl.searchParams.set("sl", "auto");
  apiUrl.searchParams.set("tl", targetLanguage);
  apiUrl.searchParams.set("dt", "t");
  apiUrl.searchParams.set("q", text);

  const translationResponse = await fetch(apiUrl, {
    headers: {
      "User-Agent": "Mozilla/5.0",
    },
    signal: AbortSignal.timeout(3500),
  });

  if (!translationResponse.ok) {
    throw new Error("Translation service is unavailable.");
  }

  const data = await translationResponse.json();
  const translatedText = Array.isArray(data?.[0])
    ? data[0].map((part) => part?.[0] || "").join("")
    : "";

  return {
    detectedLanguage: data?.[2] || "auto",
    translatedText,
  };
}

async function translateAllLanguages(text) {
  const translations = await Promise.all(
    translateLanguages.map(async (language) => {
      try {
        const result = await translateText(text, language.code);
        return {
          code: language.code,
          label: language.label,
          translatedText: result.translatedText,
          detectedLanguage: result.detectedLanguage,
          status: "success",
        };
      } catch (error) {
        return {
          code: language.code,
          label: language.label,
          translatedText: "",
          error: error.message,
          status: "failed",
        };
      }
    }),
  );

  return translations;
}

function detectLikelyLanguage(text) {
  if (/[\u4e00-\u9fff]/.test(text)) return "zh-CN";
  if (/[\u3040-\u30ff]/.test(text)) return "ja";
  if (/[\uac00-\ud7af]/.test(text)) return "ko";
  if (/[\u0600-\u06ff]/.test(text)) return "ar";
  if (/[\u0400-\u04ff]/.test(text)) return "ru";
  if (/[\u0590-\u05ff]/.test(text)) return "he";
  if (/[\u0900-\u097f]/.test(text)) return "hi";
  if (/[\u0e00-\u0e7f]/.test(text)) return "th";
  if (/[ăâđêôơưĂÂĐÊÔƠƯ]/.test(text)) return "vi";
  if (/[ñáéíóúü¿¡]/i.test(text)) return "es";
  if (/[àâçéèêëîïôùûüÿæœ]/i.test(text)) return "fr";
  if (/[äöüß]/i.test(text)) return "de";
  if (/[ğışİöçü]/i.test(text)) return "tr";
  return "en";
}

async function translateWithMyMemory(text, targetLanguage) {
  const sourceLanguage = detectLikelyLanguage(text);

  if (sourceLanguage === targetLanguage) {
    return {
      detectedLanguage: sourceLanguage,
      translatedText: text,
    };
  }

  const source = myMemoryLanguageMap[sourceLanguage] || "en";
  const target = myMemoryLanguageMap[targetLanguage] || targetLanguage;
  const apiUrl = new URL("https://api.mymemory.translated.net/get");
  apiUrl.searchParams.set("q", text);
  apiUrl.searchParams.set("langpair", `${source}|${target}`);

  const translationResponse = await fetch(apiUrl, {
    headers: {
      "User-Agent": "Mozilla/5.0",
    },
  });

  if (!translationResponse.ok) {
    throw new Error("Translation service is unavailable.");
  }

  const data = await translationResponse.json();
  const translatedText = data?.responseData?.translatedText;

  if (!translatedText || data?.responseStatus >= 400) {
    throw new Error(data?.responseDetails || "Translation failed.");
  }

  return {
    detectedLanguage: sourceLanguage,
    translatedText,
  };
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

  if (request.method === "POST" && requestUrl.pathname === "/api/translate") {
    try {
      const body = await readRequestBody(request);
      const payload = JSON.parse(body || "{}");
      const text = String(payload.text || "").trim();
      const targetLanguage = String(payload.targetLanguage || "");

      if (!text) {
        sendJson(response, 400, { message: "Please enter text to translate." });
        return;
      }

      if (!supportedTranslateLanguages.has(targetLanguage)) {
        sendJson(response, 400, { message: "Unsupported target language." });
        return;
      }

      const result = await translateText(text, targetLanguage);
      sendJson(response, 200, result);
    } catch (error) {
      sendJson(response, 500, { message: error.message });
    }
    return;
  }

  if (request.method === "POST" && requestUrl.pathname === "/api/translate-all") {
    try {
      const body = await readRequestBody(request);
      const payload = JSON.parse(body || "{}");
      const text = String(payload.text || "").trim();

      if (!text) {
        sendJson(response, 400, { message: "Please enter text to translate." });
        return;
      }

      const translations = await translateAllLanguages(text);
      sendJson(response, 200, { translations });
    } catch (error) {
      sendJson(response, 500, { message: error.message });
    }
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
