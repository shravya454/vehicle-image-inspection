const sharp = require("sharp");

/**
 * Calculates image blurriness using Laplacian Variance and Sobel Gradient Variance.
 * @param {string|Buffer} input - File path or buffer
 * @returns {Promise<Object>} Blur detection metrics
 */
async function detectBlur(input) {
    try {
        // Resize image to fixed 500px width for standardized blur and Laplacian variance calculation
        const { data, info } = await sharp(input)
            .resize({ width: 500, withoutEnlargement: false })
            .grayscale()
            .raw()
            .toBuffer({ resolveWithObject: true });

        const width = info.width;
        const height = info.height;
        const totalPixels = width * height;

        if (width < 3 || height < 3) {
            return {
                isBlurry: false,
                laplacianVariance: 999,
                sobelVariance: 999,
                sharpnessScore: 100,
                severity: "none",
                threshold: 500
            };
        }

        // 1. Calculate Laplacian Variance
        // Kernel: [ 0  1  0 ]
        //         [ 1 -4  1 ]
        //         [ 0  1  0 ]
        let lapSum = 0;
        let lapSumSq = 0;
        let count = 0;

        for (let y = 1; y < height - 1; y++) {
            const rowOffset = y * width;
            const prevRow = (y - 1) * width;
            const nextRow = (y + 1) * width;

            for (let x = 1; x < width - 1; x++) {
                const center = data[rowOffset + x];
                const top = data[prevRow + x];
                const bottom = data[nextRow + x];
                const left = data[rowOffset + (x - 1)];
                const right = data[rowOffset + (x + 1)];

                const lap = top + bottom + left + right - 4 * center;
                lapSum += lap;
                lapSumSq += lap * lap;
                count++;
            }
        }

        const lapMean = count > 0 ? lapSum / count : 0;
        const laplacianVariance = count > 0 ? (lapSumSq / count) - (lapMean * lapMean) : 0;

        // 2. Calculate Sobel Gradient Magnitude Variance
        let gradSum = 0;
        let gradSumSq = 0;

        for (let y = 1; y < height - 1; y++) {
            const rowOffset = y * width;
            const prevRow = (y - 1) * width;
            const nextRow = (y + 1) * width;

            for (let x = 1; x < width - 1; x++) {
                // Sobel X: [[-1, 0, 1], [-2, 0, 2], [-1, 0, 1]]
                const gx = (data[prevRow + x + 1] + 2 * data[rowOffset + x + 1] + data[nextRow + x + 1]) -
                           (data[prevRow + x - 1] + 2 * data[rowOffset + x - 1] + data[nextRow + x - 1]);

                // Sobel Y: [[-1, -2, -1], [0, 0, 0], [1, 2, 1]]
                const gy = (data[nextRow + x - 1] + 2 * data[nextRow + x] + data[nextRow + x + 1]) -
                           (data[prevRow + x - 1] + 2 * data[prevRow + x] + data[prevRow + x + 1]);

                const mag = Math.sqrt(gx * gx + gy * gy);
                gradSum += mag;
                gradSumSq += mag * mag;
            }
        }

        const gradMean = count > 0 ? gradSum / count : 0;
        const sobelVariance = count > 0 ? (gradSumSq / count) - (gradMean * gradMean) : 0;

        const threshold = 500;
        const isBlurry = laplacianVariance < threshold || gradMean < 35 || sobelVariance < 700;

        let severity = "none";
        if (laplacianVariance < 80 || gradMean < 15) {
            severity = "severe";
        } else if (isBlurry) {
            severity = "mild";
        }

        // Percentage blur calculation: 0% if sharp, 1-100% if blurry
        const blurPercentage = isBlurry
            ? Math.min(100, Math.max(1, Math.round((1 - Math.min(threshold, laplacianVariance) / threshold) * 100)))
            : 0;

        // Normalized sharpness score from 0 to 100
        const sharpnessScore = Math.min(100, Math.max(0, Math.round((laplacianVariance / 400) * 100)));

        return {
            isBlurry,
            blurPercentage,
            score: Math.round(laplacianVariance * 100) / 100,
            laplacianVariance: Math.round(laplacianVariance * 100) / 100,
            sobelVariance: Math.round(sobelVariance * 100) / 100,
            gradMean: Math.round(gradMean * 100) / 100,
            sharpnessScore,
            severity,
            threshold
        };
    } catch (error) {
        console.error("Error in detectBlur:", error);
        return {
            isBlurry: false,
            score: 0,
            laplacianVariance: 0,
            sobelVariance: 0,
            sharpnessScore: 0,
            severity: "unknown",
            threshold: 120,
            error: error.message
        };
    }
}

module.exports = { detectBlur };
