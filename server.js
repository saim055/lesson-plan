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

// ================= AI CLIENT =================
const Groq = require("groq-sdk");
const client = new Groq({ apiKey: process.env.GROQ_API_KEY });

// ================= BASIC CHECKS =================
const templatePath = path.join(__dirname, 'LESSON PLAN TEMPLATE.docx');
const htmlPath = path.join(__dirname, 'enhanced-lesson-planner.html');

console.log("=== STARTUP CHECK ===");
console.log("Template exists:", fs.existsSync(templatePath));
console.log("HTML exists:", fs.existsSync(htmlPath));
console.log("GROQ Key present:", !!process.env.GROQ_API_KEY);
console.log("====================\n");

// ================= SIMPLE FALLBACK AI FUNCTION =================
async function callAI(systemPrompt, userPrompt) {
  try {
    const completion = await client.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      temperature: 0.7,
      max_tokens: 8000,
      response_format: { type: "json_object" }
    });

    let content = completion.choices[0]?.message?.content || "";
    content = content.replace(/```json\n?|\n?```/g, '').trim();
    return JSON.parse(content);
  } catch (err) {
    console.error("AI Call Error:", err.message);
    throw err;
  }
}

// ================= ROUTES =================
app.get('/', (req, res) => {
  if (fs.existsSync(htmlPath)) {
    res.sendFile(htmlPath);
  } else {
    res.send("<h2>Frontend file (enhanced-lesson-planner.html) not found</h2>");
  }
});

app.get('/api/test', (req, res) => {
  res.json({ status: "Server is running", templateOk: fs.existsSync(templatePath) });
});

// MAIN GENERATE ENDPOINT
app.post("/api/generate", upload.single("file"), async (req, res) => {
  console.log("📥 Generate request received for:", req.body.subject, "-", req.body.topic);

  try {
    const { subject, grade, topic, level, period, date, semester, giftedTalented } = req.body;

    if (!subject || !grade || !topic || !level) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    if (!fs.existsSync(templatePath)) {
      return res.status(500).json({ error: "Template file missing" });
    }

    // Simple prompt
    const userPrompt = `Create a lesson plan for ${subject} Grade ${grade}, Topic: ${topic}, Level: ${level}. Return valid JSON.`;

    const systemPrompt = "You are a helpful curriculum designer. Return only valid JSON.";

    const aiData = await callAI(systemPrompt, userPrompt);

    // Prepare template data
    const templateData = {
      date: new Date().toLocaleDateString('en-US'),
      semester: semester || "1",
      grade: grade,
      subject: subject,
      topic: topic,
      period: period || "1",
      value: "Respect",

      standardText: aiData.standardText || "Standard not generated",
      objective1: aiData.objectives?.[0]?.text || "Objective 1",
      objective2: aiData.objectives?.[1]?.text || "Objective 2",
      objective3: aiData.objectives?.[2]?.text || "Objective 3",

      outcomeAll: "All students will understand the topic",
      outcomeMost: "Most students will apply the concepts",
      outcomeSome: "Some students will analyze deeply",

      vocabulary: "Key terms",
      resources: "Resources",
      skills: "Critical thinking",

      starter: aiData.starter || "Starter activity",
      teaching: aiData.teaching || "Teaching section",

      coopSupport: aiData.cooperative?.support || "Support task",
      coopAverage: aiData.cooperative?.average || "Core task",
      coopUpper: aiData.cooperative?.upper || "Challenge task",

      indepSupport: aiData.independent?.support || "Support independent",
      indepAverage: aiData.independent?.average || "Core independent",
      indepUpper: aiData.independent?.upper || "Challenge independent",

      plenary: "Plenary questions",
      realWorld: "Real world connection",
      alnObjectives: giftedTalented === 'yes' ? "Advanced task" : ""
    };

    // Render Document
    const templateContent = fs.readFileSync(templatePath);
    const zip = new PizZip(templateContent);
    const doc = new Docxtemplater(zip, { paragraphLoop: true, linebreaks: true });

    doc.setData(templateData);
    doc.render();

    const buffer = doc.getZip().generate({ type: 'nodebuffer' });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename="Lesson_Plan.docx"`);
    res.send(buffer);

  } catch (error) {
    console.error("🔥 SERVER ERROR:", error);
    res.status(500).json({
      error: "Failed to generate lesson",
      details: error.message,
      suggestion: "Check console for full error"
    });
  }
});

// Start Server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
  console.log(`Test URL: http://localhost:${PORT}/api/test`);
});
