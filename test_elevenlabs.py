import sys
import os
import numpy as np
import wave

# Add hyprwhspr lib to path
sys.path.insert(0, '/home/kaizen/hyprwhspr/lib')
from src.whisper_manager import WhisperManager
from src.config_manager import ConfigManager

print("Initializing WhisperManager...")
config = ConfigManager()
manager = WhisperManager(config_manager=config)

if not manager.initialize():
    print("Failed to initialize WhisperManager")
    sys.exit(1)

print("Manager initialized. Backend:", manager.get_backend_info())

# Generate dummy audio (1 second of 440Hz sine wave)
sample_rate = 16000
duration = 1.0
t = np.linspace(0, duration, int(sample_rate * duration), False)
audio_data = np.sin(2 * np.pi * 440 * t).astype(np.float32)

print("Transcribing dummy audio...")
result = manager.transcribe_audio(audio_data, sample_rate)
print("Result:", result)
