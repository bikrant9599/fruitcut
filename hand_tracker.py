"""
Hand Tracking Module for Gesture Fruit Slice Game.
Encapsulates MediaPipe Hands detection in a clean, reusable OOP interface.
Includes an standalone runner block for quick webcam testing when run directly.
"""
import cv2
import mediapipe as mp

class HandTracker:
    def __init__(self, static_mode=False, max_hands=1, detection_confidence=0.7, tracking_confidence=0.7):
        """
        Initializes the MediaPipe Hands model with performance configurations.
        
        Args:
            static_mode: Set to False for video streams to tracking positions sequentially. 
                         Treating tracking as continuous video provides significant speedups.
            max_hands: Set to 1 to reduce skeletal processing complexity.
            detection_confidence: High threshold (0.7) to avoid false landmark flags.
            tracking_confidence: Tracking threshold (0.7) to maintain steady tracking once detected.
        """
        # Load MediaPipe Hands solutions packages
        self.mp_hands = mp.solutions.hands
        
        # Configure Hand Tracker parameters for minimized latency
        self.hands = self.mp_hands.Hands(
            static_image_mode=static_mode,
            max_num_hands=max_hands,
            min_detection_confidence=detection_confidence,
            min_tracking_confidence=tracking_confidence
        )
        
        # Helper utilities to draw hand skeletal meshes on screen
        self.mp_draw = mp.solutions.drawing_utils
        self.results = None

    def find_hands(self, frame, draw=True):
        """
        Processes an image frame to detect hands. Optionally draws landmarks on the frame.
        
        Args:
            frame: OpenCV BGR image frame.
            draw: Boolean flag whether to draw landmarks on the frame.
            
        Returns:
            The raw BGR frame (with landmarks drawn if requested).
        """
        # OPTIMIZATION: MediaPipe expects RGB format, but OpenCV captures in BGR.
        # Converting color space before processing is necessary for valid landmark recognition.
        rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        
        # Run inference using the MediaPipe model
        self.results = self.hands.process(rgb_frame)
        
        # If landmarks are found, draw the lines on the debug stream
        if draw and self.results.multi_hand_landmarks:
            for hand_landmarks in self.results.multi_hand_landmarks:
                self.mp_draw.draw_landmarks(
                    frame, 
                    hand_landmarks, 
                    self.mp_hands.HAND_CONNECTIONS,
                    self.mp_draw.DrawingSpec(color=(0, 255, 100), thickness=2, circle_radius=3), # Green connections
                    self.mp_draw.DrawingSpec(color=(0, 0, 255), thickness=2, circle_radius=2)     # Red joints
                )
        return frame

    def get_index_finger_tip(self):
        """
        Extracts the normalized coordinates of the index finger tip (landmark index 8).
        
        Returns:
            A tuple of (x, y) normalized coordinates between [0.0, 1.0], or None if no hand is detected.
        """
        if self.results and self.results.multi_hand_landmarks:
            # Grab coordinates of primary hand indexed
            primary_hand = self.results.multi_hand_landmarks[0]
            
            # Extract LANDMARK 8: INDEX_FINGER_TIP
            index_tip = primary_hand.landmark[self.mp_hands.HandLandmark.INDEX_FINGER_TIP]
            
            # Return raw relative coordinates (x, y) as floats in range [0.0, 1.0]
            return index_tip.x, index_tip.y
        return None


# =====================================================================
# STANDALONE TESTING UTILITY
# Run "python hand_tracker.py" directly to verify your tracking stream
# =====================================================================
if __name__ == "__main__":
    print("\n" + "="*60)
    print("🎥 HAND TRACKER DIAGNOSTIC UTILITY 🎥")
    print("="*60)
    print("Press 'Q' to quit and close the diagnostic window.\n")
    
    # Initialize OpenCV webcam
    cap = cv2.VideoCapture(0)
    if not cap.isOpened():
        print("[ERROR] Could not open webcam structure. Ensure camera is plugged in.")
        exit(1)
        
    # Optimize camera capture stream buffer sizes for live preview
    cap.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)
    
    # Initialize our Hand Tracker class handler
    tracker = HandTracker()
    
    while True:
        ret, frame = cap.read()
        if not ret:
            print("[WARN] Frame capture missed.")
            break
            
        # Flip image horizontally for natural mirroring
        frame = cv2.flip(frame, 1)
        
        # Analyze hand lines
        frame = tracker.find_hands(frame, draw=True)
        
        # Retrieve fingertip telemetry
        coords = tracker.get_index_finger_tip()
        if coords:
            # Map normalized float coordinates window width/height bounds
            h, w, _ = frame.shape
            pixel_x = int(coords[0] * w)
            pixel_y = int(coords[1] * h)
            
            # Draw targeting circle on index finger tip
            cv2.circle(frame, (pixel_x, pixel_y), 15, (0, 255, 255), 3)
            
            # Print feedback to debug stream console
            log_str = f"INDEX FINGER TIP TRACKED: X={pixel_x:03d} | Y={pixel_y:03d}"
            cv2.putText(frame, log_str, (15, 35), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 255, 255), 2)
            print(f"\r{log_str}", end="", flush=True)
        else:
            cv2.putText(frame, "SEARCHING HAND SKELETON...", (15, 35), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 0, 255), 2)
            
        # Present live frame window
        cv2.imshow("Hand Tracker Diagnostic Interface - Press Q to Quit", frame)
        
        # Press q or Esc to cleanly stop stream loops
        if cv2.waitKey(1) & 0xFF == ord('q'):
            break
            
    # Clean up operations
    cap.release()
    cv2.destroyAllWindows()
    print("\n\nDiagnostic loop stopped and closed successfully!")
