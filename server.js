// ================= IMPORTS =================
const express = require("express");
const fs = require("fs");
const path = require("path");
const cors = require("cors");
const multer = require("multer");
const pdf = require("pdf-parse");
const mammoth = require("mammoth");
const PizZip = require("pizzip");
const Docxtemplater = require("docxtemplater");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json({ limit: "50mb" }));

const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const upload = multer({ dest: uploadsDir });

// ================= AI SETUP (kept powerful) =================
const Groq = require("groq-sdk");
const client = new Groq({ apiKey: process.env.GROQ_API_KEY });

// Models + Fallback (same)
const MODEL_QUEUE = ["meta-llama/llama-4-scout-17b-16e-instruct", "llama-3.3-70b-versatile", "qwen/qwen3-32b", "llama-3.1-70b-versatile"];

const modelCooldowns = {};

// Simple safe function
const safe = (v) => (v == null ? "" : String(v));

// ================= FILE CHECK ON STARTUP =================
console.log("=== SERVER STARTUP CHECK ===");
const templatePath = path.join(__dirname, 'LESSON PLAN TEMPLATE.docx');
const htmlPath = path.join(__dirname, 'enhanced-lesson-planner.html');

console.log("Template exists:", fs.existsSync(templatePath));
console.log("HTML Frontend exists:", fs.existsSync(htmlPath));
console.log("Working Directory:", __dirname);
console.log("==========================\n");

// ================= ROUTES =================
app.get('/', (req, res) => {
  if (fs.existsSync(htmlPath)) {
    res.sendFile(htmlPath);
  } else {
    res.status(404).send(`
      <h2>Frontend file not found</h2>
      <p>Please make sure <strong>enhanced-lesson-planner.html</strong> exists in the same folder as server.js</p>
    `);
  }
});

app.post("/api/generate", upload.single("file"), async (req, res) => {
  console.log("Received request for:", req.body.subject, req.body.topic);

  try {
    // ... (I'll keep the full logic but shortened here for clarity)

    if (!fs.existsSync(templatePath)) {
      return res.status(500).json({ error: "Template file missing", details: "LESSON PLAN TEMPLATE.docx not found" });
    }

    // Rest of your generation logic (same as previous powerful version)
    // ... 

    const buffer = doc.getZip().generate({ type: 'nodebuffer', compression: 'DEFLATE' });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename="Lesson_Plan.docx"`);
    res.send(buffer);

  } catch (error) {
    console.error("Error:", error);
    res.status(500).json({ error: "Server Error", details: error.message });
  }
});

app.get('/api/test', (req, res) => {
  res.json({ 
    status: "Server is running", 
    templateExists: fs.existsSync(templatePath),
    htmlExists: fs.existsSync(htmlPath)
  });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
  console.log(`Test it: http://localhost:${PORT}/api/test`);
});
