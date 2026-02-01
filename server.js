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

For CSTA K-12 Computer Science Standards:
- Include the grade level, standard code, and complete standard description
- Example: "9-10: 2-DA-07 - Represent data using multiple encoding schemes."
- Example: "6-8: 1B-CS-02 - Model the way information is transmitted, stored, and processed in digital systems."
- Use appropriate grade bands: K-2, 3-5, 6-8, 9-10, 11-12

If the standard type is not specified, use NGSS for science, Common Core for math, CSTA for computer science/ICT, and relevant national standards for other subjects.

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
   - CRITICAL: Match the standard TYPE to the SUBJECT and GRADE LEVEL:
     * MATH topics → Use Common Core Math standards (CCSS.MATH.CONTENT) with grade-specific domains
     * SCIENCE topics → Use NGSS standards (HS-PS, MS-PS, etc.) with grade bands
     * ENGLISH topics → Use Common Core ELA standards (CCSS.ELA-LITERACY) with grade bands
     * ICT/COMPUTER SCIENCE topics → Use CSTA K-12 Computer Science Standards with grade bands
     * BUSINESS STUDIES → Use Common Core California Career Technical Education (CTE) standards
     * ECONOMICS → Use Common Core California Economics standards (CA Content Standards Economics)
     * PUBLIC SPEAKING → Use Common Core California Speaking/Listening standards (CCSS.ELA-LITERACY.SL)
     * FRENCH → Use Common Core California World Languages standards (WL.CM)
     * PHYSICAL EDUCATION → Use Common Core California Physical Education standards (CA PE Standards)
     * VISUAL ARTS → Use Common Core California Visual Arts standards (CA VAPA)
     * SOCIAL STUDIES → Use Common Core California History/Social Science standards
   - For ${standardType}, include:
     * Full standard code (e.g., CCSS.MATH.CONTENT.1.OA.C.6 for Grade 1 Math)
     * Complete standard description/performance expectation
   - DO NOT write generic text like "Standard for Grade ${grade}"
   - DO NOT mix subject standards (NO physics standards for math topics!)
   - Examples by SUBJECT and GRADE:
     * GRADE 1 MATH (Single Digit Addition): "CCSS.MATH.CONTENT.1.OA.C.6: Add and subtract within 20, demonstrating fluency for addition and subtraction within 10. Use strategies such as counting on; making ten; decomposing a number leading to a ten; using the relationship between addition and subtraction; and creating equivalent but easier or known sums."
     * GRADE 2 MATH (Two Digit Addition): "CCSS.MATH.CONTENT.2.NBT.B.5: Fluently add and subtract within 100 using strategies based on place value, properties of operations, and/or the relationship between addition and subtraction."
     * GRADE 3 MATH (Multiplication): "CCSS.MATH.CONTENT.3.OA.A.1: Interpret products of whole numbers, e.g., interpret 5 × 7 as the total number of objects in 5 groups of 7 objects each."
     * GRADE 4 MATH (Multi-digit Multiplication): "CCSS.MATH.CONTENT.4.NBT.B.5: Multiply a whole number of up to four digits by a one-digit whole number, and multiply two two-digit numbers, using strategies based on place value and the properties of operations."
     * GRADE 5 MATH (Fractions): "CCSS.MATH.CONTENT.5.NF.A.1: Add and subtract fractions with unlike denominators by replacing given fractions with equivalent fractions in such a way as to produce an equivalent sum or difference of fractions with like denominators."
     * GRADE 6 MATH (Ratios): "CCSS.MATH.CONTENT.6.RP.A.1: Understand the concept of a ratio and use ratio language to describe a ratio relationship between two quantities."
     * GRADE 7 MATH (Proportional Relationships): "CCSS.MATH.CONTENT.7.RP.A.2: Recognize and represent proportional relationships between quantities."
     * GRADE 8 MATH (Linear Equations): "CCSS.MATH.CONTENT.8.EE.C.7: Solve linear equations in one variable."
     * GRADE 9-12 MATH (Quadratic Equations): "CCSS.MATH.CONTENT.HSA.REI.B.4: Solve quadratic equations in one variable."
     * GRADE 1 SCIENCE (Plant Parts): "1-LS1-1: Use materials to design a solution to a human problem by mimicking how plants and animals use their external parts to help them survive, grow, and meet their needs."
     * GRADE 1 SCIENCE (Plant Needs): "K-LS1-1: Use observations to describe patterns of what plants and animals (including humans) need to survive."
     * GRADE 2 SCIENCE (Plant Life Cycles): "2-LS2-1: Plan and conduct an investigation to determine if plants need sunlight and water to grow."
     * GRADE 3 SCIENCE (Plant Structures): "3-LS1-1: Develop models to describe that organisms have unique and diverse life cycles but all have in common birth, growth, reproduction, and death."
     * GRADE 4 SCIENCE (Plant Structures): "4-LS1-1: Construct an argument that plants and animals have internal and external structures that function to support survival, growth, behavior, and reproduction."
     * GRADE 5 SCIENCE (Plant Matter): "5-PS3-1: Use models to describe that energy in animals' food was once energy from the sun."
     * GRADE 1 ENGLISH (Story Writing): "CCSS.ELA-LITERACY.W.1.3: Write narratives in which they recount two or more appropriately sequenced events, include some details regarding what happened, use temporal words to signal event order, and provide some sense of closure."
     * GRADE 1 ENGLISH (Reading Stories): "CCSS.ELA-LITERACY.RL.1.2: Retell stories, including key details, and demonstrate understanding of their central message or lesson."
     * GRADE 1 ENGLISH (Story Elements): "CCSS.ELA-LITERACY.RL.1.3: Describe characters, settings, and major events in a story, using key details."
     * GRADE 2 ENGLISH (Story Writing): "CCSS.ELA-LITERACY.W.2.3: Write narratives in which they recount a well-elaborated event or short sequence of events, include details to describe actions, thoughts, and feelings, use temporal words to signal event order, and provide a sense of closure."
     * GRADE 3 ENGLISH (Story Writing): "CCSS.ELA-LITERACY.W.3.3: Write narratives to develop real or imagined experiences or events using effective technique, descriptive details, and clear event sequences."
     * ICT (Data Representation): "9-10: 2-DA-07 - Represent data using multiple encoding schemes."
     * ICT (Algorithms): "6-8: 1B-AP-10 - Create programs that include sequences, events, loops, and conditionals."
     * BUSINESS STUDIES (Marketing): "CA CTE 9.1.1: Demonstrate marketing concepts and strategies in a business environment."
     * ECONOMICS (Supply/Demand): "CA Content Standards Economics 12.2.1: Analyze the relationship between supply, demand, and price in competitive markets."
     * PUBLIC SPEAKING (Presentations): "CCSS.ELA-LITERACY.SL.9-10.4: Present information, findings, and supporting evidence clearly, concisely, and logically."
     * FRENCH (Conversation): "WL.CM.9-10.1: Engage in conversations on a variety of topics using appropriate vocabulary and grammar."
     * PHYSICAL EDUCATION (Fitness): "CA PE Standards 3.4: Assess and maintain a level of physical fitness to improve health and performance."
     * VISUAL ARTS (Drawing): "CA VAPA 2.1: Create original works of art using various media and techniques."

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

5. ENHANCED TEACHING COMPONENT (10-MINUTE MAXIMUM):
   - Create a detailed, student-centered teaching sequence (MAXIMUM 10 minutes)
   - Focus specifically on: What NEW knowledge and/or skill will you teach? How?
   - Structure as a direct instruction mini-lesson with clear timing:
   
   **FORMAT:**
   "Minutes 0-2: [Hook/Engagement] - Students will [specific action] to [activate prior knowledge]
   Minutes 2-7: [Direct Instruction] - I will teach [specific new knowledge/skill] by [method] using [materials]
   Minutes 7-10: [Guided Practice] - Students will [demonstrate understanding] through [specific activity]"
   
   **EXAMPLE FOR GRADE 1 STORY WRITING:**
   "Minutes 0-2: Hook/Engagement - Students will listen to a short story without ending and predict what happens next, sharing their ideas with a partner
   Minutes 2-7: Direct Instruction - I will teach story sequencing by modeling how to use 'first, then, next, finally' on a story map, using picture cards and think-aloud strategy
   Minutes 7-10: Guided Practice - Students will create their own 4-part story map using picture prompts, practicing temporal words with sentence starters"
   
   **STUDENT-CENTERED REQUIREMENTS:**
   - Use "Students will..." language throughout
   - Include specific student actions and responses
   - Describe exactly what students will DO, not just what teacher will say
   - Include hands-on activities where students manipulate materials
   - Incorporate think-pair-share or turn-and-talk opportunities
   - Provide specific examples of student work/products
   - Include formative assessment checks (thumbs up, whiteboards, etc.)
   
   **GRADE-SPECIFIC STRATEGIES:**
   - Grades K-2: Concrete manipulatives, movement, songs/rhymes, drawing, picture prompts
   - Grades 3-5: Models, diagrams, structured inquiry, peer teaching, graphic organizers
   - Grades 6-8: Investigations, data collection, argumentation, modeling
   - Grades 9-12: Analysis, design challenges, research, presentations
   
   **MUST INCLUDE:**
   - Specific timing breakdown (0-2, 2-7, 7-10 minutes)
   - Clear learning objective for this 10-minute segment
   - Student actions for each time segment
   - Materials students will use
   - How you'll check for understanding
   - What students will produce/show as evidence of learning

6. GIFTED STUDENTS ALN:
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
  console.log('Groq API Key present:', !!process.env.GROQ_API_KEY);
  console.log('API Key length:', process.env.GROQ_API_KEY?.length || 0);
  
  let attempts = 0;
  const maxAttempts = 2;
  
  while (attempts < maxAttempts) {
    attempts++;
    console.log(`AI attempt ${attempts}/${maxAttempts}`);
    
    try {
      const completion = await client.chat.completions.create({
        model: "mixtral-8x7b-32768",
        messages: [
          { role: "system", content: EXPERT_SYSTEM_PROMPT },
          { role: "user", content: userPrompt }
        ],
        temperature: 0.7,
        max_tokens: 2500
      });

      const raw = completion.choices[0].message.content;
      console.log('AI Response received:', raw.substring(0, 200) + '...');
      
      // Extract JSON from response
      const jsonStart = raw.indexOf('{');
      const jsonEnd = raw.lastIndexOf('}') + 1;
      const jsonStr = raw.slice(jsonStart, jsonEnd);
      
      const result = JSON.parse(jsonStr);
      console.log('✅ AI generation successful on attempt', attempts);
      return result;
      
    } catch (error) {
      console.error(`AI attempt ${attempts} failed:`, error.message);
      console.error('Full error:', error);
      
      if (attempts >= maxAttempts) {
        console.log('All AI attempts failed, using fallback...');
        break;
      }
      
      // Wait 2 seconds before retry
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
  
  // Fallback response with proper template
  const fallbackResponse = {
      standardText: `${standardType} Standard for Grade ${grade} ${subject}: ${topic}`,
      objectives: [
        { dok: "DOK1", text: `Students will identify and define key concepts related to ${topic}` },
        { dok: "DOK2", text: `Students will explain and apply ${topic} concepts in structured situations` },
        { dok: "DOK3", text: `Students will analyze and evaluate ${topic} applications in real-world contexts` }
      ],
      outcomes: {
        all: { dok: "DOK1", text: `All students will recognize and describe basic ${topic} concepts` },
        most: { dok: "DOK2", text: `Most students will apply ${topic} principles to solve problems` },
        some: { dok: "DOK3", text: `Some students will analyze and evaluate complex ${topic} scenarios` }
      },
      starter: `What do you already know about ${topic}? Write down 2-3 ideas and share with your partner.`,
      teaching: `Today we will explore ${topic} through interactive demonstrations, guided practice, and collaborative learning. We will build from basic concepts to practical applications.`,
      cooperative: {
        support: `Work in pairs to create a concept map showing key ideas about ${topic}. Use provided templates and examples to guide your thinking.`,
        average: `In small groups, analyze a case study involving ${topic} and create a presentation explaining the main concepts and their relationships.`,
        upper: `Design and evaluate a solution to a real-world problem using ${topic} principles. Justify your choices and predict potential outcomes.`
      },
      independent: {
        support: `Complete structured practice exercises on ${topic} with step-by-step guidance and immediate feedback.`,
        average: `Apply ${topic} concepts to solve 3-5 problems of increasing complexity, showing all work and explaining your reasoning.`,
        upper: `Research and critically evaluate how ${topic} is used in UAE industry or society. Write a 500-word analysis with recommendations.`
      },
      plenary: [
        { dok: "DOK1", q: `What are the 3 most important concepts about ${topic} we learned today?` },
        { dok: "DOK2", q: `How would you explain ${topic} to someone who has never studied it before?` },
        { dok: "DOK2", q: `What are the practical applications of ${topic} in daily life?` },
        { dok: "DOK3", q: `Why is ${topic} important for your future career or further studies?` },
        { dok: "DOK4", q: `How could ${topic} be improved or innovated to better serve society?` }
      ],
      vocabulary: ["terminology", "application", "analysis", "synthesis", "evaluation", "implementation"],
      resources: [
        `Khan Academy - ${topic} Tutorials: https://www.khanacademy.org/search?q=${encodeURIComponent(topic)}`,
        `YouTube - Educational Videos: https://www.youtube.com/results?search_query=${encodeURIComponent(topic)}+explained`,
        `Interactive simulations and digital tools for ${topic}`,
        `Grade-appropriate textbook materials and workbooks`,
        `Hands-on learning materials and laboratory equipment`,
        `Online assessment tools and practice platforms`
      ],
      skills: "Critical thinking, problem-solving, collaboration, communication, digital literacy, analysis",
      realWorld: `${topic} is essential in UAE's development, with applications in renewable energy, smart cities, healthcare innovation, and sustainable technology. Students will explore how ${topic} contributes to UAE Vision 2070 and global competitiveness.`,
      identity: {
        domain: subject.includes('Science') ? "Citizenship" : subject.includes('Math') ? "Value" : "Culture",
        element: subject.includes('Science') ? "Conservation" : subject.includes('Math') ? "Respect" : "Arabic Language",
        description: `${topic} connects to UAE's ${subject.includes('Science') ? 'environmental conservation and sustainability efforts' : subject.includes('Math') ? 'commitment to precision and innovation' : 'rich cultural heritage and linguistic traditions'}, promoting ${subject.includes('Science') ? 'responsible resource management' : subject.includes('Math') ? 'analytical thinking and ethical data use' : 'cultural understanding and communication excellence'}.`
      },
      moralEducation: `${topic} integrates with Islamic values through ethical considerations, responsible innovation, and commitment to serving humanity. Students learn to apply knowledge with integrity and compassion.`,
      steam: `${topic} demonstrates the integration of Science and Technology through practical applications, Engineering principles in problem-solving, Arts in creative solutions, and Mathematics in quantitative analysis and modeling.`,
      linksToSubjects: `Mathematics: Quantitative analysis and problem-solving\nEnglish: Technical communication and documentation\nScience: Scientific method and inquiry-based learning`,
      environment: `${topic} supports UAE's sustainability goals through efficient resource use, environmental protection, and development of green technologies that align with national climate action initiatives.`
    };
    
    // Add ALN objective if gifted students are selected
    if (giftedTalented === 'yes') {
      fallbackResponse.alnObjective = `Gifted students will design and implement an innovative ${topic} project that addresses a real UAE challenge, synthesizing advanced concepts with cutting-edge technology to create a scalable solution with measurable impact (DOK 4).`;
    }
    
    return fallbackResponse;
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
      console.error('Validation failed: Missing required fields');
      return res.status(400).json({ 
        error: "Missing required fields: grade, subject, topic, or level",
        received: { grade, subject, topic, lessonLevel }
      });
    }

    // Extract file content if uploaded
    let fileContent = '';
    if (req.file) {
      console.log('Processing uploaded file:', req.file.originalname);
      try {
        fileContent = await extractFileContent(req.file.path);
        fs.unlinkSync(req.file.path);
      } catch (fileError) {
        console.error('File processing error:', fileError);
        // Continue without file content
      }
    }

    // Generate lesson with AI
    console.log('Generating expert lesson plan...');
    let aiData;
    try {
      aiData = await generateExpertLesson({
        grade,
        subject,
        topic,
        level: lessonLevel,
        standardType: standardType || 'NGSS + AP College Board',
        fileContent,
        giftedTalented
      });
    } catch (aiError) {
      console.error('AI generation failed:', aiError.message);
      return res.status(500).json({
        error: 'AI generation failed',
        details: aiError.message,
        stack: process.env.NODE_ENV === 'development' ? aiError.stack : undefined
      });
    }

    console.log('AI Generation Complete');
    console.log('Objectives:', aiData.objectives?.length || 0);
    console.log('Standard Text:', aiData.standardText?.substring(0, 80) || 'MISSING');
    console.log('Identity:', aiData.identity?.domain + ' - ' + aiData.identity?.element || 'MISSING');
    console.log('Resources:', aiData.resources?.length || 0);
    console.log('ALN Objective:', aiData.alnObjective ? 'PRESENT' : 'NOT PRESENT');
    console.log('Teaching Component Length:', aiData.teaching?.length || 0);
    console.log('Full Teaching Component:', aiData.teaching || 'MISSING');
    console.log('Used AI or Fallback:', aiData.standardText?.includes('Standard for Grade') ? 'FALLBACK' : 'AI GENERATED');

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

    // Load template - use absolute path for Render compatibility
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
  console.log(`🤖 AI: Groq llama-3.3-70b-versatile`);
  console.log('═══════════════════════════════════════════════\n');
});
