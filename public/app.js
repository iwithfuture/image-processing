const canvasSize = 1000;
const jpegQuality = 0.85;
const supportedTypes = new Set(["image/jpeg", "image/png"]);

const fileInput = document.querySelector("#fileInput");
const imageCount = document.querySelector("#imageCount");
const imageList = document.querySelector("#imageList");
const resultList = document.querySelector("#resultList");
const statusText = document.querySelector("#statusText");
const processButton = document.querySelector("#processButton");
const downloadAllButton = document.querySelector("#downloadAllButton");
const clearButton = document.querySelector("#clearButton");

let selectedFiles = [];
let processedImages = [];

function setStatus(text) {
  statusText.textContent = text;
}

function getOutputFileName(fileName) {
  const dotIndex = fileName.lastIndexOf(".");
  const baseName = dotIndex > 0 ? fileName.slice(0, dotIndex) : fileName;
  return `${baseName}.jpg`;
}

function formatFileSize(bytes) {
  if (bytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  }

  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function createEmptyState(text) {
  const element = document.createElement("div");
  element.className = "empty-state";
  element.textContent = text;
  return element;
}

function renderFiles() {
  imageCount.textContent = selectedFiles.length;
  imageList.innerHTML = "";
  processButton.disabled = selectedFiles.length === 0;

  if (selectedFiles.length === 0) {
    imageList.append(createEmptyState("请选择 jpg、jpeg 或 png 图片"));
    setStatus("等待图片");
    return;
  }

  const fragment = document.createDocumentFragment();
  for (const file of selectedFiles) {
    const item = document.createElement("li");

    const name = document.createElement("span");
    name.className = "file-name";
    name.title = file.name;
    name.textContent = file.name;

    const meta = document.createElement("span");
    meta.className = "file-meta";
    meta.textContent = formatFileSize(file.size);

    item.append(name, meta);
    fragment.append(item);
  }

  imageList.append(fragment);
  setStatus("准备就绪");
}

function renderResults() {
  resultList.innerHTML = "";
  downloadAllButton.disabled = processedImages.length === 0;

  if (processedImages.length === 0) {
    resultList.append(createEmptyState("还没有处理结果"));
    return;
  }

  const fragment = document.createDocumentFragment();
  for (const image of processedImages) {
    const item = document.createElement("div");
    item.className = "result-item";

    const name = document.createElement("span");
    name.className = "file-name";
    name.title = image.outputName;
    name.textContent = `${image.inputName} -> ${image.outputName}`;

    const link = document.createElement("a");
    link.className = "download-link";
    link.href = image.url;
    link.download = image.outputName;
    link.textContent = "下载";

    item.append(name, link);
    fragment.append(item);
  }

  resultList.append(fragment);
}

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();

    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };

    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error(`无法读取图片：${file.name}`));
    };

    image.src = url;
  });
}

function canvasToBlob(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
          return;
        }

        reject(new Error("图片导出失败"));
      },
      "image/jpeg",
      jpegQuality,
    );
  });
}

async function processFile(file) {
  const image = await loadImage(file);
  const canvas = document.createElement("canvas");
  canvas.width = canvasSize;
  canvas.height = canvasSize;

  const context = canvas.getContext("2d");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvasSize, canvasSize);

  const scale = Math.min(canvasSize / image.naturalWidth, canvasSize / image.naturalHeight);
  const width = Math.round(image.naturalWidth * scale);
  const height = Math.round(image.naturalHeight * scale);
  const x = Math.round((canvasSize - width) / 2);
  const y = Math.round((canvasSize - height) / 2);

  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(image, x, y, width, height);

  const blob = await canvasToBlob(canvas);
  const outputName = getOutputFileName(file.name);

  return {
    blob,
    inputName: file.name,
    outputName,
    url: URL.createObjectURL(blob),
  };
}

function revokeProcessedUrls() {
  for (const image of processedImages) {
    URL.revokeObjectURL(image.url);
  }
}

async function processImages() {
  processButton.disabled = true;
  downloadAllButton.disabled = true;
  revokeProcessedUrls();
  processedImages = [];
  renderResults();
  setStatus("正在处理...");

  try {
    for (let index = 0; index < selectedFiles.length; index += 1) {
      setStatus(`正在处理 ${index + 1} / ${selectedFiles.length}`);
      processedImages.push(await processFile(selectedFiles[index]));
      renderResults();
    }

    setStatus(`完成：成功处理 ${processedImages.length} 张`);
  } catch (error) {
    setStatus(error.message);
  } finally {
    processButton.disabled = selectedFiles.length === 0;
    downloadAllButton.disabled = processedImages.length === 0;
  }
}

function downloadAll() {
  for (const image of processedImages) {
    const link = document.createElement("a");
    link.href = image.url;
    link.download = image.outputName;
    document.body.append(link);
    link.click();
    link.remove();
  }
}

function clearAll() {
  fileInput.value = "";
  selectedFiles = [];
  revokeProcessedUrls();
  processedImages = [];
  renderFiles();
  renderResults();
}

fileInput.addEventListener("change", () => {
  selectedFiles = Array.from(fileInput.files).filter((file) => supportedTypes.has(file.type));
  revokeProcessedUrls();
  processedImages = [];
  renderFiles();
  renderResults();
});

processButton.addEventListener("click", processImages);
downloadAllButton.addEventListener("click", downloadAll);
clearButton.addEventListener("click", clearAll);

renderFiles();
renderResults();
