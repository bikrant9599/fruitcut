import React, { useState, useEffect } from 'react';
import { Zap, Sparkles, ShieldCheck } from 'lucide-react';

interface CinematicLoadingScreenProps {
  onComplete?: () => void;
}

export default function CinematicLoadingScreen({ onComplete }: CinematicLoadingScreenProps) {
  const [progress, setProgress] = useState(0);
  const [isFadingOut, setIsFadingOut] = useState(false);
  const [isDone, setIsDone] = useState(false);

  // Sequential visibility triggers
  const [showSubtitle, setShowSubtitle] = useState(false);

  useEffect(() => {
    // 1. Text reveal timings
    const subTimer = setTimeout(() => setShowSubtitle(true), 350);

    // 2. Smooth progress bar simulation (finishes in ~1.8 seconds)
    const interval = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 100) {
          clearInterval(interval);
          return 100;
        }
        // Accelerating progress curve
        const increment = prev < 60 ? Math.floor(Math.random() * 8) + 5 : Math.floor(Math.random() * 12) + 8;
        return Math.min(100, prev + increment);
      });
    }, 80);

    return () => {
      clearTimeout(subTimer);
      clearInterval(interval);
    };
  }, []);

  // When progress hits 100%, trigger smooth fade out transition
  useEffect(() => {
    if (progress >= 100 && !isFadingOut) {
      const holdTimer = setTimeout(() => {
        setIsFadingOut(true);
      }, 250);

      const unmountTimer = setTimeout(() => {
        setIsDone(true);
        if (onComplete) onComplete();
      }, 950); // 250ms hold + 700ms fade transition

      return () => {
        clearTimeout(holdTimer);
        clearTimeout(unmountTimer);
      };
    }
  }, [progress, isFadingOut, onComplete]);

  if (isDone) return null;

  return (
    <div
      className={`fixed inset-0 z-[99999] flex flex-col items-center justify-center bg-slate-950 text-white select-none overflow-hidden transition-all duration-700 ease-out ${
        isFadingOut ? 'opacity-0 scale-105 pointer-events-none backdrop-blur-md' : 'opacity-100 scale-100'
      }`}
    >
      {/* 1. Atmospheric Ambient Lighting & Radial Glow */}
      <div className="absolute inset-0 pointer-events-none">
        {/* Core Center Warm Aura */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-gradient-to-tr from-rose-600/20 via-amber-500/20 to-cyan-500/10 rounded-full blur-[120px] animate-pulse" />
        
        {/* Top & Bottom Vignette Shadow */}
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_transparent_30%,_#020617_90%)]" />

        {/* Subtle Floating Sparkles / Particles */}
        <div className="absolute inset-0 overflow-hidden opacity-30">
          <div className="absolute top-1/4 left-1/5 w-2 h-2 bg-amber-400 rounded-full blur-[1px] animate-ping" style={{ animationDuration: '3s' }} />
          <div className="absolute top-1/3 right-1/4 w-3 h-3 bg-rose-500 rounded-full blur-[1px] animate-ping" style={{ animationDuration: '4s' }} />
          <div className="absolute bottom-1/3 left-1/3 w-2 h-2 bg-cyan-400 rounded-full blur-[1px] animate-ping" style={{ animationDuration: '2.5s' }} />
          <div className="absolute bottom-1/4 right-1/5 w-2.5 h-2.5 bg-emerald-400 rounded-full blur-[1px] animate-ping" style={{ animationDuration: '3.5s' }} />
        </div>
      </div>

      {/* 2. Main Centered Content Container */}
      <div className="relative z-10 flex flex-col items-center text-center px-4 max-w-lg mx-auto">
        
        {/* Blade Icon & Glow */}
        <div className="relative mb-4 group">
          <div className="absolute -inset-2 bg-gradient-to-r from-rose-500 to-amber-500 rounded-2xl blur-lg opacity-70 group-hover:opacity-100 transition duration-1000 group-hover:duration-200 animate-pulse" />
          <div className="relative p-4 bg-slate-900/90 border border-amber-500/30 rounded-2xl shadow-2xl flex items-center justify-center">
            {/* Custom Blade Slash SVG */}
            <svg
              className="w-12 h-12 text-amber-400 drop-shadow-[0_0_12px_rgba(251,191,36,0.8)]"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M14.5 2 22 9.5 10 21.5 2.5 14z" fill="currentColor" fillOpacity="0.15" />
              <path d="M22 2 2 22" className="stroke-rose-500" strokeWidth="2.5" />
              <path d="M14.5 2 22 9.5 10 21.5 2.5 14z" />
            </svg>
          </div>
        </div>

        {/* Title: "FRUIT NINJA" */}
        <div className="relative mb-2">
          {/* Background Glow */}
          <h1 className="text-4xl sm:text-6xl font-black tracking-wider uppercase bg-gradient-to-r from-amber-300 via-rose-500 to-red-500 bg-clip-text text-transparent drop-shadow-[0_0_25px_rgba(244,63,94,0.4)] animate-in fade-in zoom-in duration-500 font-sans">
            FRUIT NINJA
          </h1>
          {/* Subtle Blade Slash Line overlay */}
          <div className="absolute top-1/2 left-[-10%] right-[-10%] h-[2px] bg-gradient-to-r from-transparent via-amber-300 to-transparent shadow-[0_0_8px_#fde047] opacity-80 -rotate-3" />
        </div>

        {/* Subtitle: "HAND TRACKING AR GAME" */}
        <div
          className={`transition-all duration-500 transform ${
            showSubtitle ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'
          }`}
        >
          <div className="flex items-center gap-2 justify-center text-xs sm:text-sm font-extrabold tracking-[0.3em] sm:tracking-[0.4em] text-cyan-400/90 uppercase font-mono mb-4">
            <Zap className="w-3.5 h-3.5 text-cyan-400 animate-pulse" />
            <span>HAND TRACKING AR GAME</span>
            <Zap className="w-3.5 h-3.5 text-cyan-400 animate-pulse" />
          </div>
        </div>

        {/* Creator Credit: "MADE BY BIKRANT" - Completely Static */}
        <div className="mb-8">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-slate-900/90 border border-amber-500/30 backdrop-blur-md">
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            <span className="text-xs sm:text-sm font-bold tracking-widest text-amber-300 uppercase">
              MADE BY BIKRANT
            </span>
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
          </div>
        </div>

        {/* Minimal Cinematic Loading Indicator */}
        <div className="w-64 sm:w-80 space-y-2">
          {/* Percentage & Label readout */}
          <div className="flex items-center justify-between text-[10px] sm:text-[11px] font-mono font-semibold tracking-wider text-slate-400">
            <span className="flex items-center gap-1.5 text-slate-300">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              LOADING EXPERIENCE
            </span>
            <span className="text-amber-400 font-bold">{progress}%</span>
          </div>

          {/* Progress Bar Container */}
          <div className="w-full h-2 bg-slate-900/90 border border-slate-800 rounded-full p-0.5 overflow-hidden shadow-inner">
            <div
              className="h-full bg-gradient-to-r from-rose-500 via-amber-400 to-cyan-400 rounded-full transition-all duration-150 ease-out shadow-[0_0_12px_rgba(244,63,94,0.7)]"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

      </div>

      {/* Footer copyright tagline in loading screen */}
      <div className="absolute bottom-6 text-[10px] font-mono text-slate-500/80 tracking-widest uppercase">
        READY YOUR BLADE • NO TOUCH REQUIRED
      </div>
    </div>
  );
}
