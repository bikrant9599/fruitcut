import { useEffect, useRef, useState, MouseEvent, TouchEvent } from 'react';
import { Camera as CameraIcon, Zap, Volume2, VolumeX, ShieldAlert, Play, Pause, RotateCcw, AlertTriangle, ChevronDown, ChevronUp } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { sfx } from '../utils/SoundEngine';
import { FruitEntity, ParticleEntity, GameState, FruitType } from '../types';

export interface Fruit {
  id: string;
  x: number;
  y: number;
  radius: number;
  sliced: boolean;
}

/**
 * Detects fruit slicing via line-segment intersection with fruit hitboxes.
 * Supports fast swipe gestures, handles multiple fruits, and prevents duplicate slices.
 * Includes dynamic collision radius expansion to make swift swipes feel incredibly natural.
 */
export function detectFruitSlice(
  fingerX: number,
  fingerY: number,
  previousX: number,
  previousY: number,
  fruits: Fruit[]
): Fruit[] {
  const slicedFruits: Fruit[] = [];
  
  const dx = fingerX - previousX;
  const dy = fingerY - previousY;
  const swipeDistSq = dx * dx + dy * dy;
  const swipeDist = Math.sqrt(swipeDistSq);

  // Minimum movement threshold (in CSS pixels/frame) to prevent passive drift slicing
  const minSwipeThreshold = 4.5;
  if (swipeDist < minSwipeThreshold) {
    return slicedFruits;
  }

  // Dynamic collision expansion: Swift slashes get a slightly larger satisfying hit range (max +14px boost)
  const speedBonus = Math.min(14, swipeDist * 0.15);

  for (let i = 0; i < fruits.length; i++) {
    const f = fruits[i];
    if (f.sliced) continue;

    // Line segment vs Circle intersection projection:
    // Finding closest point on segment from P1(previous) to P2(current)
    let t = 0;
    if (swipeDistSq > 0.01) {
      t = ((f.x - previousX) * dx + (f.y - previousY) * dy) / swipeDistSq;
      t = Math.max(0, Math.min(1, t)); // clamp to line segment length
    }

    const closestX = previousX + t * dx;
    const closestY = previousY + t * dy;

    const distX = closestX - f.x;
    const distY = closestY - f.y;
    const distSq = distX * distX + distY * distY;

    // Radius boost scales fruit's effective slash area dynamically
    const effectiveRadius = f.radius + speedBonus;

    if (distSq <= effectiveRadius * effectiveRadius) {
      slicedFruits.push(f);
    }
  }

  return slicedFruits;
}

const FRUIT_SPECS: Record<FruitType, { colorP: string; colorS: string; radius: number; score: number; isBomb: boolean }> = {
  watermelon: { colorP: '#22c55e', colorS: '#ef4444', radius: 42, score: 1, isBomb: false },
  orange: { colorP: '#f97316', colorS: '#fed7aa', radius: 28, score: 2, isBomb: false },
  apple: { colorP: '#dc2626', colorS: '#fecaca', radius: 32, score: 2, isBomb: false },
  banana: { colorP: '#eab308', colorS: '#fef08a', radius: 25, score: 3, isBomb: false },
  bomb: { colorP: '#334155', colorS: '#ef4444', radius: 34, score: 0, isBomb: true },
  dragonfruit: { colorP: '#ec4899', colorS: '#fbcfe8', radius: 36, score: 8, isBomb: false }
};

const STANDARD_FRUIT_TYPES: FruitType[] = ['watermelon', 'orange', 'apple', 'banana'];

export default function FruitNinjaGameWeb() {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  // States
  const [gameState, setGameState] = useState<GameState>('START');
  const [score, setScore] = useState<number>(0);
  const [strikes, setStrikes] = useState<number>(0);
  const [trackingMode, setTrackingMode] = useState<'camera' | 'mouse'>('mouse');
  const [cameraLoading, setCameraLoading] = useState<boolean>(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [highScore, setHighScore] = useState<number>(() => {
    try {
      return parseInt(localStorage.getItem('fruit_slice_highscore') || '0', 10);
    } catch {
      return 0;
    }
  });
  
  const [isPortrait, setIsPortrait] = useState<boolean>(false);
  const [activeFruitsCount, setActiveFruitsCount] = useState<number>(0);
  const [isDebugMode, setIsDebugMode] = useState<boolean>(true);

  // Trackers
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [handDetected, setHandDetected] = useState<boolean>(false);
  const [masterVolume, setMasterVolume] = useState<number>(0.8);
  const [sfxVolume, setSfxVolume] = useState<number>(0.5);
  const [bgmVolume, setBgmVolume] = useState<number>(0.25);
  const [showVolumeSettings, setShowVolumeSettings] = useState<boolean>(true);

  // Sync state volumes with Sound Engine
  useEffect(() => {
    sfx.setMasterVolume(masterVolume);
  }, [masterVolume]);

  useEffect(() => {
    sfx.setSfxVolume(sfxVolume);
  }, [sfxVolume]);

  useEffect(() => {
    sfx.setBgmVolume(bgmVolume);
    bgmVolumeRef.current = bgmVolume;
  }, [bgmVolume]);

  // Refs for Game Loop Mechanics (to avoid stale React closure values in ticks)
  const scoreRef = useRef<number>(0);
  const strikesRef = useRef<number>(0);
  const gameStateRef = useRef<GameState>('START');
  const fruitsRef = useRef<FruitEntity[]>([]);
  const particlesRef = useRef<ParticleEntity[]>([]);

  const activeCountRef = useRef<number>(0);
  const handDetectedRef = useRef<boolean>(false);
  const bgmVolumeRef = useRef<number>(0.25);
  const isPortraitRef = useRef<boolean>(false);

  const bladeTrailRef = useRef<{ x: number; y: number; time: number }[]>([]);
  const lastBladePosRef = useRef<{ x: number; y: number } | null>(null);
  const spawnTimerRef = useRef<number>(0);
  const lastSpawnTimeRef = useRef<number>(0);
  const spawnIndicatorsRef = useRef<{ id: string; x: number; y: number; alpha: number; label: string; color: string; time: number }[]>([]);
  const latestHandRef = useRef<any>(null);

  const idCounterRef = useRef<number>(0);
  const lastFrameTimeRef = useRef<number>(0);

  const getNextId = (): string => {
    idCounterRef.current += 1;
    return `e_${idCounterRef.current}`;
  };

  const pushBladePoint = (currX: number, currY: number) => {
    bladeTrailRef.current.push({ x: currX, y: currY, time: Date.now() });
  };

  // Retro Arcade Juiciness Refs
  const screenShakeRef = useRef<number>(0);
  const comboRef = useRef<number>(0);
  const lastSliceTimeRef = useRef<number>(0);
  const floatingTextsRef = useRef<Array<{
    id: string;
    text: string;
    x: number;
    y: number;
    vx: number;
    vy: number;
    alpha: number;
    color: string;
    scale: number;
    size: number;
  }>>([]);

  // MediaPipe instances saved in refs to allow clean cleanup
  const activeCameraRef = useRef<any>(null);
  const activeHandsRef = useRef<any>(null);

  // Handle Mute Button toggles
  const handleToggleMute = () => {
    const nextMute = sfx.toggleMute();
    setIsMuted(!nextMute);
  };

  // Sync refs with state values
  useEffect(() => {
    scoreRef.current = score;
  }, [score]);

  useEffect(() => {
    strikesRef.current = strikes;
  }, [strikes]);

  useEffect(() => {
    gameStateRef.current = gameState;
  }, [gameState]);

  // Listen for keyboard P, Space or Escape to toggle pause states
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Toggle if key is Space, P, or Escape
      if (e.key === 'p' || e.key === 'P' || e.key === ' ' || e.key === 'Escape') {
        if (e.key === ' ') {
          e.preventDefault(); // Stop webpage from scrolling down on space key down
        }
        if (gameStateRef.current === 'PLAYING') {
          setGameState('PAUSED');
          sfx.setBgmVolume(bgmVolumeRef.current * 0.3);
        } else if (gameStateRef.current === 'PAUSED') {
          setGameState('PLAYING');
          sfx.setBgmVolume(bgmVolumeRef.current);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  // Handle High Score Sync
  const checkUpdateHighScore = (currentScore: number) => {
    if (currentScore > highScore) {
      setHighScore(currentScore);
      try {
        localStorage.setItem('fruit_slice_highscore', String(currentScore));
      } catch (e) {}
    }
  };

  const mapLandmark = (lm: { x: number; y: number }) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const dpr = window.devicePixelRatio || 1;
    const width = canvas.width / dpr;
    const height = canvas.height / dpr;
    const videoW = videoRef.current ? videoRef.current.videoWidth : 640;
    const videoH = videoRef.current ? videoRef.current.videoHeight : 480;

    const videoAspect = videoW / videoH;
    const canvasAspect = width / height;

    let scale = 1;
    let offsetX = 0;
    let offsetY = 0;

    if (canvasAspect > videoAspect) {
      scale = width / videoW;
      offsetY = (height - videoH * scale) / 2;
    } else {
      scale = height / videoH;
      offsetX = (width - videoW * scale) / 2;
    }

    // Mirror horizontally
    const mirroredX = 1 - lm.x;
    const mappedX = (mirroredX * videoW) * scale + offsetX;
    const mappedY = (lm.y * videoH) * scale + offsetY;

    return { x: mappedX, y: mappedY };
  };

    // Switch to gameplay state
  const startGame = () => {
    setScore(0);
    setStrikes(0);
    fruitsRef.current = [];
    particlesRef.current = [];
    bladeTrailRef.current = [];
    floatingTextsRef.current = [];
    screenShakeRef.current = 0;
    comboRef.current = 0;
    lastBladePosRef.current = null;
    spawnTimerRef.current = 0;
    lastSpawnTimeRef.current = performance.now();
    setActiveFruitsCount(0);
    spawnIndicatorsRef.current = [];
    setGameState('PLAYING');
    sfx.setBgmVolume(bgmVolume);
    sfx.playStartChime();
    sfx.startBGM();
  };

  const stopGame = () => {
    setGameState('GAME_OVER');
    sfx.stopBGM();
    sfx.playGameOver();
    checkUpdateHighScore(scoreRef.current);
  };

  // --- HTML5 CANVAS RENDERING AND GAME CYCLE ENGINE ---
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animFrameId: number;
    let resizeFrameId: number;

    // Handle initial drawing scale matching actual client div width
    const handleResize = () => {
      cancelAnimationFrame(resizeFrameId);
      resizeFrameId = requestAnimationFrame(() => {
        if (containerRef.current && canvas) {
          const dpr = window.devicePixelRatio || 1;
          const w = containerRef.current.clientWidth || 640;
          const h = containerRef.current.clientHeight || 460;
          const targetW = Math.floor(w * dpr);
          const targetH = Math.floor(h * dpr);
          if (canvas.width !== targetW || canvas.height !== targetH) {
            canvas.width = targetW;
            canvas.height = targetH;
          }
          const portrait = w < h;
          if (isPortraitRef.current !== portrait) {
            isPortraitRef.current = portrait;
            setIsPortrait(portrait);
          }
        }
      });
    };
    handleResize();

    const getCssSize = () => {
      const dpr = window.devicePixelRatio || 1;
      return {
        width: canvas.width / dpr,
        height: canvas.height / dpr,
        dpr
      };
    };

    const observer = new ResizeObserver(handleResize);
    if (containerRef.current) observer.observe(containerRef.current);

    // Helper: Spawn dynamic coordinated wave of fruits with safety horizontal column spacing
    const spawnFruitWave = (count: number, speedScale: number, bombChance: number, timestamp: number) => {
      const { width, height } = getCssSize();
      const isPortraitLayout = width < height;
      
      // Strict optimization: cap maximum active uncut fruits to 5 to keep performance smooth and avoid overlap mess (user limit)
      const activeUncut = fruitsRef.current.filter(f => !f.sliced).length;
      if (activeUncut >= 5) {
        console.log(`[Fruit Spawner] Blocked launch: Active fruit count (${activeUncut}) is already at or above maximum limit of 5.`);
        return; 
      }

      // Enforce maximum fruits per wave limit of 3
      const finalCount = Math.min(count, 3);

      // Columns-based horizontal partition to prevent fruits from spawning on top of each other
      const margin = isPortraitLayout ? width * 0.16 : 80;
      const playableWidth = width - (margin * 2);
      const columnWidth = playableWidth / finalCount;

      let specialCount = 0; // Tracks special fruits ('bomb' or 'dragonfruit') spawned in this wave.

      for (let i = 0; i < finalCount; i++) {
        // Calculate safe X column boundaries
        const colMin = margin + i * columnWidth;
        const colMax = colMin + columnWidth;
        const midPoint = (colMin + colMax) / 2;
        
        // Guarantee distinct positions across columns by applying narrow jitter around the column's midPoint
        const jitterRange = columnWidth * 0.40;
        const spawnX = midPoint + (Math.random() * jitterRange - jitterRange / 2);
        
        // Determine fruit types ensuring we never spawn more than 2 special fruits in the same wave
        const isSpawnBomb = Math.random() < bombChance;
        let chosenType: FruitType;
        
        if (isSpawnBomb && specialCount < 2) {
          chosenType = 'bomb';
          specialCount++;
        } else {
          // Special Bonus Chance: 8.5% chance to spawn rare Dragonfruit (+8 score value!)
          if (Math.random() < 0.085 && specialCount < 2) {
            chosenType = 'dragonfruit';
            specialCount++;
          } else {
            chosenType = STANDARD_FRUIT_TYPES[Math.floor(Math.random() * STANDARD_FRUIT_TYPES.length)];
          }
        }

        const spec = FRUIT_SPECS[chosenType];
        const radius = spec.radius;
        const heightScale = Math.sqrt(height / 560);
        
        // Slightly stagger launching heights so fruits are not completely synchronized
        const spawnY = height + radius * 1.5 + (Math.random() * 45);

        // Gentle centering inward drift so fruits stay in-viewport, combined with random trajectories
        const screenCenterX = width / 2;
        const centerDistance = screenCenterX - spawnX;
        
        // Horizontal drag/speed clamped strictly to requested bounds (-100 to 100 px/s is -1.67 to 1.67 px/frame at 60 FPS)
        const minVx = -1.67;
        const maxVx = 1.67;
        let velocityX = (Math.random() * (maxVx - minVx) + minVx) * speedScale;
        
        // Apply tiny centering drift to prevent instant off-screen drops
        velocityX = (velocityX * 0.5) + (centerDistance * 0.0035) * speedScale;
        velocityX = Math.max(-1.67, Math.min(1.67, velocityX));
        
        // Physics Settings: Target Gravity = 200 px/s² (~0.055 px/frame² at 60 FPS, within requested 180-220 range)
        // Upward launch velocity requested: Min: -900, Max: -1200 px/s (-15 to -20 px/frame)
        // We calibrate with a vertical scale factor (0.50) to fit a standard 500-650px canvas container elegantly.
        const minLaunch = 15.0;
        const maxLaunch = 20.0;
        const baseLaunchY = Math.random() * (maxLaunch - minLaunch) + minLaunch;
        const dampeningFactor = 0.50;
        const velocityY = -(baseLaunchY * heightScale * speedScale * dampeningFactor);

        const fruit: FruitEntity = {
          id: getNextId(),
          type: chosenType,
          x: spawnX,
          y: spawnY,
          vx: velocityX,
          vy: velocityY,
          radius: radius,
          colorPrimary: spec.colorP,
          colorSecondary: spec.colorS,
          scoreValue: spec.score,
          isBomb: spec.isBomb,
          sliced: false,
          angle: Math.random() * Math.PI,
          rotSpeed: Math.random() * 0.1 - 0.05,
          sliceAngle: 0,
          halfOffsetDist: 0,
          separateVx: 3.5 + Math.random() * 1.5
        };

        fruitsRef.current.push(fruit);
        console.log("Fruit spawned", fruit);

        // Add a visual debugging pointer at bottom launch coordinates
        spawnIndicatorsRef.current.push({
          id: getNextId(),
          x: spawnX,
          y: height - 15,
          alpha: 1.0,
          label: `${chosenType.toUpperCase()} +${spec.score}`,
          color: spec.colorP,
          time: timestamp
        });
      }

      sfx.playSpawn();
    };

    // Slice impacts
    const triggerSliceEmitters = (fruit: FruitEntity) => {
      // Spawn fruit splash juice particles (no hardware-adaptive scaling)
      const count = fruit.isBomb ? 35 : 15;
      for (let i = 0; i < count; i++) {
        const randAngle = Math.random() * Math.PI * 2;
        const randSpeed = fruit.isBomb ? Math.random() * 7 + 4 : Math.random() * 4.5 + 2;
        
        particlesRef.current.push({
          id: getNextId(),
          x: fruit.x,
          y: fruit.y,
          vx: Math.cos(randAngle) * randSpeed,
          vy: Math.sin(randAngle) * randSpeed,
          radius: Math.random() * 3.2 + 1.3,
          color: fruit.isBomb ? '#f97316' : fruit.colorSecondary,
          alpha: 1.0,
          fadeSpeed: Math.random() * 0.035 + 0.015,
          gravity: 0.12,
          isSpark: fruit.isBomb
        });
      }
    };

    // Main 60FPS Game loop drawing
    const tick = () => {
      if (!ctx || !canvas) return;

      const { width, height, dpr } = getCssSize();

      // Real-time precise FPS and delta timing updates
      const now = performance.now();
      let dt = 1.0;
      if (lastFrameTimeRef.current > 0) {
        const delta = now - lastFrameTimeRef.current;
        
        // At 60 FPS, delta is 16.67ms. Normalize dt such that 1 frame at 60 FPS is exactly 1.0.
        // Clamp dt between 0.1 and 2.5 to avoid teleportation.
        dt = Math.max(0.1, Math.min(2.5, delta / 16.67));

        const activeCount = fruitsRef.current.filter(f => !f.sliced).length;
        if (activeCountRef.current !== activeCount) {
          activeCountRef.current = activeCount;
          setActiveFruitsCount(activeCount);
        }
      }
      lastFrameTimeRef.current = now;

      // ==========================================
      // SECTION A: PHYSICS & STATE UPDATES (No canvas drawing yet)
      // ==========================================

      // 1. Spawner & Dynamic Difficulty Timer logic with Rebalanced Progression & limits
      if (gameStateRef.current === 'PLAYING') {
        const currentScore = scoreRef.current;
        // Enforce user constraints: spawnInterval 1200ms - 1500ms; fruitsPerWave 1-3
        let spawnInterval = 1500; // in milliseconds
        let fruitsPerWave = 1;
        let speedScale = 0.95;
        let bombChance = 0.05;

        // Apply progressive difficulty stages (strictly matching requested bounds)
        if (currentScore <= 15) {
          spawnInterval = 1500;
          fruitsPerWave = 1;
          speedScale = 0.95;
          bombChance = 0.04;
        } else if (currentScore <= 45) {
          spawnInterval = 1400;
          fruitsPerWave = Math.random() < 0.65 ? 1 : 2;
          speedScale = 1.0;
          bombChance = 0.08;
        } else if (currentScore <= 85) {
          spawnInterval = 1300;
          fruitsPerWave = 2;
          speedScale = 1.05;
          bombChance = 0.12;
        } else {
          spawnInterval = 1200; // Capped at lowest allowed limit of 1.2s
          fruitsPerWave = Math.random() < 0.45 ? 2 : 3; // Capped at max 3
          speedScale = 1.10;
          bombChance = 0.16;
        }

        const elapsedSinceLastSpawn = now - lastSpawnTimeRef.current;
        if (elapsedSinceLastSpawn >= spawnInterval) {
          const activeUncut = fruitsRef.current.filter(f => !f.sliced).length;
          
          // Debugging console statements to track active limits, timings, and gravity
          console.log(`[Difficulty Engine] Active Fruits: ${activeUncut}/5, Interval: ${spawnInterval}ms, Wave Count: ${fruitsPerWave}, Target Gravity: 200 px/s² (~0.055 px/frame²)`);

          if (activeUncut >= 5) {
            // Keep maximum active fruits on screen under limit of 5
            console.log(`[Difficulty Engine] Spawn Limit Enforced: Active on-screen count is ${activeUncut} >= 5. Spawning paused/postponed.`);
            // Defer current tick by 150ms so it tries again soon
            lastSpawnTimeRef.current = now - spawnInterval + 150;
          } else {
            lastSpawnTimeRef.current = now;
            
            // Log successful wave spawn parameters
            console.log(`[Difficulty Engine] Launching wave with ${fruitsPerWave} fruits at speed ${speedScale}. Active count: ${activeUncut}`);
            
            // Trigger the coordinated wave with safety-positioned launchers
            spawnFruitWave(fruitsPerWave, speedScale, bombChance, now);
          }
        }
      }

      // 2. Filter & decay blade trail values (sliced/limited to 20 points)
      const nowTime = Date.now();
      bladeTrailRef.current = bladeTrailRef.current.filter(p => nowTime - p.time < 190).slice(-20);

      // Decay spawn indicators
      spawnIndicatorsRef.current = spawnIndicatorsRef.current.filter(ind => {
        if (gameStateRef.current === 'PLAYING') {
          ind.alpha -= 0.022 * dt; // fade out over roughly 45 frames (~750ms)
        }
        return ind.alpha > 0;
      });

      // 3. Update fruits physics and handle multi-segment slice collision triggers
      const activeFruits = fruitsRef.current;
      const trail = bladeTrailRef.current;

      fruitsRef.current = activeFruits.filter(f => {
        if (gameStateRef.current === 'PLAYING') {
          // Apply Gravities (Slightly reduced gravity for beautiful, natural float: 165 px/s² = 0.046 px/frame², dt-based)
          f.vy += 0.046 * dt;
          f.x += f.vx * dt;
          f.y += f.vy * dt;
          f.angle += f.rotSpeed * dt;

          if (f.sliced) {
            f.halfOffsetDist += f.separateVx * dt;
          }
        }

        // Calculate intersecting lines multi-segment slice detection - check last 6 points for perfect responsiveness
        if (!f.sliced && gameStateRef.current === 'PLAYING' && trail.length >= 2) {
          const checkCount = Math.min(6, trail.length - 1);
          for (let s = 0; s < checkCount; s++) {
            const idx1 = trail.length - 2 - s;
            const idx2 = trail.length - 1 - s;
            if (idx1 < 0) break;

            const p1 = trail[idx1];
            const p2 = trail[idx2];

            const newlySliced = detectFruitSlice(p2.x, p2.y, p1.x, p1.y, [f]);
            if (newlySliced.length > 0) {
              f.sliced = true;
              console.log("Fruit sliced via robust detectFruitSlice detector", f);
              f.sliceAngle = Math.atan2(p2.y - p1.y, p2.x - p1.x);
              triggerSliceEmitters(f);
              
              if (f.isBomb) {
                sfx.playExplosion();
                screenShakeRef.current = 24; 

                floatingTextsRef.current.push({
                  id: getNextId(),
                  text: "KABOOM!",
                  x: f.x,
                  y: f.y,
                  vx: 0,
                  vy: -3,
                  alpha: 1,
                  color: '#ef4444',
                  scale: 2.2,
                  size: 32
                });

                setStrikes(3);
                stopGame();
              } else {
                const sliceNow = Date.now();
                if (sliceNow - lastSliceTimeRef.current < 450) {
                  comboRef.current += 1;
                } else {
                  comboRef.current = 1;
                }
                lastSliceTimeRef.current = sliceNow;

                // Play professional custom sound feedback based on combo thresholds
                if (comboRef.current >= 3) {
                  sfx.playCombo(comboRef.current);
                } else {
                  sfx.playSlice();
                  sfx.playSplat();
                  sfx.playBassThump();
                }

                const pointsEarned = f.scoreValue;
                let finalPoints = pointsEarned;
                let floatingMessage = `+${pointsEarned}`;
                let floatingColor = f.colorSecondary;
                let textScale = 1.3;

                if (comboRef.current >= 3) {
                  finalPoints += 1;
                  floatingMessage = `+${pointsEarned + 1} Multi-Slice x${comboRef.current}!`;
                  floatingColor = '#facc15'; 
                  textScale = 1.8;
                  
                  // Spawn bonus particles
                  for (let j = 0; j < 8; j++) {
                    particlesRef.current.push({
                      id: getNextId(),
                      x: f.x + (Math.random() - 0.5) * 30,
                      y: f.y + (Math.random() - 0.5) * 30,
                      vx: (Math.random() - 0.5) * 6,
                      vy: (Math.random() - 0.5) * 6,
                      radius: Math.random() * 3 + 1,
                      color: '#facc15',
                      alpha: 1.0,
                      fadeSpeed: Math.random() * 0.04 + 0.02,
                      gravity: 0.1,
                      isSpark: true
                    });
                  }
                }

                setScore(prev => prev + finalPoints);

                floatingTextsRef.current.push({
                   id: getNextId(),
                   text: floatingMessage,
                   x: f.x,
                   y: f.y,
                   vx: (Math.random() - 0.5) * 3,
                   vy: -4 - Math.random() * 1.5,
                   alpha: 1,
                   color: floatingColor,
                   scale: textScale,
                   size: 24
                });
              }
              break; // Slice succeeded, no need to check earlier segments for this fruit
            }
          }
        }

        // Offscreen check allowing safe initial spawn below page
        const isOff = (f.y > height + f.radius * 3 && f.vy > 0) || f.x < -120 || f.x > width + 120;
        if (isOff) {
          if (!f.sliced && !f.isBomb && gameStateRef.current === 'PLAYING') {
            setStrikes(prev => {
              const updated = prev + 1;
              if (updated >= 3) {
                stopGame();
              }
              return updated;
            });
          }
          return false;
        }
        return true;
      });

      // Update particle physics (dt-based) using dynamic array filter
      particlesRef.current = particlesRef.current.filter(p => {
        if (gameStateRef.current === 'PLAYING') {
          p.vy += p.gravity * dt;
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          p.alpha -= p.fadeSpeed * dt;
        }
        return p.alpha > 0;
      });

      // Update floating texts physics (dt-based)
      floatingTextsRef.current = floatingTextsRef.current.filter(t => {
        if (gameStateRef.current === 'PLAYING') {
          t.x += t.vx * dt;
          t.y += t.vy * dt;
          t.vy += 0.081 * dt;
          t.alpha -= 0.016 * dt;
          if (t.scale > 1.0) t.scale -= 0.012 * dt;
        }
        return t.alpha > 0;
      });

      // ==========================================
      // SECTION B: IN-ORDER CANVAS DRAWING PASSES
      // ==========================================

      // Clear the physical canvas first using raw physical bounds
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Save and scale context for Device Pixel Ratio transparency
      ctx.save();
      ctx.scale(dpr, dpr);

      // Apply screen shake translates if active
      if (screenShakeRef.current > 0.1) {
        const shakeX = (Math.random() - 0.5) * screenShakeRef.current;
        const shakeY = (Math.random() - 0.5) * screenShakeRef.current;
        ctx.translate(shakeX, shakeY);
        screenShakeRef.current *= 0.88; 
      }

      // --- LAYER 1: Live camera feed (or default ambient backup grid) ---
      if (videoRef.current && videoRef.current.readyState >= 2) {
        ctx.save();
        const videoW = videoRef.current.videoWidth || 640;
        const videoH = videoRef.current.videoHeight || 480;
        const videoAspect = videoW / videoH;
        const canvasAspect = width / height;

        let scale = 1;
        let offsetX = 0;
        let offsetY = 0;

        if (canvasAspect > videoAspect) {
          scale = width / videoW;
          offsetY = (height - videoH * scale) / 2;
        } else {
          scale = height / videoH;
          offsetX = (width - videoW * scale) / 2;
        }

        ctx.translate(width, 0);
        ctx.scale(-1, 1);
        ctx.drawImage(videoRef.current, offsetX, offsetY, videoW * scale, videoH * scale);
        ctx.restore();

        // Dark contrasting overlay to keep the neon blade and colorful fruits perfectly visible
        ctx.fillStyle = 'rgba(10, 12, 18, 0.44)';
        ctx.fillRect(0, 0, width, height);
      } else {
        // Dark space visual alternative
        ctx.fillStyle = '#0a0c10';
        ctx.fillRect(0, 0, width, height);

        // Circular geometric outlines
        ctx.strokeStyle = 'rgba(56, 189, 248, 0.08)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(width / 2, height / 2, 120, 0, Math.PI * 2);
        ctx.arc(width / 2, height / 2, 240, 0, Math.PI * 2);
        ctx.stroke();
      }

      // --- LAYER 1.5: Spawn Debugging Indicators ---
      spawnIndicatorsRef.current.forEach(ind => {
        ctx.save();
        ctx.globalAlpha = ind.alpha;
        
        // Ring pulse circle at the bottom spawn position
        ctx.strokeStyle = ind.color;
        ctx.lineWidth = 2.0;
        ctx.beginPath();
        const pulseRadius = (1 - ind.alpha) * 35 + 8;
        ctx.arc(ind.x, ind.y, pulseRadius, 0, Math.PI * 2);
        ctx.stroke();

        // Small crosshair coordinate lines
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(ind.x - 10, ind.y);
        ctx.lineTo(ind.x + 10, ind.y);
        ctx.moveTo(ind.x, ind.y - 10);
        ctx.lineTo(ind.x, ind.y + 10);
        ctx.stroke();

        // Glowing text label just above bottom of screen
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 10px "JetBrains Mono", "Fira Code", monospace';
        ctx.textAlign = 'center';
        ctx.shadowColor = ind.color;
        ctx.shadowBlur = 6;
        ctx.fillText(ind.label.toUpperCase() + " LAUNCHED", ind.x, ind.y - 18);
        
        ctx.restore();
      });

      // --- LAYER 2: Fruits (non-sliced only) ---
      fruitsRef.current.forEach(f => {
        if (!f.sliced) {
          ctx.save();
          if (f.isBomb) {
            // Metallic dark bomb core with neon outline glows and a dark drop shadow
            ctx.shadowBlur = 15;
            ctx.shadowColor = 'rgba(0, 0, 0, 0.6)';
            ctx.shadowOffsetX = 4;
            ctx.shadowOffsetY = 6;
            ctx.fillStyle = '#1e293b';
            ctx.strokeStyle = '#ef4444';
            ctx.lineWidth = 3.5;
            ctx.beginPath();
            ctx.arc(f.x, f.y, f.radius, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();

            // Disable shadow for fuse/spark to preserve visual vibrancy
            ctx.shadowColor = 'transparent';
            ctx.shadowBlur = 0;
            ctx.shadowOffsetX = 0;
            ctx.shadowOffsetY = 0;

            // Fuse Spark Cord
            const sparkX = f.x + Math.cos(f.angle) * (f.radius + 10);
            const sparkY = f.y + Math.sin(f.angle) * (f.radius + 10);
            ctx.beginPath();
            ctx.moveTo(f.x, f.y);
            ctx.lineTo(sparkX, sparkY);
            ctx.strokeStyle = '#b45309';
            ctx.lineWidth = 3;
            ctx.stroke();

            // Fuse yellow spark fire
            ctx.fillStyle = Math.random() < 0.5 ? '#f97316' : '#eab308';
            ctx.beginPath();
            ctx.arc(sparkX, sparkY, Math.random() * 6 + 4, 0, Math.PI * 2);
            ctx.fill();
          } else {
            // Glossy skin vector fruit models with elegant rich drop shadow for tactile visual depth
            ctx.shadowColor = 'rgba(0, 0, 0, 0.55)';
            ctx.shadowBlur = 12;
            ctx.shadowOffsetX = 4;
            ctx.shadowOffsetY = 6;
            ctx.fillStyle = f.colorPrimary;
            ctx.beginPath();
            ctx.arc(f.x, f.y, f.radius, 0, Math.PI * 2);
            ctx.fill();

            // Disable shadow for inner detailing to keep detail patterns completely crisp
            ctx.shadowColor = 'transparent';
            ctx.shadowBlur = 0;
            ctx.shadowOffsetX = 0;
            ctx.shadowOffsetY = 0;

            // Flesh interior layer
            ctx.fillStyle = f.colorSecondary;
            ctx.beginPath();
            ctx.arc(f.x, f.y, f.radius * 0.82, 0, Math.PI * 2);
            ctx.fill();

            // Fruit specific detailing (seeds, etc.)
            if (f.type === 'dragonfruit') {
              // Draw black dragonfruit seeds dotted inside
              ctx.fillStyle = '#0f172a';
              const seedAngles = [0.1, 0.7, 1.4, 2.0, 2.6, 3.2, 3.8, 4.4, 5.0, 5.6];
              seedAngles.forEach((ang) => {
                const rRadius = f.radius * 0.42;
                const seedX = f.x + Math.cos(ang + f.angle) * rRadius;
                const seedY = f.y + Math.sin(ang + f.angle) * rRadius;
                ctx.beginPath();
                ctx.arc(seedX, seedY, 1.8, 0, Math.PI * 2);
                ctx.fill();
              });
            } else if (f.type === 'watermelon') {
              // Draw black watermelon seeds
              ctx.fillStyle = '#1d1d1f';
              const seedAngles = [0.3, 1.5, 2.7, 3.9, 5.1];
              seedAngles.forEach((ang) => {
                const rRadius = f.radius * 0.48;
                const seedX = f.x + Math.cos(ang + f.angle * 0.5) * rRadius;
                const seedY = f.y + Math.sin(ang + f.angle * 0.5) * rRadius;
                ctx.beginPath();
                ctx.arc(seedX, seedY, 2.2, 0, Math.PI * 2);
                ctx.fill();
              });
            } else {
              // Stem detailing for other standard fruits
              ctx.strokeStyle = '#78350f';
              ctx.lineWidth = 3;
              ctx.beginPath();
              ctx.moveTo(f.x, f.y - f.radius + 1);
              ctx.lineTo(f.x - 4, f.y - f.radius - 8);
              ctx.stroke();
              
              // Stem leaf
              ctx.fillStyle = '#22c55e';
              ctx.beginPath();
              ctx.ellipse(f.x - 7, f.y - f.radius - 6, 6, 3, -Math.PI / 4, 0, Math.PI * 2);
              ctx.fill();
            }
          }
          ctx.restore();
        }
      });

      // --- LAYER 3: Fruit halves (sliced segments) ---
      fruitsRef.current.forEach(f => {
        if (f.sliced) {
          ctx.save();
          const dx = Math.cos(f.sliceAngle + Math.PI / 2) * f.halfOffsetDist;
          const dy = Math.sin(f.sliceAngle + Math.PI / 2) * f.halfOffsetDist;

          // Half A outer skin with drop shadow
          ctx.shadowColor = 'rgba(0, 0, 0, 0.55)';
          ctx.shadowBlur = 12;
          ctx.shadowOffsetX = 4;
          ctx.shadowOffsetY = 6;
          ctx.beginPath();
          ctx.arc(f.x - dx, f.y - dy, f.radius, f.sliceAngle, f.sliceAngle + Math.PI);
          ctx.fillStyle = f.colorPrimary;
          ctx.fill();

          // Disable shadow for inner detailing
          ctx.shadowColor = 'transparent';
          ctx.shadowBlur = 0;
          ctx.shadowOffsetX = 0;
          ctx.shadowOffsetY = 0;

          ctx.beginPath();
          ctx.arc(f.x - dx, f.y - dy, f.radius * 0.82, f.sliceAngle, f.sliceAngle + Math.PI);
          ctx.fillStyle = f.colorSecondary;
          ctx.fill();

          // Sliced Seeds for Half A
          if (f.type === 'dragonfruit') {
            ctx.fillStyle = '#0f172a';
            [-0.5, 0, 0.5].forEach((offset) => {
              const seedAngle = f.sliceAngle + Math.PI / 2 + offset;
              const seedX = (f.x - dx) + Math.cos(seedAngle) * (f.radius * 0.44);
              const seedY = (f.y - dy) + Math.sin(seedAngle) * (f.radius * 0.44);
              ctx.beginPath();
              ctx.arc(seedX, seedY, 1.8, 0, Math.PI * 2);
              ctx.fill();
            });
          } else if (f.type === 'watermelon') {
            ctx.fillStyle = '#1d1d1f';
            [-0.4, 0.4].forEach((offset) => {
              const seedAngle = f.sliceAngle + Math.PI / 2 + offset;
              const seedX = (f.x - dx) + Math.cos(seedAngle) * (f.radius * 0.48);
              const seedY = (f.y - dy) + Math.sin(seedAngle) * (f.radius * 0.48);
              ctx.beginPath();
              ctx.arc(seedX, seedY, 2.2, 0, Math.PI * 2);
              ctx.fill();
            });
          }

          // Half B-段 outer skin with drop shadow
          ctx.shadowColor = 'rgba(0, 0, 0, 0.55)';
          ctx.shadowBlur = 12;
          ctx.shadowOffsetX = 4;
          ctx.shadowOffsetY = 6;
          ctx.beginPath();
          ctx.arc(f.x + dx, f.y + dy, f.radius, f.sliceAngle + Math.PI, f.sliceAngle * 2);
          ctx.fillStyle = f.colorPrimary;
          ctx.fill();

          // Disable shadow for inner detailing
          ctx.shadowColor = 'transparent';
          ctx.shadowBlur = 0;
          ctx.shadowOffsetX = 0;
          ctx.shadowOffsetY = 0;

          ctx.beginPath();
          ctx.arc(f.x + dx, f.y + dy, f.radius * 0.82, f.sliceAngle + Math.PI, f.sliceAngle * 2);
          ctx.fillStyle = f.colorSecondary;
          ctx.fill();

          // Sliced Seeds for Half B
          if (f.type === 'dragonfruit') {
            ctx.fillStyle = '#0f172a';
            [-0.5, 0, 0.5].forEach((offset) => {
              const seedAngle = f.sliceAngle + 3 * Math.PI / 2 + offset;
              const seedX = (f.x + dx) + Math.cos(seedAngle) * (f.radius * 0.44);
              const seedY = (f.y + dy) + Math.sin(seedAngle) * (f.radius * 0.44);
              ctx.beginPath();
              ctx.arc(seedX, seedY, 1.8, 0, Math.PI * 2);
              ctx.fill();
            });
          } else if (f.type === 'watermelon') {
            ctx.fillStyle = '#1d1d1f';
            [-0.4, 0.4].forEach((offset) => {
              const seedAngle = f.sliceAngle + 3 * Math.PI / 2 + offset;
              const seedX = (f.x + dx) + Math.cos(seedAngle) * (f.radius * 0.48);
              const seedY = (f.y + dy) + Math.sin(seedAngle) * (f.radius * 0.48);
              ctx.beginPath();
              ctx.arc(seedX, seedY, 2.2, 0, Math.PI * 2);
              ctx.fill();
            });
          }
          ctx.restore();
        }
      });

      // --- LAYER 4: Juice particles & sparks (stretching along vector direction) ---
      particlesRef.current.forEach(p => {
        if (p.alpha > 0) {
          ctx.save();
          ctx.globalAlpha = p.alpha;
          
          const speed = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
          const flowAngle = Math.atan2(p.vy, p.vx);
          ctx.translate(p.x, p.y);
          ctx.rotate(flowAngle);

          if (p.isSpark) {
            ctx.fillStyle = '#ffedd5';
            ctx.beginPath();
            const length = p.radius * (1 + speed * 0.18);
            const thickness = p.radius * 0.7;
            ctx.ellipse(0, 0, length, thickness, 0, 0, Math.PI * 2);
            ctx.fill();
          } else {
            ctx.fillStyle = p.color;
            ctx.beginPath();
            const length = p.radius * (1 + speed * 0.14);
            const thickness = p.radius * 0.8;
            ctx.ellipse(0, 0, length, thickness, 0, 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.restore();
        }
      });

      // --- LAYER 5: Combo effects & Floating scores text ---
      floatingTextsRef.current.forEach(t => {
        ctx.save();
        ctx.globalAlpha = t.alpha;
        ctx.fillStyle = t.color;
        
        ctx.shadowBlur = 12;
        ctx.shadowColor = t.color;
        
        ctx.font = `bold ${Math.round(t.size * t.scale)}px "Space Grotesk", "Outfit", "Inter", sans-serif`;
        ctx.textAlign = 'center';
        ctx.lineWidth = 4.5;
        ctx.strokeStyle = '#020617'; 
        ctx.strokeText(t.text, t.x, t.y);
        ctx.fillText(t.text, t.x, t.y);
        ctx.restore();
      });

      // --- LAYER 6: Blade Trail (Vivid neon green & lime yellow core sword line) ---
      if (trail.length >= 2) {
        ctx.save();
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        const nowTime = Date.now();

        for (let i = 1; i < trail.length; i++) {
          const pointAge = nowTime - trail[i].time;
          // Calculate dynamic alpha and thickness based on point age (max 190ms lifetime)
          const lifeRatio = Math.max(0, 1 - pointAge / 190);
          if (lifeRatio <= 0) continue;

          // Width narrows toward the tail end of the swipe
          const outerWidth = lifeRatio * 15;
          const innerWidth = lifeRatio * 4.5;

          // Outer glowing sweep segment (Neon Green)
          ctx.strokeStyle = `rgba(34, 197, 94, ${lifeRatio * 0.75})`;
          ctx.lineWidth = outerWidth;
          ctx.beginPath();
          ctx.moveTo(trail[i - 1].x, trail[i - 1].y);
          ctx.lineTo(trail[i].x, trail[i].y);
          ctx.stroke();

          // Inner laser core segment (Crisp pale yellow core)
          ctx.strokeStyle = `rgba(255, 255, 230, ${lifeRatio * 0.95})`;
          ctx.lineWidth = innerWidth;
          ctx.beginPath();
          ctx.moveTo(trail[i - 1].x, trail[i - 1].y);
          ctx.lineTo(trail[i].x, trail[i].y);
          ctx.stroke();
        }
        ctx.restore();
      }

      // --- LAYER 7: Debugging and Hand Tracking Overlays ---
      if (trackingMode === 'camera' && latestHandRef.current) {
        const hand = latestHandRef.current;
        
        // 1. Draw full hand skeleton joints if in debug mode
        if (isDebugMode) {
          ctx.save();
          // Draw standard connections
          const connections = [
            [0, 1], [1, 2], [2, 3], [3, 4], // Thumb
            [0, 5], [5, 6], [6, 7], [7, 8], // Index
            [5, 9], [9, 10], [10, 11], [11, 12], // Middle
            [9, 13], [13, 14], [14, 15], [15, 16], // Ring
            [13, 17], [17, 18], [18, 19], [19, 20], // Pinky
            [0, 17] // Fold palm base
          ];

          ctx.strokeStyle = 'rgba(99, 102, 241, 0.6)'; // Neon Indigo
          ctx.lineWidth = 3;
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';

          connections.forEach(([start, end]) => {
            const startPt = hand[start];
            const endPt = hand[end];
            if (startPt && endPt) {
              const sMapped = mapLandmark(startPt);
              const eMapped = mapLandmark(endPt);

              ctx.beginPath();
              ctx.moveTo(sMapped.x, sMapped.y);
              ctx.lineTo(eMapped.x, eMapped.y);
              ctx.stroke();
            }
          });

          // Draw joint points with secondary glows
          hand.forEach((lm: any, idx: number) => {
            const mapped = mapLandmark(lm);

            ctx.beginPath();
            ctx.arc(mapped.x, mapped.y, 5, 0, Math.PI * 2);
            // Highlight index fingertip in special green, others in indigo or yellow
            if (idx === 8) {
              ctx.fillStyle = '#22c55e'; // Bright Green
            } else {
              ctx.fillStyle = idx % 4 === 0 ? '#fbbf24' : '#6366f1'; 
            }
            ctx.fill();

            // Light gray stroke to stand out
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 1;
            ctx.stroke();
          });
          ctx.restore();
        }

        // 2. "Draw a visible green circle at the fingertip"
        // Also display fingertip coordinates if in Debug Mode
        const indexTip = hand[8];
        if (indexTip) {
          const mapped = mapLandmark(indexTip);

          ctx.save();
          // Draw Neon Green pulse circle
          ctx.shadowBlur = 15;
          ctx.shadowColor = '#22c55e';
          ctx.fillStyle = '#22c55e';
          ctx.beginPath();
          ctx.arc(mapped.x, mapped.y, 9, 0, Math.PI * 2);
          ctx.fill();

          // White core circle
          ctx.fillStyle = '#ffffff';
          ctx.beginPath();
          ctx.arc(mapped.x, mapped.y, 4, 0, Math.PI * 2);
          ctx.fill();
          
          if (isDebugMode) {
            // Text values above finger
            ctx.fillStyle = '#22c55e';
            ctx.font = 'bold 11px "JetBrains Mono", monospace';
            ctx.textAlign = 'center';
            ctx.shadowBlur = 4;
            ctx.shadowColor = '#000000';
            ctx.fillText(`INDEX TIP (${Math.round(mapped.x)}, ${Math.round(mapped.y)})`, mapped.x, mapped.y - 18);
          }
          ctx.restore();
        }
      }

      // 3. Highlight fruits, draw bounding circles and trace slice lines to closest trails
      if (isDebugMode && trackingMode === 'camera') {
        const trail = bladeTrailRef.current;
        fruitsRef.current.forEach(f => {
          if (!f.sliced) {
            ctx.save();
            
            // Draw hitbox radius
            ctx.strokeStyle = f.isBomb ? 'rgba(239, 68, 68, 0.45)' : 'rgba(56, 189, 248, 0.45)';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.setLineDash([4, 4]);
            ctx.arc(f.x, f.y, f.radius, 0, Math.PI * 2);
            ctx.stroke();

            // Label radius of the fruit
            ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
            ctx.font = '8px "JetBrains Mono", monospace';
            ctx.textAlign = 'center';
            ctx.fillText(`r:${f.radius}`, f.x, f.y + f.radius + 10);

            // Draw line to closest blade trail point
            if (trail.length >= 2) {
              const p1 = trail[trail.length - 2];
              const p2 = trail[trail.length - 1];

              const dx = p2.x - p1.x;
              const dy = p2.y - p1.y;
              const segmentLenSq = dx * dx + dy * dy;
              
              let closestX = p1.x;
              let closestY = p1.y;

              if (segmentLenSq > 1) {
                let t = ((f.x - p1.x) * dx + (f.y - p1.y) * dy) / segmentLenSq;
                t = Math.max(0, Math.min(1, t));
                closestX = p1.x + t * dx;
                closestY = p1.y + t * dy;
              }

              const distSq = (closestX - f.x) ** 2 + (closestY - f.y) ** 2;
              const dist = Math.sqrt(distSq);
              const collision = dist <= f.radius;

              // Highlight line and text if collides
              ctx.beginPath();
              ctx.moveTo(f.x, f.y);
              ctx.lineTo(closestX, closestY);
              ctx.strokeStyle = collision ? '#22c55e' : 'rgba(244, 63, 94, 0.45)';
              ctx.lineWidth = collision ? 3 : 1;
              ctx.stroke();

              // Draw distance text along line
              const midX = (f.x + closestX) / 2;
              const midY = (f.y + closestX) ? (f.y + closestY) / 2 : f.y;
              ctx.fillStyle = collision ? '#22c55e' : '#f43f5e';
              ctx.font = 'bold 9px "JetBrains Mono", monospace';
              ctx.fillText(`${Math.round(dist)}px`, midX, midY - 4);

              // Draw collision highlight glow ring if collided
              if (collision) {
                ctx.strokeStyle = '#22c55e';
                ctx.lineWidth = 4;
                ctx.shadowBlur = 12;
                ctx.shadowColor = '#22c55e';
                ctx.beginPath();
                ctx.arc(f.x, f.y, f.radius + 6, 0, Math.PI * 2);
                ctx.stroke();
              }
            }
            ctx.restore();
          }
        });
      }

      // Restores general screen-shaking contexts
      ctx.restore();

      // Restores Device Pixel Ratio scaling context
      ctx.restore();

      // Recall frame
      animFrameId = requestAnimationFrame(tick);
    };

    tick();

    return () => {
      cancelAnimationFrame(animFrameId);
      cancelAnimationFrame(resizeFrameId);
      observer.disconnect();
    };
  }, [gameState]);

  // Handle manual cursor tracking fallbacks on canvas
  const handleCanvasMouseMove = (e: MouseEvent<HTMLCanvasElement>) => {
    if (trackingMode === 'camera') return; // Skip if in camera processing
    
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const currX = e.clientX - rect.left;
    const currY = e.clientY - rect.top;

    pushBladePoint(currX, currY);

    // Click trigger start if in screens
    if (gameState === 'START' && e.buttons === 1) {
      startGame();
    } else if (gameState === 'PAUSED' && e.buttons === 1) {
      setGameState('PLAYING');
      sfx.setBgmVolume(bgmVolume);
    }
  };

  const handleCanvasTouchMove = (e: TouchEvent<HTMLCanvasElement>) => {
    if (trackingMode === 'camera') return;
    
    const canvas = canvasRef.current;
    if (!canvas || e.touches.length === 0) return;
    const rect = canvas.getBoundingClientRect();
    const touch = e.touches[0];
    const currX = touch.clientX - rect.left;
    const currY = touch.clientY - rect.top;

    pushBladePoint(currX, currY);

    if (gameState === 'START') {
      startGame();
    } else if (gameState === 'PAUSED') {
      setGameState('PLAYING');
      sfx.setBgmVolume(bgmVolume);
    }
  };

  // --- MEDIAPIPE CAMERA START/STOP CONTROLLER ROUTINES ---
  const handleTrackerChange = async (mode: 'camera' | 'mouse') => {
    if (mode === 'mouse') {
      // Disengage Camera Threading
      if (activeCameraRef.current) {
        activeCameraRef.current.stop();
        activeCameraRef.current = null;
      }
      if (activeHandsRef.current) {
        activeHandsRef.current.close();
        activeHandsRef.current = null;
      }
      if (videoRef.current && videoRef.current.srcObject) {
         const stream = videoRef.current.srcObject as MediaStream;
         stream.getTracks().forEach(track => track.stop());
         videoRef.current.srcObject = null;
      }
      setTrackingMode('mouse');
      setHandDetected(false);
      setCameraError(null);
    } else {
      // Initialize Camera
      setCameraLoading(true);
      setCameraError(null);
      try {
        const hasHands = (window as any).Hands;
        const hasCamera = (window as any).Camera;

        if (!hasHands || !hasCamera) {
          throw new Error('MediaPipe script resources are still loading or blocked. Please wait 5 seconds and retry.');
        }

        const video = videoRef.current;
        if (!video) throw new Error('HTML Video constraints not loaded.');

        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 640, height: 480, frameRate: { ideal: 30 } }
        });
        video.srcObject = stream;
        video.play().catch(err => {
          console.warn("Video play request was interrupted or prevented by browser settings:", err);
        });

        // Instantiate MediaPipe Hands
        const hands = new (window as any).Hands({
          locateFile: (file: string) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
        });

        hands.setOptions({
          maxNumHands: 1,
          modelComplexity: 0,
          minDetectionConfidence: 0.6,
          minTrackingConfidence: 0.6
        });

        hands.onResults((results: any) => {
          if (!canvasRef.current) return;

          if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
            if (!handDetectedRef.current) {
              handDetectedRef.current = true;
              setHandDetected(true);
            }
            const hand = results.multiHandLandmarks[0];
            latestHandRef.current = hand;

            // Landmark 8 corresponds to INDEX_FINGER_TIP
            const indexTip = hand[8];
            if (indexTip) {
              const mapped = mapLandmark(indexTip);
              pushBladePoint(mapped.x, mapped.y);

              // Trigger start on hover
              if (gameStateRef.current === 'START') {
                startGame();
              }
            }
          } else {
            if (handDetectedRef.current) {
              handDetectedRef.current = false;
              setHandDetected(false);
            }
            latestHandRef.current = null;
          }
        });

        const cameraObj = new (window as any).Camera(video, {
          onFrame: async () => {
            try {
              if (hands) {
                await hands.send({ image: video });
              }
            } catch (err) {
              console.warn("MediaPipe input pipeline error caught:", err);
            }
          },
          width: 640,
          height: 480
        });

        cameraObj.start();

        activeCameraRef.current = cameraObj;
        activeHandsRef.current = hands;
        setTrackingMode('camera');
      } catch (err: any) {
        console.error("Camera Setup Error:", err);
        setCameraError(err.message || 'Webcam initialization failed or permissions declined.');
        setTrackingMode('mouse');
      } finally {
        setCameraLoading(false);
      }
    }
  };

  // Clean trackers on unmount to make sure webcam streams cease execution
  useEffect(() => {
    return () => {
      if (activeCameraRef.current) activeCameraRef.current.stop();
      if (activeHandsRef.current) activeHandsRef.current.close();
    };
  }, []);

  return (
    <div className="bg-slate-950 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl flex flex-col xl:flex-row min-h-[580px]">
      
      {/* 1. Left Side: Dynamic HUD Control Console Panel */}
      <div className="w-full xl:w-[280px] p-6 bg-slate-900/60 border-b xl:border-b-0 xl:border-r border-slate-800 flex flex-col justify-between select-none shrink-0">
        <div>
          {/* Mode Selector */}
          <div className="space-y-3">
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest block">
              Slicing Input Source
            </span>
            
            <button
              onClick={() => handleTrackerChange('mouse')}
              className={`w-full py-2.5 px-3 rounded-lg text-xs font-medium flex items-center justify-between transition-all ${
                trackingMode === 'mouse'
                  ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20'
                  : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-slate-200'
              }`}
            >
              <span>Mouse Click & Drag</span>
              <span className="opacity-80">Default Fast</span>
            </button>

            <button
              onClick={() => handleTrackerChange('camera')}
              disabled={cameraLoading}
              className={`w-full py-2.5 px-3 rounded-lg text-xs font-medium flex items-center justify-between transition-all ${
                trackingMode === 'camera'
                  ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-500/10'
                  : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-slate-200'
              }`}
            >
              <div className="flex items-center gap-1.5">
                <CameraIcon className="w-3.5 h-3.5" />
                <span>Webcam Gesture (AI)</span>
              </div>
              <span className="opacity-80">
                {cameraLoading ? 'Loading...' : 'Launch'}
              </span>
            </button>
          </div>



          {/* Hand tracking status indicator */}
          {trackingMode === 'camera' && (
            <div className="mt-4 p-3 bg-slate-950/80 border border-slate-800 rounded-lg flex items-center justify-between text-xs">
              <span className="text-slate-400 font-medium">Tracking Status:</span>
              <span className={`font-semibold flex items-center gap-1.5 ${handDetected ? 'text-emerald-400' : 'text-amber-500'}`}>
                <span className={`w-2 h-2 rounded-full ${handDetected ? 'bg-emerald-400 animate-ping' : 'bg-amber-500'}`} />
                {handDetected ? 'Hand Tracked' : 'Searching Hand...'}
              </span>
            </div>
          )}

          {/* Error Banner */}
          {cameraError && (
            <div className="mt-4 p-3.5 bg-red-950/30 border border-red-500/30 text-xs rounded-xl flex items-start gap-2 text-red-300">
              <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-red-200">Camera Blocked</p>
                <p className="mt-0.5 text-[11px] text-red-400/90 leading-normal">{cameraError}</p>
              </div>
            </div>
          )}

          {/* Audio Settings Menu */}
          <div className="mt-5 p-4 bg-slate-950/70 border border-slate-800 rounded-xl space-y-3.5">
            <div 
              onClick={() => setShowVolumeSettings(!showVolumeSettings)}
              className="flex items-center justify-between cursor-pointer group"
            >
              <div className="flex items-center gap-2">
                {isMuted ? (
                  <VolumeX className="w-4 h-4 text-red-400 animate-pulse" />
                ) : (
                  <Volume2 className="w-4 h-4 text-indigo-400" />
                )}
                <span className="text-[11px] font-bold text-slate-300 uppercase tracking-widest group-hover:text-indigo-400 transition-colors">
                  Audio Settings
                </span>
              </div>
              {showVolumeSettings ? (
                <ChevronUp className="w-4 h-4 text-slate-500 group-hover:text-indigo-400 transition-colors" />
              ) : (
                <ChevronDown className="w-4 h-4 text-slate-500 group-hover:text-indigo-400 transition-colors" />
              )}
            </div>

            {showVolumeSettings && (
              <div className="space-y-3 pt-2.5 border-t border-slate-900">
                {/* Mute Button */}
                <button
                  type="button"
                  onClick={handleToggleMute}
                  className={`w-full py-1.5 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all select-none border cursor-pointer ${
                    isMuted 
                      ? 'bg-red-950/40 border-red-500/30 text-red-300 hover:bg-red-900/40' 
                      : 'bg-indigo-950/30 border-indigo-500/30 text-indigo-300 hover:bg-indigo-900/40'
                  }`}
                >
                  {isMuted ? (
                    <>
                      <VolumeX className="w-3.5 h-3.5" />
                      <span>UNMUTE GAME</span>
                    </>
                  ) : (
                    <>
                      <Volume2 className="w-3.5 h-3.5" />
                      <span>MUTE GAME</span>
                    </>
                  )}
                </button>

                {/* Master Volume Slider */}
                <div className="space-y-1">
                  <div className="flex justify-between text-[10px] font-mono text-slate-400 uppercase">
                    <span>Master Volume</span>
                    <span className="text-slate-200 font-bold">{Math.round(masterVolume * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={masterVolume}
                    disabled={isMuted}
                    onChange={(e) => setMasterVolume(parseFloat(e.target.value))}
                    className="w-full h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-500 disabled:opacity-30 disabled:cursor-not-allowed"
                  />
                </div>

                {/* Music Volume Slider */}
                <div className="space-y-1">
                  <div className="flex justify-between text-[10px] font-mono text-slate-400 uppercase">
                    <span>Music Volume</span>
                    <span className="text-slate-200 font-bold">{Math.round(bgmVolume * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={bgmVolume}
                    disabled={isMuted}
                    onChange={(e) => setBgmVolume(parseFloat(e.target.value))}
                    className="w-full h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-500 disabled:opacity-30 disabled:cursor-not-allowed"
                  />
                </div>

                {/* Effects Volume Slider */}
                <div className="space-y-1">
                  <div className="flex justify-between text-[10px] font-mono text-slate-400 uppercase">
                    <span>Effects Volume</span>
                    <span className="text-slate-200 font-bold">{Math.round(sfxVolume * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={sfxVolume}
                    disabled={isMuted}
                    onChange={(e) => setSfxVolume(parseFloat(e.target.value))}
                    className="w-full h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-500 disabled:opacity-30 disabled:cursor-not-allowed"
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Hidden video element required for MediaPipe hand tracking capture */}
        <video
          ref={videoRef}
          className="hidden"
          muted
          playsInline
        />
      </div>

      {/* 2. Right Side: Interactive HTML5 Gaming Canvas Field */}
      <div 
        ref={containerRef}
        className="flex-1 relative bg-slate-950 cursor-crosshair min-h-[460px] flex items-center justify-center p-1"
      >
        <canvas
          ref={canvasRef}
          onMouseMove={handleCanvasMouseMove}
          onTouchMove={handleCanvasTouchMove}
          className="absolute inset-0 w-full h-full block rounded-xl outline-none"
        />

        {/* HUD Game HUD Overlay Info */}
        <div className={`absolute ${isPortrait ? 'top-14 sm:top-16 pt-5 left-6' : 'top-6 left-6'} pointer-events-none select-none z-10 w-1/2`}>
          <div className="text-slate-400 text-[10px] sm:text-xs font-mono tracking-widest uppercase">SCORE</div>
          <div className="text-3.5xl sm:text-4xl font-extrabold text-white mt-0.5 font-mono tracking-tight">{score}</div>
          
          <div className="text-[10px] text-indigo-400 font-mono flex items-center gap-1.5 mt-1.5 uppercase tracking-wide">
            <span className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-pulse" />
            <span>Active Fruits: {activeFruitsCount}</span>
          </div>

          {/* High score shown below score ONLY on landscape Mode */}
          {!isPortrait && (
            <div className="text-[10px] text-slate-500 tracking-wider mt-1 font-mono uppercase">
              High: {highScore}
            </div>
          )}
        </div>

        {/* HUD controls and strikes */}
        <div className={`absolute ${isPortrait ? 'top-14 sm:top-16 pt-5 right-6' : 'top-6 right-6'} select-none flex items-center gap-1.5 sm:gap-3 z-10`}>
          {/* Pause / Resume Button */}
          {gameState === 'PLAYING' && (
            <button
              onClick={() => {
                setGameState('PAUSED');
                sfx.setBgmVolume(bgmVolume * 0.3);
              }}
              className="py-1.5 px-2 sm:px-3 bg-slate-900/80 hover:bg-slate-800 text-slate-300 font-semibold text-[10px] sm:text-[11px] rounded-lg border border-slate-800/80 transition-all flex items-center gap-1.5 cursor-pointer shadow-md"
            >
              <Pause className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-indigo-400" />
              <span className="hidden xs:inline">PAUSE</span>
            </button>
          )}
          {gameState === 'PAUSED' && (
            <button
              onClick={() => {
                setGameState('PLAYING');
                sfx.setBgmVolume(bgmVolume);
              }}
              className="py-1.5 px-2 sm:px-3 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-[10px] sm:text-[11px] rounded-lg transition-all flex items-center gap-1.5 cursor-pointer shadow-lg shadow-indigo-600/30"
            >
              <Play className="w-3 h-3 sm:w-3.5 sm:h-3.5 fill-current" />
              <span>RESUME</span>
            </button>
          )}

          {/* Debug Mode Toggle Button (Camera mode only) */}
          {trackingMode === 'camera' && (
            <button
              onClick={() => setIsDebugMode(prev => !prev)}
              className={`py-1.5 px-2 sm:px-3 rounded-lg border font-semibold text-[10px] sm:text-[11px] transition-all flex items-center gap-1.5 cursor-pointer shadow-md ${
                isDebugMode 
                  ? 'bg-emerald-950/40 border-emerald-500/50 text-emerald-300 hover:bg-emerald-900/40' 
                  : 'bg-slate-900/80 border-slate-800 text-slate-400 hover:bg-slate-800'
              }`}
            >
              <div className={`w-1.5 h-1.5 rounded-full ${isDebugMode ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'}`} />
              <span>DEBUG: {isDebugMode ? 'ON' : 'OFF'}</span>
            </button>
          )}

          {/* Strikes tracker (Lives in top-right) */}
          <div className="flex gap-1.5 bg-slate-900/60 backdrop-blur-md border border-slate-800/60 py-1.5 px-2 sm:px-3 rounded-xl pointer-events-none text-xs sm:text-sm">
            {[0, 1, 2].map((idx) => (
              <span key={idx}>
                {idx < strikes ? '❌' : '⚪'}
              </span>
            ))}
          </div>
        </div>

        {/* Instruction overlay at bottom center in MOBILE Mode */}
        {isPortrait && gameState === 'PLAYING' && (
          <div className="absolute bottom-10 left-1/2 -translate-x-1/2 pointer-events-none select-none text-center px-4 w-full max-w-xs z-10">
            <div className="text-emerald-400 text-[10px] sm:text-xs font-bold tracking-widest uppercase drop-shadow animate-pulse">
              SWIPE TO SLICE FRUITS
            </div>
            <div className="text-slate-500 text-[9px] sm:text-[10px] mt-0.5 font-mono">
              Keep index finger visible & in safe area bounds
            </div>
          </div>
        )}

        <AnimatePresence mode="wait">
          {/* State Banner: PAUSED */}
          {gameState === 'PAUSED' && (
            <motion.div
              key="paused"
              initial={{ scale: 0.9, opacity: 0, y: 15 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 15 }}
              transition={{ type: "spring", duration: 0.4 }}
              className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[calc(100%-4rem)] text-center p-8 bg-slate-900/90 backdrop-blur-lg border border-indigo-500/30 rounded-3xl max-w-sm mx-auto shadow-2xl z-30"
            >
              <h2 className="text-3xl font-extrabold text-indigo-400 font-mono tracking-wider animate-pulse leading-none uppercase">
                Game Paused
              </h2>
              <p className="text-slate-400 text-xs max-w-sm mx-auto leading-relaxed mt-2.5">
                Everything is frozen. Hover or wave your finger to track coordinates & blade traces!
              </p>

              <div className="mt-6 flex flex-col gap-2">
                <button
                  onClick={() => {
                    setGameState('PLAYING');
                    sfx.setBgmVolume(bgmVolume);
                  }}
                  className="py-3 px-6 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl text-sm transition-all flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/30 cursor-pointer"
                >
                  <Play className="w-4 h-4 fill-white" />
                  <span>RESUME SESSION</span>
                </button>
                
                <button
                  onClick={() => {
                    setGameState('START');
                    sfx.stopBGM();
                  }}
                  className="py-2.5 px-4 bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold rounded-xl text-xs transition-all flex items-center justify-center gap-2 cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>QUIT TO MAIN SCREEN</span>
                </button>
              </div>

              <div className="mt-4 text-[10px] text-slate-500 font-mono">
                Press <span className="text-indigo-400 font-semibold bg-slate-800 px-1 py-0.5 rounded">SPACE</span>, <span className="text-indigo-400 font-semibold bg-slate-800 px-1 py-0.5 rounded">P</span>, or <span className="text-indigo-400 font-semibold bg-slate-800 px-1 py-0.5 rounded">ESC</span> to resume
              </div>
            </motion.div>
          )}

          {/* State Banner: START_SCREEN */}
          {gameState === 'START' && (
            <motion.div
              key="start"
              initial={{ scale: 0.92, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.92, opacity: 0, y: 20 }}
              transition={{ type: "spring", duration: 0.5, bounce: 0.15 }}
              className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[calc(100%-4rem)] text-center p-8 bg-slate-900/80 backdrop-blur-lg border border-slate-800 rounded-3xl max-w-lg mx-auto shadow-2xl z-30"
            >
              <h1 className="text-3xl font-extrabold text-white font-mono tracking-wider leading-none">
                FRUIT NINJA GESTURE
              </h1>
              <p className="text-slate-400 text-xs max-w-sm mx-auto leading-relaxed mt-2.5">
                Slice flying watermelons, apples, oranges, and bananas. Avoid the dark explosive fuses!
              </p>

              <div className="mt-8 flex flex-col sm:flex-row justify-center gap-3">
                <button
                  onClick={startGame}
                  className="py-3 px-6 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl text-sm transition-all flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/30"
                >
                  <Play className="w-4 h-4 fill-white" />
                  <span>PLAY IN BROWSER</span>
                </button>
              </div>

              <div className="mt-6 flex justify-center gap-8 text-xs text-slate-500 font-mono">
                <div>
                  <span className="text-slate-400 font-bold text-white pr-1.5">Score:</span> 
                  {score}
                </div>
                <div>
                  <span className="text-slate-400 font-bold text-white pr-1.5">High:</span> 
                  {highScore}
                </div>
              </div>
            </motion.div>
          )}

          {/* State Banner: GAME_OVER */}
          {gameState === 'GAME_OVER' && (
            <motion.div
              key="gameover"
              initial={{ scale: 0.88, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.88, opacity: 0 }}
              transition={{ type: "spring", duration: 0.5 }}
              className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[calc(100%-4rem)] text-center p-10 bg-slate-950/90 backdrop-blur-md border border-red-500/20 rounded-3xl max-w-md mx-auto shadow-2xl z-30"
            >
              <AlertTriangle className="w-12 h-12 text-red-500 mx-auto animate-bounce mb-2" />
              <h2 className="text-4xl font-black text-red-500 font-mono tracking-tight uppercase leading-none">
                Game Over
              </h2>
              <p className="text-slate-400 text-xs mt-2 font-mono leading-relaxed">
                You ran out of lives! Splendid attempt slicing the board.
              </p>

              <hr className="border-slate-800 my-6" />

              <div className="mb-6">
                <div className="text-slate-500 font-mono text-xs uppercase tracking-widest">Final Chop Score</div>
                <div className="text-5xl font-black text-white mt-1.5 font-mono">{score}</div>
                {score >= highScore && score > 0 && (
                  <div className="text-emerald-400 text-[11px] font-bold mt-1 uppercase tracking-widest">
                    🎉 NEW HIGH SCORE!
                  </div>
                )}
              </div>

              <button
                onClick={startGame}
                className="w-full py-3 px-6 bg-red-600 hover:bg-red-500 text-white font-bold rounded-xl text-sm transition-all flex items-center justify-center gap-2.5 shadow-lg shadow-red-600/20"
              >
                <RotateCcw className="w-4 h-4" />
                <span>SLICE AGAIN</span>
              </button>
            </motion.div>
          )}
        </AnimatePresence>

      </div>
    </div>
  );
}
