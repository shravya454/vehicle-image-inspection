const sharp = require("sharp");

/**
 * Analyzes image lighting conditions (low light, overexposure, contrast).
 * @param {string|Buffer} input - File path or buffer
 * @returns {Promise<Object>} Lighting metric breakdown
 */
async function analyzeLighting(input) {
    try {
        const { data, info } = await sharp(input)
            .resize({ width: 600, withoutEnlargement: true })
            .grayscale()
            .raw()
            .toBuffer({ resolveWithObject: true });

        const totalPixels = data.length;
        if (totalPixels === 0) {
            return {
                isLowLight: false,
                isOverexposed: false,
                meanBrightness: 128,
                darkPixelPercentage: 0,
                brightPixelPercentage: 0,
                lightingQuality: "good",
                severity: "none"
            };
        }

        let sum = 0;
        let sumSq = 0;
        let darkPixelCount = 0; // < 45
        let brightPixelCount = 0; // > 240

        for (let i = 0; i < totalPixels; i++) {
            const val = data[i];
            sum += val;
            sumSq += val * val;

            if (val < 45) darkPixelCount++;
            if (val > 240) brightPixelCount++;
        }

        const meanBrightness = sum / totalPixels;
        const variance = (sumSq / totalPixels) - (meanBrightness * meanBrightness);
        const stdDev = Math.sqrt(Math.max(0, variance));

        const darkPixelPercentage = (darkPixelCount / totalPixels) * 100;
        const brightPixelPercentage = (brightPixelCount / totalPixels) * 100;

        const lowLightThreshold = 65;
        const darkRatioThreshold = 40;

        const isLowLight = meanBrightness < lowLightThreshold || darkPixelPercentage > darkRatioThreshold;
        const isOverexposed = meanBrightness > 200 || brightPixelPercentage > 40;

        // Percentage low light calculation: 0% if good, 1-100% if dark
        let lowLightPercentage = 0;
        if (isLowLight) {
            if (darkPixelPercentage > darkRatioThreshold) {
                lowLightPercentage = Math.min(100, Math.max(1, Math.round(darkPixelPercentage)));
            } else {
                lowLightPercentage = Math.min(100, Math.max(1, Math.round((1 - meanBrightness / lowLightThreshold) * 100)));
            }
        }

        let lightingQuality = "good";
        let severity = "none";

        if (isLowLight) {
            lightingQuality = "low_light";
            severity = meanBrightness < 40 || darkPixelPercentage > 60 ? "severe" : "mild";
        } else if (isOverexposed) {
            lightingQuality = "overexposed";
            severity = meanBrightness > 225 || brightPixelPercentage > 60 ? "severe" : "mild";
        }

        return {
            isLowLight,
            lowLightPercentage,
            isOverexposed,
            meanBrightness: Math.round(meanBrightness * 100) / 100,
            stdDev: Math.round(stdDev * 100) / 100,
            darkPixelPercentage: Math.round(darkPixelPercentage * 100) / 100,
            brightPixelPercentage: Math.round(brightPixelPercentage * 100) / 100,
            lightingQuality,
            severity,
            threshold: lowLightThreshold
        };
    } catch (error) {
        console.error("Error in analyzeLighting:", error);
        return {
            isLowLight: false,
            isOverexposed: false,
            meanBrightness: 0,
            darkPixelPercentage: 0,
            brightPixelPercentage: 0,
            lightingQuality: "unknown",
            severity: "unknown",
            error: error.message
        };
    }
}

module.exports = { analyzeLighting };
