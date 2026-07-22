const sharp = require("sharp");
const path = require("path");
const fs = require("fs");
const mongoose = require("mongoose");
const dotenv = require("dotenv");
dotenv.config();

const Image = require("../src/models/Image");
const { runFullInspection } = require("../src/services/inspectionEngine");

async function seed() {
    console.log("🌱 Seeding sample vehicle inspection test data into MongoDB Atlas...\n");

    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log("✅ Connected to database");

        const uploadsDir = path.join(__dirname, "../src/uploads");
        if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

        const scenarios = [
            { name: "MH12AB1234_CleanVehicle.jpg", type: "clean", plate: "MH12AB1234" },
            { name: "KA05MB5678_BlurryVehicle.jpg", type: "blurry", plate: "KA05MB5678" },
            { name: "DL01CA9999_LowLightVehicle.jpg", type: "low_light", plate: "DL01CA9999" },
            { name: "Screenshot_iOS_MH12AB1234.png", type: "screenshot", plate: "MH12AB1234" },
            { name: "Tampered_Photoshop_Vehicle.jpg", type: "tampered", plate: "MH12AB1234" },
            { name: "InvalidPlate_MH-BAD-99.jpg", type: "invalid_plate", plate: "MH-BAD-99" }
        ];

        for (const s of scenarios) {
            const filePath = path.join(uploadsDir, s.name);

            // Generate simple SVG image
            const isDark = s.type === "low_light";
            const isBlur = s.type === "blurry";
            const isScreen = s.type === "screenshot";

            const width = isScreen ? 1080 : 800;
            const height = isScreen ? 2400 : 600;

            const bg = isDark ? "#080c14" : "#334155";
            const carBg = isDark ? "#1e293b" : "#2563eb";
            const text = s.plate;

            const svg = `
                <svg width="${width}" height="${height}">
                    <rect width="100%" height="100%" fill="${bg}"/>
                    <rect x="${width/4}" y="${height/2 - 50}" width="${width/2}" height="160" fill="${carBg}"/>
                    <rect x="${width/2 - 130}" y="${height/2 + 30}" width="260" height="60" fill="#fef08a" stroke="black" stroke-width="3"/>
                    <text x="${width/2}" y="${height/2 + 72}" font-family="monospace" font-size="30" font-weight="bold" text-anchor="middle" fill="black">${text}</text>
                </svg>
            `;

            let sharpInst = sharp(Buffer.from(svg));
            if (isBlur) {
                sharpInst = sharpInst.blur(10);
            }

            await sharpInst.toFile(filePath);

            const imageId = require("uuid").v4();
            const image = new Image({
                imageId,
                originalName: s.name,
                fileName: s.name,
                filePath,
                fileSize: fs.statSync(filePath).size,
                mimeType: isScreen ? "image/png" : "image/jpeg",
                status: "processing"
            });
            await image.save();

            const report = await runFullInspection(filePath, imageId, s.name, Image);

            await Image.findOneAndUpdate(
                { imageId },
                {
                    status: "completed",
                    overallStatus: report.overallStatus,
                    qualityScore: report.qualityScore,
                    detectedIssues: report.detectedIssues,
                    flags: {
                        isBlurry: report.metrics.blur.isBlurry,
                        isLowLight: report.metrics.lighting.isLowLight,
                        isDuplicate: report.metrics.duplicate.isDuplicate,
                        isScreenshotOrPhotoOfPhoto: report.metrics.photoOfPhoto.isScreenshotOrPhotoOfPhoto,
                        isEditedOrTampered: report.metrics.tamper.isEditedOrTampered,
                        isInvalidVehicleNumber: report.metrics.vehiclePlate.isInvalidPlateFormat
                    },
                    recommendations: report.recommendations,
                    analysis: report.metrics
                }
            );

            console.log(`✅ Seeded scenario: ${s.type.toUpperCase()} -> ${s.name}`);
        }

        console.log("\n🎉 Seeding complete! Database populated with test scenarios.");
        process.exit(0);
    } catch (err) {
        console.error("❌ Seed error:", err);
        process.exit(1);
    }
}

seed();
