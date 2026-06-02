"""
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
from pygame_sound import pygame_sfx

class FruitNinjaGame:
    def __init__(self):
        """
        SECTION 1: GAME INITIALIZATION
        Initializes Pygame, sets up the 1280x720 screen, sets game states,
        configures spawner variables, and attempts to initialize the webcam hand tracker.
        """
        pygame.init()
        pygame.font.init()
        
        # Initialize Audio Channel Systems
        pygame_sfx.init_mixer()
        pygame_sfx.start_bgm()
        
        # Dimensions (Configured to exactly 1280x720 as requested)
        self.width = 1280
        self.height = 720
        self.screen = pygame.display.set_mode((self.width, self.height))
        self.game_surface = pygame.Surface((self.width, self.height))
        pygame.display.set_caption("Gesture Fruit Slice (AI Hand Tracker)")
        self.clock = pygame.time.Clock()
        
        # Core Game Variables
        self.score = 0
        self.strikes = 0
        self.max_strikes = 3
        self.high_score = 0
        try:
            with open("highscore.txt", "r") as f:
                self.high_score = int(f.read().strip())
        except Exception:
            pass
        
        # Game States: 'START', 'PLAYING', 'PAUSED', 'GAME_OVER'
        self.state = 'START'
        
        # Micro-interactions & Juicy Visuals
        self.screen_shake = 0.0
        self.combo_count = 0
        self.last_slice_time = 0.0
        self.floating_texts = []
        
        # Slicing Blade Trail Setup for Visual Effects
        self.trail_max_len = 12
        self.blade_trail = deque(maxlen=self.trail_max_len)
        self.last_clean_pos = None # Stores last valid hand location (smoothed)
        self.smooth_x = 0.0
        self.smooth_y = 0.0
        self.SMOOTHING = 0.25
        
        # Fruit & Bomb Spawner Variables
        self.fruits = []
        self.particles = []
        self.spawn_timer = 0
        self.spawn_interval = 80 # base rate; drops over time to increase difficulty
        
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

        # Typography & Fonts
        self.font_large = pygame.font.SysFont("impact", 64)
        self.font_medium = pygame.font.SysFont("sans", 32, bold=True)
        self.font_small = pygame.font.SysFont("sans", 18)
        
        # Sound Effects Configuration
        self.sound_enabled = False

    def run(self):
        """
        SECTION 2: CORE GAME LOOP
        Handles timing limits, dispatches user events, updates physics/telemetry, 
        and renders final visual states.
        """
        running = True
        while running:
            # 1. Limit Framerate to 60 FPS (Fulfills FPS Requirement)
            self.clock.tick(60)
            
            # 2. Event Dispatching
            running = self._handle_events()
            
            # 3. Game State Updates (Fulfills separate update requirement)
            self.update()
            
            # 4. Game Rendering (Fulfills separate draw requirement)
            self.draw()
                
            # Render changes to the display
            pygame.display.flip()
            
        # Clean up frames & handles on termination
        if self.camera_active:
            self.cap.release()
        pygame.quit()
        sys.exit()

    def update(self):
        """
        SECTION 3: STATE UPDATE ENGINE
        Separates state changes from any draw logic.
        Coordinates timers, movement, slicing mechanics, particle fading, 
        and state changes.
        """
        if self.state == 'START':
            self._update_start_screen()
        elif self.state == 'PLAYING':
            self._update_gameplay()
        elif self.state == 'PAUSED':
            self._update_paused()
        elif self.state == 'GAME_OVER':
            self._update_gameover()

    def draw(self):
        """
        SECTION 4: RENDER ENGINE
        Renders UI layouts, decorative background particles, game items,
        scores, strikes, blade trails, and PiP camera streams onto the buffered game surface.
        """
        # Render onto intermediate game surface
        real_screen = self.screen
        self.screen = self.game_surface

        if self.state == 'START':
            self._draw_start_screen()
        elif self.state == 'PLAYING':
            self._draw_gameplay()
        elif self.state == 'PAUSED':
            self._draw_paused()
        elif self.state == 'GAME_OVER':
            self._draw_gameover()

        # Render floating score popups
        self._draw_floating_texts()

        # Restore frame context
        self.screen = real_screen

        # Apply screen shake displacement offsets if severe impacts are registered
        if self.screen_shake > 0.1:
            shake_x = random.randint(-int(self.screen_shake), int(self.screen_shake))
            shake_y = random.randint(-int(self.screen_shake), int(self.screen_shake))
            self.screen_shake *= 0.88 # decay rate
            self.screen.blit(self.game_surface, (shake_x, shake_y))
        else:
            self.screen.blit(self.game_surface, (0, 0))

    def _handle_events(self):
        for event in pygame.event.get():
            if event.type == pygame.QUIT:
                return False
                
            if event.type == pygame.KEYDOWN:
                if event.key == pygame.K_ESCAPE:
                    if self.state == 'PLAYING':
                        self.state = 'PAUSED'
                        pygame_sfx.set_bgm_volume(pygame_sfx.bgm_volume * 0.3)
                    elif self.state == 'PAUSED':
                        self.state = 'PLAYING'
                        pygame_sfx.set_bgm_volume(pygame_sfx.bgm_volume / 0.3)
                    else:
                        return False
                if self.state == 'GAME_OVER' and event.key == pygame.K_r:
                    self._reset_game()
                
                # Space or P to Pause/Resume
                if event.key in (pygame.K_SPACE, pygame.K_p):
                    if self.state == 'PLAYING':
                        self.state = 'PAUSED'
                        pygame_sfx.set_bgm_volume(pygame_sfx.bgm_volume * 0.3)
                    elif self.state == 'PAUSED':
                        self.state = 'PLAYING'
                        pygame_sfx.set_bgm_volume(pygame_sfx.bgm_volume / 0.3)
                
                # Dynamic audio controls and volume adjustments
                if event.key == pygame.K_m:
                    pygame_sfx.toggle_mute()
                elif event.key == pygame.K_UP:
                    pygame_sfx.set_bgm_volume(pygame_sfx.bgm_volume + 0.1)
                elif event.key == pygame.K_DOWN:
                    pygame_sfx.set_bgm_volume(pygame_sfx.bgm_volume - 0.1)
                elif event.key in (pygame.K_EQUALS, pygame.K_KP_PLUS):
                    pygame_sfx.set_sfx_volume(pygame_sfx.sfx_volume + 0.1)
                elif event.key == pygame.K_MINUS:
                    pygame_sfx.set_sfx_volume(pygame_sfx.sfx_volume - 0.1)
            
            if event.type == pygame.MOUSEBUTTONDOWN:
                if self.state == 'START':
                    self.state = 'PLAYING'
                    pygame_sfx.start_bgm()
                elif self.state == 'PAUSED':
                    self.state = 'PLAYING'
                    pygame_sfx.set_bgm_volume(pygame_sfx.bgm_volume / 0.3)
                elif self.state == 'GAME_OVER':
                    self._reset_game()
                    
        return True

    def _reset_game(self):
        self.score = 0
        self.strikes = 0
        self.fruits.clear()
        self.particles.clear()
        self.blade_trail.clear()
        self.floating_texts.clear()
        self.screen_shake = 0.0
        self.combo_count = 0
        self.last_clean_pos = None
        self.spawn_interval = 80
        self.state = 'PLAYING'
        pygame_sfx.start_bgm()

    def _update_start_screen(self):
        # Allow mouse/hand tracking on start screen so players can hover to slice the "START" button
        cursor_pos = self._get_slice_position()
        if cursor_pos:
            self.blade_trail.append(cursor_pos)
            # Create interactive floating bubbles / fruits in start screen
            if random.random() < 0.02:
                f = Fruit(self.width, self.height)
                f.vy = random.uniform(-10, -14)
                self.fruits.append(f)
                
            # Update background decorative fruits
            for f in self.fruits:
                f.update()
                # If player slices decorative fruit on start screen, chop it!
                if len(self.blade_trail) >= 2:
                    if f.check_slice(self.blade_trail[-2], self.blade_trail[-1]):
                        # Start game if they sliced the start-screen decorative bomb/fruit!
                        self._trigger_fruit_slice_effects(f)
                        self.state = 'PLAYING'
                        self.fruits.clear()
                        pygame_sfx.start_bgm()
                        break
            
            self.fruits = [f for f in self.fruits if not f.is_off_screen()]
            self._update_particles()
        else:
            self.blade_trail.clear()

    def _draw_start_screen(self):
        # Layer 1: Full-screen video background under everything if webcam active
        if self.camera_active and hasattr(self, 'current_frame') and self.current_frame is not None:
            try:
                frame_resized = cv2.resize(self.current_frame, (self.width, self.height))
                frame_rgb = cv2.cvtColor(frame_resized, cv2.COLOR_BGR2RGB)
                frame_transposed = frame_rgb.swapaxes(0, 1)
                bg_surface = pygame.surfarray.make_surface(frame_transposed)
                self.screen.blit(bg_surface, (0, 0))
            except Exception:
                self.screen.fill((20, 20, 24))
        else:
            self.screen.fill((20, 20, 24))
        
        # Render decorative background fruits
        for f in self.fruits:
            f.draw(self.screen)
        self._draw_particles()
        
        # Header Typography using High-Contrast text outlines
        self._draw_text_with_shadow("GESTURE FRUIT SLICE", self.font_large, (255, 195, 0), self.width // 2, 120, center=True)
        self._draw_text_with_shadow("P L A Y   A N Y W H E R E", self.font_medium, (255, 255, 255), self.width // 2, 200, center=True)
        self._draw_text_with_shadow(f"BEST SCORE: {self.high_score}", self.font_medium, (255, 215, 0), self.width // 2, 270, center=True)
        self._draw_text_with_shadow("CLICK or SLICE FLIGHT TO START", self.font_medium, (0, 255, 180), self.width // 2, 400, center=True)
        
        # Tech guidelines description
        guide_text = "Place yourself in front of the camera, wave your hand and slice using your INDEX FINGER TIP."
        if not self.camera_active:
            guide_text = "Camera Offline - Mouse Drag / Touch Simulation active! Drag to slice."
            
        self._draw_text_with_shadow(guide_text, self.font_small, (200, 200, 210), self.width // 2, 520, center=True)
        
        # Draw blade trail
        self._draw_blade_trail()

    def _update_gameplay(self):
        # 1. Spawn Fruits
        self.spawn_timer += 1
        # Gradually decrease spawn interval to make target spawning faster as score increases
        dynamic_interval = max(35, self.spawn_interval - (self.score // 10) * 4)
        if self.spawn_timer >= dynamic_interval:
            self.spawn_timer = 0
            # Spawn between 1 to 3 fruits/bombs concurrently
            num_spawns = random.choices([1, 2, 3], weights=[50, 35, 15], k=1)[0]
            for _ in range(num_spawns):
                self.fruits.append(Fruit(self.width, self.height))
            pygame_sfx.play_spawn()

        # 2. Tracking coordinates
        cursor_pos = self._get_slice_position()
        if cursor_pos:
            self.blade_trail.append(cursor_pos)
        else:
            self.blade_trail.clear()
            self.last_clean_pos = None

        # 3. Handle Interactions & Motion Update
        for f in self.fruits:
            f.update()
            
            # Slice validation
            if len(self.blade_trail) >= 2:
                # Last two coordinates serve as the line segment for precise slice collision
                if f.check_slice(self.blade_trail[-2], self.blade_trail[-1]):
                    if f.is_bomb:
                        # Slice a bomb! Instant Game Over!
                        self.strikes = self.max_strikes
                        self.screen_shake = 28.0 # trigger screen shake!
                        self._trigger_bomb_explosion(f)
                        self.fruits.remove(f)
                        self.state = 'GAME_OVER'
                        self._check_set_highscore()
                        pygame_sfx.stop_bgm()
                        pygame_sfx.play_gameover()
                        
                        # Add a giant red "KABOOM!" floating text
                        self.floating_texts.append({
                            "text": "KABOOM!",
                            "x": f.x,
                            "y": f.y,
                            "vx": 0.0,
                            "vy": -3.0,
                            "color": (255, 40, 40),
                            "alpha": 255.0,
                            "size": 48
                        })
                        break
                    else:
                        # Chop successful fruit!
                        import time
                        now = time.time()
                        if now - self.last_slice_time < 0.45:
                            self.combo_count += 1
                        else:
                            self.combo_count = 1
                        self.last_slice_time = now

                        score_added = f.score
                        bonus = 0
                        text_str = f"+{score_added}"
                        color = f.color_secondary
                        
                        if self.combo_count >= 3:
                            bonus = 1
                            text_str = f"+{score_added + bonus} Combo x{self.combo_count}!"
                            color = (255, 195, 0)
                            # Extra custom sparkle particles
                            for _ in range(8):
                                self.particles.append(SplashParticle(f.x, f.y, (255, 195, 0), is_spark=True))
                        
                        self.score += score_added + bonus

                        self.floating_texts.append({
                            "text": text_str,
                            "x": f.x,
                            "y": f.y,
                            "vx": random.uniform(-2.0, 2.0),
                            "vy": random.uniform(-6.0, -4.0),
                            "color": color,
                            "alpha": 255.0,
                            "size": 36 if self.combo_count >= 3 else 24
                        })

                        self._trigger_fruit_slice_effects(f)
                        
            # If fruit drops off the screen unsliced and is NOT a bomb, user receives a strike!
            if f.is_off_screen():
                if not f.sliced and not f.is_bomb:
                    self.strikes += 1
                    if self.strikes >= self.max_strikes:
                        self.state = 'GAME_OVER'
                        self._check_set_highscore()
                        pygame_sfx.stop_bgm()
                        pygame_sfx.play_gameover()
                self.fruits.remove(f)
                
        # 4. Update particles
        self._update_particles()

        # 5. Update floating texts
        for ft in self.floating_texts:
            ft["x"] += ft["vx"]
            ft["y"] += ft["vy"]
            ft["vy"] += 0.15 # gravitational drift
            ft["alpha"] -= 5.0 # fade speed
        self.floating_texts = [ft for ft in self.floating_texts if ft["alpha"] > 0]

    def _draw_gameplay(self):
        # Layer 1: Full-Screen Webcam Background (mirrored, resized)
        if self.camera_active and hasattr(self, 'current_frame') and self.current_frame is not None:
            try:
                frame_resized = cv2.resize(self.current_frame, (self.width, self.height))
                frame_rgb = cv2.cvtColor(frame_resized, cv2.COLOR_BGR2RGB)
                frame_transposed = frame_rgb.swapaxes(0, 1)
                bg_surface = pygame.surfarray.make_surface(frame_transposed)
                self.screen.blit(bg_surface, (0, 0))
            except Exception:
                self.screen.fill((16, 16, 20))
        else:
            self.screen.fill((16, 16, 20))
        
        # Layer 2: Fruit objects
        for f in self.fruits:
            f.draw(self.screen)
            
        # Layer 3: Fruit particles and juice effects (rendered on top of fruits)
        self._draw_particles()
        
        # Layer 4: Finger blade trail (Neon green)
        self._draw_blade_trail()
        
        # Layer 5: Score and HUD
        # Draw Score
        self._draw_text_with_shadow(f"SCORE: {self.score}", self.font_medium, (255, 255, 255), 30, 30)
        
        # Draw FPS Counter
        fps = int(self.clock.get_fps())
        fps_text = self.font_small.render(
            f"FPS: {fps}",
            True,
            (255, 255, 255)
        )
        self.screen.blit(fps_text, (10, 50))
        
        # Draw Hearts/lives in top-right corner
        heart_start_x = self.width - 40
        heart_y = 50
        heart_gap = 40
        for i in range(self.max_strikes):
            active = i < (self.max_strikes - self.strikes)
            self._draw_heart(heart_start_x - (self.max_strikes - 1 - i) * heart_gap, heart_y, 30, active=active)
        
        # Mode display
        mode_str = "GESTURE MODE (CAMERA AR)" if self.camera_active else "MOUSE SIMULATION MODE"
        self._draw_text_with_shadow(mode_str, self.font_small, (0, 255, 150) if self.camera_active else (255, 160, 0), 30, 100)
        
        # Audio HUD display
        mute_status = "MUTED" if pygame_sfx.muted else "ACTIVE"
        vol_str = f"AUDIO: [M] Toggle Mute ({mute_status}) | [UP/DN] BGM: {int(pygame_sfx.bgm_volume*100)}% | [+/-] SFX: {int(pygame_sfx.sfx_volume*100)}%"
        self._draw_text_with_shadow(vol_str, self.font_small, (130, 200, 255), 30, 130)

    def _update_gameover(self):
        # Still capture camera/mouse motions behind gameover to display user skeleton hands
        cursor_pos = self._get_slice_position()
        if cursor_pos:
            self.blade_trail.append(cursor_pos)
        else:
            self.blade_trail.clear()
            
        self._update_particles()

    def _draw_gameover(self):
        # Layer 1: Full-Screen Webcam as background
        if self.camera_active and hasattr(self, 'current_frame') and self.current_frame is not None:
            try:
                frame_resized = cv2.resize(self.current_frame, (self.width, self.height))
                frame_rgb = cv2.cvtColor(frame_resized, cv2.COLOR_BGR2RGB)
                frame_transposed = frame_rgb.swapaxes(0, 1)
                bg_surface = pygame.surfarray.make_surface(frame_transposed)
                self.screen.blit(bg_surface, (0, 0))
            except Exception:
                self.screen.fill((10, 10, 12))
        else:
            self.screen.fill((10, 10, 12))
            
        # Dimmed black mask overlaying video for game over legibility
        dark_mask = pygame.Surface((self.width, self.height), pygame.SRCALPHA)
        dark_mask.fill((0, 0, 0, 180))
        self.screen.blit(dark_mask, (0, 0))
        
        self._draw_particles()
        
        # Draw high-contrast outlined HUD text
        self._draw_text_with_shadow("GAME OVER", self.font_large, (255, 40, 40), self.width // 2, 160, center=True)
        self._draw_text_with_shadow(f"FINAL SCORE: {self.score}", self.font_medium, (255, 255, 255), self.width // 2, 240, center=True)
        self._draw_text_with_shadow(f"BEST SCORE: {self.high_score}", self.font_medium, (255, 195, 0), self.width // 2, 300, center=True)
        self._draw_text_with_shadow("Press 'R' or CLICK to Play Again", self.font_medium, (0, 240, 150), self.width // 2, 380, center=True)
        
        self._draw_blade_trail()

    def _update_paused(self):
        # Capture raw slice positioning, but do not update timers/fruit positions
        cursor_pos = self._get_slice_position()
        if cursor_pos:
            self.blade_trail.append(cursor_pos)
        else:
            self.blade_trail.clear()
            self.last_clean_pos = None

    def _draw_paused(self):
        # Render static game elements underneath
        self._draw_gameplay()
        
        # Draw translucent black pause overlay screen mask
        pause_overlay = pygame.Surface((self.width, self.height), pygame.SRCALPHA)
        pause_overlay.fill((0, 0, 0, 175))
        self.screen.blit(pause_overlay, (0, 0))
        
        # Heading typography panels
        p_surf = self.font_large.render("GAME PAUSED", True, (0, 240, 255))
        r_surf = self.font_medium.render("Press SPACE, P, or CLICK anywhere to Resume", True, (255, 255, 255))
        q_surf = self.font_small.render("Press ESC to exit game", True, (150, 150, 160))
        
        self.screen.blit(p_surf, (self.width // 2 - p_surf.get_width() // 2, 230))
        self.screen.blit(r_surf, (self.width // 2 - r_surf.get_width() // 2, 320))
        self.screen.blit(q_surf, (self.width // 2 - q_surf.get_width() // 2, 380))
        
        self._draw_blade_trail()
        self._draw_camera_overlay()

    def _check_set_highscore(self):
        if self.score > self.high_score:
            self.high_score = self.score
            try:
                with open("highscore.txt", "w") as f:
                    f.write(str(self.high_score))
            except Exception:
                pass

    def smooth_finger(self, current_x, current_y):
        """
        Coordinates smoothing algorithm using the exact smoothing equation supplied.
        """
        self.smooth_x += (current_x - self.smooth_x) * self.SMOOTHING
        self.smooth_y += (current_y - self.smooth_y) * self.SMOOTHING
        return int(self.smooth_x), int(self.smooth_y)

    def _get_slice_position(self):
        """
        Gathers raw webcam or mouse input and scales or smooths coordinates.
        Supports single hand scaling using Exponential Moving Average filters.
        """
        if self.camera_active:
            ret, frame = self.cap.read()
            if ret:
                # 1. Rotate frame 180 degrees horizontally to negate mirroring effects
                frame = cv2.flip(frame, 1)
                
                # 2. Extract landmark skeletal positions from frame
                self.tracker.find_hands(frame, draw=True)
                landmark_pos = self.tracker.get_index_finger_tip()
                
                # Store the annotated canvas for our picture-in-picture overlay
                self.current_frame = frame
                
                if landmark_pos:
                    # Scale normalized [0.0 - 1.0] coefficients to Pygame screen coordinates
                    raw_x = int(landmark_pos[0] * self.width)
                    raw_y = int(landmark_pos[1] * self.height)
                    
                    # Exact requested finger coordinate smoothing calculation
                    if self.last_clean_pos is None:
                        self.smooth_x = float(raw_x)
                        self.smooth_y = float(raw_y)
                        self.last_clean_pos = (raw_x, raw_y)
                    else:
                        smooth_x, smooth_y = self.smooth_finger(raw_x, raw_y)
                        self.last_clean_pos = (smooth_x, smooth_y)
                    
                    return self.last_clean_pos
            else:
                self.current_frame = None
        
        # Fallback to standard mouse coordinate points if hand tracking fails or camera is dead
        mouse_pressed = pygame.mouse.get_pressed()
        if mouse_pressed[0] or self.state == 'START' or self.state == 'GAME_OVER':
            # Pygame coordinates standard mouse
            return pygame.mouse.get_pos()
            
        return None

    def _trigger_fruit_slice_effects(self, fruit):
        """Spawns circular juice splash particles on sliced fruits."""
        pygame_sfx.play_slice()
        for _ in range(18):
            self.particles.append(SplashParticle(fruit.x, fruit.y, fruit.color_secondary, is_spark=False))

    def _trigger_bomb_explosion(self, bomb):
        """Spawns severe sparkling explosive fire particles during bomb slicing."""
        pygame_sfx.play_explosion() # High velocity blade contact
        for _ in range(40):
            self.particles.append(SplashParticle(bomb.x, bomb.y, (255, 100, 0), is_spark=True))

    def _update_particles(self):
        for p in self.particles:
            p.update()
        # Keep particles that have fading transparency remaining
        self.particles = [p for p in self.particles if p.alpha > 0]
        # Cap active particles to avoid CPU bottlenecks
        if len(self.particles) > 120:
            self.particles = self.particles[-120:]

    def _draw_particles(self):
        for p in self.particles:
            p.draw(self.screen)

    def _draw_floating_texts(self):
        for ft in self.floating_texts:
            alpha_val = max(0, min(255, int(ft["alpha"])))
            font_size = ft["size"]
            custom_font = pygame.font.SysFont("sans", font_size, bold=True)
            
            # Surfaces
            text_surf = custom_font.render(ft["text"], True, ft["color"])
            shadow_surf = custom_font.render(ft["text"], True, (10, 10, 15))
            
            # Alpha fading opacity
            text_surf.set_alpha(alpha_val)
            shadow_surf.set_alpha(alpha_val)
            
            # Double blit for outline contrast effect
            self.screen.blit(shadow_surf, (int(ft["x"] - shadow_surf.get_width() // 2 + 2), int(ft["y"] - shadow_surf.get_height() // 2 + 2)))
            self.screen.blit(text_surf, (int(ft["x"] - text_surf.get_width() // 2), int(ft["y"] - text_surf.get_height() // 2)))

    def _draw_heart(self, x, y, size, active=True):
        """Draws a beautiful glossy vector heart representing active player lives."""
        color = (255, 40, 40) if active else (70, 70, 80)
        highlight_color = (255, 180, 180) if active else (110, 110, 120)
        r = size // 4
        
        # Main heart circles
        pygame.draw.circle(self.screen, color, (x - r, y), r)
        pygame.draw.circle(self.screen, color, (x + r, y), r)
        
        # Heart bottom triangle
        pygame.draw.polygon(self.screen, color, [
            (x - size // 2, y + r // 2),
            (x + size // 2, y + r // 2),
            (x, y + size // 2 + r)
        ])
        
        # Specular glint highlight
        pygame.draw.circle(self.screen, highlight_color, (x - r - 1, y - r // 2), r // 3)

    def _draw_text_with_shadow(self, text_str, font, color, x, y, center=False):
        """Draws screen overlay text with a offset drop shadow to maximize legibility."""
        text_surf = font.render(text_str, True, color)
        shadow_surf = font.render(text_str, True, (0, 0, 0))
        
        tx = x - text_surf.get_width() // 2 if center else x
        ty = y
        
        # Draw background shadow
        self.screen.blit(shadow_surf, (tx + 2, ty + 2))
        # Draw foreground text surface
        self.screen.blit(text_surf, (tx, ty))

    def _draw_blade_trail(self):
        """Draws a professional, gorgeous fading gradient glowing green blade trail."""
        if len(self.blade_trail) < 2:
            return
            
        points = list(self.blade_trail)
        n_points = len(points)
        
        # We draw overlaps: thin bright white inner line + wide translucent glow
        for i in range(1, n_points):
            p1 = points[i - 1]
            p2 = points[i]
            
            # Progress factor 0.0 at start, 1.0 at tip
            progress = i / n_points
            
            # Outer neon green glow width and color
            glow_width = int(12 * progress)
            if glow_width > 0:
                # Translucent alpha curve
                alpha = int(190 * progress)
                glow_surf = pygame.Surface((self.width, self.height), pygame.SRCALPHA)
                # Pure glowing Neon Green (57, 255, 20)
                pygame.draw.line(glow_surf, (57, 255, 20, alpha), p1, p2, glow_width)
                self.screen.blit(glow_surf, (0, 0))
                
            # Inner white blade core line
            core_width = max(1, int(3 * progress))
            pygame.draw.line(self.screen, (255, 255, 255), p1, p2, core_width)

        # Render knife cursor at fingertip
        self._draw_knife_cursor(points[-1])

    def _draw_knife_cursor(self, tip_pos):
        """
        Draws a customized, high-tech metallic knife cursor at the fingertip coordinates.
        Calculates trajectory angle relative to preceding movement frames to align blade orientation.
        """
        x, y = tip_pos
        
        # Calculate trailing angle relative to previous positions in the queue
        if len(self.blade_trail) >= 3:
            p_prev = list(self.blade_trail)[-3]
            dx = x - p_prev[0]
            dy = y - p_prev[1]
            if dx != 0 or dy != 0:
                angle = math.atan2(dy, dx)
            else:
                angle = -math.pi / 4 # Default to pointing 45 degrees up-left
        else:
            angle = -math.pi / 4

        # Define localized coordinates for a sleek cyber dagger (centered around hilt at 0,0)
        # Pointing along positive X-axis
        cos_a = math.cos(angle)
        sin_a = math.sin(angle)

        def transform_point(lx, ly):
            rx = int(x + lx * cos_a - ly * sin_a)
            ry = int(y + lx * sin_a + ly * cos_a)
            return (rx, ry)

        # 1. Knife Handle (brown/charcoal grip)
        handle_start = transform_point(-18, 0)
        handle_end = transform_point(0, 0)
        pygame.draw.line(self.screen, (80, 80, 90), handle_start, handle_end, 5)

        # 2. Blade guard / Hilt (golden)
        guard_top = transform_point(0, -8)
        guard_bottom = transform_point(0, 8)
        pygame.draw.line(self.screen, (255, 195, 0), guard_top, guard_bottom, 3)

        # 3. Steel Blade (silver/white polygon)
        blade_base_top = transform_point(0, -4)
        blade_base_bot = transform_point(0, 4)
        blade_tip = transform_point(25, 0)
        pygame.draw.polygon(self.screen, (200, 220, 240), [blade_base_top, blade_tip, blade_base_bot])

        # 4. Neon Edge Highlight (glowing thin green edge)
        pygame.draw.polygon(self.screen, (255, 255, 255), [blade_base_top, blade_tip, blade_base_bot], 1)

        # 5. Cybernetic glint flare at the tip (bright glowing green glint)
        pygame.draw.circle(self.screen, (0, 255, 100), blade_tip, 5)
        pygame.draw.circle(self.screen, (255, 255, 255), blade_tip, 2)

    def _draw_camera_overlay(self):
        """Webcam is already rendered full-screen in AR mode behind all items."""
        return
