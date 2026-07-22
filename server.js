const express = require("express");
const cors = require("cors");
const morgan = require("morgan");
const dotenv = require("dotenv");
const path = require("path");
const fs = require("fs");

dotenv.config();

// Ensure upload directories exist
const uploadDir = path.join(__dirname, "src/uploads");
const elaDir = path.join(__dirname, "src/uploads/ela");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
if (!fs.existsSync(elaDir)) fs.mkdirSync(elaDir, { recursive: true });

// Optional Redis & BullMQ initialization
try {
    require("./src/queue/redis");
    require("./src/workers/imageWorker");
} catch (err) {
    console.log("ℹ️ Running in standalone mode (direct inspection execution)");
}

const connectDB = require("./src/config/db");
const uploadRoutes = require("./src/routes/uploadRoutes");

const app = express();

// Connect Database
connectDB();

// Middleware
app.use(cors());
app.use(express.json());
app.use(morgan("dev"));

// Static File Routes
app.use("/uploads", express.static(path.join(__dirname, "src/uploads")));
app.use(express.static(path.join(__dirname, "public")));

// API Routes
app.use("/api", uploadRoutes);

// Server Status Route
app.get("/api/health", (req, res) => {
    res.json({
        success: true,
        message: "Vehicle Image Quality & Authenticity Inspection System active",
        time: new Date().toISOString()
    });
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
    console.log(`🚀 Vehicle Inspection Server running on http://localhost:${PORT}`);
});