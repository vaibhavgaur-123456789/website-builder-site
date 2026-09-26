// Exam content definitions. Adding an exam = adding an entry here (or via the admin panel). No code changes.
// Patterns follow the publicly documented structure of each exam; weightages are relative importance (1–5).

export interface TopicDef {
  slug: string;
  name: string;
  weightage: number;
  difficulty: number;
  minutes: number;
  gen?: string;
  bank?: string;
  count?: number;
  children?: TopicDef[];
}
export interface SubjectDef {
  slug: string;
  name: string;
  weightage: number;
  quant?: boolean;
  memory?: boolean;
  topics: TopicDef[];
}
export interface SectionDef {
  name: string;
  questionCount: number;
  subjects: SubjectDef[];
}
export interface BenchmarkDef {
  metric: "MOCK_PERCENT" | "ACCURACY" | "WEEKLY_MINUTES" | "QUESTIONS_PER_DAY" | "CONSISTENCY";
  value: number;
  p25: number;
  p75: number;
}
export interface ExamDef {
  slug: string;
  name: string;
  shortName: string;
  category: string;
  description: string;
  durationMinutes: number;
  totalQuestions: number;
  marksPerQuestion: number;
  negativeMarking: number;
  sections: SectionDef[];
  fullMocks: number;
  referenceBenchmarks: BenchmarkDef[];
}

const t = (slug: string, name: string, weightage: number, difficulty: number, minutes: number, src: { gen?: string; bank?: string; count?: number } = {}, children?: TopicDef[]): TopicDef => ({ slug, name, weightage, difficulty, minutes, ...src, children });

// Shared topic blocks (each exam gets its own copies; subjects are exam-specific).
const quantCore = (): TopicDef[] => [
  t("number-system", "Number System", 4, 3, 240, { gen: "numberSystem" }),
  t("simplification", "Simplification", 3, 2, 120, { gen: "simplification" }),
  t("percentage", "Percentage", 5, 2, 180, { gen: "percentage" }),
  t("profit-loss", "Profit & Loss", 5, 3, 200, { gen: "profitLoss" }),
  t("ratio-proportion", "Ratio & Proportion", 4, 2, 150, { gen: "ratio" }),
  t("average", "Average", 3, 2, 120, { gen: "average" }),
  t("interest", "Simple & Compound Interest", 4, 3, 180, { gen: "interest" }),
  t("time-work", "Time & Work", 4, 3, 180, { gen: "timeWork" }),
  t("time-speed-distance", "Time, Speed & Distance", 4, 3, 200, { gen: "tsd" }),
  t("mixture-alligation", "Mixture & Alligation", 2, 3, 120, { gen: "mixture" }),
];

const gaHistory = () =>
  t("history", "History", 4, 3, 360, {}, [
    t("ancient-history", "Ancient History", 3, 3, 150, { bank: "gk.ancient" }),
    t("medieval-history", "Medieval History", 3, 3, 150, { bank: "gk.medieval" }),
    t("modern-history", "Modern History", 4, 3, 180, { bank: "gk.modern" }),
  ]);
const gaCore = (): TopicDef[] => [
  gaHistory(),
  t("polity", "Indian Polity", 5, 3, 300, { bank: "gk.polity" }),
  t("geography", "Geography", 4, 3, 300, { bank: "gk.geography" }),
  t("economics", "Economics", 3, 3, 200, { bank: "gk.economics" }),
  t("static-gk", "Static GK", 3, 2, 180, { bank: "gk.static" }),
  t("current-affairs", "Current Affairs (last 6 months)", 4, 2, 300),
];
const scienceCore = (): TopicDef[] => [
  t("physics", "Physics", 4, 3, 360, {}, [
    t("mechanics", "Physics: Mechanics", 3, 3, 150, { bank: "gs.mechanics" }),
    t("electricity", "Physics: Electricity", 4, 3, 150, { bank: "gs.electricity" }),
    t("light-sound", "Physics: Light & Sound", 3, 3, 120, { bank: "gs.optics" }),
  ]),
  t("chemistry", "Chemistry", 4, 3, 240, { bank: "gs.chemistry" }),
  t("biology", "Biology", 4, 2, 240, { bank: "gs.biology" }),
];
const englishCore = (): TopicDef[] => [
  t("reading-comprehension", "Reading Comprehension", 5, 3, 240, { bank: "eng.reading" }),
  t("error-spotting", "Error Spotting", 5, 3, 200, { bank: "eng.errors" }),
  t("fill-blanks", "Fill in the Blanks / Cloze", 4, 2, 150, { bank: "eng.fillers" }),
  t("sentence-improvement", "Sentence Improvement", 3, 3, 120, { bank: "eng.improvement" }),
  t("para-jumbles", "Para Jumbles", 3, 3, 120, { bank: "eng.parajumble" }),
];
const vocab = (): TopicDef[] => [
  t("synonyms", "Synonyms", 3, 2, 120, { bank: "eng.synonyms" }),
  t("antonyms", "Antonyms", 3, 2, 120, { bank: "eng.antonyms" }),
  t("idioms", "Idioms & Phrases", 3, 2, 120, { bank: "eng.idioms" }),
  t("one-word", "One Word Substitution", 3, 2, 100, { bank: "eng.oneWord" }),
  t("spelling", "Spelling Correction", 2, 1, 60, { bank: "eng.spelling" }),
];
const reasoningCore = (): TopicDef[] => [
  t("analogy", "Analogy", 4, 2, 120, { gen: "analogy" }),
  t("classification", "Classification (Odd One Out)", 3, 2, 90, { gen: "oddOne" }),
  t("series", "Number Series", 4, 3, 150, { gen: "numberSeries" }),
  t("alphabet-series", "Alphabet Series", 3, 2, 90, { gen: "alphabetSeries" }),
  t("coding-decoding", "Coding-Decoding", 4, 2, 150, { gen: "codingDecoding" }),
  t("blood-relations", "Blood Relations", 4, 3, 120, { bank: "rsn.blood" }),
  t("direction-sense", "Direction Sense", 3, 2, 90, { gen: "direction" }),
  t("order-ranking", "Order & Ranking", 3, 2, 90, { gen: "ranking" }),
  t("syllogism", "Syllogism", 4, 3, 150, { bank: "rsn.syllogism" }),
  t("venn-diagrams", "Venn Diagrams", 2, 2, 60, { bank: "rsn.venn" }),
];

export const EXAMS: ExamDef[] = [
  {
    slug: "ssc-cgl-tier1",
    name: "SSC CGL Tier 1",
    shortName: "SSC CGL",
    category: "SSC",
    description: "Staff Selection Commission Combined Graduate Level, Tier 1: 100 questions, 60 minutes, 2 marks each, 0.5 negative.",
    durationMinutes: 60,
    totalQuestions: 100,
    marksPerQuestion: 2,
    negativeMarking: 0.5,
    fullMocks: 4,
    sections: [
      { name: "General Intelligence & Reasoning", questionCount: 25, subjects: [{ slug: "reasoning", name: "Reasoning", weightage: 25, topics: reasoningCore() }] },
      {
        name: "General Awareness",
        questionCount: 25,
        subjects: [
          { slug: "general-awareness", name: "General Awareness", weightage: 15, memory: true, topics: gaCore() },
          { slug: "general-science", name: "General Science", weightage: 10, memory: true, topics: scienceCore() },
        ],
      },
      {
        name: "Quantitative Aptitude",
        questionCount: 25,
        subjects: [{
          slug: "quant", name: "Quantitative Aptitude", weightage: 25, quant: true,
          topics: [
            ...quantCore(),
            t("algebra", "Algebra", 4, 4, 240, { gen: "algebra" }),
            t("geometry", "Geometry", 4, 4, 300, { gen: "geometry" }),
            t("mensuration", "Mensuration", 4, 3, 240, { gen: "mensuration" }),
            t("trigonometry", "Trigonometry", 4, 4, 240, { gen: "trigonometry" }),
            t("data-interpretation", "Data Interpretation", 3, 3, 180, { gen: "dataInterpretation" }),
          ],
        }],
      },
      { name: "English Comprehension", questionCount: 25, subjects: [{ slug: "english", name: "English", weightage: 25, topics: [...englishCore(), ...vocab(), t("voice", "Active & Passive Voice", 2, 2, 90, { bank: "eng.voice" }), t("narration", "Direct & Indirect Speech", 2, 2, 90, { bank: "eng.narration" })] }] },
    ],
    referenceBenchmarks: [
      { metric: "MOCK_PERCENT", value: 58, p25: 46, p75: 70 },
      { metric: "ACCURACY", value: 70, p25: 61, p75: 78 },
      { metric: "WEEKLY_MINUTES", value: 1260, p25: 840, p75: 1680 },
      { metric: "QUESTIONS_PER_DAY", value: 90, p25: 55, p75: 130 },
      { metric: "CONSISTENCY", value: 71, p25: 50, p75: 86 },
    ],
  },
  {
    slug: "rrb-ntpc-cbt1",
    name: "RRB NTPC CBT 1",
    shortName: "RRB NTPC",
    category: "RAILWAY",
    description: "Railway Recruitment Board Non-Technical Popular Categories, CBT 1: 100 questions, 90 minutes, 1 mark each, 1/3 negative.",
    durationMinutes: 90,
    totalQuestions: 100,
    marksPerQuestion: 1,
    negativeMarking: 1 / 3,
    fullMocks: 2,
    sections: [
      { name: "Mathematics", questionCount: 30, subjects: [{ slug: "mathematics", name: "Mathematics", weightage: 30, quant: true, topics: [...quantCore(), t("mensuration", "Mensuration", 3, 3, 200, { gen: "mensuration" }), t("algebra", "Elementary Algebra", 3, 3, 150, { gen: "algebra" })] }] },
      { name: "General Intelligence & Reasoning", questionCount: 30, subjects: [{ slug: "general-intelligence", name: "General Intelligence", weightage: 30, topics: reasoningCore() }] },
      {
        name: "General Awareness",
        questionCount: 40,
        subjects: [
          { slug: "general-science", name: "General Science", weightage: 15, memory: true, topics: scienceCore() },
          { slug: "general-awareness", name: "General Awareness", weightage: 25, memory: true, topics: gaCore() },
        ],
      },
    ],
    referenceBenchmarks: [
      { metric: "MOCK_PERCENT", value: 62, p25: 50, p75: 73 },
      { metric: "ACCURACY", value: 72, p25: 63, p75: 80 },
      { metric: "WEEKLY_MINUTES", value: 1080, p25: 720, p75: 1500 },
      { metric: "QUESTIONS_PER_DAY", value: 80, p25: 50, p75: 120 },
      { metric: "CONSISTENCY", value: 68, p25: 48, p75: 84 },
    ],
  },
  {
    slug: "ibps-po-prelims",
    name: "IBPS PO Prelims",
    shortName: "IBPS PO",
    category: "BANKING",
    description: "Institute of Banking Personnel Selection, Probationary Officer Prelims: 100 questions, 60 minutes, 1 mark each, 0.25 negative.",
    durationMinutes: 60,
    totalQuestions: 100,
    marksPerQuestion: 1,
    negativeMarking: 0.25,
    fullMocks: 2,
    sections: [
      { name: "English Language", questionCount: 30, subjects: [{ slug: "english", name: "English Language", weightage: 30, topics: [...englishCore(), t("vocabulary", "Vocabulary", 3, 2, 150, { bank: "eng.synonyms" })] }] },
      {
        name: "Quantitative Aptitude",
        questionCount: 35,
        subjects: [{
          slug: "quant", name: "Quantitative Aptitude", weightage: 35, quant: true,
          topics: [
            t("simplification", "Simplification & Approximation", 5, 2, 150, { gen: "simplification" }),
            t("number-series", "Number Series", 5, 3, 150, { gen: "numberSeries" }),
            t("quadratic-equations", "Quadratic Equations", 4, 3, 120, { gen: "quadratic" }),
            t("data-interpretation", "Data Interpretation", 5, 4, 300, { gen: "dataInterpretation" }),
            t("percentage", "Percentage", 4, 2, 150, { gen: "percentage" }),
            t("profit-loss", "Profit & Loss", 4, 3, 150, { gen: "profitLoss" }),
            t("interest", "Simple & Compound Interest", 3, 3, 150, { gen: "interest" }),
            t("time-work", "Time & Work", 3, 3, 150, { gen: "timeWork" }),
            t("time-speed-distance", "Time, Speed & Distance", 3, 3, 150, { gen: "tsd" }),
            t("probability", "Probability", 3, 3, 120, { gen: "probability" }),
            t("mixture-alligation", "Mixture & Alligation", 2, 3, 100, { gen: "mixture" }),
          ],
        }],
      },
      {
        name: "Reasoning Ability",
        questionCount: 35,
        subjects: [{
          slug: "reasoning", name: "Reasoning Ability", weightage: 35,
          topics: [
            t("seating-puzzles", "Puzzles & Seating Arrangement", 5, 4, 360, { bank: "rsn.seating" }),
            t("syllogism", "Syllogism", 4, 3, 150, { bank: "rsn.syllogism" }),
            t("inequality", "Inequality", 4, 2, 120, { bank: "rsn.inequality" }),
            t("coding-decoding", "Coding-Decoding", 3, 2, 120, { gen: "codingDecoding" }),
            t("blood-relations", "Blood Relations", 3, 3, 100, { bank: "rsn.blood" }),
            t("direction-sense", "Direction Sense", 3, 2, 90, { gen: "direction" }),
            t("order-ranking", "Order & Ranking", 3, 2, 90, { gen: "ranking" }),
            t("alphanumeric-series", "Alphanumeric Series", 3, 2, 90, { gen: "alphabetSeries" }),
          ],
        }],
      },
    ],
    referenceBenchmarks: [
      { metric: "MOCK_PERCENT", value: 55, p25: 42, p75: 67 },
      { metric: "ACCURACY", value: 74, p25: 65, p75: 82 },
      { metric: "WEEKLY_MINUTES", value: 1400, p25: 900, p75: 1900 },
      { metric: "QUESTIONS_PER_DAY", value: 110, p25: 70, p75: 160 },
      { metric: "CONSISTENCY", value: 73, p25: 52, p75: 88 },
    ],
  },
];

export const ACHIEVEMENTS = [
  { code: "first_session", name: "First step", description: "Complete your first focused study session.", icon: "🚀", category: "MILESTONE", xpReward: 10 },
  { code: "hours_10", name: "First 10 hours", description: "Log 10 hours of validated study time.", icon: "⏱️", category: "MILESTONE", xpReward: 50 },
  { code: "hours_50", name: "50 hours in", description: "Log 50 hours of validated study time.", icon: "🏔️", category: "MILESTONE", xpReward: 150 },
  { code: "questions_100", name: "Century", description: "Solve 100 questions.", icon: "💯", category: "MILESTONE", xpReward: 30 },
  { code: "questions_1000", name: "Thousand strong", description: "Solve 1,000 questions.", icon: "🧮", category: "MILESTONE", xpReward: 150 },
  { code: "streak_7", name: "7-day consistency", description: "Study at least 25 minutes on 7 consecutive days.", icon: "🔥", category: "CONSISTENCY", xpReward: 50 },
  { code: "streak_10", name: "10-day consistency", description: "Study at least 25 minutes on 10 consecutive days.", icon: "🔥", category: "CONSISTENCY", xpReward: 70 },
  { code: "streak_30", name: "30-day consistency", description: "A full month of steady preparation.", icon: "🏆", category: "CONSISTENCY", xpReward: 200 },
  { code: "first_mock", name: "First mock", description: "Submit your first mock test.", icon: "📝", category: "MOCK", xpReward: 20 },
  { code: "mocks_10", name: "10 mocks", description: "Submit 10 mock tests.", icon: "📚", category: "MOCK", xpReward: 100 },
  { code: "accuracy_80", name: "Sharp shooter", description: "Reach 80%+ accuracy over at least 100 questions in a week.", icon: "🎯", category: "ACCURACY", xpReward: 80 },
  { code: "weak_topic_recovered", name: "Comeback", description: "Complete the recovery pathway for a weak topic.", icon: "📈", category: "IMPROVEMENT", xpReward: 80 },
  { code: "revisions_20", name: "Memory keeper", description: "Complete 20 spaced revisions.", icon: "🧠", category: "MILESTONE", xpReward: 60 },
  { code: "night_review_7", name: "Reflective", description: "Complete 7 night reviews.", icon: "🌙", category: "CONSISTENCY", xpReward: 40 },
  { code: "recovery_exit", name: "Back on track", description: "Exit recovery mode after 3 strong days.", icon: "🛟", category: "IMPROVEMENT", xpReward: 60 },
] as const;
