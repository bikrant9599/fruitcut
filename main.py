"""
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
        print("\n" + "="*50)
        print("ERROR: Missing Required Libraries!")
        print("Please resolve missing packages to play the local Pygame version:")
        for pkg in missing:
            print(f" - {pkg}")
        print("\nQuick Fix: Run 'pip install -r requirements.txt'")
        print("="*50 + "\n")
        return False
    return True

if __name__ == "__main__":
    if check_dependencies():
        print("\n" + "="*60)
        print("🚀 GESTURE FRUIT SLICE: LOCAL PYGAME LAUNCHER 🚀")
        print("="*60)
        print("Slicing Mechanics:")
        print(" - Waves of fruits and bombs fly up from the bottom of the screen.")
        print(" - Move your index finger tip in front of the camera to slice.")
        print(" - Missing fruits adds a strike (❌). Slicing bombs triggers a penalty.")
        print(" - 3 strikes or bomb expiration triggers GAME OVER.")
        print(" - Fail-safe: No webcam? Simply drag or click your mouse to chop!")
        print("\nLoading Graphics & Trackers... Please wait...\n")
        
        try:
            from game import FruitNinjaGame
            game_instance = FruitNinjaGame()
            game_instance.run()
        except Exception as e:
            print(f"\n[FATAL ERROR] Game execution failed: {e}")
            print("Please ensure your webcam is not locked by another application.")
            sys.exit(1)
    else:
        sys.exit(1)
