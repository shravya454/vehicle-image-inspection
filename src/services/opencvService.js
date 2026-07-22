const fs = require("fs");
const path = require("path");
const cv = require("@techstark/opencv-js");

async function analyzeImageWithOpenCV(imagePath) {

    const resolvedPath = path.resolve(imagePath);

    if (!fs.existsSync(resolvedPath)) {
        throw new Error("Image not found");
    }

    // Placeholder until image decoding is added
    return {
        brightness: "Pending",
        blur: "Pending",
        message: "OpenCV service connected successfully"
    };
}

module.exports = {
    analyzeImageWithOpenCV
};