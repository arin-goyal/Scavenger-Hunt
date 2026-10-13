# SCAVENGER // YOLO AR Object Hunt

A minimalist, responsive Augmented Reality Scavenger Hunt game where players solve riddles and locate real-world everyday objects using their device camera and real-time **YOLOv8** computer vision.

---

## Features

- **Strict YOLOv8 Object Detection**: Uses `ultralytics` YOLOv8 nano model (`yolov8n.pt`) with real-time inference (~80-120ms latency on CPU), identifying everyday objects (`cup`, `bottle`, `book`, `cell phone`, `scissors`, `mouse`, `keyboard`, `backpack`, `chair`, `clock`, etc.).
- **5 Dynamic Rounds**: Each game session generates 5 non-repeating riddle challenges.
- **Dual Riddle Engine**:
  - **Curated Offline AI Catalog**: 50+ tested poetic riddles with 2-tier progressive hints that work 100% out of the box with zero setup or API keys required.
  - **GenAI Integration**: Optional free Google Gemini (`gemini-1.5-flash`) or Groq (`llama-3.1-8b-instant`) API key integration for infinite dynamic riddle generation.
- **X-Ray Scan Mode**:
  - Live HUD toggle (`[ 👁 X-RAY: ON / OFF ]`).
  - When enabled, draws technical bounding boxes around all detected objects with confidence percentages.
  - Highlights target objects in vibrant tactical emerald (`🎯 TARGET: CUP 88%`) while rendering background objects in subtle mono outlines.
- **Tactile Point System**:
  - Base points: `1,000 pts` per successful object location.
  - Time speed bonus: `+15 pts/sec` remaining on the countdown clock.
  - Clean solve bonus: `+200 pts` for locating the item without using hints.
  - Hint 1 penalty: `-150 pts` (contextual clue).
  - Hint 2 penalty: `-250 pts` (direct appearance/location clue).
  - Skip / Timeout: `0 pts` (reveals the object and advances).
  - Final Detective Rank: (*Master Detective*, *Eagle Eye*, *Keen Observer*).
- **Procedural Sound Effects**: Synthesized audio via Web Audio API (camera shutter, target lock-on tone, victory chimes, countdown ticks, hints)—zero external audio assets or network requests.
- **Mobile-First Scandinavian Aesthetic**: High-contrast, clean, tactile typography, avoiding generic AI glow gradients or cluttered cards.

---

## Quick Start

### 1. Requirements
- Python 3.10+
- Webcam or mobile browser with camera access

### 2. Run Locally
```bash
python run.py
```

The launcher starts HTTPS by default and prints a desktop URL and a phone URL. Use the **HTTPS** phone URL on the same Wi-Fi network:
```
 -> Desktop Browser:      https://localhost:8000
 -> Mobile Phone (HTTPS): https://192.168.x.x:8000
```

### 3. Open in Browser
- On your computer: Open `https://localhost:8000`
- On your phone (same Wi-Fi): Open `https://<your-lan-ip>:8000`
- The first visit uses a locally generated, self-signed certificate. Accept the browser's certificate warning to continue, then allow camera access when prompted.
- Do not use the `http://<your-lan-ip>:8000` address on a phone. Mobile browsers block camera access on plain HTTP, so the permission prompt will not appear. If you see a blank or virtual camera view, check the address bar and use the HTTPS URL printed by the launcher.

## Deploy to Railway

The repository includes `railway.json` with the production start command and `/api/health` health check. To publish it:

1. Push this repository to GitHub.
2. In Railway, create a project and choose **Deploy from GitHub repo**. Connect GitHub and select `arin-goyal/Scavenger-Hunt`.
3. Wait for the first deployment to finish, then open the service's **Settings → Networking** and choose **Generate Domain**. Railway's HTTPS domain allows mobile browsers to request camera access.
4. Optional: add `GEMINI_API_KEY` or `GROQ_API_KEY` under the service's **Variables** to enable generated riddles. Without these, the curated offline riddles work as usual.

The AI key settings endpoint is disabled by default because it changes credentials shared by the whole server. Configure keys as Railway variables instead. Do not enable `ENABLE_RUNTIME_AI_SETTINGS` on a public deployment.

Railway deploys automatically from the connected GitHub branch when new commits are pushed.

## Deploy to Google Cloud Run

The repository includes a Dockerfile that listens on Cloud Run's injected `PORT` and bundles the YOLO weights. In Google Cloud Console, open **Cloud Run → Services → Connect repo**, connect GitHub, and select this repository and the `main` branch. Select **Dockerfile** as the build type, choose a region, and enable **Allow public access** so anyone can play. Start with 2 vCPU, 2 GiB memory, minimum instances 0, maximum instances 1, and concurrency 1; these limits keep the first deployment modest and prevent uncontrolled scaling. Cloud Run provides HTTPS automatically.

Cloud Run is pay-as-you-go with monthly free usage allowances, not a guaranteed no-charge host. Inference requests may use CPU, and usage beyond the free allowance or other Google Cloud services can be billed. Check billing and set budget alerts in Google Cloud before making the service public. Google documents source-repository deployment in its [Cloud Run continuous deployment guide](https://cloud.google.com/run/docs/continuous-deployment) and current allowances in [Cloud Run pricing](https://cloud.google.com/run/pricing).

---

## Project Structure

```
Scavenger Hunt/
├── app/
│   ├── detector.py      # Ultralytics YOLOv8 detector singleton, fast frame inference
│   ├── riddles.py       # Curated riddle database + Gemini/Groq GenAI integration
│   ├── game_state.py    # Game session state machine, 5-round tracking, scoring
│   └── main.py          # FastAPI application, static file serving, detection routes
├── static/
│   ├── index.html       # Semantic HTML5 layout (Landing, Game HUD, Result, Scorecard)
│   ├── css/
│   │   └── style.css    # Clean, tactile, minimalist CSS design system
│   └── js/
│       ├── audio.js     # Web Audio API synthesizer for tactile sound feedback
│       ├── camera.js    # WebRTC camera manager (rear/front flip, torch, stream sampling)
│       ├── detection.js # Frame streaming loop, X-Ray canvas drawing, target lock-on
│       └── app.js       # Game UI state machine, riddle presenter, timers, modals
├── yolov8n.pt           # YOLOv8 nano model weights (~6.5MB)
├── requirements.txt     # Python dependencies
└── run.py               # Launcher script with automatic LAN IP resolution
```

---

## How to Play

1. Click **Start Game** on the home screen.
2. Read the riddle describing an everyday item in your room or desk.
3. If you get stuck, unlock **Hint 1** or **Hint 2** (at the cost of small point deductions), or choose **Skip**.
4. Frame the target object in your camera viewfinder.
5. Once YOLO detects the item, the viewfinder will lock on, take a photo snapshot, and award you points based on your speed and accuracy!
6. Toggle **X-Ray Mode** at any time to see everything the AI detects in real-time.
