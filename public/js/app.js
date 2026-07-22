document.addEventListener("DOMContentLoaded", () => {
    initDropZone();
});

function initDropZone() {
    const dropZone = document.getElementById("dropZone");
    const fileInput = document.getElementById("fileInput");

    dropZone.addEventListener("click", () => fileInput.click());

    dropZone.addEventListener("dragover", (e) => {
        e.preventDefault();
        dropZone.style.borderColor = "#3b82f6";
    });

    dropZone.addEventListener("dragleave", () => {
        dropZone.style.borderColor = "#3b82f6";
    });

    dropZone.addEventListener("drop", (e) => {
        e.preventDefault();
        if (e.dataTransfer.files.length > 0) {
            uploadFile(e.dataTransfer.files[0]);
        }
    });

    fileInput.addEventListener("change", (e) => {
        if (e.target.files.length > 0) {
            uploadFile(e.target.files[0]);
        }
    });
}

async function uploadFile(file) {
    const formData = new FormData();
    formData.append("image", file);

    try {
        const res = await fetch("/api/upload", {
            method: "POST",
            body: formData
        });
        const data = await res.json();

        if (data.success) {
            // Fetch detailed report for the newly uploaded image
            fetchLatestReport(data.imageId);
        } else {
            alert(`Upload failed: ${data.message}`);
        }
    } catch (err) {
        alert(`Error uploading file: ${err.message}`);
    }
}

async function fetchLatestReport(imageId, retries = 40) {
    try {
        const res = await fetch(`/api/images/${imageId}`);
        const data = await res.json();

        if (data.success && data.image) {
            const status = data.image.status;
            if ((status === "pending" || status === "processing") && retries > 0) {
                setTimeout(() => fetchLatestReport(imageId, retries - 1), 1000);
            } else {
                renderInspectionResults(data.image);
            }
        }
    } catch (err) {
        console.error("Error fetching report:", err);
    }
}

/**
 * Renders simple 6-point checklist results
 */
function renderInspectionResults(img) {
    document.getElementById("emptyPlaceholder").classList.add("hidden");
    document.getElementById("resultContent").classList.remove("hidden");

    const analysis = img.analysis || {};
    const blur = analysis.blur || {};
    const lighting = analysis.lighting || {};
    const duplicate = analysis.duplicate || {};
    const photoOfPhoto = analysis.photoOfPhoto || {};
    const dimensions = analysis.dimensions || {};
    const plate = analysis.vehiclePlate || {};
    const tamper = analysis.tamper || {};

    const fileEl = document.getElementById("resultFileName");
    if (fileEl) fileEl.innerText = img.originalName;
    const scoreEl = document.getElementById("resultScoreText");
    if (scoreEl) scoreEl.innerText = `Quality Score: ${img.qualityScore}/100`;

    // Display Inspected Vehicle Image Preview
    const imageSrc = img.imageUrl || img.webPath || (img.fileName ? `/uploads/${img.fileName}` : "");
    const previewEl = document.getElementById("inspectedImageDisplay");
    if (previewEl && imageSrc) {
        previewEl.src = imageSrc;
    }

    // Display ELA image preview if available
    const elaEl = document.getElementById("elaImageDisplay");
    const elaCard = document.getElementById("elaPreviewCard");
    if (elaEl && elaCard) {
        if (tamper.elaImagePath) {
            elaEl.src = tamper.elaImagePath;
            elaCard.classList.remove("hidden");
        } else {
            elaCard.classList.add("hidden");
        }
    }

    // Percentages & plate visibility
    const blurPct = blur.blurPercentage || (blur.isBlurry ? Math.min(100, Math.max(1, Math.round((1 - (blur.laplacianVariance || 0) / 120) * 100))) : 0);
    const lightPct = lighting.lowLightPercentage || (lighting.isLowLight ? Math.min(100, Math.max(1, Math.round(lighting.darkPixelPercentage || ((1 - (lighting.meanBrightness || 0) / 65) * 100)))) : 0);



    const dimensionsStatusEl = document.getElementById("dimensionStatus");
    if (dimensionsStatusEl) {
        if (dimensions.width) {
            dimensionsStatusEl.innerHTML = `Image dimensions analysis complete`;
        } else {
            dimensionsStatusEl.innerHTML = `Waiting for analysis`;
        }
    }

    const imgMeta = analysis.metadata || {};
    const w = dimensions.width || imgMeta.width || 0;
    const h = dimensions.height || imgMeta.height || 0;

    // Populate Image Dimensions Section Card
    const tableThumb = document.getElementById("tableThumb");
    const tableFileName = document.getElementById("tableFileName");
    const dimResolution = document.getElementById("dimResolution");
    const dimAspectRatio = document.getElementById("dimAspectRatio");
    const dimLayout = document.getElementById("dimLayout");

    if (w && h) {
        if (tableThumb) tableThumb.src = imageSrc;
        if (tableFileName) tableFileName.innerText = img.originalName || "vehicle_image.jpg";
        if (dimResolution) dimResolution.innerText = `${w} × ${h} px`;
        if (dimAspectRatio) dimAspectRatio.innerText = calculateAspectRatioLabel(w, h);
        if (dimLayout) dimLayout.innerText = getLayoutDetection(w, h);
    } else {
        if (tableThumb) tableThumb.src = imageSrc;
        if (tableFileName) tableFileName.innerText = img.originalName || "vehicle_image.jpg";
    }

    // Populate Metadata Analysis Section Card
    const metaFormat = document.getElementById("metaFormat");
    const metaSize = document.getElementById("metaSize");
    const metaColorDepth = document.getElementById("metaColorDepth");
    const metaPixels = document.getElementById("metaPixels");
    const metaDigitalOrigin = document.getElementById("metaDigitalOrigin");
    const metaPlateNumber = document.getElementById("metaPlateNumber");

    if (metaFormat) metaFormat.innerText = String(imgMeta.format || img.mimeType?.split("/")[1] || "JPEG").toUpperCase();
    if (metaSize) {
        const sizeBytes = imgMeta.fileSize || img.fileSize || 0;
        const sizeInKb = sizeBytes / 1024;
        const sizeStr = sizeInKb >= 1024 ? `${(sizeInKb / 1024).toFixed(2)} MB` : `${sizeInKb.toFixed(1)} KB`;
        metaSize.innerText = sizeStr;
    }
    if (metaColorDepth) metaColorDepth.innerText = getColorDepthAndSpace(imgMeta);
    
    if (metaPixels) {
        const totalPixels = w * h;
        const mp = totalPixels > 0 ? (totalPixels / 1000000).toFixed(2) : "0";
        metaPixels.innerText = totalPixels > 0 ? `${totalPixels.toLocaleString()} px (${mp} MP)` : "N/A";
    }

    if (metaDigitalOrigin) {
        metaDigitalOrigin.innerText = imgMeta.digitalOrigin || "Original Camera Capture";
    }

    if (metaPlateNumber) {
        if (plate.cleanedPlateNumber) {
            metaPlateNumber.innerText = plate.cleanedPlateNumber;
        } else if (plate.rawExtractedText) {
            metaPlateNumber.innerText = `Invalid Format (${plate.rawExtractedText})`;
        } else {
            metaPlateNumber.innerText = "Not Detected";
        }
    }

    // Populate Vehicle Plate Number Section Card
    const displayPlateNumber = document.getElementById("displayPlateNumber");
    const displayPlateStatus = document.getElementById("displayPlateStatus");
    const displayPlateType = document.getElementById("displayPlateType");

    if (displayPlateNumber) {
        displayPlateNumber.innerText = plate.cleanedPlateNumber || plate.rawExtractedText || "Not Detected";
    }
    if (displayPlateStatus) {
        displayPlateStatus.innerText = plate.isValidFormat ? "Valid Registration Format" : (plate.rawExtractedText ? `Invalid Format (${plate.rawExtractedText})` : "Not Detected");
    }
    if (displayPlateType) {
        displayPlateType.innerText = plate.plateType || (plate.isValidFormat ? "Standard Plate" : "N/A");
    }

    // Helper to update check item
    function updateCheckItem(checkId, iconId, descId, tagId, isFailed, failMsg, passMsg, tagLabel) {
        const checkEl = document.getElementById(checkId);
        const iconEl = document.getElementById(iconId);
        const descEl = document.getElementById(descId);
        const tagEl = document.getElementById(tagId);

        if (!checkEl || !iconEl || !descEl || !tagEl) return;

        if (isFailed) {
            checkEl.className = "check-item failed-item";
            iconEl.innerText = "❌";
            descEl.innerText = failMsg;
            tagEl.className = "check-tag fail";
            tagEl.innerText = tagLabel || "YES";
        } else {
            checkEl.className = "check-item passed-item";
            iconEl.innerText = "✅";
            descEl.innerText = passMsg;
            tagEl.className = "check-tag pass";
            tagEl.innerText = tagLabel || "NO";
        }
    }

    // 1. Blur
    updateCheckItem(
        "checkBlur", "iconBlur", "descBlur", "tagBlur",
        blur.isBlurry,
        `Blurry image (${blurPct}%)`,
        `Sharp image`,
        blur.isBlurry ? `YES (${blurPct}%)` : `NO`
    );

    // 2. Low Light
    updateCheckItem(
        "checkLight", "iconLight", "descLight", "tagLight",
        lighting.isLowLight,
        `Low light condition (${lightPct}%)`,
        `Good lighting`,
        lighting.isLowLight ? `YES (${lightPct}%)` : `NO`
    );

    // 3. Duplicate
    updateCheckItem(
        "checkDup", "iconDup", "descDup", "tagDup",
        duplicate.isDuplicate,
        `Duplicate image detected`,
        `Unique original image`,
        duplicate.isDuplicate ? `YES` : `NO`
    );

    // 4. Photo-of-Photo
    updateCheckItem(
        "checkScreen", "iconScreen", "descScreen", "tagScreen",
        photoOfPhoto.isScreenshotOrPhotoOfPhoto,
        `Photo-of-photo detected`,
        `Original camera photo`,
        photoOfPhoto.isScreenshotOrPhotoOfPhoto ? `YES` : `NO`
    );

    // 5. Edited / Tampered
    updateCheckItem(
        "checkTamper", "iconTamper", "descTamper", "tagTamper",
        tamper.isEditedOrTampered,
        `Tampering detected (${tamper.tamperReasons?.join(", ") || "anomalies detected"})`,
        `Original unmodified photo`,
        tamper.isEditedOrTampered ? `YES` : `NO`
    );

    // Render Terminal Console Output Box
    const terminalText = img.terminalReport || formatTerminalOutputClient(img);
    const terminalEl = document.getElementById("terminalOutputText");
    if (terminalEl) {
        terminalEl.innerText = terminalText;
    }

    // Scroll smoothly to results
    document.getElementById("resultsSection").scrollIntoView({ behavior: "smooth" });
}

/**
 * Fallback client-side formatter for terminal output display
 */
function formatTerminalOutputClient(img) {
    const analysis = img.analysis || {};
    const blur = analysis.blur || {};
    const lighting = analysis.lighting || {};
    const duplicate = analysis.duplicate || {};
    const photoOfPhoto = analysis.photoOfPhoto || {};
    const tamper = analysis.tamper || {};
    const dimensions = analysis.dimensions || {};
    const meta = analysis.metadata || {};
    const plate = analysis.vehiclePlate || {};

    const blurPct = blur.blurPercentage || (blur.isBlurry ? Math.min(100, Math.max(1, Math.round((1 - (blur.laplacianVariance || 0) / 120) * 100))) : 0);
    const blurText = blur.isBlurry ? `YES (${blurPct}%)` : "NO";

    const lightPct = lighting.lowLightPercentage || (lighting.isLowLight ? Math.min(100, Math.max(1, Math.round(lighting.darkPixelPercentage || ((1 - (lighting.meanBrightness || 0) / 65) * 100)))) : 0);
    const lightText = lighting.isLowLight ? `YES (${lightPct}%)` : "NO";

    const dupText = duplicate.isDuplicate ? `YES` : "NO";
    const screenText = photoOfPhoto.isScreenshotOrPhotoOfPhoto ? "YES" : "NO";
    const tamperText = tamper.isEditedOrTampered ? `YES (Score: ${tamper.riskScore}%)` : "NO";

    const w = dimensions.width || meta.width || 0;
    const h = dimensions.height || meta.height || 0;
    const aspectText = calculateAspectRatioLabel(w, h);
    const layoutText = getLayoutDetection(w, h);

    const sizeBytes = meta.fileSize || img.fileSize || 0;
    const sizeInKb = sizeBytes / 1024;
    const fileSizeStr = sizeInKb >= 1024 ? `${(sizeInKb / 1024).toFixed(2)} MB` : `${sizeInKb.toFixed(1)} KB`;

    const totalPixels = w * h;
    const mp = totalPixels > 0 ? (totalPixels / 1000000).toFixed(2) : "0";
    const pixelStr = `${totalPixels.toLocaleString()} pixels (${mp} MP)`;
    const colorDepthStr = getColorDepthAndSpace(meta);
    const digitalOriginStr = meta.digitalOrigin || "Original Camera Capture";
    const plateText = plate.cleanedPlateNumber || (plate.rawExtractedText ? `Invalid Format (${plate.rawExtractedText})` : "Not Detected");

    const lines = [
        "================================================================================",
        "                        🚗 VEHICLE IMAGE INSPECTION REPORT                       ",
        "================================================================================",
        `  File Name        : ${img.originalName || "Unknown"}`,
        `  Image ID         : ${img.imageId || img._id || "N/A"}`,
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
        `  Image File       : ${img.originalName || "Unknown"}`,
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

/**
 * Copy terminal output text to user clipboard
 */
function copyTerminalOutput() {
    const textEl = document.getElementById("terminalOutputText");
    if (!textEl) return;
    navigator.clipboard.writeText(textEl.innerText).then(() => {
        const btn = document.getElementById("copyTerminalBtn");
        if (btn) {
            const originalHTML = btn.innerHTML;
            btn.innerHTML = `<i class="fa-solid fa-check"></i> Copied!`;
            setTimeout(() => {
                btn.innerHTML = originalHTML;
            }, 2000);
        }
    }).catch(err => {
        console.error("Copy failed:", err);
    });
}

/**
 * Generates synthetic sample image on canvas to test scenarios live
 */
function runPresetTest(type) {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");

    let w = 800;
    let h = 600;
    let filename = `test_${type}_MH12AB1234.jpg`;

    if (type === "screenshot") {
        w = 1080;
        h = 2400;
        filename = `test_screenshot_iOS_MH12AB1234.png`;
    }

    canvas.width = w;
    canvas.height = h;

    if (type === "low_light") {
        ctx.fillStyle = "#050810";
        ctx.fillRect(0, 0, w, h);
    } else if (type === "screenshot") {
        ctx.fillStyle = "#000000";
        ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = "#1e293b";
        ctx.fillRect(20, 80, w - 40, h - 160);
        ctx.fillStyle = "#ffffff";
        ctx.font = "bold 24px sans-serif";
        ctx.fillText("09:41 AM", 40, 50);
        ctx.fillText("📶 🔋 100%", w - 180, 50);
    } else {
        ctx.fillStyle = "#334155";
        ctx.fillRect(0, 0, w, h);
    }

    const carY = h / 2 - 50;
    ctx.fillStyle = type === "low_light" ? "#1e293b" : "#2563eb";
    ctx.fillRect(w / 4, carY, w / 2, 160);

    ctx.fillStyle = "#0f172a";
    ctx.beginPath();
    ctx.arc(w / 3, carY + 160, 45, 0, Math.PI * 2);
    ctx.arc((w * 2) / 3, carY + 160, 45, 0, Math.PI * 2);
    ctx.fill();

    const plateW = 260;
    const plateH = 60;
    const plateX = w / 2 - plateW / 2;
    const plateY = carY + 80;

    ctx.fillStyle = "#fef08a";
    ctx.fillRect(plateX, plateY, plateW, plateH);
    ctx.lineWidth = 3;
    ctx.strokeStyle = "#000000";
    ctx.strokeRect(plateX, plateY, plateW, plateH);

    let plateText = "MH12AB1234";

    ctx.fillStyle = "#000000";
    ctx.font = "bold 32px 'JetBrains Mono', monospace";
    ctx.textAlign = "center";
    ctx.fillText(plateText, w / 2, plateY + 42);

    if (type === "blurry") {
        const imgData = ctx.getImageData(0, 0, w, h);
        const data = imgData.data;
        for (let i = 0; i < data.length; i += 4) {
            data[i] = (data[i] + (data[i + 4] || data[i])) / 2;
            data[i + 1] = (data[i + 1] + (data[i + 5] || data[i + 1])) / 2;
            data[i + 2] = (data[i + 2] + (data[i + 6] || data[i + 2])) / 2;
        }
        ctx.putImageData(imgData, 0, 0);
    }

    canvas.toBlob(async (blob) => {
        const file = new File([blob], filename, { type: type === "screenshot" ? "image/png" : "image/jpeg" });
        await uploadFile(file);
    }, type === "screenshot" ? "image/png" : "image/jpeg", 0.95);
}

/**
 * Calculates standard ratio format (e.g., 16:9, 4:3, 1:1 square, 9:16)
 */
function calculateAspectRatioLabel(width, height) {
    if (!width || !height) return "N/A";
    const ratio = width / height;

    if (Math.abs(ratio - 16 / 9) < 0.06) return "16:9";
    if (Math.abs(ratio - 9 / 16) < 0.06) return "9:16";
    if (Math.abs(ratio - 4 / 3) < 0.06) return "4:3";
    if (Math.abs(ratio - 3 / 4) < 0.06) return "3:4";
    if (Math.abs(ratio - 1) < 0.04) return "1:1 (Square)";
    if (Math.abs(ratio - 21 / 9) < 0.06) return "21:9";
    if (Math.abs(ratio - 5 / 4) < 0.06) return "5:4";

    function gcd(a, b) { return b === 0 ? a : gcd(b, a % b); }
    const divisor = gcd(width, height);
    return `~${Math.round(width / divisor)}:${Math.round(height / divisor)}`;
}

/**
 * Layout Detection: Landscape (horizontal), Portrait (vertical), or Square
 */
function getLayoutDetection(width, height) {
    if (!width || !height) return "N/A";
    if (width > height) return "Landscape (horizontal)";
    if (height > width) return "Portrait (vertical)";
    return "Square";
}

/**
 * Calculates Bit Depth and Color Space string
 */
function getColorDepthAndSpace(meta) {
    const channels = meta.channels || 3;
    const space = (meta.space || "srgb").toUpperCase();
    
    let bitDepth = "24-bit";
    if (channels === 1) bitDepth = "8-bit";
    else if (channels === 4) bitDepth = "32-bit";

    return `${bitDepth} (${space})`;
}
