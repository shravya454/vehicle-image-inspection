const sharp = require("sharp");
const path = require("path");
const fs = require("fs");

/**
 * Performs Tamper Detection and Error Level Analysis (ELA).
 * @param {string|Buffer} input - File path or buffer
 * @param {string} imageId - Unique ID of the image for saving ELA preview
 * @returns {Promise<Object>} Tamper detection & ELA report
 */
async function detectTampering(input, imageId = "temp") {
    try {
        const image = sharp(input);
        const metadata = await image.metadata();

        const tamperReasons = [];
        let riskScore = 0;

        // 1. EXIF Software Signature Analysis
        let softwareDetected = null;
        const editingSoftwareList = [
            "photoshop", "gimp", "canva", "picsart", "snapseed", "lightroom",
            "photoroom", "photopea", "paint.net", "pixlr", "meitu", "capcut",
            "inshot", "facetune", "afterlight", "fotor", "befunky", "vsco"
        ];

        if (metadata.exif) {
            const exifStr = metadata.exif.toString("utf8").toLowerCase();
            for (const sw of editingSoftwareList) {
                if (exifStr.includes(sw)) {
                    softwareDetected = sw;
                    tamperReasons.push(`Image metadata contains photo editor software tag: "${sw.toUpperCase()}"`);
                    riskScore += 40;
                    break;
                }
            }
        }

        // 2. Error Level Analysis (ELA)
        // Resave image at 92% JPEG quality and compare pixel-by-pixel difference
        const originalBuffer = await image
            .resize({ width: 800, withoutEnlargement: true })
            .toFormat("jpeg", { quality: 100 })
            .toBuffer();

        const resavedBuffer = await sharp(originalBuffer)
            .jpeg({ quality: 90 })
            .toBuffer();

        const origRaw = await sharp(originalBuffer).raw().toBuffer({ resolveWithObject: true });
        const resavedRaw = await sharp(resavedBuffer).raw().toBuffer({ resolveWithObject: true });

        const width = origRaw.info.width;
        const height = origRaw.info.height;
        const channels = origRaw.info.channels;
        const totalPixels = width * height;

        const diffPixels = Buffer.alloc(width * height * 3);
        let diffSum = 0;
        let diffSumSq = 0;
        let maxDiff = 0;
        let highDiffCount = 0;

        for (let i = 0; i < totalPixels; i++) {
            const idx = i * channels;
            const rDiff = Math.abs(origRaw.data[idx] - resavedRaw.data[idx]);
            const gDiff = Math.abs(origRaw.data[idx + 1] - resavedRaw.data[idx + 1]);
            const bDiff = Math.abs(origRaw.data[idx + 2] - resavedRaw.data[idx + 2]);

            const avgDiff = (rDiff + gDiff + bDiff) / 3;
            diffSum += avgDiff;
            diffSumSq += avgDiff * avgDiff;

            if (avgDiff > maxDiff) maxDiff = avgDiff;
            if (avgDiff > 25) highDiffCount++; // Significant compression disparity

            // Scale ELA difference for visualization (multiplied by 12x for visual clarity)
            const elaIdx = i * 3;
            diffPixels[elaIdx] = Math.min(255, Math.round(rDiff * 12));
            diffPixels[elaIdx + 1] = Math.min(255, Math.round(gDiff * 12));
            diffPixels[elaIdx + 2] = Math.min(255, Math.round(bDiff * 12));
        }

        const elaMean = diffSum / totalPixels;
        const elaVariance = (diffSumSq / totalPixels) - (elaMean * elaMean);
        const highDiffPercentage = (highDiffCount / totalPixels) * 100;

        // Generate ELA output image map
        let elaImagePath = null;
        try {
            const elaDir = path.join(__dirname, "../uploads/ela");
            if (!fs.existsSync(elaDir)) {
                fs.mkdirSync(elaDir, { recursive: true });
            }
            const filename = `ela_${imageId}.jpg`;
            const fullElaPath = path.join(elaDir, filename);

            await sharp(diffPixels, {
                raw: { width, height, channels: 3 }
            })
            .jpeg({ quality: 90 })
            .toFile(fullElaPath);

            elaImagePath = `/uploads/ela/${filename}`;
        } catch (err) {
            console.error("Failed to generate ELA image file:", err);
        }

        // Assess ELA metrics for tampered region spikes
        if (elaVariance > 180 || highDiffPercentage > 8.5) {
            tamperReasons.push(`Error Level Analysis (ELA) indicates localized compression anomalies (Variance: ${Math.round(elaVariance)})`);
            riskScore += 35;
        }

        if (maxDiff > 80 && highDiffPercentage > 5.0) {
            tamperReasons.push(`High error level spikes detected in image regions (Max Diff: ${Math.round(maxDiff)})`);
            riskScore += 20;
        }

        const finalScore = Math.min(100, Math.max(0, riskScore));
        const isEditedOrTampered = finalScore >= 40;

        return {
            isEditedOrTampered,
            riskScore: finalScore,
            tamperReasons,
            elaScore: Math.round(elaVariance * 10) / 10,
            elaImagePath,
            details: {
                softwareDetected,
                elaMean: Math.round(elaMean * 100) / 100,
                elaVariance: Math.round(elaVariance * 100) / 100,
                maxDiff: Math.round(maxDiff),
                highDiffPercentage: Math.round(highDiffPercentage * 100) / 100
            }
        };
    } catch (error) {
        console.error("Error in detectTampering:", error);
        return {
            isEditedOrTampered: false,
            riskScore: 0,
            tamperReasons: [],
            elaScore: 0,
            elaImagePath: null,
            error: error.message
        };
    }
}

module.exports = { detectTampering };
