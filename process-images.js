const fs = require("node:fs/promises");
const path = require("node:path");
const sharp = require("sharp");

const projectDir = __dirname;
const inputDir = path.join(projectDir, "input");
const outputDir = path.join(projectDir, "output");

const supportedExtensions = new Set([".jpg", ".jpeg", ".png"]);
const size = 1000;

async function ensureFolders() {
  await fs.mkdir(inputDir, { recursive: true });
  await fs.mkdir(outputDir, { recursive: true });
}

async function getInputImages() {
  const entries = await fs.readdir(inputDir, { withFileTypes: true });

  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .filter((fileName) => supportedExtensions.has(path.extname(fileName).toLowerCase()))
    .sort((a, b) => a.localeCompare(b));
}

function getOutputFileName(fileName) {
  return `${path.parse(fileName).name}.jpg`;
}

async function processImage(fileName) {
  const sourcePath = path.join(inputDir, fileName);
  const outputPath = path.join(outputDir, getOutputFileName(fileName));

  await sharp(sourcePath)
    .rotate()
    .resize(size, size, {
      fit: "contain",
      position: "center",
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    })
    .flatten({ background: { r: 255, g: 255, b: 255 } })
    .jpeg({ quality: 85 })
    .toFile(outputPath);

  return outputPath;
}

async function processAllImages(onProgress = () => {}) {
  await ensureFolders();

  const images = await getInputImages();

  const results = [];
  let successCount = 0;
  let failureCount = 0;

  for (const image of images) {
    try {
      const outputPath = await processImage(image);
      successCount += 1;
      const result = {
        status: "success",
        input: image,
        output: path.basename(outputPath),
      };
      results.push(result);
      onProgress(result);
    } catch (error) {
      failureCount += 1;
      const result = {
        status: "failed",
        input: image,
        error: error.message,
      };
      results.push(result);
      onProgress(result);
    }
  }

  return {
    total: images.length,
    successCount,
    failureCount,
    results,
    inputDir,
    outputDir,
  };
}

async function main() {
  const summary = await processAllImages((result) => {
    if (result.status === "success") {
      console.log(`Processed: ${result.input} -> ${result.output}`);
    } else {
      console.error(`Failed: ${result.input}`);
      console.error(result.error);
    }
  });

  if (summary.total === 0) {
    console.log(`No jpg, jpeg, or png images found in: ${inputDir}`);
    return;
  }

  console.log(
    `Done. Processed ${summary.successCount} image(s). Output folder: ${outputDir}`,
  );
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

module.exports = {
  ensureFolders,
  getInputImages,
  inputDir,
  outputDir,
  processAllImages,
};
