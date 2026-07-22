const { Worker } = require("bullmq");
const connection = require("../queue/redis");
const Image = require("../models/Image");
const { runFullInspection } = require("../services/inspectionEngine");

let worker = null;

try {
    worker = new Worker(
        "image-processing",

        async (job) => {
            console.log("📦 Processing BullMQ Job:", job.id);

            const { imageId } = job.data;

            // Update status to processing
            await Image.findOneAndUpdate({ imageId }, { status: "processing" });

            const image = await Image.findOne({ imageId });
            if (!image) {
                console.log("❌ Image not found in DB:", imageId);
                return;
            }

            // Run 6-Point Inspection Engine
            const report = await runFullInspection(
                image.filePath,
                image.imageId,
                image.originalName,
                Image
            );

            // Save inspection report in MongoDB
            await Image.findOneAndUpdate(
                { imageId },
                {
                    status: "completed",
                    overallStatus: report.overallStatus,
                    qualityScore: report.qualityScore,
                    detectedIssues: report.detectedIssues,
                    flags: {
                        isBlurry: report.metrics?.blur?.isBlurry || false,
                        isLowLight: report.metrics?.lighting?.isLowLight || false,
                        isDuplicate: report.metrics?.duplicate?.isDuplicate || false,
                        isScreenshotOrPhotoOfPhoto: report.metrics?.photoOfPhoto?.isScreenshotOrPhotoOfPhoto || false,
                        isEditedOrTampered: report.metrics?.tamper?.isEditedOrTampered || false,
                        isInvalidVehicleNumber: false,
                        isInvalidDimensions: report.metrics?.dimensions?.isInvalidDimensions || false
                    },
                    recommendations: report.recommendations,
                    analysis: report.metrics,
                    terminalReport: report.terminalReport
                }
            );

            console.log("✅ Processing Completed for Job:", job.id);
        },
        { connection }
    );

    worker.on("completed", (job) => {
        console.log(`🎉 Job ${job.id} completed successfully`);
    });

    worker.on("failed", (job, err) => {
        console.error(`❌ Job ${job?.id} failed:`, err.message);
    });
} catch (err) {
    console.log("⚠️ BullMQ Worker setup notice:", err.message);
}

module.exports = worker;