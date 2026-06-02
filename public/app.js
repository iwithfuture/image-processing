const squareSize = 1000;
const wideWidth = 1920;
const jpegQuality = 0.95;
const supportedExtensions = new Set([".jpg", ".jpeg", ".png"]);

const folderInput = document.querySelector("#folderInput");
const imageCount = document.querySelector("#imageCount");
const imageList = document.querySelector("#imageList");
const resultList = document.querySelector("#resultList");
const statusText = document.querySelector("#statusText");
const outputFolderName = document.querySelector("#outputFolderName");
const modeSummary = document.querySelector("#modeSummary");
const sizeSummary = document.querySelector("#sizeSummary");
const chooseOutputButton = document.querySelector("#chooseOutputButton");
const processButton = document.querySelector("#processButton");
const downloadAllButton = document.querySelector("#downloadAllButton");
const clearButton = document.querySelector("#clearButton");
const sizeModeInputs = document.querySelectorAll('input[name="sizeMode"]');

let selectedFiles = [];
let processedImages = [];
let outputDirectoryHandle = null;

function setStatus(text) {
  statusText.textContent = text;
}

function getSizeMode() {
  return document.querySelector('input[name="sizeMode"]:checked').value;
}

function updateModeText() {
  if (getSizeMode() === "wide1920") {
    modeSummary.textContent = "宽度 1920，高度按比例缩放";
    sizeSummary.textContent = "1920 × 自动 JPG";
    return;
  }

  modeSummary.textContent = "1000 × 1000 白底居中";
  sizeSummary.textContent = "1000 × 1000 JPG";
}

function getRelativePath(file) {
  return file.webkitRelativePath || file.name;
}

function getExtension(fileName) {
  const dotIndex = fileName.lastIndexOf(".");
  return dotIndex >= 0 ? fileName.slice(dotIndex).toLowerCase() : "";
}

function getOutputPath(file) {
  const relativePath = getRelativePath(file).replaceAll("\\", "/");
  const lastSlashIndex = relativePath.lastIndexOf("/");
  const folder = lastSlashIndex >= 0 ? relativePath.slice(0, lastSlashIndex + 1) : "";
  const fileName = lastSlashIndex >= 0 ? relativePath.slice(lastSlashIndex + 1) : relativePath;
  const dotIndex = fileName.lastIndexOf(".");
  const baseName = dotIndex > 0 ? fileName.slice(0, dotIndex) : fileName;

  return `${folder}${baseName}.jpg`;
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
    imageList.append(createEmptyState("请选择包含 jpg、jpeg 或 png 图片的文件夹"));
    setStatus("等待文件夹");
    return;
  }

  const fragment = document.createDocumentFragment();
  for (const file of selectedFiles) {
    const item = document.createElement("li");

    const name = document.createElement("span");
    name.className = "file-name";
    name.title = getRelativePath(file);
    name.textContent = getRelativePath(file);

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
    name.title = `${image.outputPath} (${image.width} × ${image.height})`;
    name.textContent = `${image.outputPath} (${image.width} × ${image.height})`;

    const link = document.createElement("a");
    link.className = "download-link";
    link.href = image.url;
    link.download = image.outputPath;
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
      reject(new Error(`无法读取图片：${getRelativePath(file)}`));
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

function drawSquareImage(context, image) {
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, squareSize, squareSize);

  const scale = Math.min(squareSize / image.naturalWidth, squareSize / image.naturalHeight);
  const width = Math.round(image.naturalWidth * scale);
  const height = Math.round(image.naturalHeight * scale);
  const x = Math.round((squareSize - width) / 2);
  const y = Math.round((squareSize - height) / 2);

  context.drawImage(image, x, y, width, height);
  return { width: squareSize, height: squareSize };
}

function drawWideImage(context, image, canvas) {
  const scale = wideWidth / image.naturalWidth;
  const height = Math.max(1, Math.round(image.naturalHeight * scale));

  canvas.width = wideWidth;
  canvas.height = height;
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, wideWidth, height);
  context.drawImage(image, 0, 0, wideWidth, height);

  return { width: wideWidth, height };
}

async function processFile(file) {
  const image = await loadImage(file);
  const canvas = document.createElement("canvas");
  canvas.width = squareSize;
  canvas.height = squareSize;

  const context = canvas.getContext("2d");
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";

  const dimensions =
    getSizeMode() === "wide1920"
      ? drawWideImage(context, image, canvas)
      : drawSquareImage(context, image);

  const blob = await canvasToBlob(canvas);
  const outputPath = getOutputPath(file);

  return {
    blob,
    inputPath: getRelativePath(file),
    outputPath,
    url: URL.createObjectURL(blob),
    width: dimensions.width,
    height: dimensions.height,
  };
}

async function getWritableFileHandle(rootHandle, outputPath) {
  const parts = outputPath.split("/").filter(Boolean);
  const fileName = parts.pop();
  let directoryHandle = rootHandle;

  for (const part of parts) {
    directoryHandle = await directoryHandle.getDirectoryHandle(part, { create: true });
  }

  return directoryHandle.getFileHandle(fileName, { create: true });
}

async function saveToOutputFolder(image) {
  if (!outputDirectoryHandle) {
    return false;
  }

  const fileHandle = await getWritableFileHandle(outputDirectoryHandle, image.outputPath);
  const writable = await fileHandle.createWritable();
  await writable.write(image.blob);
  await writable.close();
  return true;
}

function revokeProcessedUrls() {
  for (const image of processedImages) {
    URL.revokeObjectURL(image.url);
  }
}

async function chooseOutputFolder() {
  if (!window.showDirectoryPicker) {
    setStatus("当前浏览器不支持直接选择输出文件夹，可处理后点击下载全部");
    return;
  }

  try {
    outputDirectoryHandle = await window.showDirectoryPicker({ mode: "readwrite" });
    outputFolderName.textContent = outputDirectoryHandle.name;
    setStatus("已选择输出文件夹");
  } catch (error) {
    if (error.name !== "AbortError") {
      setStatus(error.message);
    }
  }
}

async function processImages() {
  processButton.disabled = true;
  downloadAllButton.disabled = true;
  revokeProcessedUrls();
  processedImages = [];
  renderResults();
  setStatus("正在处理...");

  let savedCount = 0;

  try {
    for (let index = 0; index < selectedFiles.length; index += 1) {
      setStatus(`正在处理 ${index + 1} / ${selectedFiles.length}`);
      const processed = await processFile(selectedFiles[index]);

      if (await saveToOutputFolder(processed)) {
        savedCount += 1;
      }

      processedImages.push(processed);
      renderResults();
    }

    if (outputDirectoryHandle) {
      setStatus(`完成：成功处理 ${processedImages.length} 张，已保存 ${savedCount} 张`);
    } else {
      setStatus(`完成：成功处理 ${processedImages.length} 张，请点击下载全部`);
    }
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
    link.download = image.outputPath;
    document.body.append(link);
    link.click();
    link.remove();
  }
}

function clearAll() {
  folderInput.value = "";
  selectedFiles = [];
  revokeProcessedUrls();
  processedImages = [];
  renderFiles();
  renderResults();
}

folderInput.addEventListener("change", () => {
  selectedFiles = Array.from(folderInput.files)
    .filter((file) => supportedExtensions.has(getExtension(file.name)))
    .sort((a, b) => getRelativePath(a).localeCompare(getRelativePath(b)));
  revokeProcessedUrls();
  processedImages = [];
  renderFiles();
  renderResults();
});

for (const input of sizeModeInputs) {
  input.addEventListener("change", () => {
    revokeProcessedUrls();
    processedImages = [];
    updateModeText();
    renderResults();
    if (selectedFiles.length > 0) {
      setStatus("尺寸模式已更改，请重新开始处理");
    }
  });
}

chooseOutputButton.addEventListener("click", chooseOutputFolder);
processButton.addEventListener("click", processImages);
downloadAllButton.addEventListener("click", downloadAll);
clearButton.addEventListener("click", clearAll);

updateModeText();
renderFiles();
renderResults();
