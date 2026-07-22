const sharp = require("sharp");

/**
 * Validates image dimensions against practical vehicle-photo requirements.
 * Flags overly small, stretched, or suspiciously low-resolution images.
 */
async function validateDimensions(input) {
    try {
        const metadata = await sharp(input).metadata();
        const width = metadata.width || 0;
        const height = metadata.height || 0;

        const minWidth = 800;
        const minHeight = 600;
        const maxAspectRatio = 2.2;
        const minAspectRatio = 0.65;

        const aspectRatio = width && height ? width / height : 0;
        const isTooSmall = width < minWidth || height < minHeight;
        const isExtremeAspect = aspectRatio > maxAspectRatio || aspectRatio < minAspectRatio;

        const isInvalidDimensions = isTooSmall || isExtremeAspect;

        return {
            isInvalidDimensions,
            width,
            height,
            aspectRatio: Number(aspectRatio.toFixed(2)),
            minWidth,
            minHeight,
            maxAspectRatio,
            minAspectRatio,
            reason: isInvalidDimensions
                ? isTooSmall
                    ? "Image dimensions are below the recommended minimum for vehicle inspection."
                    : "Image aspect ratio is unusual for a standard vehicle photo."
                : "Image dimensions meet the recommended requirements."
        };
    } catch (error) {
        return {
            isInvalidDimensions: true,
            width: 0,
            height: 0,
            aspectRatio: 0,
            minWidth: 800,
            minHeight: 600,
            maxAspectRatio: 2.2,
            minAspectRatio: 0.65,
            reason: error.message || "Unable to read image dimensions."
        };
    }
}

module.exports = { validateDimensions };
