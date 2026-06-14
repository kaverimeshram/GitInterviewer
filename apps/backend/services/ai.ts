import OpenAI from "openai";
import { z } from "zod";
import { zodTextFormat } from "openai/helpers/zod";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const CHATGPT_MODEL = process.env.OPENAI_MODEL || "gpt-5.5";
const difficultySchema = z.enum(["Easy", "Medium", "Hard"]);

const candidateProfileSchema = z.object({
  technologiesUsed: z.array(z.string()),
  projectCategories: z.array(z.string()),
  experienceLevel: z.enum(["Junior", "Mid-level", "Senior"]),
  questions: z.array(
    z.object({
      question: z.string(),
      topic: z.string(),
      difficulty: difficultySchema,
    })
  ),
});

const answerEvaluationSchema = z.object({
  score: z.number(),
  feedback: z.string(),
  difficulty: difficultySchema,
  nextQuestion: z.string().nullable(),
  interviewEnded: z.boolean(),
});

const finalEvaluationSchema = z.object({
  technicalKnowledge: z.number(),
  problemSolving: z.number(),
  communication: z.number(),
  confidence: z.number(),
  overallScore: z.number(),
  strengths: z.array(z.string()),
  weaknesses: z.array(z.string()),
  recommendations: z.array(z.string()),
  feedback: z.string(),
});

async function generateStructuredJson<T>(
  prompt: string,
  schema: z.ZodType<T>,
  name: string
): Promise<T> {
  const response = await openai.responses.parse({
    model: CHATGPT_MODEL,
    input: prompt,
    text: {
      format: zodTextFormat(schema, name),
    },
  });

  if (!response.output_parsed) {
    throw new Error(`No structured response from OpenAI while generating ${name}.`);
  }

  return response.output_parsed;
}

export interface RepoMetadata {
  name: string;
  description: string;
  language: string;
  stars: number;
  topics: string[];
}

export interface CandidateProfile {
  technologiesUsed: string[];
  projectCategories: string[];
  experienceLevel: "Junior" | "Mid-level" | "Senior";
  questions: {
    question: string;
    topic: string;
    difficulty: "Easy" | "Medium" | "Hard";
  }[];
}

export interface AnswerEvaluation {
  score: number; // 1 to 5
  feedback: string;
  difficulty: "Easy" | "Medium" | "Hard";
  nextQuestion: string | null;
  interviewEnded: boolean;
}

export interface FinalEvaluation {
  technicalKnowledge: number;
  problemSolving: number;
  communication: number;
  confidence: number;
  overallScore: number;
  strengths: string[];
  weaknesses: string[];
  recommendations: string[];
  feedback: string;
}

/**
 * Scans a candidate's GitHub repositories to build their profile and pre-generate interview questions.
 */
export async function generateProfileAndQuestions(username: string, repos: RepoMetadata[]): Promise<CandidateProfile> {
  const prompt = `
You are a top-tier technical interviewer. Review the following GitHub repositories of the candidate "${username}":
${JSON.stringify(repos, null, 2)}

Task:
1. Identify key technologies, frameworks, and programming languages used.
2. Deduce project categories (e.g., frontend, backend, machine learning, compiler design, tooling).
3. Estimate the candidate's experience level (Junior, Mid-level, or Senior) based on the sophistication and scale of projects.
4. Pre-generate 5 personalized technical interview questions.
   - These questions must directly target their actual repositories rather than general concepts.
   - For example, if they have a repository for a custom compiler, ask about the parser or code generator instead of generic questions.
   - Distribute the questions by difficulty ("Easy", "Medium", "Hard") and list what topic they address.

Return ONLY a JSON object matching this schema (do not wrap in markdown tags or include any extra text):
{
  "technologiesUsed": ["string"],
  "projectCategories": ["string"],
  "experienceLevel": "Junior" | "Mid-level" | "Senior",
  "questions": [
    {
      "question": "string",
      "topic": "string",
      "difficulty": "Easy" | "Medium" | "Hard"
    }
  ]
}
`;

  return generateStructuredJson(prompt, candidateProfileSchema, "candidate_profile");
}

/**
 * Evaluates the user's latest answer, adjusts interview difficulty, and determines the next question.
 */
export async function evaluateAnswerAndGetNextQuestion(
  githubMetadata: any,
  messages: { role: string; content: string }[],
  latestAnswer: string,
  currentDifficulty: string,
  questionCount: number
): Promise<AnswerEvaluation> {
  const prompt = `
You are an expert technical interviewer conducting a voice/chat-based interview.
The candidate's GitHub profile metadata:
${JSON.stringify(githubMetadata)}

Here is the conversation history so far:
${messages.map((m) => `${m.role.toUpperCase()}: ${m.content}`).join("\n")}

The candidate's latest answer to your last question: "${latestAnswer}"

Current difficulty: "${currentDifficulty}"
Total questions asked so far (including the one just answered): ${questionCount} (Max default is 5)

Task:
1. Evaluate the latest answer for correctness, technical depth, and clarity.
2. Assign a quality score (1 to 5) for this answer.
3. Determine the next difficulty level:
   - If quality score is >= 4, increase difficulty (e.g., Easy -> Medium, Medium -> Hard, Hard -> Hard).
   - If quality score is <= 2, decrease difficulty (e.g., Hard -> Medium, Medium -> Easy, Easy -> Easy).
   - Otherwise, keep current difficulty.
4. Select or generate the next question (Question #${questionCount + 1}).
   - The question must be personalized based on their GitHub projects.
   - Make it feel like a natural continuation, or shift topics to another project.
   - IMPORTANT: If they have already answered 5 questions (i.e. questionCount >= 5), set "interviewEnded" to true and "nextQuestion" to null. Do NOT generate a next question.

Return ONLY a JSON object matching this schema:
{
  "score": number, // 1 to 5 quality score
  "feedback": "string", // short critique of the answer
  "difficulty": "Easy" | "Medium" | "Hard", // adjusted next difficulty
  "nextQuestion": "string" | null, // next question to ask, null if interviewEnded
  "interviewEnded": boolean // true if this was the last question (5th answer)
}
`;

  return generateStructuredJson(prompt, answerEvaluationSchema, "answer_evaluation");
}

/**
 * Generates the final evaluation report at the end of the interview.
 */
export async function generateFinalEvaluation(
  githubMetadata: any,
  messages: { role: string; content: string }[]
): Promise<FinalEvaluation> {
  const prompt = `
You are a senior tech lead evaluating a candidate's technical interview performance.
Candidate's GitHub Profile Metadata:
${JSON.stringify(githubMetadata)}

Full Interview Transcript:
${messages.map((m) => `${m.role.toUpperCase()}: ${m.content}`).join("\n")}

Task:
Generate a comprehensive performance evaluation covering the following categories:
1. Technical Knowledge: Depth of understanding of concepts, libraries, and frameworks used.
2. Problem Solving: Clarity of analytical thinking and approaches to implementation questions.
3. Communication: Articulation of ideas, conciseness, and precision.
4. Confidence: Technical certainty, fluency, and lack of hesitation.

Assign a score out of 10 for each of the four categories above.
Calculate an Overall Score (out of 100) combining these criteria.
Provide 3-5 concrete strengths, 3-5 concrete weaknesses/areas of improvement, actionable recommendations, and a detailed overall feedback paragraph.

Return ONLY a JSON object matching this schema:
{
  "technicalKnowledge": number, // out of 10
  "problemSolving": number, // out of 10
  "communication": number, // out of 10
  "confidence": number, // out of 10
  "overallScore": number, // out of 100
  "strengths": ["string"],
  "weaknesses": ["string"],
  "recommendations": ["string"],
  "feedback": "string"
}
`;

  return generateStructuredJson(prompt, finalEvaluationSchema, "final_evaluation");
}
