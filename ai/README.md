# ai/

AutoShort's own AI environment: WhisperX transcription, Silero VAD, rembg, Robust Video Matting.
- Windows: `start.bat` creates `ai/.venv` from `requirements.lock.txt` (CUDA 12.6, needs an NVIDIA GPU).
- macOS: `start.sh` creates it from `requirements.mac.lock.txt` (compiled from `requirements.mac.in`, no CUDA: Apple
  GPU for the matting, CPU for the transcription). `server/jobs/accel.py` picks the device.
Model weights are downloaded once into `ai/models/` (RVM) or the Hugging Face / torch caches (WhisperX, Silero).
