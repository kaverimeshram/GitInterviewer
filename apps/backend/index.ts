import "dotenv/config";
import express from "express";
import cors from "cors";
import PDFDocument from "pdfkit";
import { prisma } from "./db";
import { scrapeGithub } from "./scrapers/github";
import {
  generateProfileAndQuestions,
  evaluateAnswerAndGetNextQuestion,
  generateFinalEvaluation,
} from "./services/ai";

const app = express();
app.use(express.json());
app.use(cors());

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

    // If session is Pre, start the interview and choose/generate first question
    if (interview.status === "Pre") {
      const metadata = interview.githubMetadata as any;
      const preGenerated = metadata?.preGeneratedQuestions || [];

      // Choose first question
      let firstQuestion = "Could you tell me about the architecture of your primary GitHub project?";
      if (preGenerated.length > 0) {
        // Prefer starting with an Easy or Medium difficulty question
        const startingQuestion =
          preGenerated.find((q: any) => q.difficulty === "Medium" || q.difficulty === "Easy") ||
          preGenerated[0];
        firstQuestion = startingQuestion.question;
      }

      // Save the first question as a message
      await prisma.message.create({
        data: {
          interviewId,
          role: "assistant",
          content: firstQuestion,
        },
      });

      const updatedInterview = await prisma.interview.update({
        where: { id: interviewId },
        data: {
          status: "InProgress",
          questionCount: 1,
        },
        include: { messages: true },
      });

      res.json({
        status: updatedInterview.status,
        difficulty: updatedInterview.difficulty,
        questionCount: updatedInterview.questionCount,
        currentQuestion: firstQuestion,
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

app.listen(3001, () => {
  console.log("🚀 Backend server listening on port 3001");
});