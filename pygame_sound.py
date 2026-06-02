import numpy as np
import pygame
import random

class PygameSoundEngine:
    def __init__(self):
        self.sample_rate = 22050
        self.sfx_volume = 0.5
        self.bgm_volume = 0.3
        self.muted = False
        
        self.slice_sound = None
        self.spawn_sound = None
        self.gameover_sound = None
        self.explosion_sound = None
        self.bgm_sound = None
        
        self.bgm_channel = None
        self.initialized = False

    def init_mixer(self):
        if self.initialized:
            return
        try:
            # Initialize pygame mixer if not already done
            if not pygame.mixer.get_init():
                pygame.mixer.init(frequency=self.sample_rate, size=-16, channels=2)
            
            # Generate our procedurally synthesized sounds
            self.slice_sound = self._generate_slice_sound()
            self.spawn_sound = self._generate_spawn_sound()
            self.gameover_sound = self._generate_gameover_sound()
            self.explosion_sound = self._generate_explosion_sound()
            self.bgm_sound = self._generate_bgm_track()
            
            # Set initials
            self.set_sfx_volume(self.sfx_volume)
            self.set_bgm_volume(self.bgm_volume)
            
            self.initialized = True
            print("[INFO] Procedural Pygame Audio System initialized successfully!")
        except Exception as e:
            print(f"[WARN] Sound initialization failed: {e}. Running in silent mode.")

    def _make_sound(self, mono_array):
        """Converts raw 1D float array into stereo 16-bit Pygame Sound object."""
        # Normalize and clip
        mono_array = np.clip(mono_array, -1.0, 1.0)
        # Convert to 16-bit integers
        int_array = (mono_array * 32767).astype(np.int16)
        # Duplicate to stereo (2D array of shape [samples, 2])
        stereo_array = np.repeat(int_array[:, np.newaxis], 2, axis=1)
        return pygame.sndarray.make_sound(stereo_array)

    def _generate_slice_sound(self):
        """Synthesizes a sharp sweeping swoosh slicing sound."""
        duration = 0.15
        t = np.linspace(0, duration, int(self.sample_rate * duration), False)
        # Rapid descending sweep from 1000Hz to 100Hz
        freqs = 1000.0 * np.exp(-15.0 * t)
        phases = 2.0 * np.pi * np.cumsum(freqs) / self.sample_rate
        # Mixing a triangle wave for steel crispness
        wave = (np.abs((phases % (2 * np.pi)) - np.pi) / np.pi) * 2.0 - 1.0
        # Volume fade-out
        fade_out = np.exp(-12.0 * t)
        wave *= fade_out
        return self._make_sound(wave)

    def _generate_spawn_sound(self):
        """Synthesizes a quick springy launch pop sound."""
        duration = 0.12
        t = np.linspace(0, duration, int(self.sample_rate * duration), False)
        # Rapid rising sweep from 180Hz to 550Hz
        freqs = 180.0 + (550.0 - 180.0) * (t / duration)
        phases = 2.0 * np.pi * np.cumsum(freqs) / self.sample_rate
        wave = np.sin(phases)
        # Add smooth envelope
        envelope = np.sin(np.pi * (t / duration)) # arch shape
        wave *= envelope * 0.8
        return self._make_sound(wave)

    def _generate_gameover_sound(self):
        """Synthesizes a sad descending arpeggio progression."""
        duration = 1.0
        samples = int(self.sample_rate * duration)
        wave = np.zeros(samples)
        
        # A sad 4-note descending cascade (A3, F3, D3, B2)
        notes = [220.0, 174.61, 146.83, 123.47]
        note_dur = 0.22
        note_samples = int(self.sample_rate * note_dur)
        
        for idx, freq in enumerate(notes):
            start_idx = int(idx * 0.2 * self.sample_rate)
            t = np.linspace(0, note_dur, note_samples, False)
            # Mixed square/sine sound for that 8-bit retro gaming vibe
            sq_wave = np.sign(np.sin(2.0 * np.pi * freq * t))
            sin_wave = np.sin(2.0 * np.pi * freq * t)
            note_wave = 0.4 * sq_wave + 0.6 * sin_wave
            
            # Fade out note
            fade = np.linspace(1.0, 0.01, note_samples)
            note_wave *= fade
            
            # Place note into master track
            end_idx = min(samples, start_idx + note_samples)
            wave[start_idx:end_idx] += note_wave[0:(end_idx - start_idx)]
            
        return self._make_sound(wave)

    def _generate_bgm_track(self):
        """Generates a pleasant, atmospheric 4-second retro synth loop."""
        duration = 4.0
        samples = int(self.sample_rate * duration)
        wave = np.zeros(samples)
        
        # Chord progression: Am -> F -> C -> G (1 second per chord)
        progression = [
            [110.0, 164.81, 220.0, 261.63],  # Am (A, E, A, C)
            [87.31, 130.81, 174.61, 220.0],  # F  (F, C, F, A)
            [130.81, 196.0, 261.63, 329.63], # C  (C, G, C, E)
            [98.0, 146.83, 196.0, 246.94]    # G  (G, D, G, B)
        ]
        
        for sect_idx, chord in enumerate(progression):
            sect_start = int(sect_idx * 1.0 * self.sample_rate)
            sect_samples = int(self.sample_rate * 1.0)
            
            # Schedule an arpeggiated sweet baseline note and chord highlights
            for step in range(4): # 4 arpeggio steps per second
                note = chord[step % len(chord)]
                step_start = sect_start + int(step * 0.25 * self.sample_rate)
                step_dur = 0.4
                step_samples = int(self.sample_rate * step_dur)
                
                t = np.linspace(0, step_dur, step_samples, False)
                # Triangle arpeggio synth
                triangle = (np.abs(((2.0 * np.pi * note * t) % (2 * np.pi)) - np.pi) / np.pi) * 2.0 - 1.0
                envelope = np.exp(-6.0 * t)
                
                wave_segment = triangle * envelope * 0.25
                
                end_idx = min(samples, step_start + step_samples)
                wave[step_start:end_idx] += wave_segment[0:(end_idx - step_start)]
                
        # Fade edges slightly to make the loop seamless
        fade_len = int(self.sample_rate * 0.05)
        fade_in = np.linspace(0.0, 1.0, fade_len)
        fade_out = np.linspace(1.0, 0.0, fade_len)
        wave[:fade_len] *= fade_in
        wave[-fade_len:] *= fade_out
        
        return self._make_sound(wave)

    def _generate_explosion_sound(self):
        """Synthesizes a deep explosive rumble."""
        duration = 0.6
        t = np.linspace(0, duration, int(self.sample_rate * duration), False)
        # Low frequency rumble mixed with noise
        freqs = 150.0 * np.exp(-10.0 * t)
        phases = 2.0 * np.pi * np.cumsum(freqs) / self.sample_rate
        sine = np.sin(phases)
        # Add random noise for blast effect
        noise = np.random.uniform(-1.0, 1.0, len(t))
        wave = 0.6 * sine + 0.4 * noise
        # Fade out
        fade_out = np.exp(-6.0 * t)
        wave *= fade_out
        return self._make_sound(wave)

    def play_slice(self):
        if not self.initialized or self.muted:
            return
        if self.slice_sound:
            self.slice_sound.play()

    def play_spawn(self):
        if not self.initialized or self.muted:
            return
        if self.spawn_sound:
            self.spawn_sound.play()

    def play_explosion(self):
        if not self.initialized or self.muted:
            return
        if self.explosion_sound:
            self.explosion_sound.play()

    def play_gameover(self):
        if not self.initialized or self.muted:
            return
        if self.gameover_sound:
            self.gameover_sound.play()

    def start_bgm(self):
        if not self.initialized:
            self.init_mixer()
        if not self.initialized or self.muted:
            return
        try:
            if self.bgm_sound:
                # Play loops indefinitely
                self.bgm_channel = self.bgm_sound.play(loops=-1)
                if self.bgm_channel:
                    self.bgm_channel.set_volume(self.bgm_volume)
        except Exception as e:
            print(f"[WARN] BGM play failed: {e}")

    def stop_bgm(self):
        if self.bgm_channel:
            try:
                self.bgm_channel.stop()
            except:
                pass

    def toggle_mute(self):
        self.muted = not self.muted
        if self.muted:
            self.stop_bgm()
        else:
            self.start_bgm()
        return self.muted

    def set_sfx_volume(self, volume):
        self.sfx_volume = max(0.0, min(1.0, volume))
        if self.initialized:
            if self.slice_sound:
                self.slice_sound.set_volume(self.sfx_volume)
            if self.spawn_sound:
                self.spawn_sound.set_volume(self.sfx_volume * 0.8)
            if self.gameover_sound:
                self.gameover_sound.set_volume(self.sfx_volume)
            if self.explosion_sound:
                self.explosion_sound.set_volume(self.sfx_volume * 1.2)

    def set_bgm_volume(self, volume):
        self.bgm_volume = max(0.0, min(1.0, volume))
        if self.initialized and self.bgm_channel:
            try:
                self.bgm_channel.set_volume(self.bgm_volume)
            except:
                pass


# Export shared singleton instance
pygame_sfx = PygameSoundEngine()
