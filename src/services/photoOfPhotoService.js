const sharp = require("sharp");

/**
 * Detects whether an image is a screenshot or a photo taken of a digital screen (photo-of-photo).
 * @param {string|Buffer} input - File path or buffer
 * @returns {Promise<Object>} Photo-of-photo / screenshot confidence & indicator report
 */
async function detectPhotoOfPhoto(input) {
    try {
        const image = sharp(input);
        const metadata = await image.metadata();

        const indicators = [];
        let score = 0;

        const width = metadata.width || 0;
        const height = metadata.height || 0;
        const format = metadata.format || "";
        const exif = metadata.exif;

        // 1. EXIF Camera Metadata Check
        let hasCameraExif = false;
        let cameraMake = null;
        let cameraModel = null;
        let softwareTag = null;

        if (exif) {
            const exifString = exif.toString("utf8");
            const cameraBrands = ["Apple", "Samsung", "Xiaomi", "Google", "OnePlus", "Sony", "Canon", "Nikon", "Realme", "Vivo", "Oppo", "Motorola"];
            for (const brand of cameraBrands) {
                if (exifString.toLowerCase().includes(brand.toLowerCase())) {
                    hasCameraExif = true;
                    cameraMake = brand;
                    break;
                }
            }

            const screenshotSoftware = ["screenshot", "snipping", "canvas", "figma", "capcut", "winshot", "lightshot", "flameshot"];
            for (const sw of screenshotSoftware) {
                if (exifString.toLowerCase().includes(sw)) {
                    softwareTag = sw;
                    indicators.push(`Metadata contains screenshot software signature: "${sw}"`);
                    score += 35;
                    break;
                }
            }
        }

        if (!exif || !hasCameraExif) {
            indicators.push("Missing standard camera EXIF metadata (Make/Model)");
            score += 12;
        }

        if (format.toLowerCase() === "png" && !hasCameraExif) {
            indicators.push("Uploaded in PNG format without camera EXIF (typical for digital screenshots)");
            score += 18;
        }

        // 2. Aspect Ratio & Resolution Analysis
        if (width > 0 && height > 0) {
            const ratio = width / height;
            const invRatio = height / width;

            const commonScreenshotRatios = [
                { name: "19.5:9 Mobile", val: 2.166 },
                { name: "20:9 Mobile", val: 2.222 },
                { name: "16:9 Landscape Screen", val: 1.777 },
                { name: "9:16 Portrait Screen", val: 0.562 },
                { name: "9:19.5 Portrait Mobile", val: 0.461 },
                { name: "9:20 Portrait Mobile", val: 0.450 }
            ];

            for (const item of commonScreenshotRatios) {
                if (Math.abs(ratio - item.val) < 0.03 || Math.abs(invRatio - item.val) < 0.03) {
                    indicators.push(`Aspect ratio (${width}x${height}) matches standard screen dimensions (${item.name})`);
                    score += 20;
                    break;
                }
            }

            const exactScreenHeights = [2400, 2340, 2532, 2778, 1920, 1080, 1280, 2560, 3200];
            if (exactScreenHeights.includes(height) || exactScreenHeights.includes(width)) {
                indicators.push(`Exact pixel dimensions (${width}x${height}) match mobile/desktop display resolution`);
                score += 12;
            }
        }

        // 3. Screen Bezel & Border Frame Detection
        const { data, info } = await image
            .resize({ width: 400, height: 400, fit: "fill" })
            .grayscale()
            .raw()
            .toBuffer({ resolveWithObject: true });

        // Check border region pixel uniformity (detecting frame border of a monitor/phone screen)
        const borderPixels = [];
        const innerPixels = [];
        const size = 400;

        for (let y = 0; y < size; y++) {
            for (let x = 0; x < size; x++) {
                const pixel = data[y * size + x];
                if (x < 15 || x > size - 15 || y < 15 || y > size - 15) {
                    borderPixels.push(pixel);
                } else if (x > 100 && x < 300 && y > 100 && y < 300) {
                    innerPixels.push(pixel);
                }
            }
        }

        const borderMean = borderPixels.reduce((a, b) => a + b, 0) / borderPixels.length;
        const borderVariance = borderPixels.reduce((a, b) => a + Math.pow(b - borderMean, 2), 0) / borderPixels.length;

        // Low border variance means uniform black/dark bezel around the image
        if (borderVariance < 350 && borderMean < 50) {
            indicators.push("Detected uniform dark outer border frame (typical of screen monitor bezels)");
            score += 18;
        }

        // 4. Moiré Pattern / High Frequency Grid Artifacts
        // Re-photographing screens creates high-frequency periodic pixel grid ripples
        let gridDiffSum = 0;
        for (let y = 5; y < size - 5; y += 2) {
            for (let x = 5; x < size - 5; x += 2) {
                const current = data[y * size + x];
                const adjacent = data[y * size + x + 2];
                gridDiffSum += Math.abs(current - adjacent);
            }
        }
        const gridNoiseRatio = gridDiffSum / (size * size);

        if (gridNoiseRatio > 12.5 && !hasCameraExif) {
            indicators.push("High frequency periodic pixel grid pattern detected (Moiré ripple artifact)");
            score += 20;
        }

        const finalScore = Math.min(100, Math.max(0, score));
        const isScreenshotOrPhotoOfPhoto = finalScore >= 50;

        return {
            isScreenshotOrPhotoOfPhoto,
            confidenceScore: finalScore,
            detectedIndicators: indicators,
            details: {
                hasCameraExif,
                cameraMake,
                cameraModel,
                softwareTag,
                aspectRatio: `${width}x${height}`,
                format
            }
        };
    } catch (error) {
        console.error("Error in detectPhotoOfPhoto:", error);
        return {
            isScreenshotOrPhotoOfPhoto: false,
            confidenceScore: 0,
            detectedIndicators: [],
            error: error.message
        };
    }
}

module.exports = { detectPhotoOfPhoto };
