import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

interface VoiceOrbProps {
    stream: MediaStream | null;
    label: string;
    sublabel: string;
    icon: LucideIcon;
    accent: "violet" | "emerald" | "orange";
    onSpeakingChange?: (speaking: boolean) => void;
}

const ACCENTS = {
    violet: {
        core: "from-violet-400 to-indigo-600",
        glow: "139, 92, 246",
        ring: "border-violet-400/40",
        text: "text-violet-300",
        bars: "bg-violet-400",
    },
    emerald: {
        core: "from-emerald-300 to-teal-600",
        glow: "16, 185, 129",
        ring: "border-emerald-400/40",
        text: "text-emerald-300",
        bars: "bg-emerald-400",
    },
    orange: {
        core: "from-orange-400 to-red-600",
        glow: "249, 115, 22",
        ring: "border-orange-500/45",
        text: "text-orange-400",
        bars: "bg-orange-500",
    },
} as const;

export function VoiceOrb({ stream, label, sublabel, icon: Icon, accent, onSpeakingChange }: VoiceOrbProps) {
    const a = ACCENTS[accent];
    const Icon_ = Icon;

    const [speaking, setSpeaking] = useState(false);

    // Refs for DOM nodes to bypass React renders for level-based updates
    const outerRingRef = useRef<HTMLDivElement>(null);
    const secondaryRingRef = useRef<HTMLDivElement>(null);
    const coreOrbRef = useRef<HTMLDivElement>(null);
    const barsRef = useRef<(HTMLSpanElement | null)[]>([]);

    useEffect(() => {
        if (!stream) {
            setSpeaking(false);
            onSpeakingChange?.(false);
            // Reset DOM properties to silent state
            if (outerRingRef.current) {
                outerRingRef.current.style.transform = "scale(1)";
                outerRingRef.current.style.opacity = "0.3";
            }
            if (secondaryRingRef.current) {
                secondaryRingRef.current.style.transform = "scale(1)";
                secondaryRingRef.current.style.opacity = "0.4";
            }
            if (coreOrbRef.current) {
                coreOrbRef.current.style.transform = "scale(1)";
                coreOrbRef.current.style.boxShadow = `0 0 16px rgba(${a.glow}, 0.35)`;
            }
            barsRef.current.forEach((bar) => {
                if (bar) {
                    bar.style.height = "4px";
                    bar.style.opacity = "0.25";
                }
            });
            return;
        }

        let audioCtx: AudioContext | null = null;
        let source: MediaStreamAudioSourceNode | null = null;
        let analyser: AnalyserNode | null = null;
        let animationFrameId = 0;
        let currentSpeaking = false;

        try {
            const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
            audioCtx = new AudioContextClass();
            source = audioCtx.createMediaStreamSource(stream);
            analyser = audioCtx.createAnalyser();
            analyser.fftSize = 256;
            source.connect(analyser);

            const bufferLength = analyser.frequencyBinCount;
            const dataArray = new Uint8Array(bufferLength);
            const weights = [0.6, 0.85, 1, 0.7, 0.45];

            const draw = () => {
                if (!analyser) return;
                analyser.getByteTimeDomainData(dataArray);

                let sum = 0;
                for (let i = 0; i < bufferLength; i++) {
                    const val = (dataArray[i]! - 128) / 128;
                    sum += val * val;
                }
                const rms = Math.sqrt(sum / bufferLength);
                const level = Math.min(1, rms * 6);
                const clamped = Math.min(1, Math.max(0, level));

                // Direct DOM updates (bypassing React)
                if (outerRingRef.current) {
                    outerRingRef.current.style.transform = `scale(${1 + clamped * 0.25})`;
                    outerRingRef.current.style.opacity = `${0.3 + clamped * 0.5}`;
                }
                if (secondaryRingRef.current) {
                    secondaryRingRef.current.style.transform = `scale(${1 + clamped * 0.15})`;
                    secondaryRingRef.current.style.opacity = `${0.4 + clamped * 0.4}`;
                }
                if (coreOrbRef.current) {
                    const scale = 1 + clamped * 0.4;
                    const glowSize = 16 + clamped * 90;
                    coreOrbRef.current.style.transform = `scale(${scale})`;
                    coreOrbRef.current.style.boxShadow = `0 0 ${glowSize}px rgba(${a.glow}, ${0.35 + clamped * 0.5})`;
                }

                const isSpeakingNow = level > 0.05;
                if (isSpeakingNow !== currentSpeaking) {
                    currentSpeaking = isSpeakingNow;
                    setSpeaking(isSpeakingNow);
                    onSpeakingChange?.(isSpeakingNow);
                }

                barsRef.current.forEach((bar, idx) => {
                    if (bar) {
                        const weight = weights[idx] || 0.5;
                        bar.style.height = `${Math.max(4, clamped * weight * 24)}px`;
                        bar.style.opacity = isSpeakingNow ? "1" : "0.25";
                    }
                });

                animationFrameId = requestAnimationFrame(draw);
            };

            draw();
        } catch (err) {
            console.warn("Could not start voice volume tracker inside VoiceOrb:", err);
        }

        return () => {
            cancelAnimationFrame(animationFrameId);
            if (source) source.disconnect();
            if (audioCtx && audioCtx.state !== "closed") {
                audioCtx.close();
            }
        };
    }, [stream, a.glow, onSpeakingChange]);

    return (
        <div className="flex flex-col items-center gap-5">
            <div className="relative grid h-52 w-52 place-items-center">
                {/* Outer reactive ring */}
                <div
                    ref={outerRingRef}
                    className={cn(
                        "absolute inset-0 rounded-full border transition-opacity duration-150",
                        a.ring,
                    )}
                    style={{ transform: "scale(1)", opacity: 0.3 }}
                />
                {/* Secondary ring */}
                <div
                    ref={secondaryRingRef}
                    className={cn("absolute h-40 w-40 rounded-full border", a.ring)}
                    style={{ transform: "scale(1)", opacity: 0.4 }}
                />
                {/* Core orb */}
                <div
                    ref={coreOrbRef}
                    className={cn(
                        "relative grid h-28 w-28 place-items-center rounded-full bg-gradient-to-br text-white transition-transform duration-100",
                        a.core,
                    )}
                    style={{
                        transform: "scale(1)",
                        boxShadow: `0 0 16px rgba(${a.glow}, 0.35)`,
                    }}
                >
                    <Icon_ className="size-10" strokeWidth={1.75} />
                </div>
            </div>

            {/* Equalizer bars driven by the volume level */}
            <div className="flex h-6 items-end gap-1">
                {[0, 1, 2, 3, 4].map((i) => (
                    <span
                        key={i}
                        ref={(el) => {
                            barsRef.current[i] = el;
                        }}
                        className={cn("w-1.5 rounded-full transition-all duration-100", a.bars)}
                        style={{
                            height: "4px",
                            opacity: 0.25,
                        }}
                    />
                ))}
            </div>

            <div className="text-center">
                <p className={cn("text-sm font-semibold", speaking ? a.text : "text-foreground")}>
                    {label}
                </p>
                <p className="text-xs text-muted-foreground">{speaking ? "Speaking…" : sublabel}</p>
            </div>
        </div>
    );
}