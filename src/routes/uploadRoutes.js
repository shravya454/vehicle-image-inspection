const express = require("express");
const router = express.Router();
const upload = require("../config/multer");

const {
    uploadImage,
    uploadBatch,
    getAllImages,
    getImageById,
    reanalyzeImage,
    deleteImage,
    getDashboardStats
} = require("../controllers/uploadController");

// Upload single image
router.post("/upload", upload.single("image"), uploadImage);

// Upload batch of images
router.post("/upload/batch", upload.array("images", 10), uploadBatch);

// List all images with filters
router.get("/images", getAllImages);

// Get single image inspection details
router.get("/images/:id", getImageById);

// Force re-analysis of image
router.post("/images/:id/reanalyze", reanalyzeImage);

// Delete image record
router.delete("/images/:id", deleteImage);

// Dashboard analytics & summary metrics
router.get("/stats", getDashboardStats);

module.exports = router;