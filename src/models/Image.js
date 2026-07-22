const mongoose = require("mongoose");

const imageSchema = new mongoose.Schema(
    {
        imageId: {
            type: String,
            required: true,
            unique: true,
            index: true
        },

        originalName: {
            type: String,
            required: true
        },

        fileName: {
            type: String,
            required: true
        },

        filePath: {
            type: String,
            required: true
        },

        fileSize: {
            type: Number
        },

        mimeType: {
            type: String
        },

        status: {
            type: String,
            enum: ["pending", "processing", "completed", "failed"],
            default: "pending",
            index: true
        },

        overallStatus: {
            type: String,
            enum: ["passed", "flagged", "failed", "pending"],
            default: "pending",
            index: true
        },

        qualityScore: {
            type: Number,
            default: 0
        },

        detectedIssues: [
            {
                type: String,
                enum: [
                    "blurry",
                    "low_light",
                    "overexposed",
                    "duplicate",
                    "screenshot_photo_of_photo",
                    "edited_tampered",
                    "invalid_vehicle_number",
                    "invalid_dimensions"
                ]
            }
        ],

        flags: {
            isBlurry: { type: Boolean, default: false, index: true },
            isLowLight: { type: Boolean, default: false, index: true },
            isDuplicate: { type: Boolean, default: false, index: true },
            isScreenshotOrPhotoOfPhoto: { type: Boolean, default: false, index: true },
            isEditedOrTampered: { type: Boolean, default: false, index: true },
            isInvalidVehicleNumber: { type: Boolean, default: false, index: true },
            isInvalidDimensions: { type: Boolean, default: false, index: true }
        },

        recommendations: [{ type: String }],

        analysis: {
            blur: { type: Object, default: {} },
            lighting: { type: Object, default: {} },
            duplicate: { type: Object, default: {} },
            photoOfPhoto: { type: Object, default: {} },
            tamper: { type: Object, default: {} },
            vehiclePlate: { type: Object, default: {} },
            dimensions: { type: Object, default: {} },
            metadata: { type: Object, default: {} }
        },

        failureReason: {
            type: String,
            default: null
        },

        terminalReport: {
            type: String,
            default: ""
        }
    },
    {
        timestamps: true
    }
);

module.exports = mongoose.model("Image", imageSchema);