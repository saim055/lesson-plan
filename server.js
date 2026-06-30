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

// ================= APP SETUP =================
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

// ================= POWERFUL MULTI-MODEL SYSTEM =================
const MODEL_QUEUE = [
  "meta-llama/llama-4-scout-17b-16e-instruct",
  "llama-3.3-70b-versatile",
  "qwen/qwen3-32b",
  "llama-3.1-70b-versatile",
  "qwen/qwen3.6-27b",
  "openai/gpt-oss-120b",
  "llama-3.1-8b-instant"
];

const modelCooldowns = {};
const modelStats = {};
const requestCache = new Map();

MODEL_QUEUE.forEach(m => modelStats[m] = { success: 0, fail: 0, rateLimited: 0 });

function markModelRateLimited(model) {
  modelCooldowns[model] = Date.now() + (75 * 1000); // 75s with jitter
  modelStats[model].rateLimited++;
  console.log(`🚨 RATE LIMIT → ${model}`);
}

async function callAIWithFallback(systemPrompt, userPrompt) {
  const cacheKey = Buffer.from(userPrompt.substring(0, 200)).toString('base64');
  if (requestCache.has(cacheKey)) return requestCache.get(cacheKey);

  let lastError = null;

  for (let attempt = 0; attempt < 3; attempt++) {
    for (const model of MODEL_QUEUE) {
      if (modelCooldowns[model] && Date.now() < modelCooldowns[model]) continue;

      try {
        console.log(`🤖 Trying ${model} (Attempt ${attempt+1})`);
        const completion = await client.chat.completions.create({
          model,
          messages: [{ role: "system", content: systemPrompt }, { role: "user", content: userPrompt }],
          temperature: attempt === 0 ? 0.6 : 0.75,
          max_tokens: 9500,
          response_format: { type: "json_object" }
        });

        let content = completion.choices[0]?.message?.content;
        if (!content) throw new Error("Empty response");

        content = content.replace(/```json\n?|\n?```/g, '').trim();
        const parsed = JSON.parse(content);

        modelStats[model].success++;
        const result = { content, model, parsed };
        requestCache.set(cacheKey, result);
        if (requestCache.size > 60) requestCache.delete(requestCache.keys().next().value);

        return result;

      } catch (err) {
        lastError = err;
        const isRateLimit = err.status === 429 || err.message?.toLowerCase().includes('rate limit');
        if (isRateLimit) markModelRateLimited(model);
        else modelStats[model].fail++;
      }
    }
  }
  throw lastError || new Error("All models failed");
}

// ================= HELPERS =================
const safe = (v) => (v == null ? "" : String(v));

function getMonthlyValue(date) {
  const values = ['Integrity','Respect','Responsibility','Courage','Compassion','Perseverance','Honesty','Fairness','Generosity','Humility','Tolerance','Peace'];
  return values[new Date(date).getMonth()] || 'Respect';
}

async function extractFileContent(filePath) {
  try {
    if (filePath.endsWith('.pdf')) {
      const data = await pdf(fs.readFileSync(filePath));
      return data.text;
    } else if (filePath.endsWith('.docx')) {
      const result = await mammoth.extractRawText({ path: filePath });
      return result.value;
    }
  } catch (e) { console.error('File error:', e); }
  return '';
}

// ================= EXPANDED STANDARDS FRAMEWORK (American Curriculum) =================
const STANDARDS_FRAMEWORK = {
  mathematics: { default: "Common Core State Standards for Mathematics" },
  science: { default: "Next Generation Science Standards (NGSS)" },
  english: { default: "Common Core State Standards for English Language Arts" },
  biology: { default: "NGSS + AP Biology" },
  chemistry: { default: "NGSS + AP Chemistry" },
  physics: { default: "NGSS + AP Physics" },
  geometry: { default: "Common Core State Standards for Mathematics - Geometry" },
  'pre-calculus': { default: "Common Core State Standards for Mathematics - Precalculus" },
  calculus: { default: "AP Calculus AB/BC College Board Standards" },
  'physical education': { default: "SHAPE America National Standards for Physical Education" },
  'public speaking': { default: "Common Core State Standards for English Language Arts - Speaking and Listening" },
  economics: { default: "National Standards for Financial Literacy + Council for Economic Education" },
  business: { default: "Business Education Standards - National Business Education Association" },
  arts: { default: "National Core Arts Standards" },
  'digital arts': { default: "National Core Arts Standards - Media Arts" },
  geography: { default: "National Geography Standards - Geography Education National Implementation Project" },
  default: "Common Core State Standards"
};

function getStandardsFramework(subject) {
  const s = subject.toLowerCase();
  if (s.includes('math') || s.includes('calculus') || s.includes('geometry') || s.includes('algebra')) 
    return STANDARDS_FRAMEWORK.mathematics.default;
  if (s.includes('biology')) return STANDARDS_FRAMEWORK.biology.default;
  if (s.includes('chemistry')) return STANDARDS_FRAMEWORK.chemistry.default;
  if (s.includes('physics')) return STANDARDS_FRAMEWORK.physics.default;
  if (s.includes('science')) return STANDARDS_FRAMEWORK.science.default;
  if (s.includes('english') || s.includes('language arts') || s.includes('reading') || s.includes('writing')) 
    return STANDARDS_FRAMEWORK.english.default;
  if (s.includes('physical') || s.includes('pe')) return STANDARDS_FRAMEWORK['physical education'].default;
  if (s.includes('public speaking') || s.includes('speech')) return STANDARDS_FRAMEWORK['public speaking'].default;
  if (s.includes('economic')) return STANDARDS_FRAMEWORK.economics.default;
  if (s.includes('business')) return STANDARDS_FRAMEWORK.business.default;
  if (s.includes('digital art') || s.includes('media art')) return STANDARDS_FRAMEWORK['digital arts'].default;
  if (s.includes('art')) return STANDARDS_FRAMEWORK.arts.default;
  if (s.includes('geograph')) return STANDARDS_FRAMEWORK.geography.default;
  
  return STANDARDS_FRAMEWORK.default;
}

// ================= ENHANCED EXPERT PROMPT =================
const EXPERT_SYSTEM_PROMPT = `You are a world-class American curriculum expert and master lesson planner.

Generate outstanding, inspection-ready lesson plans aligned with American standards (Common Core, NGSS, AP, SHAPE America, National Core Arts, etc.).

You MUST follow the full structure and requirements from the original instructions. 
Be highly detailed, student-centered, and subject-appropriate.
For Arts/Digital Arts: focus on creativity, technique, critique.
For PE: focus on skills, fitness, safety.
For Economics/Business: real-world applications and financial literacy.
For Public Speaking: communication skills, audience awareness.
For all subjects: maintain high rigor and differentiation.`;

const DOK_PROFILE = {
  introductory: ["DOK1", "DOK2", "DOK3"],
  intermediate: ["DOK2", "DOK3", "DOK4"],
  mastery: ["DOK3", "DOK4", "DOK4"]
};

// ================= API ROUTE =================
app.post("/api/generate", upload.single("file"), async (req, res) => {
  console.log('\n🚀 NEW REQUEST -', req.body.subject, req.body.topic);

  try {
    const { subject, grade, topic, level, period, date, semester, giftedTalented } = req.body;

    if (!subject || !grade || !topic || !level) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const standardsFramework = getStandardsFramework(subject);
    const dokLevels = DOK_PROFILE[level.toLowerCase()] || DOK_PROFILE.introductory;

    let syllabusContent = "";
    if (req.file) {
      syllabusContent = await extractFileContent(req.file.path);
      fs.unlinkSync(req.file.path).catch(() => {});
    }

    const userPrompt = `Create a detailed lesson plan for:
- Subject: ${subject}
- Grade: ${grade}
- Topic: ${topic}
- Level: ${level}
- Standards: ${standardsFramework}
- DOK: ${dokLevels.join(', ')}

${syllabusContent ? `SYLLABUS CONTEXT: ${syllabusContent}` : ''}
${giftedTalented === 'yes' ? 'Include ALN objective for gifted students.' : ''}

Follow the exact JSON structure and all detailed requirements.`;

    const result = await callAIWithFallback(EXPERT_SYSTEM_PROMPT, userPrompt);
    const aiData = result.parsed;

    const templateData = {
      date: safe(new Date(date).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' })),
      semester: safe(semester || '1'),
      grade: safe(grade),
      subject: safe(subject),
      topic: safe(topic),
      period: safe(period || '1'),
      value: safe(getMonthlyValue(date)),

      standardText: safe(aiData.standardText || `${standardsFramework} - ${topic}`),

      objective1: safe(aiData.objectives?.[0]?.text),
      objective2: safe(aiData.objectives?.[1]?.text),
      objective3: safe(aiData.objectives?.[2]?.text),

      outcomeAll: safe(aiData.outcomes?.all?.text),
      outcomeMost: safe(aiData.outcomes?.most?.text),
      outcomeSome: safe(aiData.outcomes?.some?.text),

      vocabulary: safe(Array.isArray(aiData.vocabulary) ? aiData.vocabulary.join('\n') : aiData.vocabulary || ''),
      resources: safe(Array.isArray(aiData.resources) ? aiData.resources.join('\n') : aiData.resources || ''),
      skills: safe(aiData.skills || ''),

      starter: safe(aiData.starter),
      teaching: safe(aiData.teaching),

      coopSupport: safe(aiData.cooperative?.support),
      coopAverage: safe(aiData.cooperative?.average),
      coopUpper: safe(aiData.cooperative?.upper),

      indepSupport: safe(aiData.independent?.support),
      indepAverage: safe(aiData.independent?.average),
      indepUpper: safe(aiData.independent?.upper),

      plenary: safe(Array.isArray(aiData.plenary) ? aiData.plenary.map((p,i) => `${i+1}. (${p.dok}) ${p.q}`).join('\n') : ''),

      myIdentity: safe(aiData.identity ? `Domain: ${aiData.identity.domain} - Element: ${aiData.identity.element}\n\n${aiData.identity.description}` : ''),
      moralEducation: safe(aiData.moralEducation),
      steam: safe(aiData.steam),
      linksToSubjects: safe(aiData.linksToSubjects),
      environment: safe(aiData.environment),
      realWorld: safe(aiData.realWorld),
      alnObjectives: giftedTalented === 'yes' ? safe(aiData.alnObjective || '') : ''
    };

    // Render Docx (unchanged)
    const templatePath = path.join(__dirname, 'LESSON PLAN TEMPLATE.docx');
    const zip = new PizZip(fs.readFileSync(templatePath));
    const doc = new Docxtemplater(zip, { paragraphLoop: true, linebreaks: true });

    doc.setData(templateData);
    doc.render();

    const buffer = doc.getZip().generate({ type: 'nodebuffer', compression: 'DEFLATE' });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename="Lesson_Plan_${subject.replace(/\s+/g,'_')}_${topic.replace(/\s+/g,'_')}.docx"`);
    res.send(buffer);

    console.log(`✅ Generated successfully using ${result.model}`);

  } catch (error) {
    console.error('Generation Error:', error);
    res.status(500).json({ error: 'Failed to generate lesson plan', details: error.message });
  }
});

// Test Route
app.get('/api/test', (req, res) => res.json({ status: 'WAAO POWERFUL', models: MODEL_QUEUE }));

// Start Server
app.listen(PORT, '0.0.0.0', () => {
  console.log('═══════════════════════════════════════════════');
  console.log('   🔥 WAAO POWERFUL UNIVERSAL LESSON PLANNER 🔥');
  console.log('═══════════════════════════════════════════════');
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log('✅ Supports ALL American Curriculum Subjects');
  console.log('🛡️  Advanced Rate Limit Protection Active');
  console.log('═══════════════════════════════════════════════\n');
});
  
