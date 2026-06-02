/**
 * Browser Audio Synthesizer for Retro Game Effects.
 * Uses Web Audio API to procedurally generate high-quality sound effects and background music on-demand.
 * This guarantees low-latency, glitch-free audio on both desktop and mobile browsers.
 */
class SoundEngine {
  private ctx: AudioContext | null = null;
  private soundEnabled: boolean = true;
  private masterVol: number = 0.8;
  private sfxVol: number = 0.5;
  private bgmVol: number = 0.25;

  // Background Music Sequencer variables
  private bgmIntervalId: any = null;
  private bgmStep: number = 0;
  private duckFactor: number = 1.0;
  private duckTimer: any = null;

  constructor() {
    // Lazy initialization on first gesture/user action
  }

  private initContext() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
    return this.ctx;
  }

  public toggleMute(): boolean {
    this.soundEnabled = !this.soundEnabled;
    if (!this.soundEnabled) {
      this.stopBGM();
    } else {
      // Allow callers to resume BGM
    }
    return this.soundEnabled;
  }

  public isMuted(): boolean {
    return !this.soundEnabled;
  }

  public setMasterVolume(volume: number) {
    this.masterVol = Math.max(0, Math.min(1, volume));
  }

  public getMasterVolume(): number {
    return this.masterVol;
  }

  public setSfxVolume(volume: number) {
    this.sfxVol = Math.max(0, Math.min(1, volume));
  }

  public setBgmVolume(volume: number) {
    this.bgmVol = Math.max(0, Math.min(1, volume));
  }

  public getSfxVolume(): number {
    return this.sfxVol;
  }

  public getBgmVolume(): number {
    return this.bgmVol;
  }

  /** Dynamic background music audio ducking during combos and explosions */
  private duckBGM() {
    this.duckFactor = 0.20; // Duck music of bgm down to 20%
    if (this.duckTimer) clearTimeout(this.duckTimer);
    this.duckTimer = setTimeout(() => {
      // Smoothly fade music back to 100% capacity over 1.2s
      const interval = setInterval(() => {
        this.duckFactor += 0.05;
        if (this.duckFactor >= 1.0) {
          this.duckFactor = 1.0;
          clearInterval(interval);
        }
      }, 40);
    }, 1500);
  }

  /** Plays a low-frequency bass impact thump for satisfying blade slices */
  public playBassThump(multiplier: number = 1.0) {
    if (!this.soundEnabled) return;
    try {
      this.initContext();
      if (!this.ctx) return;

      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.type = 'sine';
      // Low sub-bass sweep down from 85Hz to 28Hz
      osc.frequency.setValueAtTime(85, now);
      osc.frequency.exponentialRampToValueAtTime(28, now + 0.18);

      // Volume envelope fades quickly to maintain punchiness
      const volume = 0.35 * this.sfxVol * this.masterVol * multiplier;
      gain.gain.setValueAtTime(volume, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);

      osc.start(now);
      osc.stop(now + 0.20);
    } catch (e) {
      console.warn("Sub-bass Synthesizer failed:", e);
    }
  }

  /** Plays 1 of 5 randomized swooshing weapon slice variations to avoid repetitiveness */
  public playSlice() {
    if (!this.soundEnabled) return;
    try {
      this.initContext();
      if (!this.ctx) return;

      const now = this.ctx.currentTime;
      const variation = Math.floor(Math.random() * 5);

      const osc = this.ctx.createOscillator();
      const biquad = this.ctx.createBiquadFilter();
      const gain = this.ctx.createGain();

      osc.connect(biquad);
      biquad.connect(gain);
      gain.connect(this.ctx.destination);

      biquad.type = 'highpass';

      // Pick distinctive slice properties based on structural index
      switch (variation) {
        case 0: // High crisp whistle swoosh
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(1400, now);
          osc.frequency.exponentialRampToValueAtTime(280, now + 0.10);
          biquad.frequency.setValueAtTime(400, now);
          gain.gain.setValueAtTime(0.18 * this.sfxVol * this.masterVol, now);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.10);
          osc.start(now);
          osc.stop(now + 0.11);
          break;

        case 1: // Sawtooth clean whip slice
          osc.type = 'sawtooth';
          osc.frequency.setValueAtTime(950, now);
          osc.frequency.exponentialRampToValueAtTime(110, now + 0.12);
          biquad.frequency.setValueAtTime(600, now);
          gain.gain.setValueAtTime(0.10 * this.sfxVol * this.masterVol, now);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
          osc.start(now);
          osc.stop(now + 0.13);
          break;

        case 2: // Double swoosh transient
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(1100, now);
          osc.frequency.exponentialRampToValueAtTime(180, now + 0.08);
          biquad.frequency.setValueAtTime(200, now);
          gain.gain.setValueAtTime(0.14 * this.sfxVol * this.masterVol, now);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);

          const oscSub = this.ctx.createOscillator();
          const gainSub = this.ctx.createGain();
          oscSub.connect(gainSub);
          gainSub.connect(this.ctx.destination);
          oscSub.type = 'sine';
          oscSub.frequency.setValueAtTime(1250, now + 0.02);
          oscSub.frequency.exponentialRampToValueAtTime(220, now + 0.09);
          gainSub.gain.setValueAtTime(0.08 * this.sfxVol * this.masterVol, now + 0.02);
          gainSub.gain.exponentialRampToValueAtTime(0.001, now + 0.09);

          osc.start(now);
          oscSub.start(now + 0.02);
          osc.stop(now + 0.10);
          oscSub.stop(now + 0.10);
          break;

        case 3: // Low heavy katana slice
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(680, now);
          osc.frequency.exponentialRampToValueAtTime(75, now + 0.15);
          biquad.frequency.setValueAtTime(150, now);
          gain.gain.setValueAtTime(0.24 * this.sfxVol * this.masterVol, now);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
          osc.start(now);
          osc.stop(now + 0.16);
          break;

        case 4: // Sharp metallic strike ring
          osc.type = 'sine';
          osc.frequency.setValueAtTime(1700, now);
          osc.frequency.exponentialRampToValueAtTime(320, now + 0.11);
          biquad.frequency.setValueAtTime(800, now);
          gain.gain.setValueAtTime(0.11 * this.sfxVol * this.masterVol, now);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.11);

          const metalRing = this.ctx.createOscillator();
          const ringGain = this.ctx.createGain();
          metalRing.connect(ringGain);
          ringGain.connect(this.ctx.destination);
          metalRing.type = 'sine';
          metalRing.frequency.setValueAtTime(2400, now);
          metalRing.frequency.exponentialRampToValueAtTime(600, now + 0.06);
          ringGain.gain.setValueAtTime(0.05 * this.sfxVol * this.masterVol, now);
          ringGain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);

          osc.start(now);
          metalRing.start(now);
          osc.stop(now + 0.12);
          metalRing.stop(now + 0.07);
          break;
      }
    } catch (e) {
      console.warn("Slice Synth Failed:", e);
    }
  }

  /** Synthesizes a bubble bubble-up pop sound when fruits are spawned */
  public playSpawn() {
    if (!this.soundEnabled) return;
    try {
      this.initContext();
      if (!this.ctx) return;

      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      const now = this.ctx.currentTime;

      osc.type = 'sine';
      osc.frequency.setValueAtTime(190, now);
      osc.frequency.exponentialRampToValueAtTime(540, now + 0.09);

      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(0.09 * this.sfxVol * this.masterVol, now + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);

      osc.start(now);
      osc.stop(now + 0.10);
    } catch (e) {}
  }

  /** Synthesizes a wet, organic impact splat with random pitch variation */
  public playSplat() {
    if (!this.soundEnabled) return;
    try {
      this.initContext();
      if (!this.ctx) return;

      const now = this.ctx.currentTime;
      // Slight randomized pitch variance of 0.85 to 1.15 to make juices unique
      const pitchFactor = 0.85 + Math.random() * 0.3;

      const osc1 = this.ctx.createOscillator();
      const osc2 = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(this.ctx.destination);

      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(160 * pitchFactor, now);
      osc1.frequency.exponentialRampToValueAtTime(45 * pitchFactor, now + 0.16);

      osc2.type = 'triangle';
      osc2.frequency.setValueAtTime(240 * pitchFactor, now);
      osc2.frequency.exponentialRampToValueAtTime(50 * pitchFactor, now + 0.12);

      gain.gain.setValueAtTime(0.18 * this.sfxVol * this.masterVol, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);

      osc1.start(now);
      osc2.start(now);
      osc1.stop(now + 0.17);
      osc2.stop(now + 0.17);
    } catch (e) {}
  }

  /** Synthesizes ascending clean crystal scales and deep sub rumbles on multi-combos */
  public playCombo(count: number) {
    if (!this.soundEnabled) return;
    try {
      this.initContext();
      if (!this.ctx) return;

      const now = this.ctx.currentTime;
      // Pitch goes up for higher combos! (Scales proportional to multiplier)
      const baseFreq = 320 * (1.0 + Math.min(1.0, (count - 2) * 0.16));
      
      this.duckBGM(); // Automatically duck background music volume to highlight combo

      // 3 Ascending notes arpeggio chord
      for (let i = 0; i < 3; i++) {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.type = 'triangle';
        const noteFreq = baseFreq * (1.0 + i * 0.25);
        osc.frequency.setValueAtTime(noteFreq, now + i * 0.05);

        gain.gain.setValueAtTime(0.001, now + i * 0.05);
        gain.gain.linearRampToValueAtTime(0.16 * this.sfxVol * this.masterVol, now + i * 0.05 + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.05 + 0.14);

        osc.start(now + i * 0.05);
        osc.stop(now + i * 0.05 + 0.18);
      }

      // Play stronger bass impact for bigger multipliers!
      this.playBassThump(1.4 + count * 0.25);
    } catch (e) {}
  }

  /** Synthesizes white noise bursts and intense lowpass saw sweeps for explosive bombs */
  public playExplosion() {
    if (!this.soundEnabled) return;
    try {
      this.initContext();
      if (!this.ctx) return;

      const now = this.ctx.currentTime;
      this.duckBGM();

      // 1. Core low rumbly explosion
      const osc = this.ctx.createOscillator();
      const biquad = this.ctx.createBiquadFilter();
      const gain = this.ctx.createGain();

      osc.connect(biquad);
      biquad.connect(gain);
      gain.connect(this.ctx.destination);

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(170, now);
      osc.frequency.linearRampToValueAtTime(4, now + 0.75);

      biquad.type = 'lowpass';
      biquad.frequency.setValueAtTime(260, now);
      biquad.frequency.exponentialRampToValueAtTime(18, now + 0.65);

      gain.gain.setValueAtTime(0.36 * this.sfxVol * this.masterVol, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.75);

      // 2. White noise burst buffer for a dynamic "SPLAT-BOOM" blast
      const bufferSize = this.ctx.sampleRate * 0.65;
      const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2.0 - 1.0;
      }

      const noiseNode = this.ctx.createBufferSource();
      noiseNode.buffer = buffer;

      const noiseFilter = this.ctx.createBiquadFilter();
      noiseFilter.type = 'bandpass';
      noiseFilter.frequency.setValueAtTime(320, now);
      noiseFilter.frequency.exponentialRampToValueAtTime(15, now + 0.55);

      const noiseGain = this.ctx.createGain();
      noiseGain.gain.setValueAtTime(0.28 * this.sfxVol * this.masterVol, now);
      noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.65);

      noiseNode.connect(noiseFilter);
      noiseFilter.connect(noiseGain);
      noiseGain.connect(this.ctx.destination);

      osc.start(now);
      noiseNode.start(now);

      osc.stop(now + 0.80);
      noiseNode.stop(now + 0.80);

      // Strong sub-bass hits
      this.playBassThump(2.4);
    } catch (e) {}
  }

  /** Synthesizes lower melancholy descending square riffs upon game completion */
  public playGameOver() {
    if (!this.soundEnabled) return;
    try {
      this.initContext();
      if (!this.ctx) return;

      const now = this.ctx.currentTime;
      const notes = [293.66, 261.63, 220.00, 196.00]; // D4, C4, A3, G3
      
      notes.forEach((freq, idx) => {
        const osc = this.ctx!.createOscillator();
        const gain = this.ctx!.createGain();

        osc.connect(gain);
        gain.connect(this.ctx!.destination);

        osc.type = 'square';
        osc.frequency.setValueAtTime(freq, now + idx * 0.15);

        gain.gain.setValueAtTime(0.06 * this.sfxVol * this.masterVol, now + idx * 0.15);
        gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.15 + 0.18);

        osc.start(now + idx * 0.15);
        osc.stop(now + idx * 0.15 + 0.20);
      });
    } catch (e) {}
  }

  /** Synthesizes an uplifting scale when tapping start button */
  public playStartChime() {
    if (!this.soundEnabled) return;
    try {
      this.initContext();
      if (!this.ctx) return;

      const now = this.ctx.currentTime;
      const notes = [261.63, 329.63, 392.00, 523.25]; // C4, E4, G4, C5
      
      notes.forEach((freq, idx) => {
        const osc = this.ctx!.createOscillator();
        const gain = this.ctx!.createGain();

        osc.connect(gain);
        gain.connect(this.ctx!.destination);

        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, now + idx * 0.08);

        gain.gain.setValueAtTime(0.12 * this.sfxVol * this.masterVol, now + idx * 0.08);
        gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.08 + 0.25);

        osc.start(now + idx * 0.08);
        osc.stop(now + idx * 0.08 + 0.28);
      });
    } catch (e) {}
  }

  /** Loop procedural retro arcade background music progression continuously */
  public startBGM() {
    if (!this.soundEnabled) return;
    try {
      this.initContext();
      if (!this.ctx) return;

      // Avoid creating multiple duplicates
      if (this.bgmIntervalId) return;

      this.bgmStep = 0;
      
      // Infinite chord loops: Am -> F -> C -> G
      const chords = [
        [220.00, 261.63, 329.63, 440.00], // Am (A3, C4, E4, A4)
        [174.61, 220.00, 261.63, 349.23], // F maj (F3, A3, C4, F4)
        [261.63, 329.63, 392.00, 523.25], // C maj (C4, E4, G4, C5)
        [196.00, 246.94, 293.66, 392.00]  // G maj (G3, B3, D4, G4)
      ];

      const tempoMs = 240;

      this.bgmIntervalId = setInterval(() => {
        if (!this.ctx || !this.soundEnabled) return;
        
        const now = this.ctx.currentTime;
        const chordIdx = Math.floor(this.bgmStep / 8) % chords.length;
        const noteIdx = this.bgmStep % chords[chordIdx].length;
        const frequency = chords[chordIdx][noteIdx];

        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.type = 'sine';
        osc.frequency.setValueAtTime(frequency, now);

        // Soft, melodic atmosphere multiplied by master volume and live duck factor
        const noteVol = 0.04 * this.bgmVol * this.masterVol * this.duckFactor;
        gain.gain.setValueAtTime(0.001, now);
        gain.gain.linearRampToValueAtTime(noteVol, now + 0.05);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.40);

        osc.start(now);
        osc.stop(now + 0.42);

        this.bgmStep++;
      }, tempoMs);
    } catch (e) {
      console.warn("Failed to generate BGM:", e);
    }
  }

  /** Terminate background music instantly */
  public stopBGM() {
    if (this.bgmIntervalId) {
      clearInterval(this.bgmIntervalId);
      this.bgmIntervalId = null;
    }
  }
}

export const sfx = new SoundEngine();
