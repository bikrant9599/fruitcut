import { useState } from 'react';
import { Copy, Check, Download, FileCode, Terminal, HelpCircle, AlertCircle } from 'lucide-react';

interface PythonFile {
  name: string;
  description: string;
  code: string;
  language: string;
}

export default function PythonCodeViewer() {
  const [activeTab, setActiveTab] = useState<string>('main.py');
  const [copied, setCopied] = useState<boolean>(false);

  // Exact contents as the Python files we created
  const pythonFiles: Record<string, PythonFile> = {
    'main.py': {
      name: 'main.py',
      description: 'The master launcher script. Tests dependencies and boots the game canvas.',
      language: 'python',
      code: `"""
Main Entry point for Gesture Fruit Slice - Local Pygame Executable.
"""
import sys

def check_dependencies():
    """Validates if essential gaming packages exist before launching window."""
    missing = []
    try:
        import pygame
    except ImportError:
        missing.append("pygame")
    try:
        import cv2
    except ImportError:
        missing.append("opencv-python (cv2)")
    try:
        import mediapipe as mp
    except ImportError:
        missing.append("mediapipe")
    try:
        import numpy as np
    except ImportError:
        missing.append("numpy")
        
    if missing:
        print("\\n" + "="*50)
        print("ERROR: Missing Required Libraries!")
        print("Please resolve missing packages to play the local Pygame version:")
        for pkg in missing:
            print(f" - {pkg}")
        print("\\nQuick Fix: Run 'pip install -r requirements.txt'")
        print("="*50 + "\\n")
        return False
    return True

if __name__ == "__main__":
    if check_dependencies():
        print("\\n" + "="*60)
        print("🚀 GESTURE FRUIT SLICE: LOCAL PYGAME LAUNCHER 🚀")
        print("="*60)
        print("Slicing Mechanics:")
        print(" - Waves of fruits and bombs fly up from the bottom of the screen.")
        print(" - Move your index finger tip in front of the camera to slice.")
        print(" - Missing fruits adds a strike (❌). Slicing bombs triggers a penalty.")
        print(" - 3 strikes or bomb expiration triggers GAME OVER.")
        print(" - Fail-safe: No webcam? Simply drag or click your mouse to chop!")
        print("\\nLoading Graphics & Trackers... Please wait...\\n")
        
        try:
            from game import FruitNinjaGame
            game_instance = FruitNinjaGame()
            game_instance.run()
        except Exception as e:
            print(f"\\n[FATAL ERROR] Game execution failed: {e}")
            print("Please ensure your webcam is not locked by another application.")
            sys.exit(1)
    else:
        sys.exit(1)`
    },
    'game.py': {
      name: 'game.py',
      description: 'Core game architecture. Holds the Pygame rendering loop, physics simulation, particles, trail, scores, and lives.',
      language: 'python',
      code: `"""
Core Game Engine for Gesture Fruit Slice.
Manages Pygame runtime, camera capture threads, collision engine, scoring, and UI flows.
"""
import pygame
import cv2
import sys
import random
import math
from collections import deque

from hand_tracker import HandTracker
from fruit import Fruit, SplashParticle

class FruitNinjaGame:
    def __init__(self):
        pygame.init()
        pygame.font.init()
        
        # Dimensions
        self.width = 1024
        self.height = 640
        self.screen = pygame.display.set_mode((self.width, self.height))
        pygame.display.set_caption("Gesture Fruit Slice (AI Tracker)")
        self.clock = pygame.time.Clock()
        
        # Core Game Variables
        self.score = 0
        self.strikes = 0
        self.max_strikes = 3
        # Game States: 'START', 'PLAYING', 'GAME_OVER'
        self.state = 'START'
        
        # Slicing Blade Trail Setup
        self.trail_max_len = 12
        self.blade_trail = deque(maxlen=self.trail_max_len)
        self.last_clean_pos = None # Stores last valid hand location (smoothed)
        
        # Spawner Variables
        self.fruits = []
        self.particles = []
        self.spawn_timer = 0
        self.spawn_interval = 80 # frames between spawns, decreases as game progresses
        
        # MediaPipe & OpenCV Camera Setup
        self.tracker = HandTracker(detection_confidence=0.7, tracking_confidence=0.7)
        self.cam_width = 320
        self.cam_height = 240
        
        print("[INFO] Initializing webcam...")
        self.cap = cv2.VideoCapture(0)
        self.camera_active = True
        
        if not self.cap.isOpened():
            print("[WARN] No webcam detected. Automatically falling back to MOUSE CONTROL mode.")
            self.camera_active = False
        else:
            # Set camera dimensions for fast processing
            self.cap.set(cv2.CAP_PROP_FRAME_WIDTH, self.cam_width)
            self.cap.set(cv2.CAP_PROP_FRAME_HEIGHT, self.cam_height)
            print("[INFO] Webcam initialized successfully!")

        # Fonts
        self.font_large = pygame.font.SysFont("impact", 54)
        self.font_medium = pygame.font.SysFont("sans", 28, bold=True)
        self.font_small = pygame.font.SysFont("sans", 16)
        
        # Sound Effects Placeholder
        self.sound_enabled = False

    def run(self):
        running = True
        while running:
            self.clock.tick(60)
            running = self._handle_events()
            
            if self.state == 'START':
                self._update_start_screen()
                self._draw_start_screen()
            elif self.state == 'PLAYING':
                self._update_gameplay()
                self._draw_gameplay()
            elif self.state == 'GAME_OVER':
                self._update_gameover()
                self._draw_gameover()
                
            pygame.display.flip()
            
        if self.camera_active:
            self.cap.release()
        pygame.quit()
        sys.exit()

    def _handle_events(self):
        for event in pygame.event.get():
            if event.type == pygame.QUIT:
                return False
                
            if event.type == pygame.KEYDOWN:
                if event.key == pygame.K_ESCAPE:
                    return False
                if self.state == 'GAME_OVER' and event.key == pygame.K_r:
                    self._reset_game()
            
            if event.type == pygame.MOUSEBUTTONDOWN:
                if self.state == 'START':
                    self.state = 'PLAYING'
                elif self.state == 'GAME_OVER':
                    self._reset_game()
                    
        return True

    def _reset_game(self):
        self.score = 0
        self.strikes = 0
        self.fruits.clear()
        self.particles.clear()
        self.blade_trail.clear()
        self.last_clean_pos = None
        self.spawn_interval = 80
        self.state = 'PLAYING'

    def _update_start_screen(self):
        cursor_pos = self._get_slice_position()
        if cursor_pos:
            self.blade_trail.append(cursor_pos)
            if random.random() < 0.02:
                f = Fruit(self.width, self.height)
                f.vy = random.uniform(-10, -14)
                self.fruits.append(f)
                
            for f in self.fruits:
                f.update()
                if len(self.blade_trail) >= 2:
                    if f.check_slice(self.blade_trail[-2], self.blade_trail[-1]):
                        self._trigger_fruit_slice_effects(f)
                        self.state = 'PLAYING'
                        self.fruits.clear()
                        break
            
            self.fruits = [f for f in self.fruits if not f.is_off_screen()]
            self._update_particles()
        else:
            self.blade_trail.clear()

    def _draw_start_screen(self):
        self.screen.fill((20, 20, 24))
        for f in self.fruits:
            f.draw(self.screen)
        self._draw_particles()
        
        title_surf = self.font_large.render("GESTURE FRUIT SLICE", True, (255, 195, 0))
        sub_surf = self.font_medium.render("P L A Y   A N Y W H E R E", True, (255, 255, 255))
        prompt_surf = self.font_medium.render("CLICK or SLICE FLIGHT TO START", True, (0, 255, 180))
        
        self.screen.blit(title_surf, (self.width // 2 - title_surf.get_width() // 2, 140))
        self.screen.blit(sub_surf, (self.width // 2 - sub_surf.get_width() // 2, 220))
        self.screen.blit(prompt_surf, (self.width // 2 - prompt_surf.get_width() // 2, 400))
        
        guide_text = "Place yourself in front of the camera, wave your hand and slice using your INDEX FINGER TIP."
        if not self.camera_active:
            guide_text = "Camera Offline - Mouse Drag / Touch Simulation active! Drag to slice."
            
        guide_surf = self.font_small.render(guide_text, True, (150, 150, 160))
        self.screen.blit(guide_surf, (self.width // 2 - guide_surf.get_width() // 2, 520))
        
        self._draw_blade_trail()
        self._draw_camera_overlay()

    def _update_gameplay(self):
        self.spawn_timer += 1
        dynamic_interval = max(35, self.spawn_interval - (self.score // 10) * 4)
        if self.spawn_timer >= dynamic_interval:
            self.spawn_timer = 0
            num_spawns = random.choices([1, 2, 3], weights=[50, 35, 15], k=1)[0]
            for _ in range(num_spawns):
                self.fruits.append(Fruit(self.width, self.height))

        cursor_pos = self._get_slice_position()
        if cursor_pos:
            self.blade_trail.append(cursor_pos)
        else:
            self.blade_trail.clear()
            self.last_clean_pos = None

        for f in self.fruits:
            f.update()
            
            if len(self.blade_trail) >= 2:
                if f.check_slice(self.blade_trail[-2], self.blade_trail[-1]):
                    if f.is_bomb:
                        self.strikes += 1
                        self._trigger_bomb_explosion(f)
                        self.fruits.remove(f)
                        if self.strikes >= self.max_strikes:
                            self.state = 'GAME_OVER'
                        break
                    else:
                        self.score += f.score
                        self._trigger_fruit_slice_effects(f)
                        
            if f.is_off_screen():
                if not f.sliced and not f.is_bomb:
                    self.strikes += 1
                    if self.strikes >= self.max_strikes:
                        self.state = 'GAME_OVER'
                self.fruits.remove(f)
                
        self._update_particles()

    def _draw_gameplay(self):
        self.screen.fill((16, 16, 20))
        self._draw_particles()
        
        for f in self.fruits:
            f.draw(self.screen)
            
        self._draw_blade_trail()
        
        score_surf = self.font_medium.render(f"SCORE: {self.score}", True, (255, 255, 255))
        self.screen.blit(score_surf, (30, 30))
        
        strike_text = "❌" * self.strikes + "⚪" * (self.max_strikes - self.strikes)
        strike_surf = self.font_medium.render(strike_text, True, (255, 0, 0))
        self.screen.blit(strike_surf, (self.width // 2 - strike_surf.get_width() // 2, 30))
        
        mode_str = "GESTURE MODE (CAMERA)" if self.camera_active else "MOUSE SIMULATION MODE"
        mode_surf = self.font_small.render(mode_str, True, (0, 255, 150) if self.camera_active else (255, 160, 0))
        self.screen.blit(mode_surf, (30, 70))
        
        self._draw_camera_overlay()

    def _update_gameover(self):
        cursor_pos = self._get_slice_position()
        if cursor_pos:
            self.blade_trail.append(cursor_pos)
        else:
            self.blade_trail.clear()
            
        self._update_particles()

    def _draw_gameover(self):
        self.screen.fill((10, 10, 12))
        self._draw_particles()
        
        gameover_surf = self.font_large.render("GAME OVER", True, (255, 40, 40))
        final_score_surf = self.font_medium.render(f"FINAL SCORE: {self.score}", True, (255, 255, 255))
        restart_surf = self.font_medium.render("Press 'R' or CLICK to Play Again", True, (0, 240, 150))
        
        self.screen.blit(gameover_surf, (self.width // 2 - gameover_surf.get_width() // 2, 200))
        self.screen.blit(final_score_surf, (self.width // 2 - final_score_surf.get_width() // 2, 280))
        self.screen.blit(restart_surf, (self.width // 2 - restart_surf.get_width() // 2, 380))
        
        self._draw_blade_trail()
        self._draw_camera_overlay()

    def _get_slice_position(self):
        if self.camera_active:
            ret, frame = self.cap.read()
            if ret:
                frame = cv2.flip(frame, 1)
                self.tracker.find_hands(frame, draw=True)
                landmark_pos = self.tracker.get_index_finger_tip()
                self.current_frame = frame
                
                if landmark_pos:
                    raw_x = int(landmark_pos[0] * self.width)
                    raw_y = int(landmark_pos[1] * self.height)
                    
                    smoothing_factor = 0.4
                    if self.last_clean_pos is None:
                        self.last_clean_pos = (raw_x, raw_y)
                    else:
                        smooth_x = int(smoothing_factor * raw_x + (1.0 - smoothing_factor) * self.last_clean_pos[0])
                        smooth_y = int(smoothing_factor * raw_y + (1.0 - smoothing_factor) * self.last_clean_pos[1])
                        self.last_clean_pos = (smooth_x, smooth_y)
                    
                    return self.last_clean_pos
            else:
                self.current_frame = None
        
        mouse_pressed = pygame.mouse.get_pressed()
        if mouse_pressed[0] or self.state == 'START' or self.state == 'GAME_OVER':
            return pygame.mouse.get_pos()
            
        return None

    def _trigger_fruit_slice_effects(self, fruit):
        for _ in range(18):
            self.particles.append(SplashParticle(fruit.x, fruit.y, fruit.color_secondary, is_spark=False))

    def _trigger_bomb_explosion(self, bomb):
        for _ in range(40):
            self.particles.append(SplashParticle(bomb.x, bomb.y, (255, 100, 0), is_spark=True))

    def _update_particles(self):
        for p in self.particles:
            p.update()
        self.particles = [p for p in self.particles if p.alpha > 0]

    def _draw_particles(self):
        for p in self.particles:
            p.draw(self.screen)

    def _draw_blade_trail(self):
        if len(self.blade_trail) < 2:
            return
        points = list(self.blade_trail)
        n_points = len(points)
        for i in range(1, n_points):
            p1 = points[i - 1]
            p2 = points[i]
            progress = i / n_points
            glow_width = int(8 * progress)
            if glow_width > 0:
                alpha = int(180 * progress)
                glow_surf = pygame.Surface((self.width, self.height), pygame.SRCALPHA)
                pygame.draw.line(glow_surf, (0, 240, 255, alpha), p1, p2, glow_width)
                self.screen.blit(glow_surf, (0, 0))
            core_width = max(1, int(3 * progress))
            pygame.draw.line(self.screen, (255, 255, 255), p1, p2, core_width)

    def _draw_camera_overlay(self):
        if not self.camera_active or not hasattr(self, 'current_frame') or self.current_frame is None:
            return
        try:
            box_width, box_height = 180, 135
            frame_resized = cv2.resize(self.current_frame, (box_width, box_height))
            frame_rgb = cv2.cvtColor(frame_resized, cv2.COLOR_BGR2RGB)
            frame_transposed = frame_rgb.swapaxes(0, 1)
            pip_surface = pygame.surfarray.make_surface(frame_transposed)
            dest_x = self.width - box_width - 30
            dest_y = 30
            pygame.draw.rect(self.screen, (0, 255, 150), (dest_x - 3, dest_y - 3, box_width + 6, box_height + 6), 2, border_radius=4)
            self.screen.blit(pip_surface, (dest_x, dest_y))
            lbl_surf = self.font_small.render("LIVE SLICE FEED", True, (0, 255, 150))
            self.screen.blit(lbl_surf, (dest_x, dest_y + box_height + 5))
        except Exception as e:
            pass`
    },
    'hand_tracker.py': {
      name: 'hand_tracker.py',
      description: 'MediaPipe-driven hand detection class module. Isolates CV complexity and yields coordinates.',
      language: 'python',
      code: `"""
Hand Tracking Module for Simple Fruit Slice Game.
Encapsulates MediaPipe Hands detection in a clean, reusable OOP interface.
"""
import cv2
import mediapipe as mp

class HandTracker:
    def __init__(self, static_mode=False, max_hands=1, detection_confidence=0.7, tracking_confidence=0.7):
        self.mp_hands = mp.solutions.hands
        self.hands = self.mp_hands.Hands(
            static_image_mode=static_mode,
            max_num_hands=max_hands,
            min_detection_confidence=detection_confidence,
            min_tracking_confidence=tracking_confidence
        )
        self.mp_draw = mp.solutions.drawing_utils
        self.results = None

    def find_hands(self, frame, draw=True):
        rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        self.results = self.hands.process(rgb_frame)
        
        if draw and self.results.multi_hand_landmarks:
            for hand_landmarks in self.results.multi_hand_landmarks:
                self.mp_draw.draw_landmarks(
                    frame, 
                    hand_landmarks, 
                    self.mp_hands.HAND_CONNECTIONS,
                    self.mp_draw.DrawingSpec(color=(0, 255, 0), thickness=2, circle_radius=3),
                    self.mp_draw.DrawingSpec(color=(0, 0, 255), thickness=2, circle_radius=2)
                )
        return frame

    def get_index_finger_tip(self):
        if self.results and self.results.multi_hand_landmarks:
            primary_hand = self.results.multi_hand_landmarks[0]
            index_tip = primary_hand.landmark[self.mp_hands.HandLandmark.INDEX_FINGER_TIP]
            return index_tip.x, index_tip.y
        return None`
    },
    'fruit.py': {
      name: 'fruit.py',
      description: 'Defines Fruits and explosive bombs including custom canvas drawing polygons and slice intersection vectors.',
      language: 'python',
      code: `"""
Fruit Module for Gesture Fruit Slice Game.
Implements the Fruit and Particle objects using Pygame vector/geometry.
"""
import pygame
import random
import math

class Fruit:
    TYPES = {
        'watermelon': ((40, 180, 40), (220, 40, 40), 45, 1, False),
        'orange': ((255, 140, 0), (255, 190, 50), 30, 2, False),
        'apple': ((200, 20, 20), (240, 220, 200), 32, 2, False),
        'banana': ((240, 230, 40), (250, 250, 220), 25, 3, False),
        'bomb': ((40, 40, 40), (255, 10, 10), 35, 0, True)
    }

    def __init__(self, screen_width, screen_height):
        self.screen_width = screen_width
        self.screen_height = screen_height
        
        self.category = random.choice(list(self.TYPES.keys()))
        color_primary, color_secondary, self.radius, self.score, self.is_bomb = self.TYPES[self.category]
        self.color_primary = color_primary
        self.color_secondary = color_secondary
        
        self.x = random.randint(self.radius, self.screen_width - self.radius)
        self.y = self.screen_height + self.radius
        
        center_bias = (self.screen_width / 2 - self.x) * 0.005
        self.vx = random.uniform(-3, 3) + center_bias
        self.vy = random.uniform(-14, -18)
        
        self.gravity = 0.28
        self.sliced = False
        
        self.angle = 0
        self.rot_speed = random.uniform(-4, 4)
        
        self.slice_angle = 0
        self.half_offset_dist = 0
        self.separate_vx = 4.0

    def update(self):
        self.vy += self.gravity
        self.x += self.vx
        self.y += self.vy
        self.angle += self.rot_speed
        if self.sliced:
            self.half_offset_dist += self.separate_vx

    def is_off_screen(self):
        return self.y > self.screen_height + 100 or self.x < -100 or self.x > self.screen_width + 100

    def draw(self, screen):
        if not self.sliced:
            if self.is_bomb:
                pygame.draw.circle(screen, self.color_primary, (int(self.x), int(self.y)), self.radius)
                pygame.draw.circle(screen, (80, 80, 80), (int(self.x), int(self.y)), self.radius, 2)
                fuse_start = (int(self.x), int(self.y - self.radius))
                fuse_end = (int(self.x + 15), int(self.y - self.radius - 15))
                pygame.draw.line(screen, (150, 110, 50), fuse_start, fuse_end, 3)
                spark_color = (255, random.randint(150, 255), 0)
                pygame.draw.circle(screen, spark_color, fuse_end, random.randint(4, 7))
            else:
                pygame.draw.circle(screen, self.color_primary, (int(self.x), int(self.y)), self.radius)
                inner_r = int(self.radius * 0.85)
                pygame.draw.circle(screen, self.color_secondary, (int(self.x), int(self.y)), inner_r)
                
                stem_start = (int(self.x), int(self.y - self.radius))
                stem_end = (int(self.x - 5), int(self.y - self.radius - 8))
                pygame.draw.line(screen, (100, 60, 30), stem_start, stem_end, 3)
        else:
            dx = math.cos(self.slice_angle + math.pi / 2) * self.half_offset_dist
            dy = math.sin(self.slice_angle + math.pi / 2) * self.half_offset_dist
            
            c1_x, c1_y = self.x - dx, self.y - dy
            c2_x, c2_y = self.x + dx, self.y + dy
            
            self._draw_half_fruit(screen, c1_x, c1_y, self.radius, self.slice_angle)
            self._draw_half_fruit(screen, c2_x, c2_y, self.radius, self.slice_angle + math.pi)

    def _draw_half_fruit(self, screen, cx, cy, r, angle):
        points = []
        steps = 15
        for i in range(steps + 1):
            theta = angle + (i / steps) * math.pi
            px = cx + math.cos(theta) * r
            py = cy + math.sin(theta) * r
            points.append((px, py))
        
        if len(points) >= 3:
            pygame.draw.polygon(screen, self.color_primary, points)
            inner_points = []
            for i in range(steps + 1):
                theta = angle + (i / steps) * math.pi
                px = cx + math.cos(theta) * (r * 0.85)
                py = cy + math.sin(theta) * (r * 0.85)
                inner_points.append((px, py))
            pygame.draw.polygon(screen, self.color_secondary, inner_points)

    def check_slice(self, p1, p2):
        if self.sliced:
            return False
            
        x1, y1 = p1
        x2, y2 = p2
        cx, cy = self.x, self.y
        r = self.radius
        
        dx = x2 - x1
        dy = y2 - y1
        segment_len_sq = dx*dx + dy*dy
        if segment_len_sq < 1:
            dist_sq = (x1 - cx)**2 + (y1 - cy)**2
            return dist_sq <= r*r
            
        t = ((cx - x1) * dx + (cy - y1) * dy) / segment_len_sq
        t = max(0, min(1, t))
        closest_x = x1 + t * dx
        closest_y = y1 + t * dy
        dist_sq = (closest_x - cx)**2 + (closest_y - cy)**2
        
        if dist_sq <= r*r:
            self.sliced = True
            self.slice_angle = math.atan2(dy, dx)
            return True
            
        return False

class SplashParticle:
    def __init__(self, x, y, color, is_spark=False):
        self.x = x
        self.y = y
        self.color = color
        self.is_spark = is_spark
        
        angle = random.uniform(0, 2 * math.pi)
        speed = random.uniform(3, 8) if is_spark else random.uniform(2, 6)
        self.vx = math.cos(angle) * speed
        self.vy = math.sin(angle) * speed
        self.radius = random.uniform(2, 5)
        self.alpha = 255
        self.fade_speed = random.uniform(4, 8)
        self.gravity = 0.15

    def update(self):
        self.vy += self.gravity
        self.x += self.vx
        self.y += self.vy
        self.alpha = max(0, self.alpha - self.fade_speed)

    def draw(self, screen):
        if self.alpha <= 0:
            return
        if self.is_spark:
            color_spark = (255, random.randint(150, 255), 50)
            pygame.draw.circle(screen, color_spark, (int(self.x), int(self.y)), int(self.radius))
        else:
            surf = pygame.Surface((self.radius * 2, self.radius * 2), pygame.SRCALPHA)
            pygame.draw.circle(surf, (*self.color, int(self.alpha)), (self.radius, self.radius), self.radius)
            screen.blit(surf, (int(self.x - self.radius), int(self.y - self.radius)))`
    },
    'requirements.txt': {
      name: 'requirements.txt',
      description: 'Defines the Python pip virtual environment setup module requirements.',
      language: 'text',
      code: `pygame>=2.5.0
mediapipe>=0.10.0
opencv-python>=4.8.0
numpy>=1.24.0`
    }
  };

  const activeFile = pythonFiles[activeTab];

  const handleCopy = () => {
    navigator.clipboard.writeText(activeFile.code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const blob = new Blob([activeFile.code], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = activeFile.name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const downloadAllAsZipGuide = () => {
    alert("To download the clean project structure, use the AI Studio top Settings menu and export as a ZIP file! All files (main.py, game.py, hand_tracker.py, fruit.py, requirements.txt) are successfully configured inside your sandbox directory.");
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl flex flex-col md:flex-row h-[550px] text-slate-300">
      
      {/* Sidebar List */}
      <div className="w-full md:w-64 bg-slate-950 border-r border-slate-800 p-4 shrink-0 flex flex-col justify-between">
        <div>
          <div className="flex items-center gap-2 mb-4 px-2 text-indigo-400 font-semibold text-xs tracking-wider uppercase">
            <Terminal className="w-4 h-4" />
            <span>Python Workspace</span>
          </div>
          
          <div className="space-y-1">
            {Object.keys(pythonFiles).map((filename) => (
              <button
                key={filename}
                onClick={() => {
                  setActiveTab(filename);
                  setCopied(false);
                }}
                className={`w-full text-left px-3 py-2.5 rounded-lg text-sm font-mono flex items-center gap-3 transition-colors ${
                  activeTab === filename
                    ? 'bg-indigo-600/25 border border-indigo-500/30 text-white font-medium'
                    : 'text-slate-400 hover:bg-slate-900/50 hover:text-slate-200'
                }`}
              >
                <FileCode className={`w-4 h-4 ${activeTab === filename ? 'text-indigo-400' : 'text-slate-500'}`} />
                <span>{filename}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Action guidelines */}
        <div className="mt-8 bg-slate-900/50 p-3.5 rounded-lg border border-slate-800/80 text-xs text-slate-400 space-y-2">
          <div className="flex items-center gap-1.5 text-slate-300 font-semibold">
            <HelpCircle className="w-3.5 h-3.5 text-indigo-400" />
            <span>How to execute:</span>
          </div>
          <ol className="list-decimal list-inside space-y-1 text-slate-400/90 font-mono leading-relaxed">
            <li>Open local terminal</li>
            <li>Run: <span className="bg-slate-950 px-1 py-0.5 rounded text-indigo-300 text-[11px] font-semibold">pip install -r requirements.txt</span></li>
            <li>Run: <span className="bg-slate-950 px-1 py-0.5 rounded text-indigo-300 text-[11px] font-semibold">python main.py</span></li>
          </ol>
        </div>
      </div>

      {/* Editor Main Content Area */}
      <div className="flex-1 flex flex-col justify-between min-w-0">
        
        {/* Editor Header */}
        <div className="bg-slate-950 px-6 py-4 border-b border-slate-800 flex items-center justify-between gap-4">
          <div className="min-w-0">
            <h3 className="text-white font-medium text-sm font-mono flex items-center gap-2">
              <span className="text-indigo-400">/{activeFile.name}</span>
            </h3>
            <p className="text-xs text-slate-500 truncate mt-0.5 leading-relaxed">
              {activeFile.description}
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {/* Copy Button */}
            <button
              onClick={handleCopy}
              className="p-2 bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white rounded-lg border border-slate-800 transition-colors flex items-center gap-1.5 text-xs font-medium"
              title="Copy snippet to clipboard"
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-emerald-400 hidden sm:inline">Copied!</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Copy</span>
                </>
              )}
            </button>

            {/* Individual Download */}
            <button
              onClick={handleDownload}
              className="p-2 bg-slate-900 hover:bg-slate-800 text-indigo-400 hover:text-indigo-300 rounded-lg border border-slate-800 transition-colors flex items-center gap-1.5 text-xs font-medium"
              title="Download file"
            >
              <Download className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Download</span>
            </button>
          </div>
        </div>

        {/* Code Block Renderer */}
        <div className="flex-1 p-6 overflow-y-auto font-mono text-xs leading-relaxed bg-[rgb(12,14,21)] block relative">
          <pre className="text-indigo-200 select-all whitespace-pre">
            <code>{activeFile.code}</code>
          </pre>
        </div>

        {/* Exporter Footer banner */}
        <div className="bg-slate-950 px-6 py-3 border-t border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-400">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-emerald-500" />
            <span>Files are fully configured on disk. Export via ZIP / GitHub in the AI Studio menu!</span>
          </div>
          <button 
            onClick={downloadAllAsZipGuide}
            className="text-xs font-semibold text-indigo-400 hover:text-indigo-300 transition-colors"
          >
            Project Setup ZIP Guide
          </button>
        </div>

      </div>
    </div>
  );
}
