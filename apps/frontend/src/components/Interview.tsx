import { useState, useEffect, useRef } from "react";
import axios from "axios";
import { useParams, useNavigate } from "react-router-dom";
import { BACKEND_URL } from "@/lib/config";
import { VoiceOrb } from "./VoiceOrb";
import { Bot, User, Volume2, VolumeX, Award, Loader2, StopCircle, CornerDownLeft, Sparkles, Mic, Play } from "lucide-react";
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

const REALTIME_VOICES = [
  { id: "marin", label: "Marin", description: "Warm and natural" },
  { id: "cedar", label: "Cedar", description: "Calm and grounded" },
  { id: "coral", label: "Coral", description: "Clear and bright" },
  { id: "sage", label: "Sage", description: "Measured and focused" },
] as const;

type RealtimeVoice = (typeof REALTIME_VOICES)[number]["id"];
type ChatMessage = { role: "assistant" | "user"; content: string };

const COMPLETION_PHRASE = "the interview is now complete";

export function Interview() {
  const { interviewId } = useParams();
  const navigate = useNavigate();

  // Lobby & Setup state
  const [hasStarted, setHasStarted] = useState(false);
  const [voiceOutputEnabled, setVoiceOutputEnabled] = useState(true);
  const [selectedRealtimeVoice, setSelectedRealtimeVoice] = useState<RealtimeVoice>("marin");

  // Interview state
  const [currentQuestion, setCurrentQuestion] = useState("");
  const [status, setStatus] = useState("Ready");
  const [transcript, setTranscript] = useState("");
  const [typedAnswer, setTypedAnswer] = useState("");
  const [questionCount, setQuestionCount] = useState(0);
  const [difficulty, setDifficulty] = useState("Medium");
  const [isEnded, setIsEnded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [finalizing, setFinalizing] = useState(false);

  // Audio/Visualizer state
  const [userStream, setUserStream] = useState<MediaStream | null>(null);
  const [aiStream, setAiStream] = useState<MediaStream | null>(null);
  const [speakingUser, setSpeakingUser] = useState(false);
  const [speakingAI, setSpeakingAI] = useState(false);

  // Fallback typing state
  const [useTextFallback, setUseTextFallback] = useState(false);

  // WebRTC & Audio refs
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const dcRef = useRef<RTCDataChannel | null>(null);
  const audioElRef = useRef<HTMLAudioElement | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const audioSenderRef = useRef<RTCRtpSender | null>(null);

  // Analysers & Contexts for Reactive Volume driving VoiceOrbs (Moved inside VoiceOrb component)
  const finalizingRef = useRef(false);
  const useTextFallbackRef = useRef(useTextFallback);

  // Chat message transcript store
  const [, setChatMessages] = useState<ChatMessage[]>([]);
  const chatMessagesRef = useRef<ChatMessage[]>([]);

  const appendChatMessage = (message: ChatMessage) => {
    const content = message.content.trim();
    if (!content) return chatMessagesRef.current;

    const current = chatMessagesRef.current;
    const last = current[current.length - 1];
    if (last?.role === message.role && last.content === content) {
      return current;
    }

    const next = [...current, { ...message, content }];
    chatMessagesRef.current = next;
    setChatMessages(next);
    return next;
  };

  const updateQuestionProgress = (assistantText: string) => {
    const match = assistantText.match(/question\s+([1-5])\s*(?:of|\/)\s*5/i);
    if (match?.[1]) {
      setQuestionCount(Number(match[1]));
    }
  };

  const isCompletionText = (assistantText: string) =>
    assistantText.toLowerCase().includes(COMPLETION_PHRASE);

  const setMicTrackEnabled = (enabled: boolean) => {
    localStreamRef.current?.getAudioTracks().forEach((track) => {
      track.enabled = enabled;
    });
  };

  // Audio analyzer lifecycle managed by VoiceOrb components

  const requestMicrophoneStream = async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error("Microphone capture is not supported in this browser.");
    }

    return navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });
  };

  const attachMicrophoneToSession = async () => {
    const pc = pcRef.current;
    if (!pc) {
      toast.error("Start the interview before switching to voice.");
      return false;
    }

    try {
      const localStream = localStreamRef.current || await requestMicrophoneStream();
      localStreamRef.current = localStream;
      const audioTrack = localStream.getAudioTracks()[0];
      if (!audioTrack) {
        throw new Error("No microphone track was found.");
      }

      audioTrack.enabled = true;

      if (audioSenderRef.current) {
        await audioSenderRef.current.replaceTrack(audioTrack);
      } else if (pc.currentRemoteDescription) {
        throw new Error("Refresh the interview page and start again to enable voice input for this session.");
      } else {
        audioSenderRef.current = pc.addTrack(audioTrack, localStream);
      }

      setUserStream(localStream);
      return true;
    } catch (err: any) {
      console.error("Failed to enable microphone input:", err);
      const permissionDenied =
        err?.name === "NotAllowedError" ||
        err?.name === "PermissionDeniedError" ||
        String(err?.message || "").toLowerCase().includes("permission denied");

      if (permissionDenied) {
        toast.error("Microphone permission is blocked. Allow mic access in the browser, then try voice again.");
        setStatus("Microphone permission denied");
      } else {
        toast.error(err.message || "Could not enable microphone input.");
        setStatus("Could not enable microphone");
      }
      return false;
    }
  };

  const detachMicrophoneFromSession = async () => {
    setMicTrackEnabled(false);
    if (audioSenderRef.current) {
      await audioSenderRef.current.replaceTrack(null);
    }
    setUserStream(null);
  };

  useEffect(() => {
    useTextFallbackRef.current = useTextFallback;
  }, [useTextFallback]);

  // Load status
  useEffect(() => {
    let active = true;

    async function init() {
      try {
        const response = await axios.get(`${BACKEND_URL}/api/v1/interview/${interviewId}`);
        if (!active) return;
        
        const data = response.data;
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
      cleanupWebRTC();
    };
  }, [interviewId]);

  const cleanupWebRTC = () => {
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
    }
    if (dcRef.current) {
      dcRef.current.close();
      dcRef.current = null;
    }
    audioSenderRef.current = null;
    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }
    if (audioElRef.current) {
      audioElRef.current.remove();
      audioElRef.current = null;
    }
    setUserStream(null);
    setAiStream(null);
    setSpeakingUser(false);
    setSpeakingAI(false);
  };

  const finalizeInterview = async (messages = chatMessagesRef.current) => {
    if (finalizingRef.current) return;

    finalizingRef.current = true;
    setFinalizing(true);
    setLoading(true);
    setStatus("Finalizing evaluation scorecard...");

    try {
      cleanupWebRTC();

      await axios.post(`${BACKEND_URL}/api/v1/interview/${interviewId}/finalize`, {
        messages,
      });

      toast.success("Evaluation compiled. Loading scorecard...");
      navigate(`/result/${interviewId}`);
    } catch (err: any) {
      console.error("Failed to finalize interview:", err);
      toast.error("Evaluation scorecard compilation failed. Redirecting.");
      navigate(`/result/${interviewId}`);
    }
  };

  // Start the interview via WebRTC Realtime
  const startInterviewSession = async () => {
    setLoading(true);
    setStatus("Establishing connection...");
    setCurrentQuestion("");
    setTranscript("");
    setQuestionCount(0);
    setIsEnded(false);
    setFinalizing(false);
    finalizingRef.current = false;
    chatMessagesRef.current = [];
    setChatMessages([]);

    try {
      // 1. Fetch ephemeral client secret from backend
      const res = await axios.post(`${BACKEND_URL}/api/v1/interview/${interviewId}/session`, {
        voice: selectedRealtimeVoice,
      });
      const ephemeralToken = res.data.client_secret;

      // 2. Setup audio playback
      const audioEl = document.createElement("audio");
      audioEl.autoplay = true;
      audioEl.muted = !voiceOutputEnabled;
      document.body.appendChild(audioEl);
      audioElRef.current = audioEl;

      // 3. Create peer connection
      const pc = new RTCPeerConnection();
      pcRef.current = pc;

      // 4. Handle incoming tracks (AI Voice)
      pc.ontrack = (event) => {
        audioEl.srcObject = event.streams[0];
        setAiStream(event.streams[0]);
      };

      // 5. Configure audio input. Text mode should not request microphone access.
      if (useTextFallback) {
        const audioTransceiver = pc.addTransceiver("audio", { direction: "sendrecv" });
        audioSenderRef.current = audioTransceiver.sender;
      } else {
        const localStream = await requestMicrophoneStream();
        localStreamRef.current = localStream;
        const audioTrack = localStream.getAudioTracks()[0];
        if (audioTrack) {
          audioSenderRef.current = pc.addTrack(audioTrack, localStream);
        }
        setUserStream(localStream);
      }

      // 6. Create event data channel
      const dc = pc.createDataChannel("oai-events");
      dcRef.current = dc;
      setupDataChannelListeners(dc);

      // 7. SDP Offer-Answer Exchange
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      const sdpResponse = await fetch("https://api.openai.com/v1/realtime/calls", {
        method: "POST",
        body: offer.sdp,
        headers: {
          Authorization: `Bearer ${ephemeralToken}`,
          "Content-Type": "application/sdp",
        },
      });

      if (!sdpResponse.ok) {
        const errorText = await sdpResponse.text();
        throw new Error(`OpenAI WebRTC call rejected: ${errorText}`);
      }

      const sdpAnswer = await sdpResponse.text();
      await pc.setRemoteDescription({ type: "answer", sdp: sdpAnswer });

      setHasStarted(true);
      setLoading(false);
      setStatus(useTextFallback ? "Connected - text input active" : "Connected - speak naturally");
    } catch (err: any) {
      console.error("Failed to connect WebRTC voice agent:", err);
      cleanupWebRTC();
      const permissionDenied =
        err?.name === "NotAllowedError" ||
        err?.name === "PermissionDeniedError" ||
        String(err?.message || "").toLowerCase().includes("permission denied");
      if (permissionDenied) {
        setUseTextFallback(true);
        toast.error("Microphone permission was denied. Allow mic access, or start again in Text Input Mode.");
        setStatus("Microphone permission denied");
      } else {
        toast.error(err.message || "Failed to establish real-time voice connection. Please try again.");
        setStatus("Error connecting");
      }
      setLoading(false);
    }
  };

  // Voice volume analysis and visualizer loops are handled internally by the VoiceOrb components

  const setupDataChannelListeners = (dc: RTCDataChannel) => {
    dc.onopen = () => {
      console.log("WebRTC event data channel opened.");
      setStatus("Connected - AI interviewer is starting");

      // Trigger initial response from agent (greeting)
      dc.send(JSON.stringify({
        type: "response.create"
      }));
    };

    dc.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        console.log("OpenAI Realtime Event:", data);

        if (data.type === "error") {
          const message = data.error?.message || "Realtime voice session error.";
          toast.error(message);
          setStatus("Realtime error");
          return;
        }

        // Clear display text when a new generation begins
        if (data.type === "response.created") {
          setCurrentQuestion("");
          setStatus("AI interviewer is speaking");
        }

        // Handle streaming text chunks for the typewriter effect
        if (
          data.type === "response.output_audio_transcript.delta" ||
          data.type === "response.audio_transcript.delta" ||
          data.type === "response.output_text.delta"
        ) {
          setCurrentQuestion((prev) => prev + data.delta);
        }

        // Sync complete AI message
        if (
          data.type === "response.output_audio_transcript.done" ||
          data.type === "response.audio_transcript.done" ||
          data.type === "response.output_text.done"
        ) {
          const content = data.transcript || data.text || "";
          if (content.trim()) {
            const visibleContent = content.replace(/\s*\[\[INTERVIEW_COMPLETE\]\]\s*/g, "").trim();
            const nextMessages = appendChatMessage({ role: "assistant", content: visibleContent });
            setCurrentQuestion(visibleContent);
            updateQuestionProgress(visibleContent);

            if (isCompletionText(visibleContent)) {
              setIsEnded(true);
              setStatus("Interview complete");
              window.setTimeout(() => {
                void finalizeInterview(nextMessages);
              }, 1800);
            } else {
              setStatus(useTextFallbackRef.current ? "Waiting for typed answer" : "Listening for your answer");
            }
          }
        }

        // Sync completed Whisper transcription of user speech
        if (data.type === "conversation.item.input_audio_transcription.completed") {
          const content = data.transcript || "";
          if (content.trim()) {
            setTranscript(content);
            appendChatMessage({ role: "user", content });
            setStatus("AI interviewer is thinking");
          }
        }
      } catch (err) {
        console.error("Error parsing Realtime event:", err);
      }
    };
  };

  // Submit text answer fallback
  const submitAnswer = (answerText: string) => {
    if (!answerText.trim()) return;

    appendChatMessage({ role: "user", content: answerText });
    setTypedAnswer("");
    setTranscript(answerText.trim());

    if (dcRef.current && dcRef.current.readyState === "open") {
      dcRef.current.send(JSON.stringify({
        type: "conversation.item.create",
        item: {
          type: "message",
          role: "user",
          content: [
            {
              type: "input_text",
              text: answerText,
            }
          ]
        }
      }));

      dcRef.current.send(JSON.stringify({
        type: "response.create"
      }));
      setStatus("AI interviewer is thinking");
    } else {
      toast.error("Real-time voice connection is not active.");
    }
  };

  // Toggle speaker mute
  const toggleVoiceOutput = () => {
    if (voiceOutputEnabled) {
      setVoiceOutputEnabled(false);
      if (audioElRef.current) {
        audioElRef.current.muted = true;
      }
      toast.success("AI voice muted.");
    } else {
      setVoiceOutputEnabled(true);
      if (audioElRef.current) {
        audioElRef.current.muted = false;
      }
      toast.success("AI voice enabled.");
    }
  };

  // Conclude interview session and redirect to evaluation scorecard
  const handleEndEarly = () => {
    void finalizeInterview();
  };

  const toggleTextFallback = async () => {
    const nextTextMode = !useTextFallback;

    if (nextTextMode) {
      await detachMicrophoneFromSession();
      setUseTextFallback(true);
      setStatus("Text input active");
      toast.success("Text input mode enabled.");
      return;
    }

    setStatus("Requesting microphone access...");
    const micAttached = await attachMicrophoneToSession();
    if (micAttached) {
      setUseTextFallback(false);
      setStatus("Live voice input active");
      toast.success("Voice input enabled. Speak naturally after the AI asks.");
    } else {
      setUseTextFallback(true);
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

              {/* Preference 1: Voice Playback Toggle */}
              <label className="flex items-start gap-3.5 cursor-pointer group">
                <input
                  type="checkbox"
                  checked={voiceOutputEnabled}
                  onChange={(e) => setVoiceOutputEnabled(e.target.checked)}
                  className="mt-1 h-4 w-4 rounded border-white/10 bg-[#070708] text-[#ff4f12] focus:ring-orange-500/20 focus:outline-none accent-orange-500"
                />
                <div>
                  <span className="text-sm font-semibold text-slate-200 group-hover:text-orange-400 transition-colors">
                    Enable AI Voice Playback
                  </span>
                  <p className="text-xs text-slate-500 leading-relaxed mt-0.5 font-medium">
                    The Realtime interviewer will speak naturally over the live connection. Turn this off to mute local playback.
                  </p>
                </div>
              </label>

              {/* OpenAI Realtime Voice Dropdown */}
              {voiceOutputEnabled && (
                <div className="flex flex-col gap-2 pl-7.5">
                  <span className="text-xs text-slate-400 font-bold tracking-tight">Select AI Voice</span>
                  <select
                    value={selectedRealtimeVoice}
                    onChange={(e) => setSelectedRealtimeVoice(e.target.value as RealtimeVoice)}
                    className="bg-[#070708] border border-white/10 hover:border-white/20 focus:border-orange-500 rounded-xl px-3.5 py-2 text-xs text-slate-200 focus:outline-none w-full max-w-xs transition-colors"
                  >
                    {REALTIME_VOICES.map((voice) => (
                      <option key={voice.id} value={voice.id} className="bg-[#111113] text-slate-200">
                        {voice.label} - {voice.description}
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
              stream={aiStream}
              label="AI Interviewer"
              sublabel={voiceOutputEnabled ? "Speaking..." : "Voice Muted (Reading Question)"}
              icon={Bot}
              accent="orange"
              onSpeakingChange={setSpeakingAI}
            />
          </div>

          {/* CANDIDATE ORB */}
          <div className="flex flex-col items-center">
            <VoiceOrb
              stream={userStream}
              label="You"
              sublabel={useTextFallback ? "Text Mode Enabled" : "Live mic connected"}
              icon={User}
              accent="orange"
              onSpeakingChange={setSpeakingUser}
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
                <div className="flex flex-col items-center">
                  <div className="px-8 py-4 rounded-xl bg-orange-500/10 border border-orange-500/20 text-orange-400 text-sm font-bold flex items-center gap-2.5 shadow-md shadow-orange-500/5 animate-pulse">
                    <Mic className="h-4.5 w-4.5 text-orange-400 animate-pulse" />
                    Live Voice Session Active - Speak Naturally
                  </div>
                </div>
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

              {/* Text Fallback Toggle button */}
              <Button
                variant="outline"
                onClick={toggleTextFallback}
                className="px-5 py-6 rounded-xl border border-white/10 bg-[#111113]/50 hover:bg-[#111113] hover:border-orange-500/20 text-slate-300 flex items-center gap-2 text-sm transition-colors cursor-pointer"
              >
                {useTextFallback ? "Use Voice" : "Type Answer Instead"}
              </Button>
            </div>
          </div>
        </div>
      </main>

      {/* Footer controls */}
      <footer className="border-t border-white/5 bg-[#070708]/80 backdrop-blur px-6 py-4 flex items-center justify-between z-20">
        <span className="text-xs text-slate-500 font-medium">All conversation inputs are securely evaluated by AI in real-time.</span>
        <Button
          variant="ghost"
          onClick={handleEndEarly}
          disabled={loading || finalizing}
          className="text-xs text-rose-400 hover:text-rose-300 hover:bg-rose-500/5 hover:border-rose-500/10 flex items-center gap-1.5 border border-transparent rounded-lg px-3 py-1.5 transition-all duration-200 cursor-pointer"
        >
          <StopCircle className="h-3.5 w-3.5" />
          {isEnded ? "View Scorecard" : "End Interview Early"}
        </Button>
      </footer>
    </div>
  );
}
