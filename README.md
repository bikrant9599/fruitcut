# Gesture Fruit Slice: Dual-Architecture Sandbox

A modern, highly-polished **Gesture-Controlled Fruit Slicing Game** implementing high-performance client-side computer vision. This project features two fully-operational application structures:
1. **Interactive Web Sandbox**: React 18 & Vite SPA, utilizing MediaPipe Hands inside the browser with lightweight canvas rendering, interactive audio, score tracking, combo trackers, and screen shaking.
2. **Local Python Execution Engine**: Object-Oriented Pygame & MediaPipe computer vision application, complete with a procedural sound synthesizer, background looping soundtracks, live web feeds, and sub-frame segment collision routines.

Both architectures incorporate **Automatic Fallback tracking modes** (capturing relative mouse positioning) if webcam access permissions are blocked or unavailable on the player's hardware.

---

## 🎨 Design Philosophy & Features

- **Jitter-Smoothing Filters**: Implements Exponential Moving Average (EMA) filters to convert volatile hand markers into buttery-smooth slicing arcs.
- **Parametric Segment Collisions**: To support high-speed chops, collision checking evaluates quadratic line sweeps between preceding steps instead of a single dot projection, ensuring no flying fruit slips past the blade.
- **Retro Arcade Micro-Interactions**: Features camera-shake translations on bomb detonations, cascading float popups, slice multiplier combos, and sparkling ember particles.
- **Zero-Dependency Audio Synthesizers**: Procedural oscillator synthesis generates slice sweeps, launching pops, game-over arpeggios, and low-frequency bomb rumbles instantly on runtime, removing external asset loading issues entirely.

---

## 📂 Project Structure

```bash
├── main.py              # Central local game launcher entrypoint
├── game.py              # Master Pygame event and state loop coordinates
├── hand_tracker.py      # OpenCV camera thread and MediaPipe skeleton tracker wrapper
├── fruit.py             # Physics, gravity, semi-circle splitting halves, & particles
├── pygame_sound.py      # Numerical Numpy-based procedural audio synthesizer
├── requirements.txt     # Python environment requirements manifest
├── src/				 
│   ├── App.tsx          # Dual-viewer layout panel and system analytics
│   ├── components/      
│   │   ├── FruitNinjaGameWeb.tsx # Optimized HTML5 Canvas Web Sandbox game component
│   │   └── PythonCodeViewer.tsx  # Dynamic interactive companion code viewing browser
│   ├── types.ts         # Central TypeScript shape declarations
│   └── utils/
│       └── SoundEngine.ts        # Browser synthesis and audio manager
└── package.json         # React dev client build automation scripts
```

---

## 🚀 Running the Interactive Web Game

The React platform compiles into a production single page application ready to run on any desktop browser.

### Installation & Client Startup:
1. Navigate to your sandbox repository directory.
2. Install base Node dependencies:
   ```bash
   npm install
   ```
3. Boot the local development server:
   ```bash
   npm run dev
   ```
4. Access the server by opening your browser to `http://localhost:3000`.

---

## 🐍 Running the Python CV Game Locally

Executing the Python computer vision wrapper on your local machine unlocks high-definition cameras, physical threads, and native GPU-accelerated skeleton trackers.

### Requirements:
- **Python 3.8+**
- A connected **Webcam** (USB or integrated)

### Installation Guide:

1. **Clone or Export Workspace**: Ensure all files (`main.py`, `game.py`, `fruit.py`, `hand_tracker.py`, `pygame_sound.py`) exist in a local folder.
2. **Configure Virtual Environment**:
   * **Windows**:
     ```bash
     python -m venv venv
     venv\Scripts\activate
     ```
   * **macOS / Linux**:
     ```bash
     python3 -m venv venv
     source venv/bin/activate
     ```
3. **Install Dependencies**:
   ```bash
   pip install -r requirements.txt
   ```
4. **Boot the Wrapper**:
   ```bash
   python main.py
   ```

### Gameplay Controls:
- **Gestures**: Stand back slightly, present your hand to the camera, and wave your **index finger tip** to chop.
- **Mouse Controls**: If you shut your camera, drag or click your left mouse button to draw cutting lines.
- **Sound Systems**:
  - `M` / Mouse Click: Toggle sound effects and looping music mixers.
  - `UP`/`DOWN` Arrows: Adjust loop background tracks volume indices.
  - `+`/`-` Keys: Adjust slice and explosion sound waves volumes.
- **Pause & Resume**: Press `SPACE`, `P`, or `ESC` keys on your keyboard.

---

## ⚙️ Core Technical Logic Walkthrough

### 1. Vector Spanning Intersection Check (`check_slice`):
To prevent high-velocity fingertip moves from skipping over circles, a parametric segment distance check is executed. By setting line segment bounds $t \in [0, 1]$, we locate the coordinates closest to the circle's center:
```python
dx = x2 - x1
dy = y2 - y1
t = ((cx - x1) * dx + (cy - y1) * dy) / (dx*dx + dy*dy)
t = max(0, min(1, t))
closest_x = x1 + t * dx
closest_y = y1 + t * dy
```
If distance squared to the circle center is less than $r^2$, a clean slice registers, cutting the fruit into two separate arcs:
```python
self.slice_angle = math.atan2(dy, dx)
```

### 2. High-Performance Throttling (Web Sandbox):
To handle heavy camera feeds without decreasing the canvas framing rate ($60\text{ FPS}$), the web analyzer limits index pointer evaluations of MediaPipe Hands to $25\text{ FPS}$ using performance time buffers:
```typescript
const now = performance.now();
if (now - lastFrameTimeRef.current < 40) return; // limit to 25 FPS tracking
if (isProcessingHandRef.current) return;
```

---

*Developed with Pygame, MediaPipe, OpenCV, React, and Tailwind CSS.*
