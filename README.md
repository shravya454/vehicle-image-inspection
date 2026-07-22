# 🚗 Vehicle Image Inspection System

An intelligent, production-grade media processing pipeline that analyzes field-uploaded vehicle photos, evaluates image quality, detects authenticity anomalies, and reports **5-point inspection results** along with detailed image dimensions and metadata analysis before approval — all accessible through a clean web dashboard.

🔗 **Live Demo**: [https://vehicle-image-inspection-demo.com](https://vehicle-image-inspection-demo.com) *(Replace with actual link)*

---

## 📋 Table of Contents

1. [Overview & Problem Statement](#-overview--problem-statement)
2. [Technologies Used](#-technologies-used)
3. [Project Structure](#-project-structure)
4. [What Was Built](#-what-was-built)
5. [5-Point Inspection Engine](#-5-point-inspection-engine)
6. [Architecture & Design](#-architecture--design)
7. [API Reference](#-api-reference)
8. [Running Instructions](#-running-instructions)
9. [AI Usage Disclosure](#-ai-usage-disclosure)
10. [Assumptions Made](#-assumptions-made)

---

## 🔍 Overview & Problem Statement

Field agents uploading vehicle photos often encounter environmental or intent-based defects such as blurry images, low-light photos, duplicate submissions, screenshots, and tampered images. This system processes uploaded images and evaluates them against **5 critical inspection checks**, along with providing **Image Dimensions** and **Metadata Analysis**, returning a structured pass/fail report.

### Inspection Checks & Analysis
| # | Feature | Description |
|---|---|---|
| 1 | **Blurry Image** | Laplacian & Sobel variance analysis to detect out-of-focus images. |
| 2 | **Low Light** | Luminance & dark pixel ratio to detect poorly lit photos. |
| 3 | **Duplicate Image** | Exact byte match (SHA-256) & perceptual similarity (dHash/aHash) to prevent re-uploads. |
| 4 | **Screenshot / Photo-of-Photo** | EXIF, aspect ratio, and Moire pattern detection to ensure original camera captures. |
| 5 | **Edited / Tampered Image** | EXIF software tags & Error Level Analysis (ELA) to detect manipulated photos. |
| 6 | **Image Dimensions** | Extraction of resolution, aspect ratio, and layout orientation. |
| 7 | **Metadata Analysis** | Extraction of file format, size, color depth, and digital origin. |

---

## 🛠 Technologies Used

### Backend
| Technology | Purpose |
|------------|---------|
| **Node.js** (v18+) | Runtime environment |
| **Express.js** v5 | REST API framework |
| **MongoDB Atlas** + **Mongoose** | Cloud database — stores image documents, flags, scores, and inspection metrics |
| **BullMQ** | Asynchronous job queue for image processing |
| **Redis** (via **ioredis**) | Queue backend for BullMQ |
| **Sharp** | High-performance image processing — resizing, pixel-level operations, JPEG re-saving for ELA |
| **OpenCV.js** (`@techstark/opencv-js`) | Computer vision — Sobel gradients, Moire pattern analysis |
| **Multer** | Multipart file upload middleware |
| **UUID** | Unique image ID generation |
| **dotenv** | Environment variable management |
| **Morgan** | HTTP request logging |
| **CORS** | Cross-origin resource sharing |
| **Nodemon** | Development auto-restart |

### Frontend
| Technology | Purpose |
|------------|---------|
| **HTML5** | Web dashboard structure |
| **Vanilla CSS** | Custom styling with glassmorphism, animations, responsive layout |
| **Vanilla JavaScript** | Dynamic UI — result rendering, API calls, preset test triggers |
| **Font Awesome** | Icons |
| **Google Fonts** (Plus Jakarta Sans, JetBrains Mono) | Typography |

### Infrastructure
| Technology | Purpose |
|------------|---------|
| **Docker** + **Docker Compose** | Containerized deployment |
| **MongoDB Atlas** | Cloud-hosted database |
| **Redis** | Optional queue backend (graceful fallback if offline) |

---

## 📁 Project Structure

```
vehicle-image-inspection/
│
├── server.js                            # Express app entry point
├── package.json                         # Dependencies & npm scripts
├── Dockerfile                           # Docker image configuration
├── docker-compose.yml                   # Multi-container Docker setup
├── .env                                 # Environment variables (Mongo URI, Redis URL, Port)
│
├── public/                              # Frontend (Web Dashboard)
│   ├── index.html                       # Main dashboard HTML — inspection UI
│   ├── css/
│   │   └── style.css                    # Full dashboard styling (responsive, dark theme)
│   └── js/
│       └── app.js                       # Frontend logic — upload, API calls, result rendering
│
├── src/
│   ├── config/
│   │   └── db.js                        # MongoDB Atlas connection setup
│   │
│   ├── controllers/
│   │   └── uploadController.js          # Upload, fetch, stats, filter & delete endpoints
│   │
│   ├── middleware/
│   │   └── upload.js                    # Multer file upload config (size limits, file type filter)
│   │
│   ├── models/
│   │   └── Image.js                     # Mongoose schema — metadata, flags, scores, metrics
│   │
│   ├── queue/
│   │   ├── imageQueue.js                # BullMQ queue instance definition
│   │   └── redis.js                     # Redis connection with graceful failure handling
│   │
│   ├── routes/
│   │   └── uploadRoutes.js              # Maps API routes to controller functions
│   │
│   ├── services/
│   │   ├── inspectionEngine.js          # Orchestrates all checks & generates final report
│   │   ├── blurDetectionService.js      # Blur — Laplacian & Sobel variance on grayscale buffer
│   │   ├── lightingService.js           # Lighting — luminance mean & dark pixel ratio
│   │   ├── duplicateDetectionService.js # Duplicate — SHA-256 + dHash/aHash perceptual hash
│   │   ├── photoOfPhotoService.js       # Screenshot — EXIF, aspect ratio, Moire grid detection
│   │   ├── tamperDetectionService.js    # Tamper — EXIF software tags & ELA heatmap generation
│   │   ├── dimensionService.js          # Image dimension & aspect ratio extraction
│   │   ├── metadataService.js           # EXIF metadata extraction from image buffer
│   │   ├── opencvService.js             # OpenCV.js initialization helper
│   │   └── validationService.js         # Input validation helpers
│   │
│   ├── workers/
│   │   └── imageWorker.js               # Processes queued BullMQ jobs & saves results to MongoDB
│   │
│   ├── utils/                           # Shared utility helpers
│   └── uploads/                         # Uploaded images stored locally (served as static files)
│
├── scripts/
│   └── seedData.js                      # Seeds MongoDB with sample test images & reports
│
└── tests/
    └── inspection.test.js               # Automated diagnostic tests for the inspection services
```

---

## ✅ What Was Built

### 1. 🌐 Web Dashboard (Frontend)
- Single-page inspection dashboard with a **drag-and-drop file upload zone**
- Displays a **5-point inspection checklist** with pass/fail status per check (Blurry, Low Light, Duplicate, Screenshot, Tampered)
- Dedicated **Image Dimensions** table showing resolution, aspect ratio, and layout detection.
- Dedicated **Metadata Analysis** grid showing file format, size, color depth, and digital origin.
- Shows **overall pass/fail result** with a quality score (0–100)
- Live terminal-style **output log** showing real-time backend processing steps
- **Quick-test preset buttons** to instantly test with sample images:
  - ✅ Clean Image · 📷 Blurry · 🌙 Low Light · 📱 Screenshot · ✨ Tampered · 🔄 Duplicate
- Responsive layout with animated transitions and polished dark theme

### 2. 🔧 REST API Backend
| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/upload` | Upload a vehicle image for inspection |
| `GET` | `/api/images/:id` | Fetch full inspection report for an image |
| `GET` | `/api/images` | List all inspected images (supports filters: `?issue=blur`, `?status=failed`) |
| `GET` | `/api/stats` | Dashboard analytics — totals, pass/fail counts, issue breakdown |
| `DELETE` | `/api/images/:id` | Delete an image and its stored data |

### 3. ⚙️ Asynchronous Processing Queue
- Jobs are added to a **BullMQ queue** backed by Redis when Redis is available
- If Redis is **offline**, the system automatically falls back to **direct synchronous processing** — zero service disruption
- Worker (`imageWorker.js`) consumes queue jobs and saves final results to MongoDB

### 4. 🧠 5-Point Inspection Engine

| Service File | Algorithm | What It Detects |
|---|---|---|
| `blurDetectionService.js` | Laplacian variance on 800px grayscale | Variance `< 120` → blurry |
| `lightingService.js` | Mean luminance + dark pixel ratio | Luminance `< 65` or dark pixels `> 40%` → low light |
| `duplicateDetectionService.js` | SHA-256 (exact) + 64-bit dHash/aHash (perceptual) | Hamming distance `≤ 8` → duplicate |
| `photoOfPhotoService.js` | EXIF camera tags, screen aspect ratios, Moire pattern FFT | Missing EXIF, 16:9/19.5:9 ratio, Moire grid → screenshot |
| `tamperDetectionService.js` | EXIF software field scan + ELA resave pixel diff | Photoshop/Canva/GIMP tags, ELA variance spike → tampered |

*Additionally, `dimensionService.js` and `metadataService.js` run alongside these to provide complete structural information about the image.*

### 5. 💾 MongoDB Persistence
Each upload creates an **Image document** in MongoDB with:
- Image ID, file name, MIME type, file size, upload timestamp
- Overall status (`passed` / `flagged` / `failed`) and quality score (0–100)
- Detected issue list and per-flag booleans (`isBlurry`, `isDuplicate`, etc.)
- Full inspection metrics (blur variance, luminance, hashes, ELA variance, etc.)
- Recommendation messages
- Indexed fields for fast dashboard queries and duplicate detection lookups

### 6. 📊 Formatted Console Logging
Every processed image prints a structured ASCII inspection report to the terminal including the check results, metrics, and overall verdict.

### 7. 🐳 Docker Support
- `Dockerfile` and `docker-compose.yml` for containerized deployment
- Runs the Node.js app + Redis in containers; connects to MongoDB via environment variable

### 8. 🌱 Database Seeder
- `npm run seed` — Populates MongoDB with sample test records for all 7 test scenarios for local development and testing

---

## 🏗 Architecture & Design

### 1. Service Flow
The system follows a decoupled client-server model:
- **Client (Frontend)**: A vanilla JS single-page dashboard allowing drag-and-drop uploads. It polls the server for status updates and displays real-time processing logs.
- **API Layer (Express.js)**: Handles incoming file uploads via `multer`, saves them locally, generates a MongoDB document, and dispatches the inspection job.
- **Background Workers**: A Node.js worker process picks up queued tasks and executes heavy computer-vision and image processing heuristics independently, preventing the main thread from blocking.

### 2. Processing Flow
When an image is uploaded, it passes through the **5-Point Inspection Engine**:
1. **Initial Parsing**: `metadataService` and `dimensionService` parse EXIF tags and calculate the aspect ratio.
2. **Quality Checks**: `blurDetectionService` (Laplacian variance) and `lightingService` (luminance algorithms) assess visual clarity.
3. **Authenticity Checks**: `photoOfPhotoService` (Moire/EXIF missing) and `tamperDetectionService` (ELA generation/Software tags) check for screen captures or digital manipulation.
4. **Duplicate Check**: `duplicateDetectionService` computes SHA-256 for exact matches and dHash for perceptual similarity against the MongoDB corpus.
5. **Score Calculation**: A weighted scoring algorithm determines the final `Passed`, `Flagged`, or `Failed` status.

### 3. Queue Strategy
The pipeline utilizes **BullMQ** running on **Redis**:
- **Asynchronous Execution**: Uploads immediately return a processing status, allowing the frontend to remain responsive while heavy Sharp/OpenCV operations run in the background.
- **Graceful Synchronous Fallback**: If a Redis connection is unavailable (e.g., local development), the queue system automatically detects the failure and falls back to **direct synchronous processing** to ensure zero API downtime.

### 4. Major Design Decisions
- **Heuristics vs. Deep Learning**: Implemented mathematical image processing heuristics (Laplacian, dHash, Error Level Analysis) instead of heavyweight ML models (PyTorch/TensorFlow). This keeps the system incredibly lightweight, fast (< 200ms per image), zero cloud GPU dependency, and fully deterministic.
- **Modular Services**: Each inspection check is isolated into its own service file (e.g., `blurDetectionService.js`), making the system highly testable, scalable, and easy to extend with future checks.
- **Dual Verification for Duplicates**: Relying solely on SHA-256 hash checks would miss cropped or slightly compressed re-uploads. Integrating perceptual dHash/aHash (Hamming distance comparison) ensures robust near-duplicate detection.
- **Local Disk Storage**: Uploaded images are stored locally in `src/uploads/` with metadata in MongoDB for the scope of this project. *(Production Improvement: Move image blob storage to AWS S3/GCS with CDN URLs).*

---

## 🌐 API Reference

### POST `/api/upload`
Upload a vehicle image for inspection.
- **Body**: `multipart/form-data` with `image` field

```json
{
  "success": true,
  "message": "Image uploaded and queued for 5-point inspection",
  "imageId": "2669e432-32c8-4ba3-b06a-7e242d83d91e",
  "webPath": "/uploads/uuid_image.jpg",
  "status": "processing"
}
```

### GET `/api/images/:id`
Fetch the full inspection report for an image.

```json
{
  "success": true,
  "image": {
    "imageId": "2669e432-32c8-4ba3-b06a-7e242d83d91e",
    "originalName": "vehicle_photo.jpg",
    "overallStatus": "failed",
    "qualityScore": 45,
    "detectedIssues": ["duplicate", "blurry"],
    "flags": {
      "isBlurry": true,
      "isLowLight": false,
      "isDuplicate": true,
      "isScreenshotOrPhotoOfPhoto": false,
      "isEditedOrTampered": false
    },
    "recommendations": [
      "Duplicate image detected! Please upload a unique photo.",
      "Image is blurry. Please capture a sharper photo."
    ]
  }
}
```

### GET `/api/stats`
Dashboard analytics summary.

```json
{
  "success": true,
  "stats": {
    "totalUploaded": 12,
    "passedCount": 6,
    "flaggedCount": 2,
    "failedCount": 4,
    "avgQualityScore": 76.5,
    "issuesBreakdown": {
      "blurry": 2,
      "lowLight": 1,
      "duplicate": 2,
      "screenshot": 1,
      "tampered": 1
    }
  }
}
```

---

## 🚀 Running Instructions

### Prerequisites
- **Node.js** v18+
- **MongoDB Atlas** URI (set in `.env`)
- **Redis** (optional — system works without it via synchronous fallback)

### Environment Variables (`.env`)
```env
PORT=5000
MONGO_URI=mongodb+srv://<user>:<pass>@cluster.mongodb.net/vehicle-inspection
REDIS_URL=redis://localhost:6379
```

### Local Setup

```bash
# 1. Install dependencies
npm install

# 2. Start the server
npm start
# Server runs at http://localhost:5000

# 3. Run automated diagnostic tests
npm test

# 4. Seed the database with sample data
npm run seed

# 5. (Development) Auto-restart on file changes
npm run dev
```

### Docker Setup

```bash
docker-compose up --build
```

---

## 🤖 AI Usage Disclosure

1. **Where AI Was Used**:
   - Generating initial boilerplates for mathematical formulas (Laplacian convolution, Hamming distance bit shifts, ELA pixel difference loops).
   - Drafting initial test case structures for `tests/inspection.test.js`.

2. **What AI Helped With**:
   - Accelerating code structure setup and formulating image processing threshold logic.

3. **Where AI Output Required Debugging**:
   - **dHash Hex Padding**: AI code converted 64-bit binary to hex without enforcing 16-character zero padding, causing mismatched Hamming distance calculations. **Fix**: Added proper 16-char hex zero padding.

4. **Validation**:
   - All AI-assisted algorithms were validated through automated test scripts in `tests/inspection.test.js`, empirical log inspection, and visual verification.

---

## 📌 Assumptions Made

1. Duplicate detection compares against **all previously uploaded images** stored in MongoDB — both exact hash match and perceptual similarity.
2. For environments without an active Redis instance, the backend gracefully falls back to **direct synchronous processing** to guarantee API availability at all times.
3. The system is designed for **single-vehicle photos** — one vehicle per uploaded image.
4. A quality score of **≥ 80** is considered **passed**, **60–79** is **flagged** (minor issues), and **< 60** is **failed**.
