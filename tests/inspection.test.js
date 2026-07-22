const assert = require("assert");
const fs = require("fs");
const path = require("path");
const sharp = require("sharp");

const { detectBlur } = require("../src/services/blurDetectionService");
const { analyzeLighting } = require("../src/services/lightingService");
const { getSHA256, getDHash, getAHash, hammingDistance } = require("../src/services/duplicateDetectionService");
const { detectPhotoOfPhoto } = require("../src/services/photoOfPhotoService");
const { detectTampering } = require("../src/services/tamperDetectionService");
const { validateVehiclePlate, normalizePlateText } = require("../src/services/vehiclePlateService");
const { validateDimensions } = require("../src/services/dimensionService");
const { runFullInspection } = require("../src/services/inspectionEngine");

async function runAllTests() {
    console.log("🧪 Running Vehicle Image Inspection System Diagnostic Tests...\n");

    let totalPassed = 0;
    let totalFailed = 0;

    function test(name, fn) {
        try {
            fn();
            console.log(`  ✅ PASS: ${name}`);
            totalPassed++;
        } catch (err) {
            console.error(`  ❌ FAIL: ${name}`);
            console.error(`     Error: ${err.message}`);
            totalFailed++;
        }
    }

    async function asyncTest(name, fn) {
        try {
            await fn();
            console.log(`  ✅ PASS: ${name}`);
            totalPassed++;
        } catch (err) {
            console.error(`  ❌ FAIL: ${name}`);
            console.error(`     Error: ${err.message}`);
            totalFailed++;
        }
    }

    // Prepare temporary test images
    const tmpDir = path.join(__dirname, "temp_test_assets");
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });

    // 1. Sharp image buffer
    const sharpImagePath = path.join(tmpDir, "sharp_sample.jpg");
    await sharp({
        create: {
            width: 400,
            height: 300,
            channels: 3,
            background: { r: 50, g: 150, b: 250 }
        }
    })
    .composite([{
        input: Buffer.from('<svg width="400" height="300"><line x1="0" y1="0" x2="400" y2="300" stroke="white" stroke-width="10"/><rect x="50" y="50" width="100" height="100" fill="black"/></svg>')
    }])
    .jpeg({ quality: 100 })
    .toFile(sharpImagePath);

    // 2. Low light image buffer
    const lowLightImagePath = path.join(tmpDir, "dark_sample.jpg");
    await sharp({
        create: {
            width: 400,
            height: 300,
            channels: 3,
            background: { r: 10, g: 12, b: 15 }
        }
    })
    .jpeg({ quality: 100 })
    .toFile(lowLightImagePath);

    console.log("--- 1. Blur Detection Service ---");
    await asyncTest("Detects blur metrics and Laplacian variance", async () => {
        const result = await detectBlur(sharpImagePath);
        assert.strictEqual(typeof result.isBlurry, "boolean");
        assert.strictEqual(typeof result.laplacianVariance, "number");
        assert.ok(result.sharpnessScore >= 0 && result.sharpnessScore <= 100);
    });

    console.log("\n--- 2. Lighting Analysis Service ---");
    await asyncTest("Identifies low light image correctly", async () => {
        const result = await analyzeLighting(lowLightImagePath);
        assert.strictEqual(result.isLowLight, true);
        assert.strictEqual(result.lightingQuality, "low_light");
        assert.ok(result.meanBrightness < 40);
    });

    await asyncTest("Identifies normal lighting image correctly", async () => {
        const result = await analyzeLighting(sharpImagePath);
        assert.strictEqual(result.isLowLight, false);
    });

    console.log("\n--- 3. Duplicate Detection (Perceptual & SHA-256) ---");
    test("Calculates SHA-256 hash string", () => {
        const hash = getSHA256(sharpImagePath);
        assert.strictEqual(hash.length, 64);
    });

    await asyncTest("Computes dHash & aHash 64-bit hex fingerprints", async () => {
        const dHash = await getDHash(sharpImagePath);
        const aHash = await getAHash(sharpImagePath);
        assert.strictEqual(dHash.length, 16);
        assert.strictEqual(aHash.length, 16);
    });

    test("Calculates Hamming Distance between perceptual hashes", () => {
        const distSame = hammingDistance("ffff0000ffff0000", "ffff0000ffff0000");
        const distDiff = hammingDistance("ffff0000ffff0000", "0000ffff0000ffff");
        assert.strictEqual(distSame, 0);
        assert.strictEqual(distDiff, 64);
    });

    console.log("\n--- 4. Screenshot / Photo-of-Photo Detection ---");
    await asyncTest("Analyzes screenshot aspect ratio and metadata tags", async () => {
        const result = await detectPhotoOfPhoto(sharpImagePath);
        assert.strictEqual(typeof result.isScreenshotOrPhotoOfPhoto, "boolean");
        assert.strictEqual(typeof result.confidenceScore, "number");
    });

    await asyncTest("Does not flag a standard camera-style image as a photo-of-photo", async () => {
        const cameraLikePath = path.join(tmpDir, "camera_like.jpg");
        await sharp({
            create: {
                width: 1600,
                height: 1200,
                channels: 3,
                background: { r: 240, g: 240, b: 240 }
            }
        })
        .jpeg({ quality: 92 })
        .toFile(cameraLikePath);

        const result = await detectPhotoOfPhoto(cameraLikePath);
        assert.strictEqual(result.isScreenshotOrPhotoOfPhoto, false);
    });

    console.log("\n--- 5. Tamper & Error Level Analysis (ELA) ---");
    await asyncTest("Generates ELA map and calculates compression variance", async () => {
        const result = await detectTampering(sharpImagePath, "test_ela");
        assert.strictEqual(typeof result.isEditedOrTampered, "boolean");
        assert.strictEqual(typeof result.riskScore, "number");
        assert.ok(result.elaImagePath !== null);
    });

    console.log("\n--- 6. Image Dimension Validation ---");
    await asyncTest("Validates image dimensions for a standard vehicle photo", async () => {
        const result = await validateDimensions(sharpImagePath);
        assert.strictEqual(typeof result.isInvalidDimensions, "boolean");
        assert.strictEqual(typeof result.width, "number");
        assert.strictEqual(typeof result.height, "number");
        assert.ok(result.width > 0 && result.height > 0);
    });

    console.log("\n--- 7. Vehicle Plate Format Validation ---");
    test("Validates standard Indian vehicle plate format (MH12AB1234)", () => {
        const val = validateVehiclePlate("MH12AB1234");
        assert.strictEqual(val.isValidFormat, true);
        assert.strictEqual(val.plateType, "Indian Standard Plate");
    });

    test("Validates BH Series vehicle plate format (22BH1234AA)", () => {
        const val = validateVehiclePlate("22BH1234AA");
        assert.strictEqual(val.isValidFormat, true);
        assert.strictEqual(val.plateType, "Indian BH (Bharat) Series");
    });

    test("Rejects invalid plate format (INVALID123999)", () => {
        const val = validateVehiclePlate("INVALID123999");
        assert.strictEqual(val.isValidFormat, false);
        assert.ok(val.validationError !== null);
    });

    console.log("\n--- 8. Unified Inspection Pipeline ---");
    await asyncTest("Executes runFullInspection and generates quality score & recommendations", async () => {
        const report = await runFullInspection(sharpImagePath, "test_job_123", "MH12AB1234_car.jpg", null);
        assert.ok(["passed", "flagged", "failed"].includes(report.overallStatus));
        assert.strictEqual(typeof report.qualityScore, "number");
        assert.strictEqual(Array.isArray(report.detectedIssues), true);
        assert.strictEqual(Array.isArray(report.recommendations), true);
    });

    // Cleanup temp test files
    try {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch (e) {}

    console.log("\n=============================================");
    console.log(`📊 TEST RESULTS: ${totalPassed} Passed, ${totalFailed} Failed`);
    console.log("=============================================\n");

    if (totalFailed > 0) {
        process.exit(1);
    }
}

runAllTests();
