import { useState, useEffect, useRef } from "react";
import axios from "axios";
import { useParams, useNavigate } from "react-router-dom";
import { BACKEND_URL } from "@/lib/config";
import { VoiceOrb } from "./VoiceOrb";
import { Bot, User, Volume2, VolumeX, Award, ArrowRight, Loader2, StopCircle, CornerDownLeft, AlertCircle, Sparkles, Mic, Code, Play } from "lucide-react";
import { Button } from "./ui/button";
import { toast } from "sonner";

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

export function Interview() {
  const { interviewId } = useParams();
  const navigate = useNavigate();

  // Lobby & Setup state
  const [hasStarted, setHasStarted] = useState(false);
  const [voiceOutputEnabled, setVoiceOutputEnabled] = useState(true);
  
  // Voices dropdown state
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selectedVoiceName, setSelectedVoiceName] = useState<string>("");

  // Interview state
  const [currentQuestion, setCurrentQuestion] = useState("");
  const [status, setStatus] = useState("Ready");
  const [transcript, setTranscript] = useState("");
  const [typedAnswer, setTypedAnswer] = useState("");
  const [questionCount, setQuestionCount] = useState(0);
  const [difficulty, setDifficulty] = useState("Medium");
  const [isEnded, setIsEnded] = useState(false);
  const [loading, setLoading] = useState(true);

  // Audio/Visualizer state
  const [volumeUser, setVolumeUser] = useState(0);
  const [speakingUser, setSpeakingUser] = useState(false);
  const [volumeAI, setVolumeAI] = useState(0);
  const [speakingAI, setSpeakingAI] = useState(false);

  // Fallback typing state
  const [useTextFallback, setUseTextFallback] = useState(false);

  // Speech and Audio references
  const recognitionRef = useRef<any>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const aiVolumeIntervalRef = useRef<any>(null);

  // Load status
  useEffect(() => {
    let active = true;

    async function init() {
      try {
        const response = await axios.get(`${BACKEND_URL}/api/v1/interview/${interviewId}`);
        if (!active) return;
        
        const data = response.data;
        setCurrentQuestion(data.currentQuestion);
        setQuestionCount(data.questionCount);
        setDifficulty(data.difficulty);
        setLoading(false);
      } catch (err: any) {
        console.error("Failed to load interview status:", err);
        if (active) {
          toast.error("Could not load interview session.");
          setLoading(false);
        }
      }
    }

    init();

    return () => {
      active = false;
      // Cleanup audio synthesis and mic volume tracking
      stopSpeaking();
      stopMicVolume();
      if (recognitionRef.current) {
        recognitionRef.current.abort();
      }
    };
  }, [interviewId]);

  // Load and subscribe to text-to-speech voices
  useEffect(() => {
    if (!("speechSynthesis" in window)) return;

    const loadVoices = () => {
      const allVoices = window.speechSynthesis.getVoices();
      // Filter for English voices primarily, fallback to all voices
      const englishVoices = allVoices.filter(v => v.lang.startsWith("en"));
      const availableVoices = englishVoices.length > 0 ? englishVoices : allVoices;
      setVoices(availableVoices);

      // Select default voice
      if (availableVoices.length > 0) {
        // Try to find natural/Google/Siri high quality english voice as default
        const defaultVoice = 
          availableVoices.find(v => v.name.includes("Google") || v.name.includes("Natural") || v.name.includes("Samantha")) || 
          availableVoices[0];
        if (defaultVoice) {
          setSelectedVoiceName(defaultVoice.name);
        }
      }
    };

    loadVoices();
    // Voices load asynchronously in some browsers (e.g. Chrome)
    window.speechSynthesis.onvoiceschanged = loadVoices;
  }, []);

  // Start the interview from the lobby
  const startInterviewSession = () => {
    setHasStarted(true);
    if (currentQuestion) {
      if (voiceOutputEnabled) {
        speakText(currentQuestion);
      } else {
        setStatus(useTextFallback ? "Ready" : "🎤 Listening for your answer...");
        if (!useTextFallback) {
          setTimeout(() => {
            startListening();
          }, 300);
        }
      }
    }
  };

  // AI Speech Synthesis
  const speakText = (text: string) => {
    stopSpeaking();
    
    if (!voiceOutputEnabled) return;

    if (!("speechSynthesis" in window)) {
      toast.error("Speech Synthesis is not supported in this browser.");
      return;
    }

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "en-US";

    // Attach selected voice
    if (selectedVoiceName) {
      const activeVoice = window.speechSynthesis.getVoices().find(v => v.name === selectedVoiceName);
      if (activeVoice) {
        utterance.voice = activeVoice;
      }
    }

    utterance.onstart = () => {
      setSpeakingAI(true);
      startAIVolumeSimulation();
      setStatus("🤖 AI is asking...");
    };

    utterance.onend = () => {
      setSpeakingAI(false);
      stopAIVolumeSimulation();
      setStatus("🎤 Listening for your answer...");
      
      // Auto-start listening after AI finishes speaking (if not using text fallback)
      if (!useTextFallback) {
        startListening();
      }
    };

    utterance.onerror = (event) => {
      console.error("Speech synthesis error:", event);
      setSpeakingAI(false);
      stopAIVolumeSimulation();
      setStatus("Ready");
    };

    window.speechSynthesis.speak(utterance);
  };

  const stopSpeaking = () => {
    if ("speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    setSpeakingAI(false);
    stopAIVolumeSimulation();
  };

  // Simulated AI volume level based on sinusoidal frequency waves
  const startAIVolumeSimulation = () => {
    if (aiVolumeIntervalRef.current) clearInterval(aiVolumeIntervalRef.current);
    aiVolumeIntervalRef.current = setInterval(() => {
      const targetVal = Math.sin(Date.now() / 80) * 0.35 + 0.5;
      setVolumeAI(Math.max(0.15, targetVal + (Math.random() - 0.5) * 0.15));
    }, 75);
  };

  const stopAIVolumeSimulation = () => {
    if (aiVolumeIntervalRef.current) {
      clearInterval(aiVolumeIntervalRef.current);
      aiVolumeIntervalRef.current = null;
    }
    setVolumeAI(0);
  };

  // Web Audio Analyser Node for Candidate Speech Volume
  const startMicVolume = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      const audioContext = new AudioContextClass();
      audioContextRef.current = audioContext;

      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      analyserRef.current = analyser;

      source.connect(analyser);

      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);

      const checkVolume = () => {
        if (!analyserRef.current) return;
        analyserRef.current.getByteTimeDomainData(dataArray);

        let sum = 0;
        for (let i = 0; i < bufferLength; i++) {
          const val = (dataArray[i]! - 128) / 128;
          sum += val * val;
        }
        const rms = Math.sqrt(sum / bufferLength);
        // Amplify the mic visual responsiveness
        const level = Math.min(1, rms * 6);
        setVolumeUser(level);

        animationFrameRef.current = requestAnimationFrame(checkVolume);
      };

      checkVolume();
    } catch (err) {
      console.warn("Could not start micro-volume visualizer:", err);
    }
  };

  const stopMicVolume = () => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    analyserRef.current = null;
    setVolumeUser(0);
  };

  // Speech Recognition (Speech-to-Text)
  const startListening = () => {
    stopSpeaking();
    stopMicVolume();

    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setUseTextFallback(true);
      toast.warning("Speech Recognition is not supported by your browser. Reverting to text entry.");
      return;
    }

    const recognition = new SpeechRecognition();
    recognitionRef.current = recognition;
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    recognition.onstart = () => {
      setSpeakingUser(true);
      setTranscript("");
      setStatus("🎤 Listening... Speak now.");
      startMicVolume();
    };

    recognition.onresult = (event: any) => {
      const currentTranscript = Array.from(event.results)
        .map((result: any) => result[0].transcript)
        .join("");
      setTranscript(currentTranscript);
    };

    recognition.onerror = (event: any) => {
      console.error("Speech recognition error:", event.error);
      if (event.error === "not-allowed") {
        toast.error("Microphone access was denied. Switching to text entry.");
        setUseTextFallback(true);
      } else {
        toast.error(`Mic error: ${event.error}. Please try again.`);
      }
      stopListeningState();
    };

    recognition.onend = () => {
      stopListeningState();
    };

    recognition.start();
  };

  const stopListeningState = () => {
    setSpeakingUser(false);
    stopMicVolume();
  };

  const submitVoiceAnswer = async () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
    stopListeningState();

    if (!transcript.trim()) {
      toast.error("You didn't say anything yet. Please try speaking again.");
      return;
    }

    await submitAnswer(transcript);
  };

  // Submit Answer handler
  const submitAnswer = async (answerText: string) => {
    setStatus("🤖 Thinking...");
    setLoading(true);
    try {
      const response = await axios.post(`${BACKEND_URL}/api/v1/interview/chat`, {
        interviewId,
        answer: answerText,
      });

      const { reply, ended } = response.data;

      setTranscript("");
      setTypedAnswer("");

      if (ended) {
        setIsEnded(true);
        setStatus("✅ Completed!");
        setCurrentQuestion(reply);
        if (voiceOutputEnabled) {
          speakText(reply);
        }
        // Automatically redirect to result page after 4 seconds
        setTimeout(() => {
          navigate(`/result/${interviewId}`);
        }, 4500);
      } else {
        setCurrentQuestion(reply);
        setQuestionCount((prev) => prev + 1);
        setStatus("Ready");
        
        if (voiceOutputEnabled) {
          speakText(reply);
        } else {
          setStatus(useTextFallback ? "Ready" : "🎤 Listening for your answer...");
          if (!useTextFallback) {
            setTimeout(() => {
              startListening();
            }, 600);
          }
        }
      }
    } catch (err: any) {
      console.error("Submit answer error:", err);
      toast.error("Failed to submit response. Please try again.");
      setStatus("Ready");
      setLoading(false);
    }
  };

  // Toggle speaker mute
  const toggleVoiceOutput = () => {
    if (voiceOutputEnabled) {
      stopSpeaking();
      setVoiceOutputEnabled(false);
      toast.success("AI voice muted.");
    } else {
      setVoiceOutputEnabled(true);
      toast.success("AI voice enabled.");
      if (currentQuestion && !speakingUser && !speakingAI) {
        speakText(currentQuestion);
      }
    }
  };

  // End early triggers immediate evaluation
  const handleEndEarly = async () => {
    stopSpeaking();
    stopMicVolume();
    if (recognitionRef.current) {
      recognitionRef.current.abort();
    }

    setStatus("🤖 Evaluating...");
    setLoading(true);

    try {
      await axios.post(`${BACKEND_URL}/api/v1/interview/end`, { interviewId });
      toast.success("Interview submitted for early evaluation.");
      navigate(`/result/${interviewId}`);
    } catch (err: any) {
      console.error("Failed to end interview early:", err);
      toast.error("Failed to finalize evaluation. Redirecting to results.");
      navigate(`/result/${interviewId}`);
    }
  };

  if (loading && currentQuestion === "") {
    return (
      <div className="flex h-screen w-screen flex-col items-center justify-center bg-[#070708] text-slate-100 font-sans selection:bg-orange-500/30 selection:text-orange-200">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-7xl h-[600px] bg-gradient-radial from-orange-500/5 via-transparent to-transparent pointer-events-none" />
        <Loader2 className="h-10 w-10 animate-spin text-[#ff4f12]" />
        <p className="mt-4 text-sm font-semibold tracking-tight text-slate-400">Loading interview session details...</p>
      </div>
    );
  }

  // LOBBY PAGE VIEW
  if (!hasStarted) {
    return (
      <div className="relative min-h-screen w-screen overflow-hidden bg-[#070708] text-slate-100 flex flex-col justify-between items-center selection:bg-orange-500/30 selection:text-orange-200">
        {/* Background ambient glows */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-7xl h-[600px] bg-gradient-radial from-orange-500/5 via-transparent to-transparent pointer-events-none" />

        {/* Top Header */}
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

        {/* Lobby Container */}
        <div className="max-w-2xl w-full mx-auto px-4 py-8 flex flex-col justify-center items-center z-10 flex-grow">
          <div className="group w-full bg-[#111113]/85 border border-white/5 rounded-3xl p-8 md:p-10 shadow-2xl backdrop-blur-md text-center relative overflow-hidden transition-all duration-300 hover:border-orange-500/20">
            {/* Orange top indicator border */}
            <div className="absolute top-0 left-0 w-full h-[2px] bg-orange-500 opacity-60 group-hover:opacity-100 transition-opacity" />
            
            <div className="inline-flex h-12 w-12 rounded-2xl bg-gradient-to-br from-orange-500 to-red-600 items-center justify-center shadow-lg shadow-orange-500/20 border border-orange-500/10 mb-6">
              <Bot className="h-6 w-6 text-white" />
            </div>

            <h1 className="text-3xl font-black tracking-tight text-slate-100 leading-snug">
              Technical{" "}
              <span className="bg-gradient-to-r from-orange-500 to-red-500 bg-clip-text text-transparent">
                Interview Room
              </span>
            </h1>
            <p className="mt-3 text-slate-400 text-sm leading-relaxed max-w-lg mx-auto font-medium">
              Your GitHub profile analysis is complete. Before entering the session, please configure your preferences below.
            </p>

            <div className="my-8 border-t border-white/5" />

            {/* Preferences Section */}
            <div className="max-w-md mx-auto flex flex-col gap-6 text-left mb-8 bg-[#070708]/60 p-6 rounded-2xl border border-white/5 shadow-inner">
              <h2 className="text-xs font-bold uppercase tracking-wider text-orange-400 mb-1 flex items-center gap-1.5">
                <Sparkles className="h-4 w-4 text-orange-400" />
                Interview Settings
              </h2>

              {/* Preference 1: Voice Readout Toggle */}
              <label className="flex items-start gap-3.5 cursor-pointer group">
                <input
                  type="checkbox"
                  checked={voiceOutputEnabled}
                  onChange={(e) => setVoiceOutputEnabled(e.target.checked)}
                  className="mt-1 h-4 w-4 rounded border-white/10 bg-[#070708] text-[#ff4f12] focus:ring-orange-500/20 focus:outline-none accent-orange-500"
                />
                <div>
                  <span className="text-sm font-semibold text-slate-200 group-hover:text-orange-400 transition-colors">
                    Enable AI Voice Agent Read-Aloud
                  </span>
                  <p className="text-xs text-slate-500 leading-relaxed mt-0.5 font-medium">
                    The AI interviewer will speak the questions out loud. Turn this off if you prefer a text-only read.
                  </p>
                </div>
              </label>

              {/* Voice Dropdown (shown only when readout is enabled) */}
              {voiceOutputEnabled && voices.length > 0 && (
                <div className="flex flex-col gap-2 pl-7.5">
                  <span className="text-xs text-slate-400 font-bold tracking-tight">Select AI Voice Pitch/Accent</span>
                  <select
                    value={selectedVoiceName}
                    onChange={(e) => setSelectedVoiceName(e.target.value)}
                    className="bg-[#070708] border border-white/10 hover:border-white/20 focus:border-orange-500 rounded-xl px-3.5 py-2 text-xs text-slate-200 focus:outline-none w-full max-w-xs transition-colors"
                  >
                    {voices.map((v, idx) => (
                      <option key={idx} value={v.name} className="bg-[#111113] text-slate-200">
                        {v.name.replace("Microsoft", "").replace("Google", "").trim()} ({v.lang})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Preference 2: Text Fallback Toggle */}
              <label className="flex items-start gap-3.5 cursor-pointer group">
                <input
                  type="checkbox"
                  checked={useTextFallback}
                  onChange={(e) => setUseTextFallback(e.target.checked)}
                  className="mt-1 h-4 w-4 rounded border-white/10 bg-[#070708] text-[#ff4f12] focus:ring-orange-500/20 focus:outline-none accent-orange-500"
                />
                <div>
                  <span className="text-sm font-semibold text-slate-200 group-hover:text-orange-400 transition-colors">
                    Enable Text Input Mode
                  </span>
                  <p className="text-xs text-slate-500 leading-relaxed mt-0.5 font-medium">
                    You will type your answers instead of using your microphone. Recommended if you are in a noisy room.
                  </p>
                </div>
              </label>
            </div>

            {/* Action Trigger */}
            <div className="flex flex-col items-center gap-3">
              <Button
                onClick={startInterviewSession}
                className="w-full sm:w-auto px-10 py-6 rounded-xl bg-[#ff4f12] hover:bg-[#ff3b00] text-white font-semibold text-base transition-all duration-200 shadow-md shadow-orange-500/10 flex items-center justify-center gap-2 border-0 cursor-pointer"
              >
                <Play className="h-5 w-5 fill-current" />
                Start Interview
              </Button>
              <p className="text-xs text-slate-500 font-medium">
                The interview comprises exactly 5 adaptive questions. Feel free to end early at any time.
              </p>
            </div>
          </div>

          {/* Decorative glowing curve/crescent at bottom of lobby */}
          <div className="relative w-full max-w-4xl h-16 overflow-hidden mt-6 flex justify-center items-start">
            <div className="absolute top-0 w-[160%] h-[250%] rounded-[50%] border-t border-orange-500/35 shadow-[0_-12px_45px_rgba(249,115,22,0.22)] pointer-events-none" />
          </div>
        </div>

        {/* FOOTER */}
        <footer className="w-full border-t border-white/5 bg-[#0a0a0c] px-6 py-6 text-center text-xs text-slate-600 z-20">
          &copy; {new Date().getFullYear()} GitInterviewer Platform. Secure and sandboxed data analysis.
        </footer>
      </div>
    );
  }

  // ACTIVE INTERVIEW VIEW
  return (
    <div className="relative min-h-screen w-screen overflow-x-hidden bg-[#070708] text-slate-100 flex flex-col justify-between selection:bg-orange-500/30 selection:text-orange-200 font-sans">
      {/* Decorative ambient background glows */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-7xl h-[500px] bg-gradient-radial from-orange-500/5 via-transparent to-transparent pointer-events-none" />

      {/* Top Header */}
      <header className="border-b border-white/5 bg-[#070708]/80 backdrop-blur px-6 py-4 flex items-center justify-between z-20">
        <div className="flex items-center gap-2.5">
          <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-orange-500 to-red-600 flex items-center justify-center font-bold text-white shadow shadow-orange-500/20 border border-orange-500/10">
            <GithubIcon className="h-5 w-5" />
          </div>
          <span className="font-bold text-lg tracking-tight bg-gradient-to-r from-slate-100 to-slate-300 bg-clip-text text-transparent">
            GitInterviewer
          </span>
        </div>
        <div className="flex items-center gap-3 md:gap-4">
          {/* Mute/Unmute toggle button */}
          <Button
            onClick={toggleVoiceOutput}
            variant="ghost"
            className="h-8 px-3 rounded-full border border-white/10 text-slate-400 hover:text-slate-200 hover:bg-white/5 flex items-center justify-center gap-1.5 transition-all"
          >
            {voiceOutputEnabled ? (
              <>
                <Volume2 className="h-4 w-4 text-orange-400" />
                <span className="text-xs font-bold">AI Voice On</span>
              </>
            ) : (
              <>
                <VolumeX className="h-4 w-4 text-slate-500" />
                <span className="text-xs font-bold text-slate-500">AI Voice Muted</span>
              </>
            )}
          </Button>

          <div className="flex items-center gap-2 bg-[#111113]/85 border border-white/5 rounded-full px-3.5 py-1 text-xs text-slate-400 font-semibold shadow-inner">
            <Award className="h-3.5 w-3.5 text-orange-500" />
            <span>Question {questionCount} of 5</span>
          </div>
          <div className="flex items-center gap-1.5 bg-[#111113]/85 border border-white/5 rounded-full px-3.5 py-1 text-xs text-slate-400 font-semibold shadow-inner">
            <span className="h-2 w-2 rounded-full bg-orange-500 animate-pulse" />
            <span>Difficulty: <strong className="text-orange-400 font-bold">{difficulty}</strong></span>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="max-w-6xl mx-auto px-6 py-8 flex-grow flex flex-col justify-center gap-8 w-full z-10">
        {/* Double Voice Orbs Container */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-12 items-center justify-center py-6">
          {/* AI INTERVIEWER ORB */}
          <div className="flex flex-col items-center">
            <VoiceOrb
              level={volumeAI}
              speaking={speakingAI}
              label="AI Interviewer"
              sublabel={voiceOutputEnabled ? "Speaking..." : "Voice Muted (Reading Question)"}
              icon={Bot}
              accent="orange"
            />
          </div>

          {/* CANDIDATE ORB */}
          <div className="flex flex-col items-center">
            <VoiceOrb
              level={volumeUser}
              speaking={speakingUser}
              label="You"
              sublabel={useTextFallback ? "Text Mode Enabled" : "Silent (Click speak to talk)"}
              icon={User}
              accent="orange"
            />
          </div>
        </div>

        {/* Dynamic Speech & Question Board */}
        <div className="flex flex-col gap-6 max-w-3xl mx-auto w-full">
          {/* AI Question Board */}
          <div className="group bg-[#111113]/50 border border-white/5 rounded-2xl p-6 shadow-xl relative overflow-hidden transition-all duration-300 hover:border-orange-500/20">
            {/* Orange top indicator border */}
            <div className="absolute top-0 left-0 w-full h-[2px] bg-orange-500 opacity-60 group-hover:opacity-100 transition-opacity" />
            <div className="flex items-start gap-4">
              <div className="h-9 w-9 rounded-xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center text-orange-400 shrink-0">
                <Bot className="h-5 w-5" />
              </div>
              <div className="flex-grow">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs uppercase tracking-wider text-slate-500 font-bold mb-1">Current Question</h3>
                  {!voiceOutputEnabled && !isEnded && (
                    <span className="text-[10px] text-orange-400 font-bold px-2 py-0.5 rounded-full bg-orange-500/10 border border-orange-500/20 animate-pulse">
                      Read question below
                    </span>
                  )}
                </div>
                <p className="text-slate-200 text-base leading-relaxed font-semibold">
                  {currentQuestion || "Initializing interview and preparing your profile questions..."}
                </p>
              </div>
            </div>
          </div>

          {/* User Transcript Board */}
          {(!useTextFallback && (transcript || speakingUser)) && (
            <div className="group bg-[#111113]/50 border border-white/5 rounded-2xl p-6 shadow-xl relative overflow-hidden transition-all duration-300 hover:border-orange-500/20">
              {/* Orange top indicator border */}
              <div className="absolute top-0 left-0 w-full h-[2px] bg-orange-500 opacity-60 group-hover:opacity-100 transition-opacity" />
              <div className="flex items-start gap-4">
                <div className="h-9 w-9 rounded-xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center text-orange-400 shrink-0">
                  <User className="h-5 w-5" />
                </div>
                <div className="flex-grow">
                  <h3 className="text-xs uppercase tracking-wider text-slate-500 font-bold mb-1">Your Speech Transcript</h3>
                  <p className="text-slate-300 text-base leading-relaxed italic font-medium">
                    {transcript || "Listening... Start speaking..."}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Interaction controls */}
          <div className="flex flex-col items-center gap-4 mt-2">
            <p className="text-sm text-slate-400 font-medium">
              Status: <span className="text-orange-400 font-bold">{status}</span>
            </p>

            <div className="flex gap-4">
              {/* Voice controls */}
              {!useTextFallback ? (
                <>
                  {!speakingUser ? (
                    <Button
                      disabled={speakingAI || isEnded || loading}
                      onClick={startListening}
                      className="px-8 py-6 rounded-xl bg-[#ff4f12] hover:bg-[#ff3b00] text-white font-semibold transition-all duration-200 shadow-md shadow-orange-500/10 flex items-center gap-2.5 text-base border-0 cursor-pointer"
                    >
                      <Volume2 className="h-5 w-5" />
                      Speak Response
                    </Button>
                  ) : (
                    <Button
                      onClick={submitVoiceAnswer}
                      className="px-8 py-6 rounded-xl bg-gradient-to-r from-orange-500 to-red-600 hover:from-orange-600 hover:to-red-700 text-white font-semibold transition-all duration-200 shadow-md shadow-orange-500/10 flex items-center gap-2.5 text-base border-0 animate-pulse cursor-pointer"
                    >
                      <ArrowRight className="h-5 w-5" />
                      Done Speaking
                    </Button>
                  )}
                </>
              ) : (
                /* Text Input Fallback */
                <div className="flex flex-col w-full max-w-xl gap-2 bg-[#111113]/85 p-3 rounded-2xl border border-white/5 shadow-xl">
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      placeholder="Type your response here..."
                      value={typedAnswer}
                      onChange={(e) => setTypedAnswer(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && typedAnswer.trim()) {
                          submitAnswer(typedAnswer);
                        }
                      }}
                      className="flex-grow bg-[#070708] border border-white/10 focus:border-orange-500 rounded-xl px-4 py-2.5 text-sm focus:outline-none text-slate-100"
                    />
                    <Button
                      onClick={() => {
                        if (typedAnswer.trim()) submitAnswer(typedAnswer);
                      }}
                      disabled={loading || isEnded || !typedAnswer.trim()}
                      className="bg-[#ff4f12] hover:bg-[#ff3b00] h-[40px] px-4 rounded-xl flex items-center gap-1 text-sm border-0 cursor-pointer"
                    >
                      Submit
                      <CornerDownLeft className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  <p className="text-[11px] text-slate-500 px-1 font-medium">Press Enter or click Submit to send your response.</p>
                </div>
              )}

              {/* Text Fallback Toggle button (only when not speaking) */}
              {!speakingUser && (
                <Button
                  variant="outline"
                  onClick={() => setUseTextFallback((prev) => !prev)}
                  className="px-5 py-6 rounded-xl border border-white/10 bg-[#111113]/50 hover:bg-[#111113] hover:border-orange-500/20 text-slate-300 flex items-center gap-2 text-sm transition-colors cursor-pointer"
                >
                  {useTextFallback ? "Use Voice" : "Type Answer Instead"}
                </Button>
              )}
            </div>

            {/* Warn/Error states regarding browsers compatibility */}
            {!useTextFallback && !("webkitSpeechRecognition" in window) && (
              <div className="flex items-center gap-2 text-orange-400 text-xs bg-orange-500/5 px-3 py-1.5 rounded-lg border border-orange-500/10 mt-2 font-medium">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>Speech Recognition requires Chrome, Safari, or Edge. We've default enabled Type-fallback.</span>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Footer controls */}
      <footer className="border-t border-white/5 bg-[#070708]/80 backdrop-blur px-6 py-4 flex items-center justify-between z-20">
        <span className="text-xs text-slate-500 font-medium">All conversation inputs are securely evaluated by AI in real-time.</span>
        <Button
          variant="ghost"
          onClick={handleEndEarly}
          disabled={loading || isEnded}
          className="text-xs text-rose-400 hover:text-rose-300 hover:bg-rose-500/5 hover:border-rose-500/10 flex items-center gap-1.5 border border-transparent rounded-lg px-3 py-1.5 transition-all duration-200 cursor-pointer"
        >
          <StopCircle className="h-3.5 w-3.5" />
          End Interview Early
        </Button>
      </footer>
    </div>
  );
}