import { useState } from "react";
import { Button } from "./ui/button";
import { toast } from "sonner";
import axios from "axios";
import { BACKEND_URL } from "@/lib/config";
import { useNavigate } from "react-router-dom";
import { Sparkles, Mic, Code, ShieldCheck, Loader2, ArrowRight, ChevronRight, BarChart2, Activity, Play, Star } from "lucide-react";

// Custom SVG Github Icon
const GithubIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg
    viewBox="0 0 24 24"
    stroke="currentColor"
    strokeWidth="2"
    fill="none"
    strokeLinecap="round"
    strokeLinejoin="round"
    {...props}
  >
    <path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4" />
    <path d="M9 18c-4.51 2-5-2-7-2" />
  </svg>
);

export function Form() {
  const [github, setGitHub] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  async function onSubmit() {
    if (!github.trim()) {
      toast.error("Please enter your GitHub profile URL");
      return;
    }

    if (!github.includes("github.com/")) {
      toast.error("Please provide a valid GitHub profile URL (e.g., github.com/username)");
      return;
    }

    setLoading(true);
    try {
      const response = await axios.post(`${BACKEND_URL}/api/v1/pre-interview`, {
        github: github.trim(),
      });
      navigate(`/interview/${response.data.id}`);
    } catch (err: any) {
      console.error("Failed to start pre-interview analysis:", err);
      toast.error(err.response?.data?.error || "Failed to start interview. Please check the URL and try again.");
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen w-screen bg-[#070708] text-slate-100 flex flex-col font-sans overflow-x-hidden selection:bg-orange-500/30 selection:text-orange-200">

      {/* Background soft ambient glows */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-7xl h-[600px] bg-gradient-radial from-orange-500/5 via-transparent to-transparent pointer-events-none" />

      {/* TOP HEADER */}
      <header className="max-w-6xl mx-auto w-full px-6 py-6 flex items-center justify-between z-20">
        <div className="flex items-center gap-2.5">
          <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-orange-500 to-red-600 flex items-center justify-center font-bold text-white shadow shadow-orange-500/20 border border-orange-500/10">
            <GithubIcon className="h-5 w-5" />
          </div>
          <span className="font-bold text-lg tracking-tight bg-gradient-to-r from-slate-100 to-slate-300 bg-clip-text text-transparent">
            GitInterviewer
          </span>
        </div>
        <div>
          <a
            href="https://github.com"
            target="_blank"
            rel="noreferrer"
            className="text-xs font-semibold text-slate-400 hover:text-slate-200 transition-colors flex items-center gap-1.5"
          >
            <GithubIcon className="h-4 w-4" />
            GitHub Login
          </a>
        </div>
      </header>

      {/* HERO SECTION */}
      <main className="flex-grow flex flex-col z-10">
        <section className="max-w-4xl mx-auto px-6 pt-16 pb-6 text-center flex flex-col items-center gap-6">
          {/* Solutions Pill */}
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-orange-500/5 border border-orange-500/20 text-xs font-medium text-orange-400 shadow-sm shadow-orange-500/5">
            <span className="h-1.5 w-1.5 rounded-full bg-orange-500 animate-pulse" />
            Solutions
          </div>

          {/* Heading */}
          <h1 className="text-4xl sm:text-5xl md:text-6xl font-black tracking-tight text-slate-100 max-w-3xl leading-[1.15]">
            Transform Your Data Into{" "}
            <span className="bg-gradient-to-r from-orange-500 to-red-500 bg-clip-text text-transparent drop-shadow-sm">
              Actionable Solutions
            </span>
          </h1>

          {/* Subtitle */}
          <p className="max-w-xl text-slate-400 text-sm sm:text-base leading-relaxed font-medium">
            Unlock the full potential of your code with our suite of developer analytics tools. Input your GitHub profile URL to generate an adaptive voice interview.
          </p>

          {/* Input & Form Container */}
          <div className="w-full max-w-xl mt-6 flex flex-col sm:flex-row items-center gap-3 bg-[#111113]/85 p-2 rounded-2xl border border-white/5 shadow-xl backdrop-blur">
            <div className="relative w-full flex items-center">
              <span className="absolute left-4 text-slate-500">
                <GithubIcon className="h-4.5 w-4.5 text-slate-500" />
              </span>
              <input
                type="text"
                placeholder="https://github.com/your-username"
                value={github}
                disabled={loading}
                onChange={(e) => setGitHub(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !loading) onSubmit();
                }}
                className="w-full bg-transparent border-0 focus:outline-none rounded-xl pl-11 pr-4 py-3 text-sm placeholder-slate-600 text-slate-200"
              />
            </div>

            <Button
              disabled={loading}
              onClick={onSubmit}
              className="w-full sm:w-auto px-6 py-6 rounded-xl bg-[#ff4f12] hover:bg-[#ff3b00] text-white font-semibold text-sm transition-all duration-200 shadow-md shadow-orange-500/10 flex items-center justify-center gap-2 border-0 shrink-0 cursor-pointer"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin text-white" />
                  Analyzing...
                </>
              ) : (
                <>
                  Start interview
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </Button>
          </div>

          {/* Decorative glowing curve/crescent */}
          <div className="relative w-full max-w-4xl h-24 overflow-hidden mt-8 flex justify-center items-start">
            <div className="absolute top-0 w-[160%] h-[250%] rounded-[50%] border-t border-orange-500/35 shadow-[0_-12px_45px_rgba(249,115,22,0.22)] pointer-events-none" />
          </div>
        </section>

        {/* LOGOS / PARTNERS SECTION */}
        <section className="max-w-5xl mx-auto px-6 py-4 w-full text-center flex flex-col items-center gap-5">
          <p className="text-[11px] font-bold tracking-wider text-slate-500 uppercase">
            Partnering with top industry experts
          </p>
          <div className="flex flex-wrap items-center justify-center gap-x-12 gap-y-6 opacity-30 select-none grayscale">
            <span className="font-semibold text-sm text-slate-200 uppercase tracking-widest flex items-center gap-1.5"><Star className="h-4 w-4" /> GitScraper</span>
            <span className="font-semibold text-sm text-slate-200 uppercase tracking-widest flex items-center gap-1.5">OpenAi</span>
            <span className="font-semibold text-sm text-slate-200 uppercase tracking-widest flex items-center gap-1.5">CodexAI</span>
            <span className="font-semibold text-sm text-slate-200 uppercase tracking-widest flex items-center gap-1.5">Github</span>
            <span className="font-semibold text-sm text-slate-200 uppercase tracking-widest flex items-center gap-1.5">PostgreSQL</span>
          </div>
        </section>

        {/* Divider */}
        <div className="max-w-5xl mx-auto w-full px-6 py-12">
          <div className="border-t border-white/5" />
        </div>

        {/* FEATURES / BUSINESS APPLICATION SECTION */}
        <section className="max-w-5xl mx-auto px-6 py-6 w-full text-center flex flex-col items-center gap-4">
          <div className="inline-flex items-center px-2.5 py-0.5 rounded-full bg-slate-900 border border-white/5 text-[10px] uppercase font-bold tracking-wider text-slate-400">
            Take Full Control of Your Task
          </div>
          <h2 className="text-3xl font-black text-slate-100 max-w-xl tracking-tight leading-snug">
            Business Application
          </h2>
          <p className="text-slate-400 text-sm max-w-sm leading-relaxed mb-8">
            Our users love how GitInterviewer simplifies their processes and streamlines developer evaluations.
          </p>

          {/* 3-Column Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full text-left">
            {/* Feature 1 */}
            <div className="group rounded-2xl bg-[#111113]/50 border border-white/5 p-6 hover:border-orange-500/20 transition-all duration-300 relative overflow-hidden shadow-lg shadow-black/20">
              {/* Orange top indicator border */}
              <div className="absolute top-0 left-0 w-full h-[2px] bg-orange-500 opacity-60 group-hover:opacity-100 transition-opacity" />
              <div className="h-10 w-10 rounded-xl bg-orange-500/5 border border-orange-500/10 flex items-center justify-center text-[#ff4f12] mb-5 group-hover:scale-105 transition-transform duration-200">
                <Code className="h-5 w-5" />
              </div>
              <h3 className="font-bold text-base text-slate-100 mb-2">Customer Insights</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Analyze candidate repositories, technologies used, and code metrics to generate tailored questionnaires.
              </p>
            </div>

            {/* Feature 2 */}
            <div className="group rounded-2xl bg-[#111113]/50 border border-white/5 p-6 hover:border-orange-500/20 transition-all duration-300 relative overflow-hidden shadow-lg shadow-black/20">
              {/* Orange top indicator border */}
              <div className="absolute top-0 left-0 w-full h-[2px] bg-orange-500 opacity-60 group-hover:opacity-100 transition-opacity" />
              <div className="h-10 w-10 rounded-xl bg-orange-500/5 border border-orange-500/10 flex items-center justify-center text-[#ff4f12] mb-5 group-hover:scale-105 transition-transform duration-200">
                <Mic className="h-5 w-5" />
              </div>
              <h3 className="font-bold text-base text-slate-100 mb-2">Product Metrics</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Track candidate responses in real-time using audio volume visualizers and interactive speech models.
              </p>
            </div>

            {/* Feature 3 */}
            <div className="group rounded-2xl bg-[#111113]/50 border border-white/5 p-6 hover:border-orange-500/20 transition-all duration-300 relative overflow-hidden shadow-lg shadow-black/20">
              {/* Orange top indicator border */}
              <div className="absolute top-0 left-0 w-full h-[2px] bg-orange-500 opacity-60 group-hover:opacity-100 transition-opacity" />
              <div className="h-10 w-10 rounded-xl bg-orange-500/5 border border-orange-500/10 flex items-center justify-center text-[#ff4f12] mb-5 group-hover:scale-105 transition-transform duration-200">
                <Activity className="h-5 w-5" />
              </div>
              <h3 className="font-bold text-base text-slate-100 mb-2">Campaign Optimization</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Adapt technical difficulty dynamically as the interview progresses based on response grading.
              </p>
            </div>
          </div>
        </section>

        {/* Divider */}
        <div className="max-w-5xl mx-auto w-full px-6 py-12">
          <div className="border-t border-white/5" />
        </div>

        {/* DETAIL / METRICS MOCKUP SECTION */}
        <section className="max-w-5xl mx-auto px-6 pb-20 w-full grid grid-cols-1 md:grid-cols-2 gap-12 items-center text-left">
          {/* Left info column */}
          <div className="flex flex-col gap-5">
            <span className="text-[11px] font-bold tracking-wider text-orange-400 uppercase">
              Data Insights
            </span>
            <h2 className="text-3xl sm:text-4xl font-black tracking-tight text-slate-100 leading-snug">
              Improved{" "}
              <span className="bg-gradient-to-r from-orange-500 to-red-500 bg-clip-text text-transparent">
                decision-making
              </span>
            </h2>
            <p className="text-sm text-slate-400 leading-relaxed max-w-md">
              By leveraging real-time insights and comprehensive repository metrics, you can make informed evaluation decisions with certainty and speed.
            </p>

            <ul className="flex flex-col gap-4 mt-2">
              <li className="flex gap-3 items-start">
                <span className="h-5 w-5 rounded-full bg-orange-500/10 border border-orange-500/20 flex items-center justify-center text-orange-400 shrink-0 mt-0.5">
                  <ChevronRight className="h-3 w-3" />
                </span>
                <div>
                  <h4 className="text-xs uppercase tracking-wider text-slate-500 font-bold">Comprehensive Data Visualization</h4>
                  <p className="text-xs text-slate-400 leading-relaxed mt-0.5">
                    With our evaluation tools, translate complex transcript structures into easy-to-understand grades and charts.
                  </p>
                </div>
              </li>
              <li className="flex gap-3 items-start">
                <span className="h-5 w-5 rounded-full bg-orange-500/10 border border-orange-500/20 flex items-center justify-center text-orange-400 shrink-0 mt-0.5">
                  <ChevronRight className="h-3 w-3" />
                </span>
                <div>
                  <h4 className="text-xs uppercase tracking-wider text-slate-500 font-bold">Predictive Modeling</h4>
                  <p className="text-xs text-slate-400 leading-relaxed mt-0.5">
                    Leverage cutting-edge predictive grading models to forecast performance, strengths, and areas of growth.
                  </p>
                </div>
              </li>
            </ul>
          </div>

          {/* Right Dashboard Mockup Column */}
          <div className="relative rounded-2xl border border-white/5 bg-[#111113]/40 p-6 shadow-2xl backdrop-blur-sm max-w-sm mx-auto md:ml-auto w-full overflow-hidden">
            {/* Top glass reflection light */}
            <div className="absolute top-[-10%] right-[-10%] h-[150px] w-[150px] rounded-full bg-orange-500/5 blur-[40px] pointer-events-none" />

            <div className="flex items-center justify-between border-b border-white/5 pb-4 mb-5">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Evaluation Scorecard</span>
              <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[10px] font-bold">
                Done
              </span>
            </div>

            {/* Score circle / percentage */}
            <div className="flex items-baseline gap-1 mb-6">
              <span className="text-5xl font-black text-slate-100">85%</span>
              <span className="text-xs text-slate-500 font-bold bg-slate-900 border border-white/5 px-2 py-0.5 rounded">+12%</span>
            </div>

            {/* Bar charts preview */}
            <div className="flex flex-col gap-4">
              <div className="flex items-end gap-3.5 h-36 border-b border-white/5 pb-2 justify-center">
                <div className="flex flex-col items-center gap-2">
                  <div className="w-8 bg-[#ff4f12] rounded-t-md h-28 shadow shadow-orange-500/20" />
                  <span className="text-[10px] text-slate-500 font-medium uppercase">Technical</span>
                </div>
                <div className="flex flex-col items-center gap-2">
                  <div className="w-8 bg-slate-800 rounded-t-md h-16" />
                  <span className="text-[10px] text-slate-500 font-medium uppercase">Problem</span>
                </div>
                <div className="flex flex-col items-center gap-2">
                  <div className="w-8 bg-slate-800 rounded-t-md h-20" />
                  <span className="text-[10px] text-slate-500 font-medium uppercase">Comm</span>
                </div>
              </div>
              <p className="text-[11px] text-slate-500 text-center">
                Overall score compiled from Git repositories and adaptive speech performance.
              </p>
            </div>
          </div>
        </section>
      </main>

      {/* FOOTER */}
      <footer className="border-t border-white/5 bg-[#0a0a0c] px-6 py-6 text-center text-xs text-slate-600">
        &copy; {new Date().getFullYear()} GitInterviewer Platform. Secure and sandboxed data analysis.
      </footer>
    </div>
  );
}
