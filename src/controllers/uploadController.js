const mongoose = require("mongoose");
const Image = require("../models/Image");
const { v4: uuidv4 } = require("uuid");
const imageQueue = require("../queue/imageQueue");
const { runFullInspection } = require("../services/inspectionEngine");
const fs = require("fs");
const path = require("path");

/**
 * Helper to safely find image by imageId (UUID) or Mongo _id without CastError
 */
async function findImageByAnyId(id, isLean = false) {
    let query = Image.findOne({ imageId: id });
    if (isLean) query = query.lean();
    let img = await query;
    if (!img && mongoose.Types.ObjectId.isValid(id)) {
        let idQuery = Image.findById(id);
        if (isLean) idQuery = idQuery.lean();
        img = await idQuery;
    }
    return img;
}

/**
 * Helper to process an image synchronously if BullMQ / Redis is offline
 */
async function processImageSync(imageId) {
    try {
        await Image.findOneAndUpdate({ imageId }, { status: "processing" });
        const image = await Image.findOne({ imageId });
        if (!image) return;

        const report = await runFullInspection(image.filePath, image.imageId, image.originalName, Image);

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
        console.log(`✅ Synchronous inspection complete for imageId: ${imageId}`);
    } catch (err) {
        console.error(`❌ Synchronous inspection failed for imageId: ${imageId}`, err);
        await Image.findOneAndUpdate({ imageId }, { status: "failed", failureReason: err.message });
    }
}

/**
 * Upload single image and trigger inspection pipeline
 */
const uploadImage = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: "No image file uploaded"
            });
        }

        const imageId = uuidv4();
        const webPath = `/uploads/${req.file.filename}`;

        const image = new Image({
            imageId,
            originalName: req.file.originalname,
            fileName: req.file.filename,
            filePath: req.file.path,
            fileSize: req.file.size,
            mimeType: req.file.mimetype,
            status: "pending"
        });

        await image.save();

        let queuePushed = false;
        try {
            if (imageQueue) {
                await imageQueue.add("process-image", { imageId });
                queuePushed = true;
            }
        } catch (queueErr) {
            console.log("⚠️ Queue unavailable, using synchronous inspection fallback");
        }

        // If Redis/Queue unavailable, process synchronously immediately
        if (!queuePushed) {
            processImageSync(imageId);
        }

        return res.status(201).json({
            success: true,
            message: "Image uploaded and queued for 6-point inspection",
            imageId,
            webPath,
            status: "processing"
        });
    } catch (error) {
        console.error("Upload Error:", error);
        return res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

/**
 * Upload multiple images in batch
 */
const uploadBatch = async (req, res) => {
    try {
        if (!req.files || req.files.length === 0) {
            return res.status(400).json({
                success: false,
                message: "No image files uploaded"
            });
        }

        const uploadedImages = [];

        for (const file of req.files) {
            const imageId = uuidv4();
            const image = new Image({
                imageId,
                originalName: file.originalname,
                fileName: file.filename,
                filePath: file.path,
                fileSize: file.size,
                mimeType: file.mimetype,
                status: "pending"
            });

            await image.save();

            let queuePushed = false;
            try {
                if (imageQueue) {
                    await imageQueue.add("process-image", { imageId });
                    queuePushed = true;
                }
            } catch (err) {}

            if (!queuePushed) {
                processImageSync(imageId);
            }

            uploadedImages.push({
                imageId,
                originalName: file.originalname,
                status: "processing"
            });
        }

        return res.status(201).json({
            success: true,
            message: `${uploadedImages.length} images uploaded and queued for inspection`,
            count: uploadedImages.length,
            images: uploadedImages
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * Get list of all images with filtering options
 */
const getAllImages = async (req, res) => {
    try {
        const { status, issue, search, page = 1, limit = 50 } = req.query;
        const query = {};

        if (status && status !== "all") {
            query.overallStatus = status;
        }

        if (issue && issue !== "all") {
            if (issue === "blurry") query["flags.isBlurry"] = true;
            else if (issue === "low_light") query["flags.isLowLight"] = true;
            else if (issue === "duplicate") query["flags.isDuplicate"] = true;
            else if (issue === "screenshot") query["flags.isScreenshotOrPhotoOfPhoto"] = true;
            else if (issue === "tampered") query["flags.isEditedOrTampered"] = true;
            else if (issue === "invalid_plate") query["flags.isInvalidVehicleNumber"] = true;
            else if (issue === "has_issues") query.detectedIssues = { $not: { $size: 0 } };
        }

        if (search) {
            query.$or = [
                { originalName: { $regex: search, $options: "i" } },
                { imageId: { $regex: search, $options: "i" } },
                { "analysis.vehiclePlate.cleanedPlateNumber": { $regex: search, $options: "i" } }
            ];
        }

        const total = await Image.countDocuments(query);
        const images = await Image.find(query)
            .sort({ createdAt: -1 })
            .skip((page - 1) * limit)
            .limit(parseInt(limit))
            .lean();

        // Add web image URL
        const formattedImages = images.map((img) => ({
            ...img,
            imageUrl: `/uploads/${img.fileName}`
        }));

        return res.json({
            success: true,
            count: formattedImages.length,
            total,
            page: parseInt(page),
            pages: Math.ceil(total / limit),
            images: formattedImages
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * Get detailed inspection report for a single image by ID
 */
const getImageById = async (req, res) => {
    try {
        const { id } = req.params;
        const image = await findImageByAnyId(id, true);

        if (!image) {
            return res.status(404).json({ success: false, message: "Image record not found" });
        }

        return res.json({
            success: true,
            image: {
                ...image,
                imageUrl: `/uploads/${image.fileName}`
            }
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * Force re-analyze an image
 */
const reanalyzeImage = async (req, res) => {
    try {
        const { id } = req.params;
        const image = await findImageByAnyId(id, false);

        if (!image) {
            return res.status(404).json({ success: false, message: "Image record not found" });
        }

        await processImageSync(image.imageId);

        const updatedImage = await findImageByAnyId(image.imageId, true);

        return res.json({
            success: true,
            message: "Image re-inspected successfully",
            image: {
                ...updatedImage,
                imageUrl: `/uploads/${updatedImage.fileName}`
            }
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * Delete image record and associated files
 */
const deleteImage = async (req, res) => {
    try {
        const { id } = req.params;
        const image = await findImageByAnyId(id, false);

        if (!image) {
            return res.status(404).json({ success: false, message: "Image record not found" });
        }

        // Remove local file
        if (fs.existsSync(image.filePath)) {
            try { fs.unlinkSync(image.filePath); } catch (e) {}
        }

        // Remove ELA file if exists
        const elaPath = image.analysis?.tamper?.elaImagePath;
        if (elaPath) {
            const absoluteEla = path.join(__dirname, "..", elaPath);
            if (fs.existsSync(absoluteEla)) {
                try { fs.unlinkSync(absoluteEla); } catch (e) {}
            }
        }

        await Image.deleteOne({ _id: image._id });

        return res.json({
            success: true,
            message: "Image deleted successfully",
            imageId: image.imageId
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * Get dashboard analytics and summary metrics
 */
const getDashboardStats = async (req, res) => {
    try {
        const totalUploaded = await Image.countDocuments();
        const passedCount = await Image.countDocuments({ overallStatus: "passed" });
        const flaggedCount = await Image.countDocuments({ overallStatus: "flagged" });
        const failedCount = await Image.countDocuments({ overallStatus: "failed" });
        const pendingCount = await Image.countDocuments({ status: { $in: ["pending", "processing"] } });

        const blurryCount = await Image.countDocuments({ "flags.isBlurry": true });
        const lowLightCount = await Image.countDocuments({ "flags.isLowLight": true });
        const duplicateCount = await Image.countDocuments({ "flags.isDuplicate": true });
        const screenshotCount = await Image.countDocuments({ "flags.isScreenshotOrPhotoOfPhoto": true });
        const tamperedCount = await Image.countDocuments({ "flags.isEditedOrTampered": true });
        const invalidPlateCount = await Image.countDocuments({ "flags.isInvalidVehicleNumber": true });

        // Calculate average quality score
        const scoreAgg = await Image.aggregate([
            { $match: { status: "completed" } },
            { $group: { _id: null, avgScore: { $avg: "$qualityScore" } } }
        ]);

        const avgQualityScore = scoreAgg.length > 0 ? Math.round(scoreAgg[0].avgScore * 10) / 10 : 0;

        return res.json({
            success: true,
            stats: {
                totalUploaded,
                passedCount,
                flaggedCount,
                failedCount,
                pendingCount,
                avgQualityScore,
                issuesBreakdown: {
                    blurry: blurryCount,
                    lowLight: lowLightCount,
                    duplicate: duplicateCount,
                    screenshot: screenshotCount,
                    tampered: tamperedCount,
                    invalidPlate: invalidPlateCount
                }
            }
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

module.exports = {
    uploadImage,
    uploadBatch,
    getAllImages,
    getImageById,
    reanalyzeImage,
    deleteImage,
    getDashboardStats
};