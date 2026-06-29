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

// Environment variable debugging
console.log('=== STARTUP DEBUG ===');
console.log('GROQ_API_KEY present:', !!process.env.GROQ_API_KEY);
console.log('GROQ_API_KEY length:', process.env.GROQ_API_KEY?.length || 0);
console.log('PORT:', process.env.PORT || 'default');
console.log('NODE_ENV:', process.env.NODE_ENV || 'development');
console.log('Working directory:', __dirname);
console.log('=== END STARTUP DEBUG ===');

// ================= APP SETUP =================
const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json({ limit: "50mb" }));

// Ensure uploads directory exists
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

// ================= MODEL CONFIGURATION =================
// Best models prioritized for quality and rate limit management
const MODELS = [
  // Primary models - best quality
  "llama-3.3-70b-versatile",
  "meta-llama/llama-4-scout-17b-16e-instruct",
  "qwen/qwen3-32b",
  "qwen/qwen3.6-27b",
  "openai/gpt-oss-120b",
  "openai/gpt-oss-20b",
  "groq/compound",
  "groq/compound-mini",
  "llama-3.1-8b-instant"
];

// Rate limit tracking
let modelUsage = {};
let lastRequestTime = 0;
const MIN_REQUEST_INTERVAL = 200; // ms between requests to avoid rate limits

// ================= HELPER FUNCTIONS =================
const safe = (v) => (v === undefined || v === null ? "" : String(v));

function getMonthlyValue(date) {
  const month = new Date(date).getMonth();
  const values = ['Integrity', 'Respect', 'Responsibility', 'Courage', 'Compassion', 'Perseverance', 'Honesty', 'Fairness', 'Generosity', 'Humility', 'Tolerance', 'Peace'];
  return values[month] || 'Respect';
}

async function extractFileContent(filePath) {
  try {
    if (filePath.endsWith('.pdf')) {
      const dataBuffer = fs.readFileSync(filePath);
      const pdfData = await pdf(dataBuffer);
      return pdfData.text;
    } else if (filePath.endsWith('.docx')) {
      const result = await mammoth.extractRawText({ path: filePath });
      return result.value;
    }
  } catch (error) {
    console.error('File extraction error:', error);
  }
  return '';
}

const DOK_PROFILE = {
  introductory: ["DOK1", "DOK2", "DOK3"],
  intermediate: ["DOK2", "DOK3", "DOK4"],
  mastery: ["DOK3", "DOK4", "DOK4"]
};

// ================= STANDARDS MAPPING =================
const STANDARDS_FRAMEWORK = {
  mathematics: { default: 'Common Core State Standards for Mathematics - High School' },
  science: { default: 'Next Generation Science Standards (NGSS)' },
  english: { default: 'Common Core State Standards for English Language Arts' },
  'computer science': { default: 'Computer Science Teachers Association (CSTA) K-12 Standards' },
  'islamic studies': { default: 'UAE Ministry of Education Islamic Education Standards' },
  'physical education': { default: 'UAE Ministry of Education Physical and Health Education Curriculum' },
  default: 'California Common Core State Standards'
};

function getStandardsFramework(subject, grade) {
  const s = subject.toLowerCase();
  if (s.includes('islamic')) return STANDARDS_FRAMEWORK['islamic studies'].default;
  if (s.includes('physical') || s.includes('pe')) return STANDARDS_FRAMEWORK['physical education'].default;
  if (s.includes('math') || s.includes('calculus') || s.includes('algebra') || s.includes('geometry')) 
    return STANDARDS_FRAMEWORK.mathematics.default;
  if (s.includes('science') || s.includes('physics') || s.includes('chemistry') || s.includes('biology')) 
    return STANDARDS_FRAMEWORK.science.default;
  if (s.includes('english') || s.includes('language arts')) 
    return STANDARDS_FRAMEWORK.english.default;
  if (s.includes('computer') || s.includes('coding')) 
    return STANDARDS_FRAMEWORK['computer science'].default;
  return STANDARDS_FRAMEWORK.default;
}

// ================= EXPERT SYSTEM PROMPT (COMPRESSED) =================
const EXPERT_SYSTEM_PROMPT = `You are an expert curriculum designer. Generate an outstanding, inspection-ready lesson plan.

Follow ALL rules strictly:

1. LESSON LEVEL & DOK:
- Introductory: DOK 1,2,3
- Intermediate: DOK 2,3,4
- Mastery: DOK 3,4,4

2. OBJECTIVES: Exactly 3 SMART objectives. Format: "[ACTION VERB] [CONTENT] [CONTEXT] (DOK X)"

3. STANDARDS: Provide EXACT standard code + full description.

4. DIFFERENTIATED OUTCOMES: All/Most/Some students.

5. STARTER: Highly engaging, inquiry-based hook (10 seconds).

6. TEACHING & LEARNING: Detailed student-centered narrative (300+ words) with Socratic questions, modeling, think-aloud, formative checks.

7. COOPERATIVE TASKS: 3 distinct tasks (Support DOK1-2, Average DOK2-3, Upper DOK3-4) with clear steps, scaffolds, deliverables.

8. INDEPENDENT TASKS: 3 different tasks (Support, Average, Upper) with clear instructions and success criteria.

9. PLENARY: 4-5 questions across DOK levels.

10. VOCABULARY, RESOURCES, SKILLS, CROSS-CURRICULAR (My Identity), Real-World Connections.

Return ONLY valid JSON in this exact structure:
{
  "standardText": "...",
  "objectives": [{"text": "...", "dok": "DOKX"}, ...],
  "outcomes": {"all": {"text": "..."}, "most": {"text": "..."}, "some": {"text": "..."}},
  "vocabulary": ["term: def", ...],
  "resources": ["Resource - link", ...],
  "skills": "skill1, skill2...",
  "starter": "...",
  "teaching": "... (detailed 300+ words)",
  "cooperative": {"support": "...", "average": "...", "upper": "..."},
  "independent": {"support": "...", "average": "...", "upper": "..."},
  "plenary": [{"q": "...", "dok": "DOK1"}, ...],
  "identity": {"domain": "...", "element": "...", "description": "..."},
  "moralEducation": "...",
  "steam": "...",
  "linksToSubjects": "...",
  "environment": "...",
  "realWorld": "...",
  "alnObjective": "..."
}`;

// ================= STATIC FILES =================
app.get('/', (req, res) => {
  const htmlPath = path.join(__dirname, 'enhanced-lesson-planner.html');
  fs.existsSync(htmlPath) ? res.sendFile(htmlPath) : res.status(404).json({ error: 'Frontend not found' });
});

// ================= AI REQUEST FUNCTION WITH FALLBACK =================
async function makeAIRequestWithFallback(userPrompt, retryCount = 0) {
  // Rate limiting
  const now = Date.now();
  const timeSinceLastRequest = now - lastRequestTime;
  if (timeSinceLastRequest < MIN_REQUEST_INTERVAL) {
    await new Promise(resolve => setTimeout(resolve, MIN_REQUEST_INTERVAL - timeSinceLastRequest));
  }
  lastRequestTime = Date.now();

  // Build list of available models (exclude those recently rate-limited)
  const availableModels = MODELS.filter(model => {
    const usage = modelUsage[model] || { failures: 0, lastFailure: 0 };
    // If model failed more than 3 times in last 5 minutes, skip it
    if (usage.failures >= 3 && (Date.now() - usage.lastFailure) < 300000) {
      return false;
    }
    return true;
  });

  if (availableModels.length === 0) {
    // Reset model usage if all models are failing
    console.log('All models rate limited, resetting usage tracking');
    modelUsage = {};
    // Wait 30 seconds before retry
    await new Promise(resolve => setTimeout(resolve, 30000));
    return makeAIRequestWithFallback(userPrompt, retryCount + 1);
  }

  // Try models in order of priority
  for (let i = 0; i < availableModels.length; i++) {
    const model = availableModels[i];
    console.log(`Attempting with model: ${model} (attempt ${i + 1}/${availableModels.length})`);
    
    try {
      const completion = await client.chat.completions.create({
        model: model,
        messages: [
          { role: "system", content: EXPERT_SYSTEM_PROMPT },
          { role: "user", content: userPrompt }
        ],
        temperature: 0.7,
        max_tokens: 8000,
        response_format: { type: "json_object" }
      });

      // Success - reset failure count for this model
      modelUsage[model] = { failures: 0, lastFailure: 0, lastSuccess: Date.now() };
      console.log(`✅ Success with model: ${model}`);
      return completion;

    } catch (error) {
      console.error(`❌ Error with model ${model}:`, error.message);
      
      // Track failure
      if (!modelUsage[model]) {
        modelUsage[model] = { failures: 0, lastFailure: 0 };
      }
      modelUsage[model].failures += 1;
      modelUsage[model].lastFailure = Date.now();

      // Check if this is a rate limit error
      if (error.message && (error.message.includes('rate_limit') || error.message.includes('429'))) {
        console.log(`Rate limit hit for ${model}, moving to next model`);
        // Wait longer for rate limit - exponential backoff
        const waitTime = Math.min(1000 * Math.pow(2, retryCount + i), 10000);
        await new Promise(resolve => setTimeout(resolve, waitTime));
        continue;
      }

      // For other errors, try next model
      if (i < availableModels.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }
  }

  // If we've tried all models and failed, retry with backoff
  if (retryCount < 3) {
    console.log(`All models failed, retrying (attempt ${retryCount + 1}/3)`);
    await new Promise(resolve => setTimeout(resolve, 5000 * (retryCount + 1)));
    return makeAIRequestWithFallback(userPrompt, retryCount + 1);
  }

  throw new Error('All AI models failed after multiple attempts. Please try again later.');
}

// ================= API ROUTE =================
app.post("/api/generate", upload.single("file"), async (req, res) => {
  console.log('\n========== NEW LESSON GENERATION REQUEST ==========');

  try {
    const { subject, grade, topic, level, period, date, semester, lessonType, giftedTalented } = req.body;

    if (!subject || !grade || !topic || !level) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const standardsFramework = getStandardsFramework(subject, grade);
    const dokLevels = DOK_PROFILE[level.toLowerCase()] || DOK_PROFILE.introductory;

    let syllabusContent = "";
    if (req.file) {
      syllabusContent = await extractFileContent(req.file.path);
      try { fs.unlinkSync(req.file.path); } catch (e) {}
    }

    const userPrompt = `Generate lesson plan:
Subject: ${subject}
Grade: ${grade}
Topic: ${topic}
Level: ${level}
Standards: ${standardsFramework}
DOK: ${dokLevels.join(', ')}
${syllabusContent ? `SYLLABUS:\n${syllabusContent}\n` : ''}
${giftedTalented === 'yes' ? 'Include ALN objective for gifted students' : ''}

Return JSON only following the exact structure in system prompt.`;

    // Use the robust AI request with fallback
    const completion = await makeAIRequestWithFallback(userPrompt);
    
    const aiResponse = completion.choices[0]?.message?.content;
    const cleanJson = aiResponse.replace(/```json\n?|\n?```/g, '').trim();
    const aiData = JSON.parse(cleanJson);

    const templateData = {
      date: safe(new Date(date).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' })),
      semester: safe(semester || '1'),
      grade: safe(grade),
      subject: safe(subject),
      topic: safe(topic),
      period: safe(period || '1'),
      value: safe(getMonthlyValue(date)),
      standardText: safe(aiData.standardText),
      objective1: safe(aiData.objectives?.[0]?.text),
      objective2: safe(aiData.objectives?.[1]?.text),
      objective3: safe(aiData.objectives?.[2]?.text),
      outcomeAll: safe(aiData.outcomes?.all?.text),
      outcomeMost: safe(aiData.outcomes?.most?.text),
      outcomeSome: safe(aiData.outcomes?.some?.text),
      vocabulary: safe(Array.isArray(aiData.vocabulary) ? aiData.vocabulary.join('\n') : aiData.vocabulary),
      resources: safe(Array.isArray(aiData.resources) ? aiData.resources.join('\n') : aiData.resources),
      skills: safe(aiData.skills),
      starter: safe(aiData.starter),
      teaching: safe(aiData.teaching),
      coopSupport: safe(aiData.cooperative?.support),
      coopAverage: safe(aiData.cooperative?.average),
      coopUpper: safe(aiData.cooperative?.upper),
      indepSupport: safe(aiData.independent?.support),
      indepAverage: safe(aiData.independent?.average),
      indepUpper: safe(aiData.independent?.upper),
      plenary: safe(Array.isArray(aiData.plenary) ? aiData.plenary.map((p,i) => `${i+1}. (${p.dok}) ${p.q}`).join('\n') : aiData.plenary),
      myIdentity: safe(aiData.identity ? `Domain: ${aiData.identity.domain} - Element: ${aiData.identity.element}\n\n${aiData.identity.description}` : ''),
      identityDomain: safe(aiData.identity?.domain),
      identityElement: safe(aiData.identity?.element),
      identityDescription: safe(aiData.identity?.description),
      moralEducation: safe(aiData.moralEducation),
      steam: safe(aiData.steam),
      linksToSubjects: safe(aiData.linksToSubjects),
      environment: safe(aiData.environment),
      realWorld: safe(aiData.realWorld),
      alnObjectives: giftedTalented === 'yes' ? safe(aiData.alnObjective) : ''
    };

    // Load and render template
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

    console.log('========== LESSON GENERATION COMPLETE ==========');

  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

// ================= MODEL STATUS ENDPOINT =================
app.get('/api/models/status', (req, res) => {
  const status = {};
  MODELS.forEach(model => {
    const usage = modelUsage[model] || { failures: 0, lastFailure: 0, lastSuccess: 0 };
    status[model] = {
      available: !(usage.failures >= 3 && (Date.now() - usage.lastFailure) < 300000),
      failures: usage.failures || 0,
      lastFailure: usage.lastFailure ? new Date(usage.lastFailure).toISOString() : 'never',
      lastSuccess: usage.lastSuccess ? new Date(usage.lastSuccess).toISOString() : 'never'
    };
  });
  res.json({ models: status });
});

// Test endpoint
app.get('/api/test', (req, res) => {
  res.json({ 
    status: 'OK', 
    message: 'Enhanced Expert Lesson Plan Server is running',
    models: MODELS,
    timestamp: new Date().toISOString()
  });
});

// ================= START SERVER =================
app.listen(PORT, '0.0.0.0', () => {
  console.log('═══════════════════════════════════════════════');
  console.log(' ENHANCED EXPERT LESSON PLAN SERVER');
  console.log('═══════════════════════════════════════════════');
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`🤖 AI Models (${MODELS.length} available):`);
  MODELS.forEach((model, index) => {
    console.log(`   ${index + 1}. ${model}`);
  });
  console.log('🔄 Rate Limit Protection: ENABLED');
  console.log('📊 Model Status: /api/models/status');
  console.log('═══════════════════════════════════════════════\n');
});

