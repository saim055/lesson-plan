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
console.log('Environment Variables:');
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

// ================= STANDARDS MAPPING =================
const STANDARDS_FRAMEWORK = {
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
  default: 'California Common Core State Standards'
};

function getStandardsFramework(subject, grade) {
  const subjectLower = subject.toLowerCase();
  
  // Mathematics
  if (subjectLower.includes('math') || subjectLower.includes('calculus') || 
      subjectLower.includes('algebra') || subjectLower.includes('geometry')) {
    if (subjectLower.includes('pre-calculus')) return STANDARDS_FRAMEWORK.mathematics['pre-calculus'];
    if (subjectLower.includes('calculus')) return STANDARDS_FRAMEWORK.mathematics.calculus;
    return STANDARDS_FRAMEWORK.mathematics.default;
  }
  
  // Science
  if (subjectLower.includes('science') || subjectLower.includes('physics') || 
      subjectLower.includes('chemistry') || subjectLower.includes('biology')) {
    const gradeNum = parseInt(grade);
    if (subjectLower.includes('physics')) return STANDARDS_FRAMEWORK.science.physics;
    if (subjectLower.includes('chemistry')) return STANDARDS_FRAMEWORK.science.chemistry;
    if (subjectLower.includes('biology')) return STANDARDS_FRAMEWORK.science.biology;
    if (gradeNum >= 1 && gradeNum <= 5) return STANDARDS_FRAMEWORK.science.grades_1_5;
    if (gradeNum >= 6 && gradeNum <= 8) return STANDARDS_FRAMEWORK.science.grades_6_8;
    if (gradeNum === 9) return STANDARDS_FRAMEWORK.science.grade_9;
    return STANDARDS_FRAMEWORK.science.default;
  }
  
  // English
  if (subjectLower.includes('english') || subjectLower.includes('language arts') || 
      subjectLower.includes('reading') || subjectLower.includes('writing')) {
    return STANDARDS_FRAMEWORK.english.default;
  }
  
  // Computer Science
  if (subjectLower.includes('computer') || subjectLower.includes('coding') || 
      subjectLower.includes('programming')) {
    return STANDARDS_FRAMEWORK['computer science'].default;
  }
  
  // Default
  return STANDARDS_FRAMEWORK.default;
}

// ================= ENHANCED EXPERT PROMPT SYSTEM =================

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

--------------------------------------------------
3. STANDARDS ALIGNMENT (CRITICAL)
--------------------------------------------------

You MUST provide the EXACT, SPECIFIC standard code and full description.
FORMAT REQUIRED: "[STANDARD CODE]: [Complete Standard Description]"

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

Examples:
"I'm going to place this book on the table. The book pushes down on the table with its weight. Question: Does the table push back? If yes, why doesn't the book fall through? Turn to your partner and discuss for 30 seconds."

"Watch this slow-motion video of a car crash test. What forces do you observe? What happens to the car's momentum? Write down 2 observations."
✗ "Today we will learn about Newton's Third Law. It states that for every action..." (Explaining, not engaging)

Do NOT explain concepts in the starter. Ask questions that reveal thinking.

--------------------------------------------------
6. TEACHING & LEARNING (STUDENT-CENTERED & DETAILED)
--------------------------------------------------

The teaching section must be STUDENT-CENTERED, not teacher-centered.

STRUCTURE:
1. Address starter responses (2-3 min)
   - "Many of you noticed that... Let's explore why..."
   
2. Guided discovery (8-12 min)
   - Use questioning to guide students to discover concepts
   - Include think-pair-share moments
   - Use concrete examples before abstract
   - Build from simple → complex
   
3. Co-construct understanding (5-7 min)
   - Students help build definitions, formulas, or models
   - Use visual representations (diagrams, graphs, etc.)
   - Check for understanding with quick formative checks
   
4. Practice with feedback (5-8 min)
   - Worked example with student input
   - Students try similar problem in pairs
   - Immediate feedback and error correction

TEACHING STRATEGIES TO INCLUDE:
- Socratic questioning: "What do you notice? Why might that be?"
- Think-Aloud: Model problem-solving verbally
- Collaborative learning: "Discuss with your partner..."
- Formative checks: Mini whiteboards, thumbs up/down, exit tickets
- Multiple representations: Verbal, visual, symbolic, kinesthetic

Example (GOOD):
"Let's revisit your starter predictions. [Student name] said the table doesn't push back. Let's test this. I'll place this force sensor under the book. What do you observe on the display? [Students respond: It shows a force!] Exactly! The table DOES push back.

Now, turn to your partner: If the table pushes up with the same force the book pushes down, why doesn't the book fly upward? [2 min discussion]

[Listen to responses] Great thinking! The key is that these forces act on DIFFERENT objects. Let's draw this... [co-construct force diagram with students]

The book experiences TWO forces: gravity (down) and the normal force from the table (up). These are balanced. But Newton's Third Law is about PAIRS of forces between TWO objects..."

Example (BAD):
"Newton's Third Law states that for every action, there is an equal and opposite reaction. This means forces come in pairs. For example, when you push on a wall, the wall pushes back on you with the same force. The forces are equal in magnitude but opposite in direction."

--------------------------------------------------
7. COOPERATIVE TASKS (DETAILED & DIFFERENTIATED)
--------------------------------------------------

You must design THREE cooperative tasks with CLEAR, SPECIFIC instructions.

A. SUPPORT GROUP (Lowest DOK)
- State EXACTLY what students do step-by-step
- Provide scaffolds: sentence stems, graphic organizers, worked examples
- Specify the deliverable (diagram, calculation, explanation)
- Include teacher check-in points

Example:
"Support Group - Identifying Force Pairs (DOK 1-2)

Task: Working in pairs, identify action-reaction force pairs in everyday scenarios.

Materials: Force Pairs Worksheet, scenario cards

Steps:
1. Read each scenario card (e.g., 'A person sitting on a chair')
2. Use the sentence stem: 'Object A pushes/pulls on Object B, so Object B pushes/pulls back on Object A'
3. Draw arrows showing both forces in the pair
4. Label each force with magnitude and direction

Deliverable: Complete 5 scenarios with correctly labeled force pairs

Teacher checkpoint: After scenario 2, check for correct labeling before continuing"

B. CORE GROUP (Middle DOK)
- Requires reasoning and application
- Students must explain their thinking
- Include a problem-solving component

Example:
"Core Group - Applying Newton's Third Law (DOK 2-3)

Task: Calculate and analyze force pairs in collision scenarios.

Scenario: A 1200 kg car traveling at 20 m/s collides with a stationary 800 kg car.

Steps:
1. Calculate the momentum before collision
2. Using conservation of momentum, determine the velocities after collision
3. Calculate the force each car exerts on the other during the 0.5 s collision
4. Explain: Are the forces equal? Why or why not?
5. Predict: What happens if the second car is moving toward the first car?

Deliverable: Complete calculations with written explanations for steps 4-5

Success criteria: Correct calculations (70%), clear explanation using Newton's Third Law"

C. CHALLENGE GROUP (Highest DOK)
- Requires analysis, evaluation, or design
- Open-ended with multiple solution paths
- Students must justify their decisions

Example:
"Challenge Group - Engineering Application (DOK 3-4)

Task: Design a safety system that minimizes injury during a collision.

Challenge: You are an automotive engineer. Design a car safety feature that reduces the impact force on passengers during a collision.

Requirements:
1. Research: How do airbags, crumple zones, and seatbelts use Newton's Third Law?
2. Design: Sketch and explain your improved safety system
3. Analyze: Calculate force reduction using F = Δp/Δt (show how increasing time decreases force)
4. Evaluate: What are the trade-offs of your design? (cost, weight, effectiveness)

Deliverable: Design sketch, force calculations, written justification (300 words)

Extension: Present your design to the class and defend your choices based on physics principles"

--------------------------------------------------
8. INDEPENDENT TASKS (DETAILED & DOK-ALIGNED)
--------------------------------------------------

You must design THREE independent tasks following the same differentiation approach.

Each task must:
- Be clearly different from cooperative tasks (not repetitive)
- Specify the deliverable 
- Provide assessment guidance

SUPPORT Level Example:
"Independent Practice - Force Pairs in Daily Life (DOK 1-2)

Task: Complete the Force Pairs Identification Sheet

Instructions:
1. For each of 8 scenarios, identify the action-reaction pair
2. Draw and label forces with arrows
3. Write one sentence explaining why the forces are equal

Scenarios include: jumping, swimming, rocket launch, walking

Success Criteria:
- All 8 scenarios completed
- Forces correctly identified (object A on B, object B on A)
- Arrows show correct direction
- Explanation uses key vocabulary (action, reaction, equal, opposite)

Time: 15 minutes
Assessment: Self-check with answer key, then teacher review"

CORE Level Example:
"Independent Practice - Collision Analysis (DOK 2-3)

Task: Solve 4 collision problems involving momentum and force

Problems:
1. Head-on collision: Calculate forces during impact
2. Rear-end collision: Determine acceleration of both vehicles
3. Elastic collision: Apply conservation of momentum and energy
4. Real-world application: Calculate forces in a sports scenario (choose: football tackle, hockey check, or billiards)

For each problem:
- Show all work and formulas
- Explain: Why are the forces equal even if the masses differ?
- Predict: How would changing one variable affect the outcome?


CHALLENGE Level Example:
"Independent Research & Analysis (DOK 3-4)

Task: Investigate a real-world application of Newton's Third Law

Choose one:
A) Rocket propulsion in space exploration
B) Recoil in firearms
C) Swimming biomechanics
D) Jet engine thrust

Requirements:
1. Research the physics behind your chosen application
2. Create a detailed force diagram showing all action-reaction pairs
3. Perform calculations demonstrating momentum/force relationships
4. Analyze: Why is this application effective? What are limitations?
5. Design: Propose an improvement based on physics principles

Deliverable: 
- 2-page report with diagrams and calculations
- Must cite 2 reputable sources
- Include a "conclusion" section evaluating the effectiveness

--------------------------------------------------
9. PLENARY (MULTI-LEVEL ASSESSMENT)
--------------------------------------------------

Create 4-5 questions spanning DOK levels to assess understanding.

Format: [DOK Level] Question

Examples:
✓ [DOK 1] "Define Newton's Third Law in your own words"
✓ [DOK 2] "Calculate the reaction force when a 50 kg person jumps with 400 N force"
✓ [DOK 3] "Explain why a rocket can accelerate in space even though there's nothing to push against"
✓ [DOK 4] "Design an experiment to prove Newton's Third Law using household items. Justify your method"

--------------------------------------------------
10. VOCABULARY, RESOURCES & SKILLS
--------------------------------------------------

VOCABULARY: List 5-8 key terms with brief definitions

RESOURCES: Provide SPECIFIC, USABLE resources with links
- Include: textbook pages, online simulations, videos, lab equipment
- Format: "Resource Name - URL or description"

Example:
✓ "PhET Forces and Motion Simulation - https://phet.colorado.edu/en/simulation/forces-and-motion-basics"
✓ "Khan Academy: Newton's Third Law - https://www.khanacademy.org/science/physics/forces-newtons-laws/newtons-laws-of-motion/v/newton-s-third-law-of-motion"

SKILLS: List 3-5 transferable skills developed in this lesson

--------------------------------------------------
11. CROSS-CURRICULAR CONNECTIONS
--------------------------------------------------

MY IDENTITY (MANDATORY):
Culture – Use when the topic involves:

Language, literature, and communication

Historical events, traditions, and cultural practices

UAE heritage, archaeology, and traditional knowledge
Elements: Arabic Language, History, Heritage

Values – Use when the topic involves:

Ethical decision-making and moral reasoning

Interpersonal skills, empathy, and understanding others

Global understanding and international cooperation
Elements: Respect, Compassion, Global Understanding

Citizenship – Use when the topic involves:

Environmental issues, sustainability, and conservation

Community participation and civic responsibility

National identity and social responsibility
Elements: Belonging, Volunteering, Conservation

Select the domain that best represents the topic’s main learning intent, even if secondary aspects overlap with other domains.
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

Remember:
- SMART objectives are mandatory
- Standards must be EXACT and SPECIFIC
- Tasks must be DETAILED with clear instructions
- Starter must be ATTENTION-GRABBING
- Teaching must be STUDENT-CENTERED
- All sections must be inspection-ready

Generate the lesson plan now.`;

// ================= STATIC FILES =================

// Serve frontend
app.get('/', (req, res) => {
  const htmlPath = path.join(__dirname, 'enhanced-lesson-planner.html');
  if (fs.existsSync(htmlPath)) {
    res.sendFile(htmlPath);
  } else {
    res.status(404).json({ 
      error: 'Frontend not found', 
      message: 'enhanced-lesson-planner.html not found' 
    });
  }
});

// ================= API ROUTE =================

app.post("/api/generate", upload.single("file"), async (req, res) => {
  console.log('\n========== NEW LESSON GENERATION REQUEST ==========');
  
  try {
    const {
      subject, grade, topic, level, period,
      date, semester, lessonType, giftedTalented, standardType
    } = req.body;

    console.log('Request parameters:', {
      subject, grade, topic, level, lessonType, giftedTalented
    });

    // Validate required fields
    if (!subject || !grade || !topic || !level) {
      console.error('Missing required fields');
      return res.status(400).json({
        error: 'Missing required fields',
        required: ['subject', 'grade', 'topic', 'level']
      });
    }

    // Determine standards framework
    const standardsFramework = getStandardsFramework(subject, grade);
    console.log('Standards framework selected:', standardsFramework);

    // Get DOK distribution
    const dokLevels = DOK_PROFILE[level.toLowerCase()] || DOK_PROFILE.introductory;
    console.log('DOK levels for', level, ':', dokLevels);

    // Extract syllabus content if file provided
    let syllabusContent = "";
    if (req.file) {
      console.log('Processing uploaded file:', req.file.originalname);
      syllabusContent = await extractFileContent(req.file.path);
      console.log('Syllabus content extracted:', syllabusContent.substring(0, 200) + '...');
      
      // Clean up uploaded file
      try {
        fs.unlinkSync(req.file.path);
      } catch (err) {
        console.error('File cleanup error:', err);
      }
    }

    // Build AI prompt
    const userPrompt = `Generate a comprehensive lesson plan with the following specifications:

LESSON DETAILS:
- Subject: ${subject}
- Grade: ${grade}
- Topic: ${topic}
- Lesson Level: ${level}
- Standards Framework: ${standardsFramework}
- DOK Distribution: ${dokLevels.join(', ')}
${syllabusContent ? `\nSYLLABUS CONTEXT:\n${syllabusContent}\n` : ''}
${giftedTalented === 'yes' ? '\nINCLUDE: Advanced Learning Needs (ALN) objective for gifted and talented students\n' : ''}

CRITICAL REQUIREMENTS FOR DEPTH & DIFFERENTIATION:

1. TEACHING COMPONENT: This must be a detailed narrative (300+ words). 
   - DO NOT just list steps. 
   - Describe the dialogue, the specific questions you will ask, and how you will handle student misconceptions.
   - Explicitly state how you will model the concept.

2. COOPERATIVE TASKS: Create 3 CLEARLY DIFFERENT tasks.
   - The Support task must be foundational (DOK 1-2).
   - The Average task must be application-based (DOK 2-3).
   - The Challenge task must be analytical or creative (DOK 3-4).
   - They MUST NOT be the same task with different difficulty; they should be different activities.

3. INDEPENDENT TASKS: These must be distinct from the cooperative tasks. 
   - Ensure they provide a path for students to demonstrate individual mastery at their specific level.

4. STANDARDS: Provide the EXACT standard code and complete description from ${standardsFramework}.

Generate the complete lesson plan following the JSON format specified.`;

    console.log('\n=== CALLING AI API ===');
    console.log('Prompt length:', userPrompt.length, 'characters');

    // Call AI API
    let aiResponse;
    try {
      const completion = await client.chat.completions.create({
        model: "llama-3.3-70b-versatile",
        messages: [
          {
            role: "system",
            content: EXPERT_SYSTEM_PROMPT
          },
          {
            role: "user",
            content: userPrompt
          }
        ],
        temperature: 0.7,
        max_tokens: 8000,
        response_format: { type: "json_object" }
      });

      aiResponse = completion.choices[0]?.message?.content;
      console.log('AI response received:', aiResponse ? 'YES' : 'NO');
      console.log('Response length:', aiResponse?.length || 0, 'characters');

    } catch (apiError) {
      console.error('AI API Error:', apiError);
      return res.status(500).json({
        error: 'AI generation failed',
        details: apiError.message
      });
    }

    if (!aiResponse) {
      console.error('No AI response received');
      return res.status(500).json({
        error: 'No response from AI',
        details: 'The AI did not generate any content'
      });
    }

    // Parse AI response
    let aiData;
    try {
      // Clean potential markdown blocks from AI response
      const cleanJson = aiResponse.replace(/```json\n?|\n?```/g, '').trim();
      aiData = JSON.parse(cleanJson);
      console.log('AI response parsed successfully');
      console.log('Generated objectives:', aiData.objectives?.length || 0);
      console.log('Standard text:', aiData.standardText?.substring(0, 100) || 'MISSING');
    } catch (parseError) {
      console.error('JSON Parse Error:', parseError);
      console.error('AI Response:', aiResponse.substring(0, 500));
      return res.status(500).json({
        error: 'Failed to parse AI response',
        details: parseError.message,
        aiResponse: aiResponse.substring(0, 500)
      });
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
      standardText: safe(aiData.standardText || `${standardsFramework} - Standard for Grade ${grade} ${subject}: ${topic}`),

      // SMART Objectives
      objective1: safe(aiData.objectives?.[0]?.text || `Students will demonstrate understanding of ${topic} (${dokLevels[0]})`),
      objective2: safe(aiData.objectives?.[1]?.text || `Students will apply concepts from ${topic} (${dokLevels[1]})`),
      objective3: safe(aiData.objectives?.[2]?.text || `Students will analyze applications of ${topic} (${dokLevels[2]})`),

      // Outcomes
      outcomeAll: safe(aiData.outcomes?.all?.text || `All students will identify key concepts of ${topic}`),
      outcomeMost: safe(aiData.outcomes?.most?.text || `Most students will apply ${topic} to solve problems`),
      outcomeSome: safe(aiData.outcomes?.some?.text || `Some students will evaluate and justify solutions using ${topic}`),

      // Content
      vocabulary: safe(Array.isArray(aiData.vocabulary) ? aiData.vocabulary.join('\n') : aiData.vocabulary || 'Key terms'),
      resources: safe(
        Array.isArray(aiData.resources) 
          ? aiData.resources.join('\n') 
          : aiData.resources || 'Educational resources and materials'
      ),
      skills: safe(aiData.skills || 'Critical thinking, problem-solving, collaboration'),

      // Activities - Enhanced
      starter: safe(aiData.starter || 'Attention-grabbing inquiry-based starter to activate prior knowledge and reveal misconceptions'),
      teaching: safe(aiData.teaching || 'Detailed student-centered teaching component with guided discovery, Socratic questioning, and formative checks'),

      // Cooperative tasks - Detailed and differentiated
      coopUpper: safe(aiData.cooperative?.upper || 'Challenge: Advanced analysis task requiring justification, evaluation, and design thinking'),
      coopAverage: safe(aiData.cooperative?.average || 'Core: Structured application task requiring reasoning and explanation'),
      coopSupport: safe(aiData.cooperative?.support || 'Support: Scaffolded task with graphic organizers, sentence stems, and peer support'),

      // Independent tasks - Detailed and differentiated
      indepUpper: safe(aiData.independent?.upper || 'Challenge: Research and evaluation task with higher-order thinking and real-world application'),
      indepAverage: safe(aiData.independent?.average || 'Core: Application task with clear steps, success criteria, and self-assessment'),
      indepSupport: safe(aiData.independent?.support || 'Support: Guided practice with templates, worked examples, and immediate feedback'),

      // Plenary
      plenary: safe(
        Array.isArray(aiData.plenary) 
          ? aiData.plenary.map((p, i) => `${i + 1}. (${p.dok}) ${p.q}`).join('\n')
          : aiData.plenary || 'Multi-level review questions assessing understanding'
      ),

      // Cross-curricular
      myIdentity: safe(
        aiData.identity && aiData.identity.domain && aiData.identity.element && aiData.identity.description
          ? `Domain: ${aiData.identity.domain} - Element: ${aiData.identity.element}\n\n${aiData.identity.description}`
          : `Domain and Element must be selected by AI based on topic relevance.`
      ),
      identityDomain: safe(aiData.identity?.domain || 'ERROR'),
      identityElement: safe(aiData.identity?.element || 'ERROR'),
      identityDescription: safe(aiData.identity?.description || 'My Identity description missing.'),
      
      moralEducation: safe(aiData.moralEducation || 'Connection to Islamic values and moral education'),
      steam: safe(aiData.steam || 'Science, Technology, Engineering, Arts, Mathematics connections'),
      linksToSubjects: safe(aiData.linksToSubjects || 'Cross-curricular connections'),
      environment: safe(aiData.environment || 'UAE sustainability and environmental connections'),

      // Real world
      realWorld: safe(aiData.realWorld || 'Real-world applications in UAE context with industry and career connections'),

      // ALN for Gifted Students
      alnObjectives: giftedTalented === 'yes' 
        ? safe(aiData.alnObjective || `Gifted students will synthesize ${topic} concepts through advanced research, designing innovative solutions (DOK 4).`)
        : ''
    };

    console.log('Template data prepared');
    console.log('Standard Text:', templateData.standardText.substring(0, 100) + '...');
    console.log('Objective 1:', templateData.objective1.substring(0, 100) + '...');
    console.log('My Identity:', templateData.identityDomain + ' - ' + templateData.identityElement);
    console.log('ALN Objectives:', templateData.alnObjectives ? 'POPULATED' : 'EMPTY');

    // Load template
    const templatePath = path.join(__dirname, 'LESSON PLAN TEMPLATE.docx');
    
    console.log('Looking for template at:', templatePath);
    console.log('Template exists:', fs.existsSync(templatePath));
    
    if (!fs.existsSync(templatePath)) {
      console.error('Template file not found');
      return res.status(500).json({ 
        error: 'Template file not found', 
        details: `Template not found at: ${templatePath}`,
        workingDirectory: __dirname,
        filesInDir: fs.readdirSync(__dirname)
      });
    }

    console.log('Loading template from:', templatePath);
    
    let templateContent, zip, doc;
    try {
      templateContent = fs.readFileSync(templatePath);
      zip = new PizZip(templateContent);
      doc = new Docxtemplater(zip, {
        paragraphLoop: true,
        linebreaks: true,
      });
    } catch (templateError) {
      console.error('Template loading error:', templateError);
      return res.status(500).json({
        error: 'Failed to load template',
        details: templateError.message
      });
    }

    // Render template
    console.log('Rendering template with AI data...');
    try {
      doc.setData(templateData);
      doc.render();
    } catch (renderError) {
      console.error('Template render error:', renderError);
      return res.status(500).json({ 
        error: 'Failed to render template', 
        details: renderError.message,
        properties: renderError.properties
      });
    }

    // Generate buffer
    let buffer;
    try {
      buffer = doc.getZip().generate({
        type: 'nodebuffer',
        compression: 'DEFLATE',
      });
    } catch (bufferError) {
      console.error('Buffer generation error:', bufferError);
      return res.status(500).json({
        error: 'Failed to generate document',
        details: bufferError.message
      });
    }

    console.log('Document generated successfully');
    console.log('File size:', buffer.length, 'bytes');

    // Send file
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename="Lesson_Plan_G${grade}_${subject}_${topic.replace(/\s+/g, '_')}.docx"`);
    res.send(buffer);

    console.log('========== LESSON GENERATION COMPLETE ==========');
    
  } catch (error) {
    console.error('Unexpected error in lesson generation:', error);
    res.status(500).json({
      error: 'Internal server error',
      details: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// Test endpoint
app.get('/api/test', (req, res) => {
  res.json({ 
    status: 'OK', 
    message: 'Enhanced Expert Lesson Plan Server is running',
    timestamp: new Date().toISOString() 
  });
});

// ================= ERROR HANDLING MIDDLEWARE =================

app.use((error, req, res, next) => {
  console.error('Unhandled error:', error);
  res.status(500).json({
    error: 'Internal server error',
    details: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: 'Not found',
    message: `Route ${req.method} ${req.path} not found`
  });
});

// ================= START SERVER =================

app.listen(PORT, '0.0.0.0', () => {
  console.log('═══════════════════════════════════════════════');
  console.log('   ENHANCED EXPERT LESSON PLAN SERVER');
  console.log('═══════════════════════════════════════════════');
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`📁 Template: ${path.join(__dirname, 'LESSON PLAN TEMPLATE.docx')}`);
  console.log(`🤖 AI: Groq llama-3.3-70b-versatile`);
  console.log(`✨ Features: SMART Objectives, Exact Standards, Student-Centered`);
  console.log('═══════════════════════════════════════════════\n');
});


