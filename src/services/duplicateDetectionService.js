const sharp = require("sharp");
const crypto = require("crypto");
const fs = require("fs");

/**
 * Computes SHA-256 hash of a file or buffer.
 */
function getSHA256(input) {
    const buffer = typeof input === "string" ? fs.readFileSync(input) : input;
    return crypto.createHash("sha256").update(buffer).digest("hex");
}

/**
 * Computes Difference Hash (dHash) - 64 bit hex string
 */
async function getDHash(input) {
    try {
        const { data } = await sharp(input)
            .resize(9, 8, { fit: "fill" })
            .grayscale()
            .raw()
            .toBuffer({ resolveWithObject: true });

        let binaryBits = "";
        for (let row = 0; row < 8; row++) {
            for (let col = 0; col < 8; col++) {
                const left = data[row * 9 + col];
                const right = data[row * 9 + col + 1];
                binaryBits += left > right ? "1" : "0";
            }
        }

        return binaryToHex(binaryBits);
    } catch (err) {
        console.error("dHash error:", err);
        return "0000000000000000";
    }
}

/**
 * Computes Average Hash (aHash) - 64 bit hex string
 */
async function getAHash(input) {
    try {
        const { data } = await sharp(input)
            .resize(8, 8, { fit: "fill" })
            .grayscale()
            .raw()
            .toBuffer({ resolveWithObject: true });

        let sum = 0;
        for (let i = 0; i < 64; i++) {
            sum += data[i];
        }
        const mean = sum / 64;

        let binaryBits = "";
        for (let i = 0; i < 64; i++) {
            binaryBits += data[i] >= mean ? "1" : "0";
        }

        return binaryToHex(binaryBits);
    } catch (err) {
        console.error("aHash error:", err);
        return "0000000000000000";
    }
}

/**
 * Helper to convert 64-bit binary string to 16-character hex string.
 */
function binaryToHex(binaryString) {
    let hex = "";
    for (let i = 0; i < binaryString.length; i += 4) {
        const chunk = binaryString.substring(i, i + 4);
        hex += parseInt(chunk, 2).toString(16);
    }
    return hex.padStart(16, "0");
}

/**
 * Helper to convert hex string to 64-bit binary string.
 */
function hexToBinary(hexString) {
    let binary = "";
    for (let i = 0; i < hexString.length; i++) {
        binary += parseInt(hexString[i], 16).toString(2).padStart(4, "0");
    }
    return binary;
}

/**
 * Calculates Hamming distance between two hex hashes (number of differing bits).
 */
function hammingDistance(hex1, hex2) {
    if (!hex1 || !hex2 || hex1.length !== hex2.length) return 64;
    const b1 = hexToBinary(hex1);
    const b2 = hexToBinary(hex2);
    let diff = 0;
    for (let i = 0; i < b1.length; i++) {
        if (b1[i] !== b2[i]) diff++;
    }
    return diff;
}

/**
 * Checks if an image is a duplicate of any previously stored image in MongoDB.
 * @param {string|Buffer} input - File path or buffer
 * @param {string} currentImageId - Current processing image ID to exclude
 * @param {Object} ImageModel - Mongoose Image model
 * @returns {Promise<Object>} Duplicate analysis result
 */
async function checkDuplicate(input, currentImageId, ImageModel) {
    try {
        const sha256 = getSHA256(input);
        const dHash = await getDHash(input);
        const aHash = await getAHash(input);

        if (!ImageModel) {
            return {
                isDuplicate: false,
                sha256,
                dHash,
                aHash,
                matchType: "none",
                duplicateOfImageId: null,
                duplicateOfOriginalName: null,
                similarityScore: 0
            };
        }

        // 1. Check for exact SHA-256 match in DB
        const exactMatch = await ImageModel.findOne({
            imageId: { $ne: currentImageId },
            "analysis.duplicate.sha256": sha256
        }).lean();

        if (exactMatch) {
            return {
                isDuplicate: true,
                sha256,
                dHash,
                aHash,
                matchType: "exact",
                duplicateOfImageId: exactMatch.imageId,
                duplicateOfOriginalName: exactMatch.originalName,
                similarityScore: 100,
                hammingDistance: 0
            };
        }

        // 2. Check for perceptual match using dHash & aHash in DB
        const existingImages = await ImageModel.find({
            imageId: { $ne: currentImageId },
            "analysis.duplicate.dHash": { $exists: true }
        }).select("imageId originalName analysis.duplicate").lean();

        let bestMatch = null;
        let minDistance = 64;

        for (const img of existingImages) {
            const existingDHash = img.analysis?.duplicate?.dHash;
            const existingAHash = img.analysis?.duplicate?.aHash;

            if (existingDHash) {
                const distD = hammingDistance(dHash, existingDHash);
                const distA = existingAHash ? hammingDistance(aHash, existingAHash) : distD;
                const avgDist = (distD + distA) / 2;

                if (avgDist < minDistance) {
                    minDistance = avgDist;
                    bestMatch = img;
                }
            }
        }

        // Hamming distance <= 8 out of 64 indicates near duplicate (~87.5%+ similarity)
        const isPerceptualDuplicate = minDistance <= 8;
        const similarityScore = Math.max(0, Math.round(((64 - minDistance) / 64) * 100));

        return {
            isDuplicate: isPerceptualDuplicate,
            sha256,
            dHash,
            aHash,
            matchType: isPerceptualDuplicate ? "perceptual" : "none",
            duplicateOfImageId: isPerceptualDuplicate && bestMatch ? bestMatch.imageId : null,
            duplicateOfOriginalName: isPerceptualDuplicate && bestMatch ? bestMatch.originalName : null,
            similarityScore,
            hammingDistance: Math.round(minDistance * 10) / 10
        };
    } catch (error) {
        console.error("Error in checkDuplicate:", error);
        return {
            isDuplicate: false,
            sha256: "",
            dHash: "",
            aHash: "",
            matchType: "none",
            duplicateOfImageId: null,
            duplicateOfOriginalName: null,
            similarityScore: 0,
            error: error.message
        };
    }
}

module.exports = {
    getSHA256,
    getDHash,
    getAHash,
    hammingDistance,
    checkDuplicate
};
