import express from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";
import cors from "cors";
import multer from "multer";
import mammoth from "mammoth";
import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";
import dotenv from "dotenv";
import Groq from "groq-sdk";
import { createServer as createViteServer } from "vite";

const require = createRequire(import.meta.url);
const pdf = require("pdf-parse");

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ================= ENV VAR CHECK =================
console.log('=== STARTUP DEBUG ===');
console.log('Environment Variables:');
console.log('GROQ_API_KEY present:', !!process.env.GROQ_API_KEY);
console.log('GROQ_API_KEY length:', process.env.GROQ_API_KEY?.length || 0);
console.log('PORT:', process.env.PORT || 'default (3000)');
console.log('NODE_ENV:', process.env.NODE_ENV || 'development');
console.log('Working directory:', process.cwd());
console.log('=== END STARTUP DEBUG ===');

// ================= APP SETUP =================
const app = express();
const PORT = parseInt(process.env.PORT || "3000", 10);

app.use(cors());
app.use(express.json({ limit: "50mb" }));

// Ensure uploads directory exists
const uploadsDir = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const upload = multer({ dest: uploadsDir });

// ================= MULTI-MODEL FALLBACK SYSTEM (Rate Limit Solution) =================
const MODEL_QUEUE = [
  "meta-llama/llama-4-scout-17b-16e-instruct",
  "llama-3.3-70b-versatile",
  "qwen/qwen3-32b",
  "qwen/qwen3.6-27b",
  "llama-3.1-70b-versatile",
  "openai/gpt-oss-120b",
  "llama-3.1-8b-instant"
];

// In-memory model cooldown timers (cooldown expires at this timestamp)
const modelCooldowns: Record<string, number> = {};
const COOLDOWN_DURATION = 60 * 1000; // 60 seconds cooldown for rate limits

// Lazy Groq initialization helper
let groqClient: Groq | null = null;
function getGroqClient(): Groq {
  if (!groqClient) {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      throw new Error("GROQ_API_KEY environment variable is required. Please add it to your secrets or environment configuration.");
    }
    groqClient = new Groq({ apiKey });
  }
  return groqClient;
}

// Multi-Model Fallback Execution Wrapper
async function executeChatCompletionWithFallback(messages: any[], baseOptions: any = {}) {
  const client = getGroqClient();
  const now = Date.now();

  // Find models that are not on cooldown
  let availableModels = MODEL_QUEUE.filter(model => {
    const cooldownUntil = modelCooldowns[model] || 0;
    return now >= cooldownUntil;
  });

  // If all models in the queue are currently cooling down, reset them to ensure continuity
  if (availableModels.length === 0) {
    console.warn("⚠️ All models in queue are on cooldown. Resetting cooldown states to avoid outage.");
    for (const model of MODEL_QUEUE) {
      delete modelCooldowns[model];
    }
    availableModels = [...MODEL_QUEUE];
  }

  let lastError: any = null;

  // Attempt the request with available models in order of preference
  for (const model of availableModels) {
    console.log(`🤖 Attempting AI completion with model: ${model}`);
    try {
      const completion = await client.chat.completions.create({
        ...baseOptions,
        model: model,
        messages: messages
      });

      console.log(`✅ AI Completion successful using model: ${model}`);
      return {
        completion,
        usedModel: model
      };
    } catch (error: any) {
      console.error(`❌ Error with model ${model}:`, error.message || error);
      
      const statusCode = error.status || error.statusCode;
      const errorMsg = String(error.message || "").toLowerCase();
      
      const isRateLimit = statusCode === 429 || 
                          errorMsg.includes("rate limit") || 
                          errorMsg.includes("429") || 
                          errorMsg.includes("limit reached") ||
                          errorMsg.includes("too many requests");
                          
      const isOverloadedOrUnavailable = statusCode >= 500 || 
                                       errorMsg.includes("overloaded") || 
                                       errorMsg.includes("unavailable") || 
                                       errorMsg.includes("capacity");

      if (isRateLimit || isOverloadedOrUnavailable) {
        modelCooldowns[model] = Date.now() + COOLDOWN_DURATION;
        console.warn(`⏳ Model ${model} marked as cooled down for 60 seconds due to rate limit/overload.`);
      }

      lastError = error;
    }
  }

  throw new Error(`All models in the Multi-Model Fallback Queue failed. Last error: ${lastError?.message || lastError}`);
}

// ================= AUTO-HEALING DOCX TEMPLATE CREATOR =================
const templatePath = path.join(process.cwd(), 'LESSON PLAN TEMPLATE.docx');

function ensureTemplateExists() {
  if (!fs.existsSync(templatePath)) {
    console.log("📝 LESSON PLAN TEMPLATE.docx not found. Creating a default high-quality template programmatically...");
    try {
      const zip = new PizZip();
      
      // 1. [Content_Types].xml
      zip.file("[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`);

      // 2. _rels/.rels
      zip.file("_rels/.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`);

      // 3. word/document.xml
      const docXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="36"/></w:rPr><w:t>LESSON PLAN: {topic}</w:t></w:r></w:p>
    <w:p><w:r><w:rPr><w:sz w:val="24"/></w:rPr><w:t>Subject: {subject} | Grade: {grade} | Date: {date} | Semester: {semester} | Period: {period}</w:t></w:r></w:p>
    <w:p><w:r><w:rPr><w:sz w:val="24"/></w:rPr><w:t>Standard Framework: {standardText}</w:t></w:r></w:p>
    <w:p><w:r><w:rPr><w:sz w:val="24"/></w:rPr><w:t>Value of the Month: {value}</w:t></w:r></w:p>
    
    <w:p><w:pPr><w:pStyle w:val="Heading2"/></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="28"/></w:rPr><w:t>SMART Learning Objectives</w:t></w:r></w:p>
    <w:p><w:r><w:t>1. {objective1}</w:t></w:r></w:p>
    <w:p><w:r><w:t>2. {objective2}</w:t></w:r></w:p>
    <w:p><w:r><w:t>3. {objective3}</w:t></w:r></w:p>
    
    <w:p><w:pPr><w:pStyle w:val="Heading2"/></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="28"/></w:rPr><w:t>Differentiated Learning Outcomes</w:t></w:r></w:p>
    <w:p><w:r><w:b/><w:t>All Students: </w:t></w:r><w:r><w:t>{outcomeAll}</w:t></w:r></w:p>
    <w:p><w:r><w:b/><w:t>Most Students: </w:t></w:r><w:r><w:t>{outcomeMost}</w:t></w:r></w:p>
    <w:p><w:r><w:b/><w:t>Some Students: </w:t></w:r><w:r><w:t>{outcomeSome}</w:t></w:r></w:p>
    
    <w:p><w:pPr><w:pStyle w:val="Heading2"/></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="28"/></w:rPr><w:t>Vocabulary &amp; Resources</w:t></w:r></w:p>
    <w:p><w:r><w:b/><w:t>Vocabulary: </w:t></w:r><w:r><w:t>{vocabulary}</w:t></w:r></w:p>
    <w:p><w:r><w:b/><w:t>Resources: </w:t></w:r><w:r><w:t>{resources}</w:t></w:r></w:p>
    <w:p><w:r><w:b/><w:t>Transferable Skills: </w:t></w:r><w:r><w:t>{skills}</w:t></w:r></w:p>
    
    <w:p><w:pPr><w:pStyle w:val="Heading2"/></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="28"/></w:rPr><w:t>Starter Activity (Attention Grabbing)</w:t></w:r></w:p>
    <w:p><w:r><w:t>{starter}</w:t></w:r></w:p>
    
    <w:p><w:pPr><w:pStyle w:val="Heading2"/></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="28"/></w:rPr><w:t>Teaching &amp; Learning Component (Socratic &amp; Modelled)</w:t></w:r></w:p>
    <w:p><w:r><w:t>{teaching}</w:t></w:r></w:p>
    
    <w:p><w:pPr><w:pStyle w:val="Heading2"/></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="28"/></w:rPr><w:t>Cooperative Learning Tasks</w:t></w:r></w:p>
    <w:p><w:r><w:b/><w:t>Support Group (DOK 1-2): </w:t></w:r><w:r><w:t>{coopSupport}</w:t></w:r></w:p>
    <w:p><w:r><w:b/><w:t>Core/Average Group (DOK 2-3): </w:t></w:r><w:r><w:t>{coopAverage}</w:t></w:r></w:p>
    <w:p><w:r><w:b/><w:t>Challenge/Upper Group (DOK 3-4): </w:t></w:r><w:r><w:t>{coopUpper}</w:t></w:r></w:p>
    
    <w:p><w:pPr><w:pStyle w:val="Heading2"/></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="28"/></w:rPr><w:t>Independent Practice Tasks</w:t></w:r></w:p>
    <w:p><w:r><w:b/><w:t>Support: </w:t></w:r><w:r><w:t>{indepSupport}</w:t></w:r></w:p>
    <w:p><w:r><w:b/><w:t>Average: </w:t></w:r><w:r><w:t>{indepAverage}</w:t></w:r></w:p>
    <w:p><w:r><w:b/><w:t>Upper: </w:t></w:r><w:r><w:t>{indepUpper}</w:t></w:r></w:p>
    
    <w:p><w:pPr><w:pStyle w:val="Heading2"/></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="28"/></w:rPr><w:t>Plenary (Multi-Level Assessment Questions)</w:t></w:r></w:p>
    <w:p><w:r><w:t>{plenary}</w:t></w:r></w:p>
    
    <w:p><w:pPr><w:pStyle w:val="Heading2"/></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="28"/></w:rPr><w:t>Cross-Curricular &amp; Real World Connections</w:t></w:r></w:p>
    <w:p><w:r><w:b/><w:t>My Identity: </w:t></w:r><w:r><w:t>{myIdentity}</w:t></w:r></w:p>
    <w:p><w:r><w:b/><w:t>Moral Education: </w:t></w:r><w:r><w:t>{moralEducation}</w:t></w:r></w:p>
    <w:p><w:r><w:b/><w:t>STEAM Connections: </w:t></w:r><w:r><w:t>{steam}</w:t></w:r></w:p>
    <w:p><w:r><w:b/><w:t>Subject Connections: </w:t></w:r><w:r><w:t>{linksToSubjects}</w:t></w:r></w:p>
    <w:p><w:r><w:b/><w:t>Sustainability/Environment: </w:t></w:r><w:r><w:t>{environment}</w:t></w:r></w:p>
    <w:p><w:r><w:b/><w:t>Real-World Applications (UAE Context): </w:t></w:r><w:r><w:t>{realWorld}</w:t></w:r></w:p>
    
    <w:p><w:pPr><w:pStyle w:val="Heading2"/></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="28"/></w:rPr><w:t>Advanced Learning Needs (ALN) Objectives (Gifted &amp; Talented)</w:t></w:r></w:p>
    <w:p><w:r><w:t>{alnObjectives}</w:t></w:r></w:p>
  </w:body>
</w:document>`;
      zip.file("word/document.xml", docXml);
      
      const buffer = zip.generate({ type: 'nodebuffer' });
      fs.writeFileSync(templatePath, buffer);
      console.log("✅ Default LESSON PLAN TEMPLATE.docx created successfully.");
    } catch (error) {
      console.error("❌ Failed to create default LESSON PLAN TEMPLATE.docx:", error);
    }
  } else {
    console.log("📝 Word document template exists.");
  }
}

// ================= HELPER FUNCTIONS =================

const safe = (v: any) => (v === undefined || v === null ? "" : String(v));

function getMonthlyValue(dateStr: string) {
  if (!dateStr) return 'Respect';
  const month = new Date(dateStr).getMonth();
  const values = [
    'Integrity', 'Respect', 'Responsibility', 'Courage', 'Compassion', 'Perseverance',
    'Honesty', 'Fairness', 'Generosity', 'Humility', 'Tolerance', 'Peace'
  ];
  return values[month] || 'Respect';
}

async function extractFileContent(filePath: string): Promise<string> {
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

// DOK Profiles
const DOK_PROFILE: Record<string, string[]> = {
  introductory: ["DOK1", "DOK2", "DOK3"],
  intermediate: ["DOK2", "DOK3", "DOK4"],
  mastery: ["DOK3", "DOK4", "DOK4"]
};

// Standards alignment Mapping
const STANDARDS_FRAMEWORK: Record<string, Record<string, string>> = {
  mathematics: {
    calculus: 'Common Core State Standards for Mathematics - High School',
    'pre-calculus': 'Common Core State Standards for Mathematics - High School',
    algebra: 'Common Core State Standards for Mathematics - High School',
    geometry: 'Common Core State Standards for Mathematics - High School',
    default: 'Common Core State Standards for Mathematics'
  },
  science: {
    grades_1_5: 'Next Generation Science Standards (NGSS)',
    grades_6_8: 'Next Generation Science Standards (NGSS)',
    grade_9: 'Next Generation Science Standards (NGSS)',
    physics: 'NGSS + AP Physics College Board',
    chemistry: 'NGSS + AP Chemistry College Board',
    biology: 'NGSS + AP Biology College Board',
    default: 'Next Generation Science Standards (NGSS)'
  },
  english: {
    default: 'Common Core State Standards for English Language Arts'
  },
  'computer science': {
    default: 'Computer Science Teachers Association (CSTA) K-12 Standards'
  },
  'islamic studies': {
    default: 'UAE Ministry of Education Islamic Education Standards'
  },
  'physical education': {
    default: 'UAE Ministry of Education Physical and Health Education Curriculum'
  },
  default: {
    default: 'California Common Core State Standards'
  }
};

function getStandardsFramework(subject: string, grade: string): string {
  const subjectLower = subject.toLowerCase();
  
  if (subjectLower.includes('physical') || subjectLower.includes('pe')) {
    return STANDARDS_FRAMEWORK['physical education'].default;
  }
  
  if (subjectLower.includes('math') || subjectLower.includes('calculus') || 
      subjectLower.includes('algebra') || subjectLower.includes('geometry')) {
    if (subjectLower.includes('pre-calculus')) return STANDARDS_FRAMEWORK.mathematics['pre-calculus'];
    if (subjectLower.includes('calculus')) return STANDARDS_FRAMEWORK.mathematics.calculus;
    return STANDARDS_FRAMEWORK.mathematics.default;
  }
  
  if (subjectLower.includes('science') || subjectLower.includes('physics') || 
      subjectLower.includes('chemistry') || subjectLower.includes('biology')) {
    const gradeNum = parseInt(grade, 10);
    if (subjectLower.includes('physics')) return STANDARDS_FRAMEWORK.science.physics;
    if (subjectLower.includes('chemistry')) return STANDARDS_FRAMEWORK.science.chemistry;
    if (subjectLower.includes('biology')) return STANDARDS_FRAMEWORK.science.biology;
    if (gradeNum >= 1 && gradeNum <= 5) return STANDARDS_FRAMEWORK.science.grades_1_5;
    if (gradeNum >= 6 && gradeNum <= 8) return STANDARDS_FRAMEWORK.science.grades_6_8;
    if (gradeNum === 9) return STANDARDS_FRAMEWORK.science.grade_9;
    return STANDARDS_FRAMEWORK.science.default;
  }
  
  if (subjectLower.includes('english') || subjectLower.includes('language arts') || 
      subjectLower.includes('reading') || subjectLower.includes('writing')) {
    return STANDARDS_FRAMEWORK.english.default;
  }
  
  if (subjectLower.includes('computer') || subjectLower.includes('coding') || 
      subjectLower.includes('programming')) {
    return STANDARDS_FRAMEWORK['computer science'].default;
  }
  
  return STANDARDS_FRAMEWORK.default.default;
}

const EXPERT_SYSTEM_PROMPT = `You are an expert curriculum designer and experienced subject specialist.

Your task is to generate an OUTSTANDING, inspection-ready lesson plan.
The lesson must demonstrate clear cognitive progression, strong differentiation,
and practical classroom usability with student-centered pedagogy.

You MUST follow ALL instructions below. Do not skip or simplify any part.

--------------------------------------------------
1. LESSON LEVEL & DOK REQUIREMENTS
--------------------------------------------------

The lesson level will be ONE of the following:
- Introductory
- Intermediate
- Mastery

You must strictly apply the corresponding Depth of Knowledge (DOK) profile.

INTRODUCTORY LESSON
- Learning Objectives: DOK 1, DOK 2, DOK 3
- Purpose: Concept formation and guided application

INTERMEDIATE LESSON
- Learning Objectives: DOK 2, DOK 3, DOK 4
- Purpose: Application, reasoning, and justification

MASTERY LESSON
- Learning Objectives: DOK 3, DOK 4, DOK 4
- Purpose: Analysis, evaluation, transfer, and synthesis

--------------------------------------------------
2. LEARNING OBJECTIVES (SMART + MANDATORY)
--------------------------------------------------

You must write EXACTLY three SMART learning objectives.

Each objective must be:
- SPECIFIC: Clearly state the cognitive action (e.g., calculate force pairs, analyze collision scenarios, evaluate energy transfer)
- MEASURABLE: Observable and assessable (use action verbs from Bloom's Taxonomy)
- ACHIEVABLE: Realistic for the grade level and lesson duration
- RELEVANT: Directly connected to the standard and topic
- TIME-BOUND: Achievable within the lesson timeframe

Format: "[ACTION VERB] [SPECIFIC CONTENT] [CONTEXT/CONDITION] (DOK X)"

For Physical Education, use verbs like: demonstrate, perform, analyze techniques, evaluate strategies, develop fitness plans.

--------------------------------------------------
3. STANDARDS ALIGNMENT (CRITICAL)
--------------------------------------------------

You MUST provide the EXACT, SPECIFIC standard code and full description.
FORMAT REQUIRED: "[STANDARD CODE]: [Complete Standard Description]"

For Physical Education, use UAE MOE Physical and Health Education Curriculum standards, focusing on movement skills, fitness, health knowledge. Example: "UAE MOE PE 1.1.1: Demonstrates knowledge of circulatory, respiratory, muscular, skeletal systems."

--------------------------------------------------
4. DIFFERENTIATED LEARNING OUTCOMES
--------------------------------------------------

Outcomes must be derived directly from the learning objectives.
- ALL students outcome → lowest DOK objective
- MOST students outcome → middle DOK objective
- SOME students outcome → highest DOK objective

--------------------------------------------------
5. STARTER (ATTENTION-GRABBING & INQUIRY-BASED)
--------------------------------------------------

The starter must be IMMEDIATELY engaging and thought-provoking.
Requirements:
✓ Hook students' attention in the first 10 seconds
✓ Use a prediction question, demonstration, surprising fact, or real-world scenario
✓ Activate prior knowledge and reveal misconceptions
✓ Occur BEFORE any explanation

--------------------------------------------------
6. TEACHING & LEARNING (STUDENT-CENTERED & HIGHLY DETAILED)
--------------------------------------------------

The teaching section must be a step-by-step narrative of the learning journey. It should NOT be a summary.

STRUCTURE (MINIMUM 300 WORDS):
1. Address starter responses: How will you use student answers to bridge to the new concept?
2. Guided discovery: List specific Socratic questions you will ask.
3. Modeling/Think-Aloud: Describe exactly what you will demonstrate and the "internal monologue" you will share with students.
4. Formative Checks: Describe 2-3 specific moments where you will check for understanding (e.g., "Show me on your fingers 1-5...", "Turn and tell your partner the difference between...").
5. Scaffolding: Explain how you will simplify the concept for struggling learners during the explanation.

--------------------------------------------------
7. COOPERATIVE TASKS (CLEAR DIFFERENTIATION)
--------------------------------------------------

You must design THREE distinct cooperative tasks. They MUST NOT be variations of the same activity; they must represent different COGNITIVE LEVELS and DOK depths.

A. SUPPORT GROUP (Low DOK - Foundation)
- Focus: Identification, labeling, or simple recall.
- Scaffolds: Must include sentence stems, word banks, or partially completed templates.
- Instructions: Detailed, step-by-step.

B. AVERAGE/CORE GROUP (Mid DOK - Application)
- Focus: Application of concepts to new scenarios, multi-step problem solving.
- Reasoning: Must require students to explain "why" or "how".

C. UPPER/CHALLENGE GROUP (High DOK - Analysis/Creation)
- Focus: Critical evaluation, designing solutions, or predicting outcomes in complex systems.
- Complexity: Must involve variables, trade-offs, or synthesis of multiple ideas.

EACH TASK MUST INCLUDE:
- Specific Title
- Clear Goal
- Step-by-step Student Instructions
- Required Deliverable
- Teacher Checkpoint (When will you intervene?)

--------------------------------------------------
8. INDEPENDENT TASKS (DETAILED & PROGRESSIVE)
--------------------------------------------------

Independent tasks must be DIFFERENT from cooperative tasks. Do not repeat the same activity.

A. SUPPORT: Focused on fluency and basic accuracy with heavy scaffolding.
B. AVERAGE: Focused on independent application without immediate support.
C. UPPER: Focused on extension, abstraction, or peer-critique preparation.

--------------------------------------------------
RESPONSE FORMAT
--------------------------------------------------

Return a valid JSON object with the specified structure. Ensure all strings are long and detailed.

Do NOT explain concepts in the starter. Ask questions that reveal thinking.

--------------------------------------------------
9. PLENARY (MULTI-LEVEL ASSESSMENT)
--------------------------------------------------

Create 4-5 questions spanning DOK levels to assess understanding.

Format: [DOK Level] Question

--------------------------------------------------
10. VOCABULARY, RESOURCES & SKILLS
--------------------------------------------------

VOCABULARY: List 5-8 key terms with brief definitions

RESOURCES: Provide SPECIFIC, USABLE resources with links

SKILLS: List 3-5 transferable skills developed in this lesson

--------------------------------------------------
11. CROSS-CURRICULAR CONNECTIONS
--------------------------------------------------

MY IDENTITY (MANDATORY):
Culture, Values, or Citizenship. Select the domain that best represents the topic's main learning intent.
For Islamic Studies, prioritize Values (e.g., Compassion) or Citizenship (Belonging for national identity in UAE).

--------------------------------------------------
12. REAL-WORLD CONNECTIONS
--------------------------------------------------

Provide 2-3 specific real-world applications relevant to UAE context:
- Industry applications
- Career connections  
- Current UAE projects or initiatives
- Everyday life examples

Write 60-100 words total.

--------------------------------------------------
RESPONSE FORMAT
--------------------------------------------------

Return a valid JSON object with this EXACT structure:

{
  "standardText": "EXACT standard code and full description",
  "objectives": [
    {"text": "SMART objective 1 (DOK X)", "dok": "DOKX"},
    {"text": "SMART objective 2 (DOK Y)", "dok": "DOKY"},
    {"text": "SMART objective 3 (DOK Z)", "dok": "DOKZ"}
  ],
  "outcomes": {
    "all": {"text": "ALL students will..."},
    "most": {"text": "MOST students will..."},
    "some": {"text": "SOME students will..."}
  },
  "vocabulary": ["term 1: definition", "term 2: definition", ...],
  "resources": ["Resource 1 - link/description", "Resource 2 - link/description", ...],
  "skills": "Skill 1, Skill 2, Skill 3",
  "starter": "Detailed attention-grabbing starter activity with specific instructions",
  "teaching": "Detailed student-centered teaching component (300+ words) including specific dialogue, Socratic questions, modeling/think-aloud, and 2-3 formative checks.",
  "cooperative": {
    "support": "Foundation Level (DOK 1-2): Step-by-step instructions, specific scaffolds (sentence stems/word banks), and a clear deliverable.",
    "average": "Application Level (DOK 2-3): Reasoning-based task requiring multi-step problem solving and 'how/why' explanations.",
    "upper": "Analysis Level (DOK 3-4): Complex task requiring critical evaluation, design thinking, or synthesis of multiple variables."
  },
  "independent": {
    "support": "Fluency-focused task with heavy scaffolding and templates.",
    "average": "Independent application task requiring clear mastery demonstration.",
    "upper": "Extension/Abstraction task requiring high-level critical thinking."
  },
  "plenary": [
    {"q": "Question text", "dok": "DOK1"},
    {"q": "Question text", "dok": "DOK2"},
    ...
  ],
  "identity": {
    "domain": "Selected domain",
    "element": "Selected element",
    "description": "Specific connection explanation"
  },
  "moralEducation": "Connection to Islamic values...",
  "steam": "STEAM integration explanation...",
  "linksToSubjects": "Subject 1: Connection\\nSubject 2: Connection...",
  "environment": "UAE sustainability connection...",
  "realWorld": "Real-world applications in UAE context...",
  "alnObjective": "Advanced objective for gifted students (if applicable)"
}

Ensure all JSON string outputs are extremely detailed, rich, and inspection-ready.`;

// ================= API GENERATION ENDPOINT =================

app.post("/api/generate", upload.single("file"), async (req: any, res: any) => {
  console.log('\n========== NEW LESSON GENERATION REQUEST ==========');
  ensureTemplateExists();

  try {
    const {
      subject, grade, topic, level, period,
      date, semester, lessonType, giftedTalented
    } = req.body;

    console.log('Request parameters:', {
      subject, grade, topic, level, lessonType, giftedTalented
    });

    if (!subject || !grade || !topic || !level) {
      console.error('Missing required fields');
      return res.status(400).json({
        error: 'Missing required fields',
        required: ['subject', 'grade', 'topic', 'level']
      });
    }

    const standardsFramework = getStandardsFramework(subject, grade);
    console.log('Standards framework selected:', standardsFramework);

    const dokLevels = DOK_PROFILE[level.toLowerCase()] || DOK_PROFILE.introductory;
    console.log('DOK levels for', level, ':', dokLevels);

    // Extract file context
    let syllabusContent = "";
    if (req.file) {
      console.log('Processing uploaded file:', req.file.originalname);
      syllabusContent = await extractFileContent(req.file.path);
      console.log('Syllabus content extracted:', syllabusContent.substring(0, 200) + '...');
      
      try {
        fs.unlinkSync(req.file.path);
      } catch (err) {
        console.error('File cleanup error:', err);
      }
    }

    // Build user prompt
    const userPrompt = `Generate a comprehensive lesson plan with the following specifications:

LESSON DETAILS:
- Subject: ${subject}
- Grade: ${grade}
- Topic: ${topic}
- Lesson Level: ${level}
- Standards Framework: ${standardsFramework}
- DOK Distribution: ${dokLevels.join(', ')}
${syllabusContent ? `\nSYLLABUS CONTEXT:\n${syllabusContent}\n` : ''}
${giftedTalented === 'yes' ? '\nINCLUDE: Advanced Learning Needs (ALN) objective for gifted and talented students in the alnObjective property\n' : ''}

CRITICAL REQUIREMENTS FOR DEPTH & DIFFERENTIATION:
1. TEACHING COMPONENT: This must be a detailed narrative (300+ words). Describe the dialogue, specific questions you will ask, and how you will handle student misconceptions.
2. COOPERATIVE TASKS: Create 3 CLEARLY DIFFERENT tasks. Support task (DOK 1-2), Average task (DOK 2-3), and Challenge task (DOK 3-4).
3. INDEPENDENT TASKS: These must be distinct from cooperative tasks.
4. STANDARDS: Provide the EXACT standard code and complete description from ${standardsFramework}.

Generate the complete lesson plan following the JSON format specified.`;

    console.log('\n=== CALLING AI API ===');
    
    let aiResponse;
    let usedModelUsed = "";
    try {
      const result = await executeChatCompletionWithFallback([
        { role: "system", content: EXPERT_SYSTEM_PROMPT },
        { role: "user", content: userPrompt }
      ], {
        temperature: 0.7,
        max_tokens: 8000,
        response_format: { type: "json_object" }
      });

      aiResponse = result.completion.choices[0]?.message?.content;
      usedModelUsed = result.usedModel;
      console.log(`AI response received. Model used: ${usedModelUsed}`);
    } catch (apiError: any) {
      console.error('AI API Error:', apiError);
      return res.status(500).json({
        error: 'AI generation failed after model fallback queue attempts.',
        details: apiError.message
      });
    }

    if (!aiResponse) {
      console.error('No AI response content returned');
      return res.status(500).json({
        error: 'No response from AI',
        details: 'The AI did not generate any content'
      });
    }

    // Parse AI response
    let aiData: any;
    try {
      const cleanJson = aiResponse.replace(/```json\n?|\n?```/g, '').trim();
      aiData = JSON.parse(cleanJson);
      console.log('AI response parsed successfully');
    } catch (parseError: any) {
      console.error('JSON Parse Error:', parseError);
      return res.status(500).json({
        error: 'Failed to parse AI response',
        details: parseError.message,
        aiResponse: aiResponse.substring(0, 500)
      });
    }

    // Format fields
    const templateData = {
      date: safe(date ? new Date(date).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' }) : new Date().toLocaleDateString('en-US')),
      semester: safe(semester || '1'),
      grade: safe(grade),
      subject: safe(subject),
      topic: safe(topic),
      period: safe(period || '1'),
      value: safe(getMonthlyValue(date)),

      standardText: safe(aiData.standardText || `${standardsFramework} - Standard for Grade ${grade} ${subject}: ${topic}`),

      objective1: safe(aiData.objectives?.[0]?.text || `Students will demonstrate understanding of ${topic} (${dokLevels[0]})`),
      objective2: safe(aiData.objectives?.[1]?.text || `Students will apply concepts from ${topic} (${dokLevels[1]})`),
      objective3: safe(aiData.objectives?.[2]?.text || `Students will analyze applications of ${topic} (${dokLevels[2]})`),

      outcomeAll: safe(aiData.outcomes?.all?.text || `All students will identify key concepts of ${topic}`),
      outcomeMost: safe(aiData.outcomes?.most?.text || `Most students will apply ${topic} to solve problems`),
      outcomeSome: safe(aiData.outcomes?.some?.text || `Some students will evaluate and justify solutions using ${topic}`),

      vocabulary: safe(Array.isArray(aiData.vocabulary) ? aiData.vocabulary.join('\n') : aiData.vocabulary || 'Key terms'),
      resources: safe(Array.isArray(aiData.resources) ? aiData.resources.join('\n') : aiData.resources || 'Educational resources and materials'),
      skills: safe(aiData.skills || 'Critical thinking, problem-solving, collaboration'),

      starter: safe(aiData.starter || 'Starter activity'),
      teaching: safe(aiData.teaching || 'Detailed teaching component'),

      coopUpper: safe(aiData.cooperative?.upper || 'Challenge analysis task'),
      coopAverage: safe(aiData.cooperative?.average || 'Core application task'),
      coopSupport: safe(aiData.cooperative?.support || 'Support foundational task'),

      indepUpper: safe(aiData.independent?.upper || 'Challenge research task'),
      indepAverage: safe(aiData.independent?.average || 'Core application task'),
      indepSupport: safe(aiData.independent?.support || 'Support guided practice'),

      plenary: safe(
        Array.isArray(aiData.plenary) 
          ? aiData.plenary.map((p: any, i: number) => `${i + 1}. (${p.dok || 'DOK'}) ${p.q}`).join('\n')
          : aiData.plenary || 'Multi-level review questions'
      ),

      myIdentity: safe(
        aiData.identity && aiData.identity.domain && aiData.identity.element && aiData.identity.description
          ? `Domain: ${aiData.identity.domain} - Element: ${aiData.identity.element}\n\n${aiData.identity.description}`
          : `Domain and Element selected based on topic relevance.`
      ),
      
      moralEducation: safe(aiData.moralEducation || 'Connection to Islamic values and moral education'),
      steam: safe(aiData.steam || 'STEAM connections'),
      linksToSubjects: safe(aiData.linksToSubjects || 'Cross-curricular connections'),
      environment: safe(aiData.environment || 'UAE sustainability and environmental connections'),
      realWorld: safe(aiData.realWorld || 'Real-world applications in UAE context'),

      alnObjectives: giftedTalented === 'yes' 
        ? safe(aiData.alnObjective || `Gifted students will synthesize ${topic} concepts through advanced research, designing innovative solutions (DOK 4).`)
        : ''
    };

    // If client requested JSON representation (e.g. for rich UI preview)
    if (req.headers.accept === 'application/json' || req.query.format === 'json') {
      return res.json({
        success: true,
        usedModel: usedModelUsed,
        templateData,
        rawAiData: aiData
      });
    }

    // Build DOCX document
    let templateContent;
    try {
      templateContent = fs.readFileSync(templatePath);
    } catch (err: any) {
      console.error("Failed to load template:", err);
      return res.status(500).json({ error: "Template file missing", details: err.message });
    }

    const zip = new PizZip(templateContent);
    const doc = new Docxtemplater(zip, {
      paragraphLoop: true,
      linebreaks: true,
    });

    doc.setData(templateData);
    doc.render();

    const buffer = doc.getZip().generate({
      type: 'nodebuffer',
      compression: 'DEFLATE',
    });

    console.log(`Document generated. Size: ${buffer.length} bytes.`);

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename="Lesson_Plan_G${grade}_${subject}_${topic.replace(/\s+/g, '_')}.docx"`);
    res.send(buffer);

    console.log('========== LESSON PLAN GENERATED AND SENT SUCCESSFULY ==========');

  } catch (error: any) {
    console.error('Unexpected error in lesson generation endpoint:', error);
    res.status(500).json({
      error: 'Internal server error',
      details: error.message
    });
  }
});

// Test endpoint
app.get('/api/test', (req, res) => {
  res.json({ 
    status: 'OK', 
    message: 'Enhanced Expert Lesson Plan Server is fully operational',
    timestamp: new Date().toISOString(),
    supported_models: MODEL_QUEUE,
    cooldown_states: modelCooldowns
  });
});

// ================= VITE MIDDLEWARE SETUP / STATIC FILES =================

if (process.env.NODE_ENV !== "production") {
  const vite = await createViteServer({
    server: { middlewareMode: true },
    appType: "spa",
  });
  app.use(vite.middlewares);
} else {
  const distPath = path.join(process.cwd(), 'dist');
  app.use(express.static(distPath));
  app.get('*', (req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

// ================= START SERVER =================

app.listen(PORT, '0.0.0.0', () => {
  ensureTemplateExists();
  console.log('═══════════════════════════════════════════════');
  console.log('   ENHANCED EXPERT LESSON PLANNER SERVER');
  console.log('═══════════════════════════════════════════════');
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`📁 Template: ${templatePath}`);
  console.log(`🤖 Fallback Models Enabled: ${MODEL_QUEUE.length} models`);
  console.log('═══════════════════════════════════════════════\n');
});
