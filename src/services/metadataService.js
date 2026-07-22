const sharp = require("sharp");
const fs = require("fs");

const getImageMetadata = async (filePath) => {
    const metadata = await sharp(filePath).metadata();

    const stats = fs.statSync(filePath);

    let digitalOrigin = "Original Camera Capture";
    if (metadata.exif) {
        try {
            const exifStr = metadata.exif.toString("utf8");
            const swMatch = exifStr.match(/(photoshop|canva|gimp|snapseed|picsart|lightroom|ios\s?[\d\.]*|android|apple|samsung|redmi|vivo|oppo|xiaomi|pixel|chrome|safari)/i);
            if (swMatch) {
                digitalOrigin = swMatch[0];
            }
        } catch (e) {}
    }

    return {
        width: metadata.width,
        height: metadata.height,
        format: metadata.format,
        channels: metadata.channels,
        space: metadata.space || "srgb",
        depth: metadata.depth || "uchar",
        density: metadata.density || 72,
        hasAlpha: metadata.hasAlpha || false,
        fileSize: stats.size,
        digitalOrigin
    };
};

module.exports = getImageMetadata;