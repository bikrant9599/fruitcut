"""
Fruit Module for Gesture Fruit Slice Game.
Implements the Fruit and Particle objects using Pygame vector/geometry.
"""
import pygame
import random
import math

class Fruit:
    # Supported types: (Name, Color, Radius, ScoreMultiplier, IsBomb)
    TYPES = {
        'watermelon': ((40, 180, 40), (220, 40, 40), 45, 1, False),  # Green skin, Red flesh
        'orange': ((255, 140, 0), (255, 190, 50), 30, 2, False),
        'apple': ((200, 20, 20), (240, 220, 200), 32, 2, False),
        'banana': ((240, 230, 40), (250, 250, 220), 25, 3, False),
        'bomb': ((40, 40, 40), (255, 10, 10), 35, 0, True)           # Dark iron, Glowing fuse
    }

    def __init__(self, screen_width, screen_height):
        self.screen_width = screen_width
        self.screen_height = screen_height
        
        # Pick random fruit type
        self.category = random.choice(list(self.TYPES.keys()))
        color_primary, color_secondary, self.radius, self.score, self.is_bomb = self.TYPES[self.category]
        self.color_primary = color_primary
        self.color_secondary = color_secondary
        
        # Initial Physics
        # Spawn near bottom, fly upwards
        self.x = random.randint(self.radius, self.screen_width - self.radius)
        self.y = self.screen_height + self.radius
        
        # Adjust velocities based on spawn position to keep fruits on screen
        center_bias = (self.screen_width / 2 - self.x) * 0.005
        self.vx = random.uniform(-3, 3) + center_bias
        self.vy = random.uniform(-14, -18) # Strong upward thrust
        
        self.gravity = 0.28
        self.sliced = False
        
        # Rotation and Half offset when sliced
        self.angle = 0
        self.rot_speed = random.uniform(-4, 4)
        
        # Variables for rendering half cuts
        self.slice_angle = 0
        self.half_offset_dist = 0
        self.separate_vx = 4.0 # Speed of split pieces separating

    def update(self):
        """Updates gravity, positions, rates, and splitting offsets."""
        self.vy += self.gravity
        self.x += self.vx
        self.y += self.vy
        
        self.angle += self.rot_speed
        
        if self.sliced:
            # Splitting halves separate outwards
            self.half_offset_dist += self.separate_vx

    def is_off_screen(self):
        """Checks if fruit has exited the play zone."""
        # Once sliced, it falls off screen faster or can be deleted when off vertical boundaries
        return self.y > self.screen_height + 100 or self.x < -100 or self.x > self.screen_width + 100

    def draw(self, screen):
        """Draws the fruit. If sliced, draws two rotating separate halves."""
        if not self.sliced:
            # Subtle flat dark shadow offset under the fruit
            shadow_offset_col = (10, 12, 16)
            pygame.draw.circle(screen, shadow_offset_col, (int(self.x + 4), int(self.y + 6)), self.radius)

            if self.is_bomb:
                # Draw black sphere
                pygame.draw.circle(screen, self.color_primary, (int(self.x), int(self.y)), self.radius)
                # Outer ring details
                pygame.draw.circle(screen, (80, 80, 80), (int(self.x), int(self.y)), self.radius, 2)
                # Draw fuse
                fuse_start = (int(self.x), int(self.y - self.radius))
                fuse_end = (int(self.x + 15), int(self.y - self.radius - 15))
                pygame.draw.line(screen, (150, 110, 50), fuse_start, fuse_end, 3)
                # Spark spark spark
                spark_color = (255, random.randint(150, 255), 0)
                pygame.draw.circle(screen, spark_color, fuse_end, random.randint(4, 7))
            else:
                # Solid skin circle
                pygame.draw.circle(screen, self.color_primary, (int(self.x), int(self.y)), self.radius)
                # Inner flesh details (e.g. apple white, orange light orange)
                inner_r = int(self.radius * 0.85)
                pygame.draw.circle(screen, self.color_secondary, (int(self.x), int(self.y)), inner_r)
                
                # Draw top leaf or stem
                stem_start = (int(self.x), int(self.y - self.radius))
                stem_end = (int(self.x - 5), int(self.y - self.radius - 8))
                pygame.draw.line(screen, (100, 60, 30), stem_start, stem_end, 3)
                
        else:
            # Sliced representation: Draw two halves separating along slice_angle
            # We calculate offset vectors orthogonal to the slice angle
            dx = math.cos(self.slice_angle + math.pi / 2) * self.half_offset_dist
            dy = math.sin(self.slice_angle + math.pi / 2) * self.half_offset_dist
            
            # Left half and Right half centers
            c1_x, c1_y = self.x - dx, self.y - dy
            c2_x, c2_y = self.x + dx, self.y + dy
            
            # Handlers to draw semi-circles
            self._draw_half_fruit(screen, c1_x, c1_y, self.radius, self.slice_angle)
            self._draw_half_fruit(screen, c2_x, c2_y, self.radius, self.slice_angle + math.pi)

    def _draw_half_fruit(self, screen, cx, cy, r, angle):
        """Utility to draw a rotated half-circle (fruit slice matching angular orientation)."""
        # We can draw it as a filled polygon representing a semi-circle
        points = []
        steps = 15
        # Generate arc points
        for i in range(steps + 1):
            theta = angle + (i / steps) * math.pi
            px = cx + math.cos(theta) * r
            py = cy + math.sin(theta) * r
            points.append((px, py))
        
        # Shadow points offset below the sliced half
        shadow_points = [(px + 4, py + 6) for (px, py) in points]
        
        # Draw half shadow
        if len(shadow_points) >= 3:
            pygame.draw.polygon(screen, (10, 12, 16), shadow_points)

        # Draw outer skin
        if len(points) >= 3:
            pygame.draw.polygon(screen, self.color_primary, points)
            
            # Draw inner flesh slightly smaller
            inner_points = []
            for i in range(steps + 1):
                theta = angle + (i / steps) * math.pi
                px = cx + math.cos(theta) * (r * 0.85)
                py = cy + math.sin(theta) * (r * 0.85)
                inner_points.append((px, py))
            pygame.draw.polygon(screen, self.color_secondary, inner_points)

    def check_slice(self, p1, p2):
        """
        Calculates if the line segment (p1 -> p2) representing the finger block
        intersects the fruit circle.
        
        Formula: Segment-to-Circle interaction using quadratic discriminant.
        """
        if self.sliced:
            return False
            
        x1, y1 = p1
        x2, y2 = p2
        cx, cy = self.x, self.y
        r = self.radius
        
        # If segment is basically a point, do standard distance check
        dx = x2 - x1
        dy = y2 - y1
        segment_len_sq = dx*dx + dy*dy
        if segment_len_sq < 1:
            dist_sq = (x1 - cx)**2 + (y1 - cy)**2
            return dist_sq <= r*r
            
        # Parametric intersection line t in [0, 1]
        t = ((cx - x1) * dx + (cy - y1) * dy) / segment_len_sq
        t = max(0, min(1, t)) # Constrain to segment length
        
        closest_x = x1 + t * dx
        closest_y = y1 + t * dy
        
        dist_sq = (closest_x - cx)**2 + (closest_y - cy)**2
        
        if dist_sq <= r*r:
            self.sliced = True
            # Compute angle of the slice path
            self.slice_angle = math.atan2(dy, dx)
            return True
            
        return False


class SplashParticle:
    """Juice and Spark particles emitted on slices and bombs."""
    def __init__(self, x, y, color, is_spark=False):
        self.x = x
        self.y = y
        self.color = color
        self.is_spark = is_spark
        
        # Random vector direction
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
            # Draw bright speed-stretched sparks as high velocity flame lines
            color_spark = (255, random.randint(150, 255), 50)
            thickness = max(1, int(self.radius * 0.8))
            px = int(self.x - self.vx * 0.35)
            py = int(self.y - self.vy * 0.35)
            cx = int(self.x)
            cy = int(self.y)
            pygame.draw.line(screen, color_spark, (px, py), (cx, cy), thickness)
        else:
            # Draw highly optimized juice splat with physical speed stretching and background fade lerping
            thickness = max(2, int(self.radius * 1.5))
            px = int(self.x - self.vx * 0.35)
            py = int(self.y - self.vy * 0.35)
            cx = int(self.x)
            cy = int(self.y)
            
            # Linear interpolation towards background slate color (16, 16, 20)
            ratio = max(0.0, min(1.0, self.alpha / 255.0))
            r = int(self.color[0] * ratio + 16 * (1.0 - ratio))
            g = int(self.color[1] * ratio + 16 * (1.0 - ratio))
            b = int(self.color[2] * ratio + 20 * (1.0 - ratio))
            faded_color = (max(0, min(255, r)), max(0, min(255, g)), max(0, min(255, b)))
            
            pygame.draw.line(screen, faded_color, (px, py), (cx, cy), thickness)
