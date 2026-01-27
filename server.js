// ================= IMPORTS =================
const express = require("express");
const fs = require("fs");
const path = require("path");
const cors = require("cors");
const multer = require("multer");
const pdf = require("pdf-parse");
const mammoth = require("mammoth");
const OpenAI = require("openai");
const PizZip = require("pizzip");
const Docxtemplater = require("docxtemplater");
require("dotenv").config();

// ================= APP SETUP =================
const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json({ limit: "50mb" }));
const upload = multer({ dest: 'uploads/' });

// ================= AI CLIENT =================
const client = new OpenAI({
  baseURL: "https://router.huggingface.co/v1",
  apiKey: process.env.HUGGINGFACE_API_KEY
});

// ================= HELPER FUNCTIONS =================

// Safe string conversion
const safe = (v) => (v === undefined || v === null ? "" : String(v));

// Monthly values
function getMonthlyValue(date) {
  const month = new Date(date).getMonth();
  const values = [
    'Integrity', 'Respect', 'Responsibility', 'Courage', 'Compassion', 'Perseverance',
    'Honesty', 'Fairness', 'Generosity', 'Humility', 'Tolerance', 'Peace'
  ];
  return values[month] || 'Respect';
}

// Extract file content
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

// DOK Profiles
const DOK_PROFILE = {
  introductory: ["DOK1", "DOK2", "DOK3"],
  intermediate: ["DOK2", "DOK3", "DOK4"],
  mastery: ["DOK3", "DOK4", "DOK4"]
};

// ================= EXPERT PROMPT SYSTEM =================

const EXPERT_SYSTEM_PROMPT = `You are an expert curriculum designer and experienced subject specialist.

Your task is to generate an OUTSTANDING, inspection-ready lesson plan.
The lesson must demonstrate clear cognitive progression, strong differentiation,
and practical classroom usability.

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
2. LEARNING OBJECTIVES (MANDATORY)
--------------------------------------------------

You must write EXACTLY three learning objectives.

Each objective must:
- Clearly state the cognitive action (e.g., define, explain, calculate, analyze, justify, design)
- Match the assigned DOK level
- Be specific to the lesson topic

Do NOT repeat objectives using different words.
Do NOT use vague verbs such as "understand" or "learn".

--------------------------------------------------
3. DIFFERENTIATED LEARNING OUTCOMES
--------------------------------------------------

Outcomes must be derived directly from the learning objectives.

You must write:
- ALL students outcome → lowest DOK objective
- MOST students outcome → middle DOK objective
- SOME students outcome → highest DOK objective

Rules:
- Outcomes must NOT repeat the learning objectives verbatim
- Outcomes must be measurable
- Cognitive demand must clearly increase from ALL → MOST → SOME

--------------------------------------------------
4. STARTER (INQUIRY-BASED)
--------------------------------------------------

The starter must:
- Be a prediction, observation, or conceptual question
- Occur BEFORE any explanation
- Reveal prior knowledge or misconceptions
- Be directly linked to the lesson topic

Do NOT explain concepts in the starter.

--------------------------------------------------
5. TEACHING & LEARNING (MAIN INPUT)
--------------------------------------------------

The teaching section must:
- Respond directly to student predictions from the starter
- Use clear subject-specific explanations
- Include representations where relevant (e.g., diagrams, equations, graphs)
- Progress from concept → relationship → application

Avoid textbook-style paragraphs.
Write as a teacher explaining to students.

--------------------------------------------------
6. COOPERATIVE TASKS (DETAILED & USABLE)
--------------------------------------------------

You must design THREE cooperative tasks:

A. Support Group (Lower ability)
- Cognitive level: lowest DOK
- Task must state:
  • What students do
  • What they produce (e.g., labelled diagram, short explanation, calculation)
  • How the teacher checks understanding

B. Core Group (Average ability)
- Cognitive level: middle DOK
- Task must involve reasoning or application
- Must require more than recall

C. Challenge Group (Upper ability)
- Cognitive level: highest DOK
- Task must require justification, analysis, or decision-making
- Students must explain WHY, not just calculate

Do NOT write "worksheet", "diagram", or "activity" without explanation.
The teacher must know EXACTLY what happens in class.

--------------------------------------------------
7. INDEPENDENT TASKS (DETAILED & DOK-ALIGNED)
--------------------------------------------------

You must design THREE independent tasks:

- Support level → lowest DOK
- Core level → middle DOK
- Challenge level → highest DOK

Each task must clearly describe:
- The question or problem
- The expected student output
- The level of thinking involved

--------------------------------------------------
8. PLENARY (MANDATORY – 5 QUESTIONS)
--------------------------------------------------

You must include AT LEAST FIVE plenary questions.

Rules:
- Questions must span the DOK levels of the lesson
- Questions must check understanding, reasoning, and transfer
- At least:
  • 1 recall/explanation question
  • 2 application questions
  • 2 higher-order (why / justify / evaluate) questions

List the questions clearly.

--------------------------------------------------
9. MY IDENTITY (STRUCTURED – INTELLIGENT SELECTION REQUIRED)
--------------------------------------------------

You MUST select the MOST RELEVANT domain and element based on the lesson topic.

DOMAIN SELECTION GUIDE:

**Culture** - Use when the topic involves:
- Language, literature, communication
- Historical events, traditions, cultural practices
- UAE heritage, archaeology, traditional knowledge
Elements: Arabic Language, History, Heritage

**Value** - Use when the topic involves:
- Ethical decisions, moral reasoning
- Interpersonal skills, empathy, understanding others
- Global perspectives, international cooperation
Elements: Respect, Compassion, Global Understanding

**Citizenship** - Use when the topic involves:
- Environmental issues, sustainability, conservation
- Community participation, civic duty
- National identity, social responsibility
Elements: Belonging, Volunteering, Conservation

SELECTION EXAMPLES:
- Physics experiments → Citizenship - Conservation (lab safety, waste reduction)
- Math/Statistics → Value - Respect (data privacy, ethical use of information)
- Environmental science → Citizenship - Conservation (sustainability)
- Literature/Poetry → Culture - Arabic Language or Heritage
- Engineering/Design → Citizenship - Volunteering (community problem-solving)
- Biology/Medicine → Value - Compassion (healthcare, helping others)

MANDATORY REQUIREMENTS:
- Choose the ONE domain that fits the topic BEST
- Select the ONE element within that domain that is MOST relevant
- Write 2-3 sentences explaining the connection
- Be specific about UAE context and real applications
- Do NOT use Culture - Heritage as default unless truly relevant

CRITICAL: If you cannot identify a clear connection, analyze the topic more deeply. Every subject has a My Identity link - find it.

--------------------------------------------------
10. RESOURCES (MANDATORY – SPECIFIC WITH WEB LINKS)
--------------------------------------------------

You MUST provide 6-8 specific, actionable resources.

DIGITAL RESOURCES - MUST include exact web links:
Format: Resource Name: Full URL
Examples:
- Khan Academy - Newton's Laws: https://www.khanacademy.org/science/physics/forces-newtons-laws
- PhET Simulation - Circuit Construction: https://phet.colorado.edu/en/simulation/circuit-construction-kit-dc
- YouTube - Crash Course Chemistry #1: https://www.youtube.com/watch?v=FSyAehMdpyI
- Desmos Graphing Calculator: https://www.desmos.com/calculator
- GeoGebra - Geometry Tools: https://www.geogebra.org/geometry

PHYSICAL RESOURCES - Be specific about what and how:
Examples:
- Laboratory equipment: Beakers (250ml), test tubes, Bunsen burner
- Manipulatives: Base-10 blocks, fraction circles, geometric shapes
- Materials: Graph paper, colored markers, sticky notes
- Safety equipment: Lab coats, safety goggles, gloves

TEXTBOOK RESOURCES - Include specific chapters/sections:
Examples:
- Textbook: Physics for Scientists Chapter 4, pages 87-102
- Workbook: Mathematics Practice Book, Unit 3, exercises 1-15

REQUIREMENTS:
- Minimum 6 resources total
- At least 3 must be digital resources with exact web links
- At least 2 must be physical/hands-on resources
- All URLs must be complete and accurate (https://...)
- Prioritize free, educational resources (Khan Academy, PhET, YouTube educational channels)
- Resources must be directly relevant to the topic and grade level

DO NOT write:
- "Online resources" (too vague)
- "Internet" (not specific)
- "Digital tools" (specify which ones)
- URLs without resource names
--------------------------------------------------

You MUST provide the EXACT curriculum standard for the topic.

For NGSS (Next Generation Science Standards):
- Include the full standard code (e.g., HS-PS2-1, MS-PS3-5)
- Include the complete performance expectation text
- Example: "HS-PS2-1: Analyze data to support the claim that Newton's second law of motion describes the mathematical relationship among the net force on a macroscopic object, its mass, and its acceleration."

For AP College Board:
- Include the specific Big Idea, Enduring Understanding, and Learning Objective
- Example: "Big Idea 3: The interactions of an object with other objects can be described by forces. Learning Objective 3.A.1.1: Express the motion of an object using narrative, mathematical, and graphical representations."

For Common Core Math:
- Include the complete standard code and description
- Example: "CCSS.MATH.CONTENT.HSA.REI.B.3: Solve linear equations and inequalities in one variable, including equations with coefficients represented by letters."

If the standard type is not specified, use NGSS for science, Common Core for math, and relevant national standards for other subjects.

--------------------------------------------------
12. GIFTED STUDENTS (ALN OBJECTIVE)
--------------------------------------------------

If gifted students are included, generate ONE ALN (Advanced Learning Needs) objective at DOK 4 level that:
- Extends beyond the highest regular objective
- Involves synthesis, creation, evaluation, or design
- Connects to real-world UAE applications
- Is achievable within the lesson timeframe
- Should be a complete, actionable objective statement

--------------------------------------------------
13. QUALITY CHECK (FINAL RULES)
--------------------------------------------------

Before finishing, ensure:
- Introductory, Intermediate, and Mastery lessons would look clearly DIFFERENT
- No section is empty or generic
- Tasks are actionable by a real teacher
- Cognitive demand increases across the lesson
- Language is clear, professional, and age-appropriate
- The curriculum standard is EXACT and COMPLETE with full code and description
- If gifted students are included, ALN objective is present and detailed
- My Identity domain/element is intelligently selected (NOT just Culture-Heritage by default)
- Resources include at least 3 digital resources with exact, complete web links
- All URLs are valid and complete (starting with https://)

If any requirement is missing, rewrite before responding.

--------------------------------------------------
OUTPUT FORMAT - RETURN ONLY VALID JSON
--------------------------------------------------

Return your response as valid JSON with this exact structure:

{
  "standardText": "EXACT curriculum standard with full code and complete description",
  "objectives": [
    {"dok": "DOK1", "text": "Objective 1 text here"},
    {"dok": "DOK2", "text": "Objective 2 text here"},
    {"dok": "DOK3", "text": "Objective 3 text here"}
  ],
  "outcomes": {
    "all": {"dok": "DOK1", "text": "All students outcome"},
    "most": {"dok": "DOK2", "text": "Most students outcome"},
    "some": {"dok": "DOK3", "text": "Some students outcome"}
  },
  "starter": "Detailed inquiry-based starter activity",
  "teaching": "Detailed student-centered teaching component",
  "cooperative": {
    "support": "Support group cooperative task - what they do and produce",
    "average": "Average group cooperative task - application and reasoning",
    "upper": "Upper group cooperative task - analysis and justification"
  },
  "independent": {
    "support": "Support independent task - structured with scaffolding",
    "average": "Average independent task - application with clear steps",
    "upper": "Upper independent task - research/evaluation with higher-order thinking"
  },
  "plenary": [
    {"dok": "DOK1", "q": "Recall/explanation question"},
    {"dok": "DOK2", "q": "Application question 1"},
    {"dok": "DOK2", "q": "Application question 2"},
    {"dok": "DOK3", "q": "Why/justify question"},
    {"dok": "DOK4", "q": "Evaluate/transfer question"}
  ],
  "vocabulary": ["term1", "term2", "term3", "term4", "term5", "term6"],
  "resources": [
    "Khan Academy - Topic Name: https://www.khanacademy.org/...",
    "PhET Simulation - Simulation Name: https://phet.colorado.edu/en/simulation/...",
    "YouTube - Video Title: https://www.youtube.com/watch?v=...",
    "Physical resource: Specific item name and quantity",
    "Textbook: Book name, Chapter X, pages Y-Z",
    "Laboratory equipment: Specific items"
  ],
  "skills": "Critical thinking, Problem-solving, Collaboration, Analysis, Communication",
  "realWorld": "Detailed paragraph showing real-world UAE applications with 3-4 specific examples",
  "identity": {
    "domain": "Culture/Value/Citizenship",
    "element": "Specific element from approved list",
    "description": "2-3 sentence explanation linking element to topic in UAE context"
  },
  "moralEducation": "2-3 sentences connecting topic to Islamic values and UAE moral education",
  "steam": "2-3 sentences with explicit Science, Technology, Engineering, Arts, Mathematics connections",
  "linksToSubjects": "Subject 1: Connection explanation\\nSubject 2: Connection explanation",
  "environment": "2-3 sentences on UAE sustainability and environmental connections",
  "alnObjective": "Complete DOK 4 extension objective for gifted students - only if gifted students are included, otherwise omit this field entirely"
}`;

// ================= AI GENERATION =================

async function generateExpertLesson({ grade, subject, topic, level, standardType, fileContent, giftedTalented }) {
  const dokProfile = DOK_PROFILE[level.toLowerCase()] || DOK_PROFILE.intermediate;
  
  const userPrompt = `Grade: ${grade}
Subject: ${subject}
Topic: ${topic}
Lesson Level: ${level}
DOK Profile: ${dokProfile.join(", ")}
Standard Type: ${standardType}
Gifted Students: ${giftedTalented === 'yes' ? 'YES - MUST include alnObjective field with DOK 4 extension' : 'NO - Do NOT include alnObjective field'}
${fileContent ? `Additional Context from uploaded file:\n${fileContent}` : ''}

CRITICAL INSTRUCTIONS:

1. CURRICULUM STANDARD:
   - You MUST provide the EXACT, COMPLETE curriculum standard for "${topic}" in Grade ${grade} ${subject}
   - For ${standardType}, include:
     * Full standard code (e.g., HS-PS2-1 for NGSS, or Big Idea 3, LO 3.A.1.1 for AP)
     * Complete standard description/performance expectation
   - DO NOT write generic text like "Standard for Grade ${grade}"
   - Find and cite the REAL standard that matches "${topic}"

2. MY IDENTITY DOMAIN/ELEMENT:
   - INTELLIGENTLY select the most relevant domain (Culture/Value/Citizenship) based on "${topic}"
   - For ${subject} on "${topic}", think: What UAE context fits best?
   - DO NOT default to Culture-Heritage unless truly relevant
   - Examples:
     * Lab/experiment topics → Citizenship - Conservation (safety, waste)
     * Data/statistics → Value - Respect (privacy, ethics)
     * Environmental topics → Citizenship - Conservation
     * Literature/language → Culture - Arabic Language or Heritage
     * Community projects → Citizenship - Belonging or Volunteering
   - Provide 2-3 specific sentences about UAE connection

3. RESOURCES WITH WEB LINKS:
   - REQUIRED: At least 3 digital resources with EXACT, COMPLETE web links
   - Format: "Resource Name: https://full-url-here"
   - Prioritize: Khan Academy, PhET, YouTube (educational channels), Desmos, GeoGebra
   - Also include 2-3 physical resources (equipment, manipulatives)
   - All URLs must be real, complete, and start with https://
   - Example: "Khan Academy - Newton's Laws: https://www.khanacademy.org/science/physics/forces-newtons-laws"

4. GIFTED STUDENTS ALN:
   ${giftedTalented === 'yes' ? `
   - REQUIRED: Generate "alnObjective" field with complete DOK 4 statement
   - Format: "Gifted students will [action verb] [topic] by [method] to [outcome with UAE connection]"
   - Example: "Gifted students will design and evaluate a scaled experimental model to investigate apparent weight changes in accelerated systems, synthesizing Newton's laws with engineering applications in UAE's high-speed transportation infrastructure"
   - Must be actionable, specific, and extend beyond regular objectives
   ` : `
   - DO NOT include "alnObjective" field in JSON response
   - Omit this field entirely from output
   `}

Generate a complete, detailed lesson plan following all requirements above.
Return ONLY valid JSON - no explanations, no markdown, just the JSON object.`;

  console.log('Calling AI with Expert Prompt...');
  
  const completion = await client.chat.completions.create({
    model: "meta-llama/Llama-3.1-70B-Instruct",
    messages: [
      { role: "system", content: EXPERT_SYSTEM_PROMPT },
      { role: "user", content: userPrompt }
    ],
    temperature: 0.5,
    max_tokens: 5000
  });

  const raw = completion.choices[0].message.content;
  console.log('AI Response received:', raw.substring(0, 200) + '...');
  
  // Extract JSON from response
  const jsonStart = raw.indexOf('{');
  const jsonEnd = raw.lastIndexOf('}') + 1;
  const jsonStr = raw.slice(jsonStart, jsonEnd);
  
  return JSON.parse(jsonStr);
}

// ================= ROUTES =================

app.use(express.static(path.join(__dirname)));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'enhanced-lesson-planner.html'));
});

app.post('/api/generate-lesson', upload.single('file'), async (req, res) => {
  console.log('\n========== NEW LESSON GENERATION REQUEST ==========');
  
  try {
    const { date, semester, grade, subject, topic, lessonLevel, standardType, period, giftedTalented } = req.body;
    
    console.log('Request Data:', { grade, subject, topic, level: lessonLevel, standardType, giftedTalented });

    // Validate required fields
    if (!grade || !subject || !topic || !lessonLevel) {
      return res.status(400).json({ error: "Missing required fields: grade, subject, topic, or level" });
    }

    // Extract file content if uploaded
    let fileContent = '';
    if (req.file) {
      console.log('Processing uploaded file:', req.file.originalname);
      fileContent = await extractFileContent(req.file.path);
      fs.unlinkSync(req.file.path);
    }

    // Generate lesson with AI
    console.log('Generating expert lesson plan...');
    const aiData = await generateExpertLesson({
      grade,
      subject,
      topic,
      level: lessonLevel,
      standardType: standardType || 'NGSS + AP College Board',
      fileContent,
      giftedTalented
    });

    console.log('AI Generation Complete');
    console.log('Objectives:', aiData.objectives?.length || 0);
    console.log('Standard Text:', aiData.standardText?.substring(0, 80) || 'MISSING');
    console.log('Identity:', aiData.identity?.domain + ' - ' + aiData.identity?.element || 'MISSING');
    console.log('Resources:', aiData.resources?.length || 0);
    console.log('ALN Objective:', aiData.alnObjective ? 'PRESENT' : 'NOT PRESENT');

    // Validate critical fields
    if (!aiData.standardText || aiData.standardText.length < 30) {
      console.warn('⚠️ WARNING: Standard text is too short or missing');
    }
    
    if (!aiData.identity || !aiData.identity.domain || !aiData.identity.element) {
      console.error('❌ ERROR: My Identity domain/element missing - AI failed');
      throw new Error('My Identity not properly generated. Please try again.');
    }
    
    if (aiData.identity.domain === 'Culture' && aiData.identity.element === 'Heritage' && subject !== 'History' && subject !== 'Social Studies') {
      console.warn('⚠️ WARNING: AI defaulted to Culture-Heritage - may not be most relevant');
    }
    
    if (!aiData.resources || aiData.resources.length < 6) {
      console.warn('⚠️ WARNING: Insufficient resources generated');
    }
    
    const hasWebLinks = aiData.resources?.some(r => r.includes('http'));
    if (!hasWebLinks) {
      console.warn('⚠️ WARNING: No web links found in resources');
    }
    
    if (giftedTalented === 'yes' && !aiData.alnObjective) {
      console.warn('⚠️ WARNING: Gifted students selected but ALN objective missing');
    }

    // Prepare template data
    const templateData = {
      // Basic info
      date: safe(new Date(date).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' })),
      semester: safe(semester || '1'),
      grade: safe(grade),
      subject: safe(subject),
      topic: safe(topic),
      period: safe(period || '1'),
      value: safe(getMonthlyValue(date)),

      // Standards - Now uses AI-generated exact standard
      standardText: safe(aiData.standardText || `${standardType || 'NGSS + AP College Board'} - Please provide specific standard code and description for Grade ${grade} ${subject}: ${topic}`),

      // Objectives
      objective1: safe(aiData.objectives?.[0]?.text || `Students will demonstrate understanding of ${topic}`),
      objective2: safe(aiData.objectives?.[1]?.text || `Students will apply concepts from ${topic}`),
      objective3: safe(aiData.objectives?.[2]?.text || `Students will analyze applications of ${topic}`),

      // Outcomes
      outcomeAll: safe(aiData.outcomes?.all?.text || `All students will identify key concepts of ${topic}`),
      outcomeMost: safe(aiData.outcomes?.most?.text || `Most students will apply ${topic} to solve problems`),
      outcomeSome: safe(aiData.outcomes?.some?.text || `Some students will evaluate and justify solutions using ${topic}`),

      // Content
      vocabulary: safe(Array.isArray(aiData.vocabulary) ? aiData.vocabulary.join('\n') : aiData.vocabulary || 'Key terms'),
      resources: safe(
        Array.isArray(aiData.resources) 
          ? aiData.resources.join('\n') 
          : aiData.resources || 'Khan Academy resources\nPhET simulations\nYouTube educational videos\nTextbook materials\nLaboratory equipment'
      ),
      skills: safe(aiData.skills || 'Critical thinking, problem-solving, collaboration'),

      // Activities
      starter: safe(aiData.starter || 'Inquiry-based starter to activate prior knowledge and reveal misconceptions'),
      teaching: safe(aiData.teaching || 'Student-centered teaching component with guided discovery and formative checks'),

      // Cooperative tasks
      coopUpper: safe(aiData.cooperative?.upper || 'Advanced analysis task requiring justification and evaluation'),
      coopAverage: safe(aiData.cooperative?.average || 'Structured application task with reasoning'),
      coopSupport: safe(aiData.cooperative?.support || 'Scaffolded task with templates and peer support'),

      // Independent tasks
      indepUpper: safe(aiData.independent?.upper || 'Research and evaluation task with higher-order thinking'),
      indepAverage: safe(aiData.independent?.average || 'Application task with clear steps and expectations'),
      indepSupport: safe(aiData.independent?.support || 'Guided practice with graphic organizers and feedback'),

      // Plenary
      plenary: safe(
        Array.isArray(aiData.plenary) 
          ? aiData.plenary.map((p, i) => `${i + 1}. (${p.dok}) ${p.q}`).join('\n')
          : aiData.plenary || 'Review questions at multiple DOK levels'
      ),

      // Cross-curricular - REMOVED hardcoded Culture-Heritage fallback
      myIdentity: safe(
        aiData.identity && aiData.identity.domain && aiData.identity.element && aiData.identity.description
          ? `Domain: ${aiData.identity.domain} - Element: ${aiData.identity.element}\n\n${aiData.identity.description}`
          : `ERROR: My Identity not generated properly. Domain and Element must be selected by AI based on topic relevance.`
      ),
      identityDomain: safe(aiData.identity?.domain || 'ERROR'),
      identityElement: safe(aiData.identity?.element || 'ERROR'),
      identityDescription: safe(aiData.identity?.description || 'ERROR: My Identity description missing.'),
      
      moralEducation: safe(aiData.moralEducation || 'Connection to Islamic values and moral education'),
      steam: safe(aiData.steam || 'Science, Technology, Engineering, Arts, Mathematics connections'),
      linksToSubjects: safe(aiData.linksToSubjects || 'Mathematics: Quantitative analysis\nEnglish: Technical writing'),
      environment: safe(aiData.environment || 'UAE sustainability and environmental connections'),

      // Real world
      realWorld: safe(aiData.realWorld || 'Real-world applications in UAE context with industry and career connections'),

      // ALN for Gifted Students - Always populate when gifted students are selected
      alnObjectives: giftedTalented === 'yes' 
  ? safe(aiData.alnObjective || aiData.objectives?.alnObjective || `Gifted students will synthesize ${topic} concepts through advanced research, designing innovative solutions that evaluate real-world applications in UAE's technological and scientific development (DOK 4).`)
  : ''
    }

    console.log('Template data prepared');
    console.log('Standard Text:', templateData.standardText.substring(0, 100) + '...');
    console.log('My Identity:', templateData.identityDomain + ' - ' + templateData.identityElement);
    console.log('Resources with links:', templateData.resources.includes('http') ? 'YES' : 'NO');
    console.log('ALN Objectives:', templateData.alnObjectives ? 'POPULATED (' + templateData.alnObjectives.length + ' chars)' : 'EMPTY');

    // Load template
    const templatePath = path.join(__dirname, 'LESSON PLAN TEMPLATE.docx');
    
    if (!fs.existsSync(templatePath)) {
      return res.status(500).json({ 
        error: 'Template file not found', 
        details: 'Please ensure "LESSON PLAN TEMPLATE.docx" exists in the project root directory' 
      });
    }

    console.log('Loading template from:', templatePath);
    
    const templateContent = fs.readFileSync(templatePath);
    const zip = new PizZip(templateContent);
    const doc = new Docxtemplater(zip, {
      paragraphLoop: true,
      linebreaks: true,
    });

    // Render template
    console.log('Rendering template with AI data...');
    doc.setData(templateData);
    
    try {
      doc.render();
    } catch (error) {
      console.error('Template render error:', error);
      return res.status(500).json({ 
        error: 'Failed to render template', 
        details: error.message,
        properties: error.properties
      });
    }

    // Generate buffer
    const buffer = doc.getZip().generate({
      type: 'nodebuffer',
      compression: 'DEFLATE',
    });

    console.log('Document generated successfully');
    console.log('File size:', buffer.length, 'bytes');

    // Send file
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename="Lesson_Plan_G${grade}_${subject}_${topic.replace(/\s+/g, '_')}.docx"`);
    res.send(buffer);

    console.log('========== LESSON GENERATION COMPLETE ==========\n');

  } catch (error) {
    console.error('========== ERROR ==========');
    console.error('Error:', error.message);
    console.error('Stack:', error.stack);
    console.error('===========================\n');
    
    res.status(500).json({ 
      error: 'Lesson generation failed', 
      details: error.message 
    });
  }
});

// Test endpoint
app.get('/api/test', (req, res) => {
  res.json({ 
    status: 'OK', 
    message: 'Expert Lesson Plan Server is running',
    timestamp: new Date().toISOString() 
  });
});

// ================= START SERVER =================

app.listen(PORT, '0.0.0.0', () => {
  console.log('═══════════════════════════════════════════════');
  console.log('   EXPERT LESSON PLAN SERVER');
  console.log('═══════════════════════════════════════════════');
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`📁 Template: ${path.join(__dirname, 'LESSON PLAN TEMPLATE.docx')}`);
  console.log(`🤖 AI: meta-llama/Llama-3.1-70B-Instruct`);
  console.log('═══════════════════════════════════════════════\n');
});
