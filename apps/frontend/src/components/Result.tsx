import { BACKEND_URL } from "@/lib/config";
import axios from "axios";
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { Bot, Loader2, Sparkles, User, FileText, CheckCircle2, AlertTriangle, Lightbulb, ChevronRight, BarChart2 } from "lucide-react";
import { Button } from "./ui/button";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface ResultData {
  status: "Done" | "InProgress" | "Pre";
  score: number; // overallScore 1-100
  feedback: string;
  strengths: string[];
  weaknesses: string[];
  recommendations: string[];
  technicalKnowledge: number; // 1-10
  problemSolving: number; // 1-10
  communication: number; // 1-10
  confidence: number; // 1-10
  transcript: { type: "Assistant" | "User"; content: string; createdAt: string }[];
}

export function Result() {
  const { interviewId } = useParams();
  const navigate = useNavigate();
  const [result, setResult] = useState<ResultData>({
    status: "Pre",
    score: 0,
    feedback: "",
    strengths: [],
    weaknesses: [],
    recommendations: [],
    technicalKnowledge: 0,
    problemSolving: 0,
    communication: 0,
    confidence: 0,
    transcript: [],
  });
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    const fetchResult = () =>
      axios.get(`${BACKEND_URL}/api/v1/result/${interviewId}`).then((response) => {
        setResult(response.data);
        return response.data.status as ResultData["status"];
      });

    fetchResult().catch((err) => {
      console.error("Error loading initial result:", err);
      toast.error("Failed to fetch interview results.");
    });

    const intervalId = setInterval(async () => {
      try {
        const s = await fetchResult();
        if (s === "Done") clearInterval(intervalId);
      } catch (e) {
        // Silent error while polling
      }
    }, 4000);

    return () => clearInterval(intervalId);
  }, [interviewId]);

  const handleDownloadPDF = () => {
    try {
      window.open(`${BACKEND_URL}/api/v1/result/${interviewId}/pdf`, "_blank");
      toast.success("Downloading PDF Report...");
    } catch (err) {
      toast.error("Failed to start PDF download.");
    }
  };

  const ready = result.status === "Done" && result.score > 0;

  // Custom Category progress helper
  const MetricBar = ({ name, score }: { name: string; score: number }) => (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between text-xs font-medium">
        <span className="text-slate-400">{name}</span>
        <span className="text-violet-400">{score} / 10</span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-slate-900 overflow-hidden border border-slate-800/40">
        <div
          className="h-full rounded-full bg-gradient-to-r from-violet-500 to-indigo-500 transition-all duration-500"
          style={{ width: `${score * 10}%` }}
        />
      </div>
    </div>
  );

  return (
    <div className="relative min-h-screen w-screen bg-slate-950 text-slate-100 flex flex-col">
      {/* Background ambient blur */}
      <div className="absolute top-[-15%] right-[-15%] h-[600px] w-[600px] rounded-full bg-indigo-600/5 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-15%] left-[-15%] h-[600px] w-[600px] rounded-full bg-violet-600/5 blur-[120px] pointer-events-none" />

      {/* Top Header */}
      <header className="border-b border-slate-900 bg-slate-950/80 backdrop-blur px-6 py-4 flex items-center justify-between sticky top-0 z-50">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center font-bold text-white shadow shadow-violet-500/30">
            R
          </div>
          <span className="font-semibold text-lg tracking-tight bg-gradient-to-r from-violet-200 to-slate-200 bg-clip-text text-transparent">
            Interview Results
          </span>
        </div>
        <div className="flex items-center gap-3">
          {ready && (
            <Button
              onClick={handleDownloadPDF}
              variant="outline"
              className="border-slate-800 hover:bg-slate-900 hover:text-slate-100 text-slate-300 flex items-center gap-2 text-sm"
            >
              <FileText className="h-4 w-4 text-violet-400" />
              Download PDF Report
            </Button>
          )}
          <Button
            onClick={() => navigate("/")}
            className="bg-violet-600 hover:bg-violet-500 text-white font-medium text-sm border-0"
          >
            New Interview
          </Button>
        </div>
      </header>

      {/* Page Content */}
      <main className="max-w-4xl mx-auto px-6 py-10 flex-grow w-full z-10">
        {!ready ? (
          <div className="flex flex-col items-center justify-center gap-5 rounded-2xl border border-slate-900 bg-slate-900/10 py-32 text-center shadow-2xl backdrop-blur-sm">
            <Loader2 className="h-10 w-10 animate-spin text-violet-500" />
            <div>
              <h3 className="text-lg font-semibold text-slate-200">Compiling Evaluation Report…</h3>
              <p className="mt-1.5 text-sm text-slate-400 max-w-sm leading-relaxed">
                Analyzing your responses, comparing with repository metadata, and grading competencies. This may take 5–15 seconds.
              </p>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-8">
            {/* Score and Core Metrics Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Overall Score Badge */}
              <section className="col-span-1 rounded-2xl border border-slate-900 bg-slate-900/20 p-6 flex flex-col items-center justify-center text-center shadow-lg backdrop-blur-md">
                <h2 className="text-xs uppercase tracking-wider text-slate-500 font-semibold mb-4">Overall Score</h2>
                <div className="relative flex items-center justify-center h-32 w-32 rounded-full border border-violet-500/20 bg-violet-500/5 shadow-inner">
                  {/* Decorative rotating border glow */}
                  <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-violet-500 animate-spin pointer-events-none" style={{ animationDuration: '6s' }} />
                  <div className="flex items-baseline gap-0.5">
                    <span className="text-5xl font-black tracking-tight bg-gradient-to-r from-violet-200 to-indigo-200 bg-clip-text text-transparent">
                      {result.score}
                    </span>
                    <span className="text-sm text-slate-500 font-semibold">/100</span>
                  </div>
                </div>
                <div className="mt-4 flex items-center gap-1.5 px-3 py-1 rounded-full bg-violet-500/10 border border-violet-500/20 text-xs font-semibold text-violet-400">
                  <Sparkles className="h-3.5 w-3.5" />
                  <span>AI Grade</span>
                </div>
              </section>

              {/* Categorized Metrics */}
              <section className="col-span-1 md:col-span-2 rounded-2xl border border-slate-900 bg-slate-900/20 p-6 shadow-lg backdrop-blur-md flex flex-col justify-between">
                <div className="flex items-center gap-2 mb-4">
                  <BarChart2 className="h-4.5 w-4.5 text-violet-400" />
                  <h2 className="text-xs uppercase tracking-wider text-slate-500 font-semibold">Core Competencies</h2>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4">
                  <MetricBar name="Technical Knowledge" score={result.technicalKnowledge} />
                  <MetricBar name="Problem Solving" score={result.problemSolving} />
                  <MetricBar name="Communication" score={result.communication} />
                  <MetricBar name="Confidence" score={result.confidence} />
                </div>
              </section>
            </div>

            {/* Strengths & Weaknesses Column Card */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Strengths */}
              <section className="rounded-2xl border border-slate-900 bg-slate-900/20 p-6 shadow-lg backdrop-blur-md">
                <div className="flex items-center gap-2 border-b border-slate-900 pb-3 mb-4">
                  <CheckCircle2 className="h-4.5 w-4.5 text-emerald-400" />
                  <h2 className="font-semibold text-sm text-slate-200 uppercase tracking-wider">Key Strengths</h2>
                </div>
                <ul className="flex flex-col gap-3">
                  {result.strengths.map((str, idx) => (
                    <li key={idx} className="flex gap-2.5 items-start text-sm text-slate-300 leading-relaxed">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 mt-2 shrink-0" />
                      <span>{str}</span>
                    </li>
                  ))}
                </ul>
              </section>

              {/* Weaknesses */}
              <section className="rounded-2xl border border-slate-900 bg-slate-900/20 p-6 shadow-lg backdrop-blur-md">
                <div className="flex items-center gap-2 border-b border-slate-900 pb-3 mb-4">
                  <AlertTriangle className="h-4.5 w-4.5 text-yellow-400" />
                  <h2 className="font-semibold text-sm text-slate-200 uppercase tracking-wider">Areas for Growth</h2>
                </div>
                <ul className="flex flex-col gap-3">
                  {result.weaknesses.map((weak, idx) => (
                    <li key={idx} className="flex gap-2.5 items-start text-sm text-slate-300 leading-relaxed">
                      <span className="h-1.5 w-1.5 rounded-full bg-yellow-400 mt-2 shrink-0" />
                      <span>{weak}</span>
                    </li>
                  ))}
                </ul>
              </section>
            </div>

            {/* AI Review Text Block */}
            <section className="rounded-2xl border border-slate-900 bg-slate-900/20 p-6 shadow-lg backdrop-blur-md">
              <div className="flex items-center gap-2 mb-3">
                <Sparkles className="h-4.5 w-4.5 text-violet-400" />
                <h2 className="text-xs uppercase tracking-wider text-slate-500 font-semibold">Detailed Evaluation Summary</h2>
              </div>
              <p className="text-sm leading-relaxed text-slate-300 whitespace-pre-wrap">
                {result.feedback}
              </p>
            </section>

            {/* Recommendations Section */}
            {result.recommendations.length > 0 && (
              <section className="rounded-2xl border border-slate-900 bg-slate-900/20 p-6 shadow-lg backdrop-blur-md">
                <div className="flex items-center gap-2 border-b border-slate-900 pb-3 mb-4">
                  <Lightbulb className="h-4.5 w-4.5 text-indigo-400" />
                  <h2 className="font-semibold text-sm text-slate-200 uppercase tracking-wider">Actionable Recommendations</h2>
                </div>
                <ul className="flex flex-col gap-3">
                  {result.recommendations.map((rec, idx) => (
                    <li key={idx} className="flex gap-2.5 items-start text-sm text-slate-300 leading-relaxed">
                      <ChevronRight className="h-4 w-4 text-indigo-400 mt-0.5 shrink-0" />
                      <span>{rec}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {/* Full Transcript Timeline */}
            <section className="rounded-2xl border border-slate-900 bg-slate-900/20 p-6 shadow-lg backdrop-blur-md">
              <h2 className="mb-6 font-semibold text-sm text-slate-200 uppercase tracking-wider border-b border-slate-900 pb-3">
                Conversation Transcript
              </h2>
              <div className="flex flex-col gap-6">
                {result.transcript.length === 0 ? (
                  <p className="text-sm text-slate-500 italic">No speech inputs were recorded for this session.</p>
                ) : (
                  result.transcript.map((msg, idx) => {
                    const isAi = msg.type === "Assistant";
                    return (
                      <div
                        key={idx}
                        className={cn(
                          "flex gap-4",
                          isAi ? "justify-start" : "flex-row-reverse"
                        )}
                      >
                        {/* Speaker avatar */}
                        <div
                          className={cn(
                            "grid h-9 w-9 shrink-0 place-items-center rounded-xl text-white shadow-md border",
                            isAi
                              ? "bg-gradient-to-br from-violet-500 to-indigo-600 border-violet-400/20"
                              : "bg-gradient-to-br from-emerald-500 to-teal-600 border-emerald-400/20"
                          )}
                        >
                          {isAi ? <Bot className="h-4.5 w-4.5" /> : <User className="h-4.5 w-4.5" />}
                        </div>
                        {/* Text bubble */}
                        <div
                          className={cn(
                            "max-w-[75%] rounded-2xl px-4 py-3 text-sm leading-relaxed shadow-sm",
                            isAi
                              ? "rounded-tl-none bg-slate-900/80 border border-slate-800/80 text-slate-200"
                              : "rounded-tr-none bg-violet-600 hover:bg-violet-500 text-white border border-violet-500/20"
                          )}
                        >
                          {msg.content}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </section>
          </div>
        )}
      </main>
    </div>
  );
}