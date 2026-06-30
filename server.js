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
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const upload = multer({ dest: uploadsDir });

// ================= AI CLIENT =================
const Groq = require("groq-sdk");
const client = new Groq({
  apiKey: process.env.GROQ_API_KEY
});

// ================= STRONGER EXPERT PROMPT (Keep your original if you want, but this is improved) =================
const EXPERT_SYSTEM_PROMPT = `You are an expert curriculum designer...`; // Put your full original long prompt here

// Keep your original helper functions (getMonthlyValue, extractFileContent, etc.)

// ================= API ROUTE - FIXED =================
app.post("/api/generate", upload.single("file"), async (req, res) => {
  console.log('\n========== NEW REQUEST ==========');

  try {
    const {
      subject, grade, topic, level, period, date, semester, giftedTalented
    } = req.body;

    // ... (your validation and file extraction code remains the same)

    const standardsFramework = getStandardsFramework(subject, grade);

    let syllabusContent = "";
    if (req.file) {
      syllabusContent = await extractFileContent(req.file.path);
      fs.unlinkSync(req.file.path).catch(() => {});
    }

    const userPrompt = `Generate a comprehensive lesson plan for:
Subject: ${subject}
Grade: ${grade}
Topic: ${topic}
Level: ${level}
Standards: ${standardsFramework}
${syllabusContent ? `Syllabus: ${syllabusContent}` : ''}`;

    // Call AI
    const completion = await client.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [
        { role: "system", content: EXPERT_SYSTEM_PROMPT },
        { role: "user", content: userPrompt }
      ],
      temperature: 0.7,
      max_tokens: 9000,
      response_format: { type: "json_object" }
    });

    let content = completion.choices[0].message.content;
    content = content.replace(/```json\n?|\n?```/g, '').trim();
    const aiData = JSON.parse(content);

    // === FIXED & ROBUST TEMPLATE DATA ===
    const templateData = {
      date: safe(new Date(date).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' })),
      semester: safe(semester || '1'),
      grade: safe(grade),
      subject: safe(subject),
      topic: safe(topic),
      period: safe(period || '1'),
      value: safe(getMonthlyValue(date)),

      standardText: safe(aiData.standardText || aiData.standard || `${standardsFramework} - ${topic}`),

      objective1: safe(aiData.objectives?.[0]?.text || aiData.objective1),
      objective2: safe(aiData.objectives?.[1]?.text || aiData.objective2),
      objective3: safe(aiData.objectives?.[2]?.text || aiData.objective3),

      outcomeAll: safe(aiData.outcomes?.all?.text || aiData.outcomeAll || "All students will understand the basic concepts"),
      outcomeMost: safe(aiData.outcomes?.most?.text || aiData.outcomeMost || "Most students will apply the concepts"),
      outcomeSome: safe(aiData.outcomes?.some?.text || aiData.outcomeSome || "Some students will analyze and evaluate"),

      vocabulary: safe(Array.isArray(aiData.vocabulary) ? aiData.vocabulary.join('\n') : aiData.vocabulary || "Key terms from the topic"),
      resources: safe(Array.isArray(aiData.resources) ? aiData.resources.join('\n') : aiData.resources || "Textbook, worksheets"),
      skills: safe(aiData.skills || "Critical thinking, problem solving"),

      starter: safe(aiData.starter || "Engaging starter activity"),
      teaching: safe(aiData.teaching || "Detailed teaching component"),

      coopSupport: safe(aiData.cooperative?.support || aiData.coopSupport),
      coopAverage: safe(aiData.cooperative?.average || aiData.coopAverage),
      coopUpper: safe(aiData.cooperative?.upper || aiData.coopUpper),

      indepSupport: safe(aiData.independent?.support || aiData.indepSupport),
      indepAverage: safe(aiData.independent?.average || aiData.indepAverage),
      indepUpper: safe(aiData.independent?.upper || aiData.indepUpper),

      plenary: safe(Array.isArray(aiData.plenary) ? aiData.plenary.map(p => p.q || p).join('\n') : aiData.plenary || "Review questions"),

      realWorld: safe(aiData.realWorld || aiData.realworld || "Real life applications"),
      alnObjectives: giftedTalented === 'yes' ? safe(aiData.alnObjective) : ""
    };

    // Render Template (your original code)
    const templatePath = path.join(__dirname, 'LESSON PLAN TEMPLATE.docx');
    const templateContent = fs.readFileSync(templatePath);
    const zip = new PizZip(templateContent);
    const doc = new Docxtemplater(zip, { paragraphLoop: true, linebreaks: true });

    doc.setData(templateData);
    doc.render();

    const buffer = doc.getZip().generate({ type: 'nodebuffer', compression: 'DEFLATE' });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename="Lesson_Plan_G${grade}_${subject}_${topic.replace(/\s+/g, '_')}.docx"`);
    res.send(buffer);

  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: error.message });
  }
});

function safe(v) {
  return (v === undefined || v === null) ? "" : String(v);
}

// Start Server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
