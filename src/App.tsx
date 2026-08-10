import { Gamepad2 } from 'lucide-react';
import FruitNinjaGameWeb from './components/FruitNinjaGameWeb';
import CinematicLoadingScreen from './components/CinematicLoadingScreen';

export default function App() {
  return (
    <div className="min-h-screen bg-[rgb(10,12,18)] text-slate-100 font-sans antialiased selection:bg-indigo-500/30 selection:text-white">
      {/* Cinematic Full-Screen Intro Loading Overlay */}
      <CinematicLoadingScreen />

      {/* 1. Header Banner */}
      <header className="border-b border-slate-900 bg-[rgb(12,14,21)]/80 backdrop-blur sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            
            {/* Title and Badge */}
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl shadow-lg shadow-indigo-500/25">
                <Gamepad2 className="w-5 h-5 text-white animate-pulse" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-xl font-bold tracking-tight text-white font-sans">
                    Gesture Fruit Slice
                  </h1>
                  <span className="text-[10px] font-bold bg-indigo-500/10 text-indigo-400 border border-indigo-500/25 px-2 py-0.5 rounded-full uppercase tracking-wider">
                    V1.0
                  </span>
                </div>
              </div>
            </div>

          </div>
        </div>
      </header>

      {/* 2. Main Page Layout Container */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        
        <div className="space-y-6">
          <FruitNinjaGameWeb />
        </div>

      </main>

      {/* 3. Footer */}
      <footer className="border-t border-slate-900 bg-slate-950 py-6 text-center text-xs text-slate-500 font-mono mt-12">
        <div className="max-w-7xl mx-auto px-4">
          <p>© 2026 Gesture Fruit Slice Inc. Developed by BIKRANT , OpenCV, MediaPipe && React.</p>
        </div>
      </footer>

    </div>
  );
}
