import "dotenv/config";
import express from "express";
import cors from "cors";
import PDFDocument from "pdfkit";
import { prisma } from "./db.js";
import { scrapeGithub } from "./scrapers/github.js";
import {
  generateProfileAndQuestions,
  evaluateAnswerAndGetNextQuestion,
  generateFinalEvaluation,
} from "./services/ai.js";

const app = express();
app.use(express.json());
app.use(cors());

const REALTIME_MODEL = process.env.OPENAI_REALTIME_MODEL || "gpt-realtime-2";
const TRANSCRIPTION_MODEL = process.env.OPENAI_TRANSCRIPTION_MODEL || "gpt-4o-mini-transcribe";
const REALTIME_VOICES = new Set([
  "alloy",
  "ash",
  "ballad",
  "coral",
  "echo",
  "sage",
  "shimmer",
  "verse",
  "marin",
  "cedar",
]);

// POST /api/v1/pre-interview
app.post("/api/v1/pre-interview", async (req, res) => {
  try {
    const { github } = req.body;
    if (!github || typeof github !== "string") {
      res.status(400).json({ error: "Please provide a valid GitHub profile URL" });
      return;
    }

    // Clean and validate URL
    const sanitizedUrl = github.trim().replace(/\/$/, "");
    const username = sanitizedUrl.split("/").pop();
    if (!username) {
      res.status(400).json({ error: "Could not extract username from GitHub URL" });
      return;
    }

    // Scrape repositories
    const repos = await scrapeGithub(username);

    // Analyze profile and pre-generate questions
    const aiAnalysis = await generateProfileAndQuestions(username, repos);

    const githubMetadata = {
      username,
      repos,
      profile: {
        technologiesUsed: aiAnalysis.technologiesUsed,
        projectCategories: aiAnalysis.projectCategories,
        experienceLevel: aiAnalysis.experienceLevel,
      },
      preGeneratedQuestions: aiAnalysis.questions,
    };

    // Create interview record
    const interview = await prisma.interview.create({
      data: {
        githubUrl: sanitizedUrl,
        githubMetadata: githubMetadata,
        status: "Pre",
        difficulty: "Medium",
        questionCount: 0,
      },
    });

    res.json({ id: interview.id });
  } catch (err: any) {
    console.error("Error in /pre-interview:", err);
    res.status(500).json({ error: err.message || "Failed to initialize interview" });
  }
});

// GET /api/v1/interview/:interviewId
app.get("/api/v1/interview/:interviewId", async (req, res) => {
  try {
    const { interviewId } = req.params;
    const interview = await prisma.interview.findUnique({
      where: { id: interviewId },
      include: { messages: true },
    });

    if (!interview) {
      res.status(404).json({ error: "Interview session not found" });
      return;
    }

    // If session is Pre, start the interview and greet the candidate first
    if (interview.status === "Pre") {
      const initialGreeting = "Hello! Welcome to your technical interview today. I've analyzed your GitHub profile. To start off, could you tell me a bit about your work experience?";

      // Save the introductory greeting as a message
      await prisma.message.create({
        data: {
          interviewId,
          role: "assistant",
          content: initialGreeting,
        },
      });

      const updatedInterview = await prisma.interview.update({
        where: { id: interviewId },
        data: {
          status: "InProgress",
          questionCount: 0,
        },
        include: { messages: true },
      });

      res.json({
        status: updatedInterview.status,
        difficulty: updatedInterview.difficulty,
        questionCount: updatedInterview.questionCount,
        currentQuestion: initialGreeting,
        messages: updatedInterview.messages,
      });
      return;
    }

    // Find the latest assistant message
    const assistantMsgs = interview.messages.filter((m) => m.role === "assistant");
    const currentQuestion = assistantMsgs[assistantMsgs.length - 1]?.content || "";

    res.json({
      status: interview.status,
      difficulty: interview.difficulty,
      questionCount: interview.questionCount,
      currentQuestion,
      messages: interview.messages,
    });
  } catch (err: any) {
    console.error("Error fetching interview:", err);
    res.status(500).json({ error: err.message || "Failed to retrieve interview details" });
  }
});

// POST /api/v1/interview/chat
app.post("/api/v1/interview/chat", async (req, res) => {
  try {
    const { interviewId, answer } = req.body;
    if (!interviewId || !answer) {
      res.status(400).json({ error: "Missing interviewId or answer text" });
      return;
    }

    const interview = await prisma.interview.findUnique({
      where: { id: interviewId },
      include: { messages: true },
    });

    if (!interview) {
      res.status(404).json({ error: "Interview session not found" });
      return;
    }

    if (interview.status === "Done") {
      res.json({ reply: "The interview is completed.", ended: true });
      return;
    }

    // 1. Save user answer
    await prisma.message.create({
      data: {
        interviewId,
        role: "user",
        content: answer.trim(),
      },
    });

    // 2. Fetch all messages up to now
    const allMessages = await prisma.message.findMany({
      where: { interviewId },
      orderBy: { createdAt: "asc" },
    });

    const formattedMessages = allMessages.map((m) => ({
      role: m.role,
      content: m.content,
    }));

    // Handle conversational introduction turns if questionCount is 0
    if (interview.questionCount === 0) {
      const assistantMessages = allMessages.filter((m) => m.role === "assistant");
      const assistantMsgCount = assistantMessages.length;

      if (assistantMsgCount === 1) {
        // Stage 1: Candidate has answered with their work experience.
        // Respond asking for confirmation to start the technical interview questions.
        const readyCheckMsg = "Thanks for sharing that! Based on your experience and your GitHub repositories, I've prepared a set of adaptive technical questions. Are you ready to begin the technical part of the interview?";

        await prisma.message.create({
          data: {
            interviewId,
            role: "assistant",
            content: readyCheckMsg,
          },
        });

        res.json({
          reply: readyCheckMsg,
          ended: false,
        });
        return;
      } else if (assistantMsgCount === 2) {
        // Stage 2: Candidate has confirmed they are ready.
        // Fetch and ask the first actual GitHub-based question.
        const metadata = interview.githubMetadata as any;
        const preGenerated = metadata?.preGeneratedQuestions || [];

        let firstQuestion = "Could you tell me about the architecture of your primary GitHub project?";
        if (preGenerated.length > 0) {
          const startingQuestion =
            preGenerated.find((q: any) => q.difficulty === "Medium" || q.difficulty === "Easy") ||
            preGenerated[0];
          firstQuestion = startingQuestion.question;
        }

        await prisma.message.create({
          data: {
            interviewId,
            role: "assistant",
            content: firstQuestion,
          },
        });

        // Update database: questionCount is now 1
        await prisma.interview.update({
          where: { id: interviewId },
          data: {
            questionCount: 1,
          },
        });

        res.json({
          reply: firstQuestion,
          ended: false,
        });
        return;
      }
    }

    // 3. Evaluate answer and get next question
    const evaluation = await evaluateAnswerAndGetNextQuestion(
      interview.githubMetadata,
      formattedMessages,
      answer,
      interview.difficulty,
      interview.questionCount
    );

    // Check if max question count (5) is reached
    const newQuestionCount = interview.questionCount; // Count remains same until next assistant message is saved
    if (evaluation.interviewEnded || newQuestionCount >= 5) {
      // Transition interview to Done
      await prisma.interview.update({
        where: { id: interviewId },
        data: {
          status: "Done",
        },
      });

      // Background process: compile the final evaluation report
      generateFinalEvaluation(interview.githubMetadata, formattedMessages)
        .then(async (finalEval) => {
          await prisma.result.upsert({
            where: { interviewId },
            update: {
              score: finalEval.overallScore,
              feedback: finalEval.feedback,
              strengths: finalEval.strengths,
              weaknesses: finalEval.weaknesses,
              recommendations: finalEval.recommendations,
              technicalKnowledge: finalEval.technicalKnowledge,
              problemSolving: finalEval.problemSolving,
              communication: finalEval.communication,
              confidence: finalEval.confidence,
            },
            create: {
              interviewId,
              score: finalEval.overallScore,
              feedback: finalEval.feedback,
              strengths: finalEval.strengths,
              weaknesses: finalEval.weaknesses,
              recommendations: finalEval.recommendations,
              technicalKnowledge: finalEval.technicalKnowledge,
              problemSolving: finalEval.problemSolving,
              communication: finalEval.communication,
              confidence: finalEval.confidence,
            },
          });
          console.log(`Successfully generated result database record for interview: ${interviewId}`);
        })
        .catch((err) => {
          console.error(`Failed background final evaluation for interview ${interviewId}:`, err);
        });

      res.json({
        reply: "Perfect. You have completed all 5 questions. We are now generating your final evaluation. Please wait.",
        ended: true,
      });
      return;
    }

    // 4. Save next question
    await prisma.message.create({
      data: {
        interviewId,
        role: "assistant",
        content: evaluation.nextQuestion!,
      },
    });

    // 5. Update difficulty and increment question count
    await prisma.interview.update({
      where: { id: interviewId },
      data: {
        difficulty: evaluation.difficulty,
        questionCount: newQuestionCount + 1,
      },
    });

    res.json({
      reply: evaluation.nextQuestion,
      ended: false,
    });
  } catch (err: any) {
    console.error("Error in /interview/chat:", err);
    res.status(500).json({ error: err.message || "Failed to process interview response" });
  }
});

// POST /api/v1/interview/end
app.post("/api/v1/interview/end", async (req, res) => {
  try {
    const { interviewId } = req.body;
    if (!interviewId) {
      res.status(400).json({ error: "Missing interviewId" });
      return;
    }

    const interview = await prisma.interview.findUnique({
      where: { id: interviewId },
      include: { messages: true, result: true },
    });

    if (!interview) {
      res.status(404).json({ error: "Interview session not found" });
      return;
    }

    if (interview.status !== "Done") {
      await prisma.interview.update({
        where: { id: interviewId },
        data: { status: "Done" },
      });
    }

    if (interview.result) {
      res.json(interview.result);
      return;
    }

    // Generate evaluation on demand if background compilation isn't finished yet
    const formattedMessages = interview.messages.map((m) => ({
      role: m.role,
      content: m.content,
    }));

    const finalEval = await generateFinalEvaluation(interview.githubMetadata, formattedMessages);

    const result = await prisma.result.create({
      data: {
        interviewId,
        score: finalEval.overallScore,
        feedback: finalEval.feedback,
        strengths: finalEval.strengths,
        weaknesses: finalEval.weaknesses,
        recommendations: finalEval.recommendations,
        technicalKnowledge: finalEval.technicalKnowledge,
        problemSolving: finalEval.problemSolving,
        communication: finalEval.communication,
        confidence: finalEval.confidence,
      },
    });

    res.json(result);
  } catch (err: any) {
    console.error("Error in /interview/end:", err);
    res.status(500).json({ error: err.message || "Failed to finalize evaluation report" });
  }
});

// GET /api/v1/result/:interviewId
app.get("/api/v1/result/:interviewId", async (req, res) => {
  try {
    const { interviewId } = req.params;
    const interview = await prisma.interview.findUnique({
      where: { id: interviewId },
      include: { messages: true, result: true },
    });

    if (!interview) {
      res.status(404).json({ error: "Result not found" });
      return;
    }

    // If status is Done but result hasn't been saved yet, calculate it now
    if (interview.status === "Done" && !interview.result) {
      const formattedMessages = interview.messages.map((m) => ({
        role: m.role,
        content: m.content,
      }));

      try {
        const finalEval = await generateFinalEvaluation(interview.githubMetadata, formattedMessages);
        const result = await prisma.result.create({
          data: {
            interviewId,
            score: finalEval.overallScore,
            feedback: finalEval.feedback,
            strengths: finalEval.strengths,
            weaknesses: finalEval.weaknesses,
            recommendations: finalEval.recommendations,
            technicalKnowledge: finalEval.technicalKnowledge,
            problemSolving: finalEval.problemSolving,
            communication: finalEval.communication,
            confidence: finalEval.confidence,
          },
        });
        res.json({
          status: "Done",
          score: result.score,
          feedback: result.feedback,
          strengths: result.strengths,
          weaknesses: result.weaknesses,
          recommendations: result.recommendations,
          technicalKnowledge: result.technicalKnowledge,
          problemSolving: result.problemSolving,
          communication: result.communication,
          confidence: result.confidence,
          transcript: interview.messages.map((m) => ({
            type: m.role === "assistant" ? "Assistant" : "User",
            content: m.content,
            createdAt: m.createdAt.toISOString(),
          })),
        });
        return;
      } catch (evalErr) {
        console.error("On-demand report generation failed:", evalErr);
      }
    }

    res.json({
      status: interview.status,
      score: interview.result?.score || 0,
      feedback: interview.result?.feedback || "",
      strengths: interview.result?.strengths || [],
      weaknesses: interview.result?.weaknesses || [],
      recommendations: interview.result?.recommendations || [],
      technicalKnowledge: interview.result?.technicalKnowledge || 0,
      problemSolving: interview.result?.problemSolving || 0,
      communication: interview.result?.communication || 0,
      confidence: interview.result?.confidence || 0,
      transcript: interview.messages.map((m) => ({
        type: m.role === "assistant" ? "Assistant" : "User",
        content: m.content,
        createdAt: m.createdAt.toISOString(),
      })),
    });
  } catch (err: any) {
    console.error("Error in GET /result:", err);
    res.status(500).json({ error: err.message || "Failed to retrieve interview results" });
  }
});

// GET /api/v1/result/:interviewId/pdf
app.get("/api/v1/result/:interviewId/pdf", async (req, res) => {
  try {
    const { interviewId } = req.params;
    const interview = await prisma.interview.findUnique({
      where: { id: interviewId },
      include: { messages: true, result: true },
    });

    if (!interview || !interview.result) {
      res.status(404).send("Interview report is not ready or not found.");
      return;
    }

    const doc = new PDFDocument({ margin: 50 });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename=interview_report_${interviewId}.pdf`);
    doc.pipe(res);

    // Title & Brand
    doc.fontSize(22).fillColor("#1e1b4b").text("AI Technical Interview Report", { align: "center" });
    doc.fontSize(10).fillColor("#64748b").text("GitHub-Aware Voice Interviewer Platform", { align: "center" });
    doc.moveDown(1.5);

    // Session Details
    doc.fontSize(14).fillColor("#0f172a").text("Candidate & Session Details", { underline: true });
    doc.moveDown(0.5);
    doc.fontSize(11).fillColor("#334155").text(`Candidate GitHub: ${interview.githubUrl}`);
    doc.text(`Date of Interview: ${interview.createdAt.toLocaleString()}`);
    doc.text(`Difficulty Profile: ${interview.difficulty}`);
    doc.text(`Overall Score: ${interview.result.score} / 100`);
    doc.moveDown(1.5);

    // GitHub Repo Analysis
    doc.fontSize(14).fillColor("#0f172a").text("GitHub Repositories Analyzed", { underline: true });
    doc.moveDown(0.5);
    const metadata = interview.githubMetadata as any;
    const repos = metadata?.repos || [];
    if (repos.length === 0) {
      doc.fontSize(11).fillColor("#475569").text("No public repositories were analyzed.");
    } else {
      repos.slice(0, 5).forEach((repo: any) => {
        doc.fontSize(11).fillColor("#0f172a").text(`- ${repo.name} [Lang: ${repo.language || "N/A"}, Stars: ${repo.stars}]`);
        if (repo.description) {
          doc.fontSize(9).fillColor("#475569").text(`  Description: ${repo.description}`);
        }
      });
      if (repos.length > 5) {
        doc.fontSize(10).fillColor("#64748b").text(`... and ${repos.length - 5} other repositories.`);
      }
    }
    doc.moveDown(1.5);

    // Evaluation Scores
    doc.fontSize(14).fillColor("#0f172a").text("Evaluation Metrics (out of 10)", { underline: true });
    doc.moveDown(0.5);
    doc.fontSize(11).fillColor("#334155")
      .text(`Technical Knowledge: ${interview.result.technicalKnowledge} / 10`)
      .text(`Problem Solving:     ${interview.result.problemSolving} / 10`)
      .text(`Communication:       ${interview.result.communication} / 10`)
      .text(`Confidence:          ${interview.result.confidence} / 10`);
    doc.moveDown(1.5);

    // Strengths & Weaknesses
    doc.fontSize(14).fillColor("#0f172a").text("Strengths & Weaknesses", { underline: true });
    doc.moveDown(0.5);
    doc.fontSize(11).fillColor("#0f172a").text("Strengths:");
    interview.result.strengths.forEach((s: string) => {
      doc.fontSize(10).fillColor("#334155").text(`  • ${s}`);
    });
    doc.moveDown(0.5);
    doc.fontSize(11).fillColor("#0f172a").text("Weaknesses:");
    interview.result.weaknesses.forEach((w: string) => {
      doc.fontSize(10).fillColor("#334155").text(`  • ${w}`);
    });
    doc.moveDown(1.5);

    // Feedback & Recommendations
    doc.fontSize(14).fillColor("#0f172a").text("Feedback & Recommendations", { underline: true });
    doc.moveDown(0.5);
    doc.fontSize(11).fillColor("#0f172a").text("Overall Feedback:");
    doc.fontSize(10).fillColor("#334155").text(interview.result.feedback, { align: "justify" });
    doc.moveDown(0.5);
    doc.fontSize(11).fillColor("#0f172a").text("Recommendations for Improvement:");
    interview.result.recommendations.forEach((r: string) => {
      doc.fontSize(10).fillColor("#334155").text(`  • ${r}`);
    });
    doc.moveDown(1.5);

    // Q&A Transcript Page
    doc.addPage();
    doc.fontSize(16).fillColor("#1e1b4b").text("Interview Transcript", { align: "center" });
    doc.moveDown(1);

    let qIndex = 1;
    let currentQuestionText = "";
    interview.messages.forEach((m) => {
      if (m.role === "assistant") {
        currentQuestionText = m.content;
      } else if (m.role === "user") {
        doc.fontSize(11).fillColor("#1e1b4b").text(`Q${qIndex}: ${currentQuestionText}`, { bold: true } as any);
        doc.fontSize(10).fillColor("#334155").text(`A: ${m.content}`);
        doc.moveDown(1.2);
        qIndex++;
      }
    });

    doc.end();
  } catch (err: any) {
    console.error("PDF generation failed:", err);
    res.status(500).send("Failed to generate PDF report");
  }
});

// POST /api/v1/interview/:interviewId/session
app.post("/api/v1/interview/:interviewId/session", async (req, res) => {
  try {
    const { interviewId } = req.params;
    const requestedVoice = typeof req.body?.voice === "string" ? req.body.voice : "";
    const voice = REALTIME_VOICES.has(requestedVoice) ? requestedVoice : "marin";
    const interview = await prisma.interview.findUnique({
      where: { id: interviewId },
    });

    if (!interview) {
      res.status(404).json({ error: "Interview session not found" });
      return;
    }

    const metadata = interview.githubMetadata as any;
    const reposStr = JSON.stringify(metadata?.repos || []);
    const questionsStr = JSON.stringify(metadata?.preGeneratedQuestions || []);

    const systemInstructions = `
You are GitInterviewer, a senior tech lead conducting a natural technical voice interview.
The candidate's GitHub repositories:
${reposStr}

Pre-generated questions to target:
${questionsStr}

Your instructions:
1. Speak only in English. Do not switch languages. If the candidate speaks another language, politely ask them to continue in English.
2. Start with a warm greeting, introduce yourself, and ask the candidate to briefly describe their work experience.
3. After they answer, acknowledge it naturally and ask if they are ready to begin the technical questions.
4. After they confirm, ask exactly 5 technical questions based on the repositories. Use the pre-generated list as a guide, but ask one question at a time and wait for the candidate's answer before moving on.
5. Number technical questions clearly as "Question 1 of 5", "Question 2 of 5", and so on.
6. Keep responses concise and conversational. Do not output large code blocks unless the candidate explicitly asks.
7. Do not answer for the candidate, continue from silence, or invent candidate responses. Wait for the candidate's speech or typed message.
8. After the candidate answers Question 5 of 5, thank them and end with the exact sentence: "The interview is now complete."
`.trim();

    const openAiRes = await fetch("https://api.openai.com/v1/realtime/client_secrets", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
        "OpenAI-Safety-Identifier": `interview-${interviewId}`,
      },
      body: JSON.stringify({
        expires_after: {
          anchor: "created_at",
          seconds: 600,
        },
        session: {
          type: "realtime",
          model: REALTIME_MODEL,
          instructions: systemInstructions,
          output_modalities: ["audio"],
          audio: {
            input: {
              transcription: {
                model: TRANSCRIPTION_MODEL,
                language: "en",
                prompt: "Technical interview answers in English. Preserve programming language names, repository names, framework names, and acronyms accurately.",
              },
              noise_reduction: {
                type: "near_field",
              },
              turn_detection: {
                type: "semantic_vad",
                eagerness: "medium",
                create_response: true,
                interrupt_response: true,
              },
            },
            output: {
              voice,
              speed: 1.0,
            },
          },
          max_output_tokens: 700,
        },
      }),
    });

    const data = await openAiRes.json() as any;
    if (data.error) {
      console.error("OpenAI Realtime error:", data.error);
      res.status(500).json({ error: data.error.message || "Failed to create realtime session" });
      return;
    }

    const token = data.client_secret?.value || data.value;
    if (!token) {
      console.error("OpenAI Realtime error - no token returned:", data);
      res.status(500).json({ error: "No client secret token returned by OpenAI" });
      return;
    }

    res.json({
      client_secret: token,
      model: REALTIME_MODEL,
      voice,
    });
  } catch (err: any) {
    console.error("Error creating realtime session:", err);
    res.status(500).json({ error: err.message || "Failed to create realtime session" });
  }
});

// POST /api/v1/interview/:interviewId/finalize
app.post("/api/v1/interview/:interviewId/finalize", async (req, res) => {
  try {
    const { interviewId } = req.params;
    const { messages } = req.body; // Array of { role, content }

    if (!Array.isArray(messages)) {
      res.status(400).json({ error: "Missing or invalid messages list" });
      return;
    }

    const transcriptMessages = messages
      .filter((m: any) => (m?.role === "assistant" || m?.role === "user") && typeof m?.content === "string")
      .map((m: any) => ({
        role: m.role,
        content: m.content.trim(),
      }))
      .filter((m: { role: string; content: string }) => m.content.length > 0);

    const interview = await prisma.interview.findUnique({
      where: { id: interviewId },
    });

    if (!interview) {
      res.status(404).json({ error: "Interview session not found" });
      return;
    }

    // 1. Delete any existing messages to avoid duplicates
    await prisma.message.deleteMany({
      where: { interviewId },
    });

    // 2. Insert the final messages log
    if (transcriptMessages.length > 0) {
      await prisma.message.createMany({
        data: transcriptMessages.map((m) => ({
          interviewId,
          role: m.role,
          content: m.content,
        })),
      });
    }

    // 3. Mark interview as Done
    await prisma.interview.update({
      where: { id: interviewId },
      data: {
        status: "Done",
      },
    });

    // 4. Generate the final evaluation report using OpenAI Realtime transcript
    const finalEval = await generateFinalEvaluation(interview.githubMetadata, transcriptMessages);

    // 5. Save evaluation scorecard
    await prisma.result.upsert({
      where: { interviewId },
      update: {
        score: finalEval.overallScore,
        feedback: finalEval.feedback,
        strengths: finalEval.strengths,
        weaknesses: finalEval.weaknesses,
        recommendations: finalEval.recommendations,
        technicalKnowledge: finalEval.technicalKnowledge,
        problemSolving: finalEval.problemSolving,
        communication: finalEval.communication,
        confidence: finalEval.confidence,
      },
      create: {
        interviewId,
        score: finalEval.overallScore,
        feedback: finalEval.feedback,
        strengths: finalEval.strengths,
        weaknesses: finalEval.weaknesses,
        recommendations: finalEval.recommendations,
        technicalKnowledge: finalEval.technicalKnowledge,
        problemSolving: finalEval.problemSolving,
        communication: finalEval.communication,
        confidence: finalEval.confidence,
      },
    });

    res.json({ success: true });
  } catch (err: any) {
    console.error("Error finalizing interview:", err);
    res.status(500).json({ error: err.message || "Failed to finalize interview scorecard" });
  }
});

if (process.env.NODE_ENV !== "production") {
  app.listen(3001, () => {
    console.log("🚀 Backend server listening on port 3001");
  });
}

export default app;
