const { detectBlur } = require("./blurDetectionService");
const { analyzeLighting } = require("./lightingService");
const { checkDuplicate } = require("./duplicateDetectionService");
const { detectPhotoOfPhoto } = require("./photoOfPhotoService");
const { detectTampering } = require("./tamperDetectionService");
const { inspectVehiclePlate } = require("./vehiclePlateService");
const { validateDimensions } = require("./dimensionService");
const getImageMetadata = require("./metadataService");

/**
 * Runs complete 6-point vehicle image quality and authenticity inspection.
 * Detects the 6 problem statement issues without showing numerical total scores.
 */
async function runFullInspection(filePath, imageId, originalName, ImageModel) {
    try {
        // 0. Extract Metadata
        const metadata = await getImageMetadata(filePath);

        // 1. Run blur detection first to pass parameters to plate detection
        const blurResult = await detectBlur(filePath);

        // Run remaining 6 inspections concurrently
        const [lightingResult, duplicateResult, photoOfPhotoResult, tamperResult, plateResult, dimensionResult] = await Promise.all([
            analyzeLighting(filePath),
            checkDuplicate(filePath, imageId, ImageModel),
            detectPhotoOfPhoto(filePath),
            detectTampering(filePath, imageId),
            inspectVehiclePlate(filePath, originalName, blurResult.isBlurry, blurResult.laplacianVariance),
            validateDimensions(filePath)
        ]);

        // List of detected issues and recommendations
        const detectedIssues = [];
        const recommendations = [];

        // 1. Blur Check
        if (blurResult.isBlurry) {
            detectedIssues.push("blurry");
            recommendations.push(
                blurResult.severity === "severe"
                    ? "Image is severely blurry. Hold device steady and refocus."
                    : "Image has mild blur. Ensure sharp focus on vehicle body and plate."
            );
        }

        // 2. Low Light Check
        if (lightingResult.isLowLight) {
            detectedIssues.push("low_light");
            recommendations.push(
                lightingResult.severity === "severe"
                    ? "Lighting is dark. Turn on vehicle flash/lights or move to a lit area."
                    : "Low light conditions detected. Ensure vehicle details are clearly visible."
            );
        } else if (lightingResult.isOverexposed) {
            detectedIssues.push("overexposed");
            recommendations.push("Excessive glare or overexposure detected. Avoid direct flashlight reflection.");
        }

        // 3. Duplicate Check
        if (duplicateResult.isDuplicate) {
            detectedIssues.push("duplicate");
            const matchName = duplicateResult.duplicateOfOriginalName ? ` (${duplicateResult.duplicateOfOriginalName})` : "";
            recommendations.push(
                `Duplicate image detected! Matches existing record ID ${duplicateResult.duplicateOfImageId}${matchName}. Upload a fresh photo.`
            );
        }

        // 4. Screenshot / Photo-of-Photo Check
        if (photoOfPhotoResult.isScreenshotOrPhotoOfPhoto) {
            detectedIssues.push("screenshot_photo_of_photo");
            recommendations.push(
                "Image appears to be a screenshot or photo of another screen. Take a live photograph of the physical vehicle."
            );
        }

        // 5. Edited / Tampered Check
        if (tamperResult.isEditedOrTampered) {
            detectedIssues.push("edited_tampered");
            recommendations.push(
                "Image appears modified or edited (detected software / ELA compression anomalies). Upload original unmodified photo."
            );
        }

        // 5. Dimension Validation Check
        if (dimensionResult.isInvalidDimensions) {
            detectedIssues.push("invalid_dimensions");
            recommendations.push(dimensionResult.reason);
        }

        // Overall Status: passed, flagged, failed
        let overallStatus = "passed";
        if (
            duplicateResult.isDuplicate ||
            photoOfPhotoResult.isScreenshotOrPhotoOfPhoto ||
            tamperResult.isEditedOrTampered ||
            (blurResult.isBlurry && blurResult.severity === "severe")
        ) {
            overallStatus = "failed";
        } else if (detectedIssues.length > 0) {
            overallStatus = "flagged";
        }

        // Quality Score calculation (100 base score minus penalties for detected issues)
        const qualityScore = Math.max(0, 100 - detectedIssues.length * 20);

        const report = {
            overallStatus,
            qualityScore,
            issueCount: detectedIssues.length,
            detectedIssues,
            recommendations,
            inspectionTime: new Date().toISOString(),
            metrics: {
                blur: blurResult,
                lighting: lightingResult,
                duplicate: duplicateResult,
                photoOfPhoto: photoOfPhotoResult,
                tamper: tamperResult,
                vehiclePlate: plateResult,
                dimensions: dimensionResult,
                metadata
            }
        };

        // PRINT CLEAN FORMATTED REPORT TO TERMINAL (AND ATTACH TO REPORT OBJECT)
        const terminalReportText = generateTerminalReportText(originalName, imageId, report);
        console.log(terminalReportText);
        report.terminalReport = terminalReportText;

        return report;
    } catch (error) {
        console.error(`❌ Inspection failed for Image ID ${imageId}:`, error);
        throw error;
    }
}

/**
 * Generates a clean formatted summary box string for terminal & frontend output.
 */
function generateTerminalReportText(originalName, imageId, report) {
    const { overallStatus, metrics } = report;

    const blur = metrics?.blur || {};
    const lighting = metrics?.lighting || {};
    const duplicate = metrics?.duplicate || {};
    const photoOfPhoto = metrics?.photoOfPhoto || {};
    const tamper = metrics?.tamper || {};
    const dimensions = metrics?.dimensions || {};
    const meta = metrics?.metadata || {};
    const plate = metrics?.vehiclePlate || {};

    // 1. Blur
    const blurPct = blur.blurPercentage || (blur.isBlurry ? Math.min(100, Math.max(1, Math.round((1 - (blur.laplacianVariance || 0) / 120) * 100))) : 0);
    const blurText = blur.isBlurry ? `YES (${blurPct}%)` : "NO";

    // 2. Low Light
    const lightPct = lighting.lowLightPercentage || (lighting.isLowLight ? Math.min(100, Math.max(1, Math.round(lighting.darkPixelPercentage || ((1 - (lighting.meanBrightness || 0) / 65) * 100)))) : 0);
    const lightText = lighting.isLowLight ? `YES (${lightPct}%)` : "NO";

    // 3. Duplicate
    const dupText = duplicate.isDuplicate ? `YES` : "NO";

    // 4. Screenshot
    const screenText = photoOfPhoto.isScreenshotOrPhotoOfPhoto ? "YES" : "NO";

    // 5. Edited / Tampered
    const tamperText = tamper.isEditedOrTampered ? `YES (Score: ${tamper.riskScore}%)` : "NO";

    // Dimensions calculations
    const w = dimensions.width || meta.width || 0;
    const h = dimensions.height || meta.height || 0;
    const ratio = w && h ? (w / h) : 0;

    let aspectText = "N/A";
    if (Math.abs(ratio - 16 / 9) < 0.06) aspectText = "16:9";
    else if (Math.abs(ratio - 9 / 16) < 0.06) aspectText = "9:16";
    else if (Math.abs(ratio - 4 / 3) < 0.06) aspectText = "4:3";
    else if (Math.abs(ratio - 3 / 4) < 0.06) aspectText = "3:4";
    else if (Math.abs(ratio - 1) < 0.04) aspectText = "1:1 (Square)";
    else aspectText = `${dimensions.aspectRatio || ratio.toFixed(2)}`;

    let layoutText = "N/A";
    if (w > h) layoutText = "Landscape (horizontal)";
    else if (h > w) layoutText = "Portrait (vertical)";
    else if (w && h) layoutText = "Square";

    // Metadata calculations
    const sizeBytes = meta.fileSize || 0;
    const sizeInKb = sizeBytes / 1024;
    const fileSizeStr = sizeInKb >= 1024 ? `${(sizeInKb / 1024).toFixed(2)} MB` : `${sizeInKb.toFixed(1)} KB`;

    const totalPixels = w * h;
    const mp = totalPixels > 0 ? (totalPixels / 1000000).toFixed(2) : "0";
    const pixelStr = `${totalPixels.toLocaleString()} pixels (${mp} MP)`;

    const channels = meta.channels || 3;
    const depthBit = channels === 1 ? "8-bit" : channels === 4 ? "32-bit" : "24-bit";
    const spaceStr = (meta.space || "sRGB").toUpperCase();
    const colorDepthStr = `${depthBit} (${spaceStr})`;

    const digitalOriginStr = meta.digitalOrigin || "Original Camera Capture";
    const plateText = plate.cleanedPlateNumber || (plate.rawExtractedText ? `Invalid Format (${plate.rawExtractedText})` : "Not Detected");

    const lines = [
        "\n================================================================================",
        "                        🚗 VEHICLE IMAGE INSPECTION REPORT                       ",
        "================================================================================",
        `  File Name        : ${originalName}`,
        `  Image ID         : ${imageId}`,
        "--------------------------------------------------------------------------------",
        "  🔍 QUALITY & AUTHENTICITY CHECKS:",
        `  [1] Blurry Image          : ${blurText}`,
        `  [2] Low Light             : ${lightText}`,
        `  [3] Duplicate Image       : ${dupText}`,
        `  [4] Photo-of-Photo        : ${screenText}`,
        `  [5] Edited / Tampered     : ${tamperText}`,
        "--------------------------------------------------------------------------------",
        "  💳 VEHICLE PLATE NUMBER:",
        `  Extracted Plate  : ${plateText}`,
        `  Format Status    : ${plate.isValidFormat ? "Valid Format" : (plate.rawExtractedText ? "Invalid Format" : "Not Detected")}`,
        `  Plate Type       : ${plate.plateType || "N/A"}`,
        "--------------------------------------------------------------------------------",
        "  📐 IMAGE DIMENSIONS:",
        `  Image File       : ${originalName}`,
        `  Width and Height : ${w} × ${h} px`,
        `  Aspect Ratio     : ${aspectText}`,
        `  Layout Detection : ${layoutText}`,
        "--------------------------------------------------------------------------------",
        "  ℹ️ METADATA ANALYSIS:",
        `  File Format      : ${(meta.format || "JPEG").toUpperCase()}`,
        `  File Size        : ${fileSizeStr}`,
        `  Color Depth      : ${colorDepthStr}`,
        `  Pixels           : ${pixelStr}`,
        `  Digital Origin   : ${digitalOriginStr}`,
        `  Plate Number     : ${plateText}`,
        "================================================================================"
    ];

    return lines.join("\n");
}

module.exports = { runFullInspection, generateTerminalReportText };
