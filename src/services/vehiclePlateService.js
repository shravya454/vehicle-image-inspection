const sharp = require("sharp");
const path = require("path");

let tesseract = null;
try {
    tesseract = require("tesseract.js");
} catch (e) {
    tesseract = null;
}

/**
 * Normalizes plate text and fixes common OCR character misreadings based on position.
 */
function normalizePlateText(rawText) {
    if (!rawText) return "";
    let clean = rawText.toUpperCase().replace(/[^A-Z0-9]/g, "");
    return clean;
}

// Standard regular expression for Indian vehicle number plate formats (e.g. MH12AB1234, DL01CA9999, KA05MB5678, TN9B1234)
const INDIAN_PLATE_REGEX = /^[A-Z]{2}[0-9]{1,2}[A-Z]{1,3}[0-9]{4}$/;
const INDIAN_BH_REGEX = /^[0-9]{2}BH[0-9]{4}[A-Z]{1,2}$/;
const INDIAN_GOVT_DEFENSE_REGEX = /^[0-9]{2}[A-Z]{1,3}[0-9]{4}[A-Z]?$/;

/**
 * Validates a vehicle number against standard format patterns.
 * @param {string} text - Extracted or input plate text
 * @returns {Object} Validation result
 */
function validateVehiclePlate(text) {
    const rawText = (text || "").trim();
    const cleanPlate = normalizePlateText(rawText);

    if (!cleanPlate || cleanPlate.length < 4) {
        return {
            rawExtractedText: rawText,
            cleanedPlateNumber: "",
            isValidFormat: false,
            plateType: null,
            validationError: "No valid alphanumeric plate text detected",
            matchedPattern: null
        };
    }

    const isBhSeries = INDIAN_BH_REGEX.test(cleanPlate);
    const isDefenseSeries = INDIAN_GOVT_DEFENSE_REGEX.test(cleanPlate);
    const correctedPlate = isBhSeries || isDefenseSeries ? cleanPlate : fixOCRCommonErrors(cleanPlate);
    const candidate = correctedPlate.length >= 6 ? correctedPlate : cleanPlate;

    let isValid = false;
    let plateType = null;
    let matchedPattern = null;
    let validationError = null;

    if (INDIAN_PLATE_REGEX.test(candidate)) {
        isValid = true;
        plateType = "Indian Standard Plate";
        matchedPattern = "STATE + RTO CODE + LETTERS + NUMBERS (e.g. MH12AB1234)";
    } else if (INDIAN_BH_REGEX.test(candidate)) {
        isValid = true;
        plateType = "Indian BH (Bharat) Series";
        matchedPattern = "YEAR + BH + NUMBERS + LETTERS (e.g. 22BH1234AA)";
    } else if (INDIAN_GOVT_DEFENSE_REGEX.test(candidate)) {
        isValid = true;
        plateType = "Defense / Govt Series";
        matchedPattern = "DEFENSE / GOVT FORMAT";
    } else {
        isValid = false;
        plateType = null;
        matchedPattern = null;
        validationError = `Plate string "${candidate}" does not match standard vehicle registration patterns`;
    }

    return {
        rawExtractedText: rawText,
        cleanedPlateNumber: isValid ? candidate : "",
        isValidFormat: isValid,
        plateType,
        matchedPattern,
        validationError
    };
}

/**
 * Helper to check if a string is a valid vehicle plate format and NOT a camera date/timestamp watermark.
 */
function isValidPlateCandidate(str) {
    if (!str || str.length < 6 || str.length > 11) return false;

    const normalized = str.toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (!normalized || normalized.length < 6 || normalized.length > 11) return false;

    const watermarks = [
        "JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC",
        "2023", "2024", "2025", "2026", "2027", "2028", "SHOT", "CAM", "PHOTO", "REDMI", "SAMSUNG", "VIVO", "OPPO"
    ];
    if (watermarks.some(wm => normalized.includes(wm))) {
        return false;
    }

    return INDIAN_PLATE_REGEX.test(normalized) ||
        INDIAN_BH_REGEX.test(normalized) ||
        INDIAN_GOVT_DEFENSE_REGEX.test(normalized);
}

/**
 * Fixes common OCR character misreadings (e.g. O/0, I/1, S/5, Z/2) based on license plate position.
 */
function fixOCRCommonErrors(str) {
    if (!str || str.length < 8 || str.length > 11) return str;

    // Position 0..1: State code letters (e.g., MH, DL, KA)
    const state = str.slice(0, 2).replace(/0/g, "O").replace(/1/g, "I").replace(/5/g, "S").replace(/8/g, "B");

    // Position 2..3: RTO numeric digits (e.g., 12, 01, 05)
    const rto = str.slice(2, 4).replace(/O/g, "0").replace(/I/g, "1").replace(/L/g, "1").replace(/S/g, "5").replace(/Z/g, "2").replace(/B/g, "8");

    // Remaining chars: letters followed by 4 registration digits
    let rest = str.slice(4);
    if (rest.length >= 5) {
        const lettersPart = rest.slice(0, rest.length - 4).replace(/0/g, "O").replace(/1/g, "I").replace(/5/g, "S").replace(/8/g, "B");
        const digitsPart = rest.slice(rest.length - 4).replace(/O/g, "0").replace(/I/g, "1").replace(/L/g, "1").replace(/S/g, "5").replace(/Z/g, "2").replace(/B/g, "8");
        rest = lettersPart + digitsPart;
    }

    return state + rto + rest;
}

/**
 * Preprocesses image into multi-pass zoomed crops for high-accuracy OCR.
 * Zooms into the bottom vehicle bumper region at 3x magnification.
 */
async function preprocessPassesForOCR(input) {
    const passes = [];
    try {
        const metadata = await sharp(input).metadata();
        const imgWidth = metadata.width || 1200;
        const imgHeight = metadata.height || 800;

        // Pass 1: Zoomed Center-Bottom Bumper Region (80% width, lower 45% height, upscaled 3x)
        const crop1Left = Math.floor(imgWidth * 0.10);
        const crop1Width = Math.floor(imgWidth * 0.80);
        const crop1Top = Math.floor(imgHeight * 0.45);
        const crop1Height = imgHeight - crop1Top;
        const pass1 = await sharp(input)
            .extract({ left: crop1Left, top: crop1Top, width: crop1Width, height: crop1Height })
            .resize({ width: 2400, withoutEnlargement: false })
            .grayscale()
            .normalize()
            .sharpen({ sigma: 1.5 })
            .toBuffer();
        passes.push(pass1);

        // Pass 2: High-Contrast Binarized Bumper (middle 70% width, lower 40% height, upscaled 3x)
        const crop2Left = Math.floor(imgWidth * 0.15);
        const crop2Width = Math.floor(imgWidth * 0.70);
        const crop2Top = Math.floor(imgHeight * 0.50);
        const crop2Height = imgHeight - crop2Top;
        const pass2 = await sharp(input)
            .extract({ left: crop2Left, top: crop2Top, width: crop2Width, height: crop2Height })
            .resize({ width: 2400, withoutEnlargement: false })
            .grayscale()
            .normalize()
            .threshold(125)
            .toBuffer();
        passes.push(pass2);

        // Pass 3: Lower 60% Vehicle Region (full width, 40%-100% height, upscaled 2.5x)
        const crop3Top = Math.floor(imgHeight * 0.40);
        const crop3Height = imgHeight - crop3Top;
        const pass3 = await sharp(input)
            .extract({ left: 0, top: crop3Top, width: imgWidth, height: crop3Height })
            .resize({ width: 2000, withoutEnlargement: false })
            .grayscale()
            .normalize()
            .sharpen()
            .toBuffer();
        passes.push(pass3);

        // Pass 4: Full Image Sharp Fallback
        const pass4 = await sharp(input)
            .resize({ width: 1600, withoutEnlargement: true })
            .grayscale()
            .normalize()
            .sharpen()
            .toBuffer();
        passes.push(pass4);
    } catch (err) {
        passes.push(input);
    }
    return passes;
}

/**
 * Extracts license plate text candidate from raw OCR output text.
 * Strictly matches against official Indian plate regex patterns with no random string mutations.
 */
function extractPlateFromOCRText(rawText) {
    if (!rawText) return "";
    const upper = rawText.toUpperCase();

    const lines = upper.split(/[\r\n]+/);
    const scoredCandidates = [];
    const candidateMap = new Map();

    function addCandidate(value) {
        const normalized = (value || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
        if (!normalized || normalized.length < 4) return;
        if (candidateMap.has(normalized)) return;
        candidateMap.set(normalized, true);
        let score = 0;
        if (INDIAN_PLATE_REGEX.test(normalized)) score += 100;
        else if (INDIAN_BH_REGEX.test(normalized)) score += 95;
        else if (INDIAN_GOVT_DEFENSE_REGEX.test(normalized)) score += 90;
        else if (/^[A-Z0-9]{6,10}$/.test(normalized)) score += 40;
        if (normalized.length >= 8) score += 5;
        if (normalized.includes("MH") || normalized.includes("TN") || normalized.includes("KA") || normalized.includes("DL")) score += 8;
        scoredCandidates.push({ value: normalized, score });
    }

    for (const line of lines) {
        addCandidate(line);
        addCandidate(line.replace(/\s+/g, ""));
    }

    for (let i = 0; i < lines.length - 1; i++) {
        addCandidate(lines[i] + lines[i + 1]);
        addCandidate((lines[i] + lines[i + 1]).replace(/\s+/g, ""));
    }

    const fullClean = upper.replace(/[^A-Z0-9]/g, "");
    addCandidate(fullClean);

    const regexCandidates = fullClean.match(/([A-Z]{2}[0-9]{1,2}[A-Z]{1,3}[0-9]{4}|[0-9]{2}BH[0-9]{4}[A-Z]{1,2})/g) || [];
    for (const match of regexCandidates) {
        addCandidate(match);
    }

    const ranked = scoredCandidates
        .filter(item => isValidPlateCandidate(item.value))
        .sort((a, b) => b.score - a.score);

    return ranked[0]?.value || "";
}

/**
 * Performs OCR and vehicle plate validation on an uploaded image file.
 * @param {string|Buffer} input - File path or buffer
 * @param {string} originalName - Original filename
 * @param {boolean} isBlurry - Whether image was flagged as blurry
 * @param {number} laplacianVariance - Variance score for blur
 * @returns {Promise<Object>} Vehicle plate detection report
 */
async function inspectVehiclePlate(input, originalName = "", isBlurry = false, laplacianVariance = 999) {
    let extractedText = "";

    // Attempt OCR with Tesseract when the image looks reasonably sharp and not obviously dark.
    const shouldTryOCR = tesseract && typeof tesseract.createWorker === "function" && laplacianVariance >= 15;
    if (shouldTryOCR) {
        try {
            const ocrPromise = (async () => {
                const worker = await tesseract.createWorker("eng", 1, { logger: () => { } });
                        const passBuffers = await preprocessPassesForOCR(input);

                let plateCandidate = "";
                for (const passBuf of passBuffers) {
                    const ret = await worker.recognize(passBuf, {
                        tessedit_pageseg_mode: '11',
                        preserve_interword_spaces: '1'
                    });
                    const candidate = extractPlateFromOCRText(ret?.data?.text || "");
                    if (candidate && isValidPlateCandidate(candidate)) {
                        plateCandidate = candidate;
                        break;
                    }
                }

                if (!plateCandidate) {
                    const fallbackPass = passBuffers[0];
                    if (fallbackPass) {
                        const ret = await worker.recognize(fallbackPass, {
                            tessedit_pageseg_mode: '8',
                            preserve_interword_spaces: '1'
                        });
                        plateCandidate = extractPlateFromOCRText(ret?.data?.text || "");
                    }
                }

                await worker.terminate();
                return plateCandidate;
            })();

            // Timeout set to 10 seconds to allow Tesseract worker to execute multi-pass zoom OCR
            const timeoutPromise = new Promise((resolve) => setTimeout(() => resolve(""), 10000));
            extractedText = await Promise.race([ocrPromise, timeoutPromise]);
        } catch (err) {
            // Ignore OCR exception
        }
    }

    // Fallback check from original filename hint only if OCR didn't extract text.
    if (!extractedText && originalName) {
        const nameMatch = originalName.match(/([A-Z]{2}[0-9]{1,2}[A-Z]{1,3}[0-9]{4}|[0-9]{2}BH[0-9]{4}[A-Z]{1,2})/i);
        if (nameMatch) {
            extractedText = nameMatch[0];
        }
    }

    const validation = validateVehiclePlate(extractedText);

    // If no valid plate number was extracted and the image is blurry, mark plate as unreadable
    if (!validation.isValidFormat && isBlurry) {
        validation.cleanedPlateNumber = "";
        validation.validationError = "License plate text not visible due to image blur";
    }

    return {
        rawExtractedText: extractedText,
        cleanedPlateNumber: validation.cleanedPlateNumber,
        isValidFormat: validation.isValidFormat,
        plateType: validation.plateType,
        matchedPattern: validation.matchedPattern,
        validationError: validation.validationError,
        isInvalidPlateFormat: !validation.isValidFormat
    };
}

module.exports = {
    normalizePlateText,
    validateVehiclePlate,
    inspectVehiclePlate
};
