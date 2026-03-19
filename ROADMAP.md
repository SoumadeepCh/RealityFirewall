# Reality Firewall 🛡️

> **Forensic-grade deepfake and AI media detection.**
> Multi-layer authenticity analysis for images, video, and audio — with explainability, virality risk scoring, and a real-time browser extension.

---

## Table of Contents

1. [What it does](#what-it-does)
2. [System Architecture](#system-architecture)
3. [Project Structure](#project-structure)
4. [Detection Pipeline — How it Works](#detection-pipeline--how-it-works)
5. [Scoring & Calibration](#scoring--calibration)
6. [Explainability Layer](#explainability-layer)
7. [Virality & Risk Engine](#virality--risk-engine)
8. [Browser Extension](#browser-extension)
9. [Frontend Design](#frontend-design)
10. [How Training Works](#how-training-works)
11. [How the System Improves Over Time](#how-the-system-improves-over-time)
12. [Running Locally](#running-locally)
13. [Environment Variables](#environment-variables)
14. [API Reference](#api-reference)
15. [Roadmap](#roadmap)

---

## What it does

Reality Firewall detects whether an image, video, or audio file has been synthetically generated or manipulated. It answers three questions:

| Question | Output |
|---|---|
| Is this real or fake? | Fake probability (0–100%) + verdict |
| Why does it look fake? | AMAF forensic feature vector + AI explanation |
| How dangerous is it? | Virality score + misinformation risk + societal impact |

It is **not** a binary "fake detector". It is a **forensic analysis system** that layers multiple independent signals, calibrates them, and explains its reasoning.

---

## System Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    User / Browser                       │
│   Web App (Next.js)          Chrome Extension (MV3)     │
└────────────┬───────────────────────────┬────────────────┘
             │  HTTP (multipart/upload)  │  fetch + badge overlay
             ▼                           ▼
┌─────────────────────────────────────────────────────────┐
│              FastAPI AI Service  (Python)                │
│                                                         │
│  POST /analyze  ──►  Pipeline Orchestrator              │
│  POST /retrain  ──►  Meta-Classifier Trainer            │
│  GET  /logs     ──►  Forensic Log Store (JSONL)         │
│  GET  /cache/stats ► LRU Fingerprint Cache              │
└───────────┬─────────────────────────────────────────────┘
            │
            ▼
┌─────────────────────────────────────────────────────────┐
│              AMAF Detection Pipeline                    │
│                                                         │
│  Layer 1 → Media Router (type detection + routing)      │
│  Layer 2 → Feature Extractors (7 independent modules)   │
│  Layer 3 → Pretrained Model Inference (EfficientNet-B4) │
│  Layer 4 → Meta-Classifier (LightGBM)                   │
│  Layer 5 → Signal Boost + Calibration                   │
│  Layer 6 → Virality Engine + LLM Explanation             │
└─────────────────────────────────────────────────────────┘
```

**Key design principle**: No single signal decides anything. Every verdict is a calibrated combination of forensic features + model outputs + signal confidence.

---

## Project Structure

```
realityfirewall/
│
├── app/                          # Next.js pages (App Router)
│   ├── page.tsx                  # Landing page
│   ├── analyze/page.tsx          # Upload + analysis flow
│   ├── results/page.tsx          # Full results view (Phase 7)
│   ├── investigation/page.tsx    # Frame viewer + evidence explorer (Phase 7)
│   └── dashboard/page.tsx        # Metrics + forensic log viewer
│
├── components/ui/
│   ├── AuthenticityMeter.tsx     # Gauge for fake probability
│   ├── RiskMeter.tsx             # Risk score bar
│   ├── HeatmapPanel.tsx          # Frequency anomaly canvas heatmap (Phase 4)
│   ├── VitalityCard.tsx          # Virality score + societal impact (Phase 6)
│   ├── Badge.tsx                 # Risk level badge
│   ├── Card.tsx                  # Base card component
│   ├── Navbar.tsx                # Global navigation
│   └── Button.tsx                # Styled button
│
├── lib/
│   ├── types.ts                  # All TypeScript interfaces
│   ├── mock-data.ts              # Mock data for UI development
│   └── utils.ts                  # Utility functions
│
├── extension/                    # Chrome MV3 Extension (Phase 8)
│   ├── manifest.json
│   ├── background.js             # Context menu + AI service relay
│   ├── content.js                # DOM badge injector
│   ├── styles/overlay.css        # Badge styling
│   ├── icons/                    # 16/48/128px icons
│   └── popup/
│       ├── popup.html            # Extension popup UI
│       └── popup.js              # Settings + health check + retrain
│
└── ai-service/                   # Python FastAPI backend
    ├── main.py                   # App entry + endpoints + LRU cache
    ├── pipeline.py               # Analysis pipeline orchestrator
    ├── schemas.py                # Pydantic response models
    ├── config.py                 # Tunable parameters (thresholds, baselines)
    ├── virality.py               # Phase 6 virality + risk engine
    ├── llm_explanation.py        # Phase 4 Gemini / rule-based explanations
    ├── media_router.py           # Media type detection + routing
    ├── logging_service.py        # JSONL forensic log + stats
    ├── train_meta.py             # Standalone training script
    │
    ├── feature_extractors/
    │   ├── frequency.py          # HFER — High Frequency Energy Ratio
    │   ├── texture.py            # PDI — Patch Drift Index
    │   ├── noise_analysis.py     # Noise residual analysis
    │   ├── face_detector.py      # MTCNN / OpenCV face detection
    │   ├── identity.py           # ArcFace identity drift (SVD proxy)
    │   ├── audio.py              # PVSS, FRD — spectral audio features
    │   ├── optical_flow.py       # FAV — optical flow acceleration variance
    │   └── metadata.py           # EXIF + compression anomaly scoring
    │
    ├── models/
    │   ├── deepfake_classifier.py  # EfficientNet-B4 deepfake probability
    │   └── audio_spoof_detector.py # Audio spoof probability
    │
    ├── ensemble/
    │   ├── meta_classifier.py    # LightGBM meta-classifier (train + predict)
    │   └── scoring.py            # Weighted ensemble + Platt scaling + signal boost
    │
    └── model_weights/
        ├── meta_classifier.lgb   # Trained LightGBM model
        └── meta_classifier_meta.json  # Training metrics + feature importance
```

---

## Detection Pipeline — How it Works

Every uploaded file goes through a 6-layer pipeline:

### Layer 1 — Media Router
Detects MIME type and routes to the correct sub-pipeline:
- **Image** → full spatial analysis
- **Video** → frame extraction (1 fps adaptive) + per-frame analysis + temporal layer
- **Audio** → spectrogram analysis + spoof detection

### Layer 2 — Feature Extractors (AMAF Framework)

Seven independent forensic modules each produce a scalar feature:

| Feature | Symbol | What it measures | Deepfake signature |
|---|---|---|---|
| High Frequency Energy Ratio | HFER | Energy in high-freq DCT bins | GAN generators suppress high-freq detail |
| Spectral Variance Deviation | SVD | Variance across frequency bands | GANs produce abnormally uniform spectra |
| Patch Drift Index | PDI | Block-level texture inconsistency | Seam artifacts at manipulation boundaries |
| Energy Transition Kurtosis | ETK | Sharpness of energy transitions | GAN artifacts cause sharp spectral jumps |
| Pitch Variance Smoothness | PVSS | Stability of fundamental frequency | TTS voices are overly smooth |
| Spectral Flatness Deviation | FRD | Deviation from white-noise flatness | Codec fingerprints absent in AI audio |
| Flow Acceleration Variance | FAV | Frame-to-frame optical flow variance | Deepfake videos have inconsistent motion fields |

### Layer 3 — Pretrained Model Inference

- **EfficientNet-B4** fine-tuned for deepfake classification → outputs `deepfake_prob` (0–1)
- **Identity drift** via ArcFace-style embedding comparison → outputs `identity_drift`
- **Audio spoof probability** from spectrogram classifier → outputs `audio_spoof_prob`
- **Noise residual analysis** → suppresses natural texture variance, exposes GAN noise patterns; outputs `noise_score`
- **GAN spectral fingerprint** → detects peak patterns at specific JPEG grid frequencies; outputs `spectral_peak_score`

### Layer 4 — Meta-Classifier (LightGBM)

All 14 features are assembled into the **AMAF feature vector**:

```python
feature_vector = {
    "deepfake_prob", "audio_spoof_prob", "identity_drift",
    "hfer", "svd", "pdi", "etk", "pvss", "frd",
    "metadata_score", "noise_score", "spectral_peak_score",
    "fav", "frame_consistency"
}
```

This is passed to a **trained LightGBM gradient-boosted classifier** which outputs a single calibrated fake probability. LightGBM handles missing features (`-1` sentinel) natively, so image-only inputs with `audio_spoof_prob = None` are handled correctly.

### Layer 5 — Calibration + Signal Boost

```
final_probability = (1 - 0.35) × meta_output + 0.35 × signal_confidence_avg
```

The **signal boost** prevents the meta-classifier from silently overriding strong forensic evidence. If any signals fired above 40% confidence, their average is blended at 35% weight into the final score.

Then **Platt scaling** maps the raw score to a calibrated probability:
```
P(fake) = sigmoid(2.5 × raw_score + 0.0)
```

Risk classification:

| Probability | Risk Level | Verdict |
|---|---|---|
| 0.00 – 0.28 | `low` | Authentic |
| 0.28 – 0.35 | `suspicious` | Suspicious |
| 0.35 – 0.65 | `inconclusive` | — |
| 0.65 – 0.78 | `harmful` | Manipulated |
| 0.78 – 1.00 | `high_risk` | Manipulated |

### Layer 6 — Virality Engine + LLM Explanation

See dedicated sections below.

---

## Scoring & Calibration

### Why calibration matters

A raw model score of 0.75 does not mean "75% chance of being fake" unless the model is calibrated. The pipeline uses two calibration mechanisms:

**Platt scaling** — a learned sigmoid transform. Parameters `A=2.5, B=0.0` ensure the output is a meaningful probability, not just a ranking score.

**False positive governance** — results between 0.35–0.65 are classified `inconclusive` rather than forced into a binary verdict. This widens the zone of uncertainty, reducing false positives at the cost of occasionally withholding a verdict.

### Calibration tuning

Adjust in `ai-service/config.py`:
```python
PLATT_A = 2.5           # Steepness of sigmoid transform
PLATT_B = 0.0           # Offset (positive = more fake-biased)
INCONCLUSIVE_LOW = 0.35  # Lower edge of inconclusive zone
INCONCLUSIVE_HIGH = 0.65 # Upper edge
SIGNAL_BOOST_WEIGHT = 0.35  # How much signals override the meta-classifier
SIGNAL_BOOST_THRESHOLD = 0.4 # Minimum signal confidence to trigger boost
```

After changing these values, call `POST /retrain` to retrain the meta-classifier with fresh synthetic data under the new parameters.

---

## Explainability Layer

### Frequency Anomaly Heatmap (Phase 4)

The `HeatmapPanel` component renders a canvas-based visualization of forensic frequency signals using the AMAF feature vector:

- **Energy rings** pulse based on HFER (High Frequency Energy Ratio)
- **Anomaly hotspots** appear at typical deepfake artifact zones (forehead, jawline, neck) weighted by PDI and overall fake probability
- **SVD grid overlay** fades in when spectral variance deviation is high
- Color gradient: green → amber → red encoding risk level

> This is a *forensic signal visualization*, not pixel-level saliency. Pixel-level Grad-CAM would require the full EfficientNet model to run server-side (possible future upgrade).

### AI Forensic Explanation (Phase 4)

Every analysis generates a natural-language explanation from `llm_explanation.py`:

- **If `GEMINI_API_KEY` is set**: Uses Google Gemini (`gemini-1.5-flash`) to synthesize all signal data into a fluent forensic report
- **Without API key**: A high-quality rule-based fallback always generates a two-paragraph explanation covering the verdict, top signals, and virality context

---

## Virality & Risk Engine

### Virality Score (Phase 6)

A 0–100 composite score estimating how likely a piece of media is to spread and amplify harm:

```
virality_score = base_score × media_type_multiplier × signal_amplifier
```

- `base_score` = fake_probability × 60
- `media_type_multiplier`: video ×1.4, audio ×1.2, image ×1.0
- `signal_amplifier`: scales with count + severity of fired signals

### Misinformation Risk Categories

| Category | Threshold | Description |
|---|---|---|
| `low` | < 25 | Minimal spread risk |
| `suspicious` | 25–50 | Worth monitoring |
| `harmful` | 50–70 | Active harm potential |
| `high_risk` | > 70 | Requires immediate attention |

### Societal Impact Model

Three independent metrics:

- **Polarization Potential**: How likely to deepen tribal divides (driven by political sensitivity + identity deepfakes)
- **Panic Potential**: How likely to cause public panic (driven by alarming signals + virality)
- **Reputation Damage Likelihood**: Probability of harm to an individual's reputation (driven by identity drift + face manipulation)

---

## Browser Extension

The Chrome extension (MV3) enables one-click analysis of any media on any web page.

### Installation
1. Open `chrome://extensions`
2. Enable **Developer Mode**
3. **Load unpacked** → select the `extension/` folder
4. The Reality Firewall icon appears in the toolbar

### Usage
- **Right-click any image** → *"🔍 Analyze with Reality Firewall"*
- A badge appears directly on the image:

  | Badge | Meaning |
  |---|---|
  | ✓ Authentic | Fake probability < 35% |
  | ⚠ Suspicious | 35–65% |
  | ✗ Manipulated | > 65% |
  | ◈ Inconclusive | Decision withheld |

- **Hover** the badge for a detailed tooltip (fake probability, risk level, manipulation type)
- **Click** the badge to open the full investigation dashboard

### Auto-scan mode
Toggle in the popup to automatically analyze the 5 largest images on every page load. Off by default to avoid unnecessary API calls.

### Popup features
- Live service health indicator (green/red dot)
- Total analyses + threats detected from your local AI service
- Configurable AI service URL (for remote deployment)
- One-click **Retrain Model** button with live AUC feedback

---

## Frontend Design

### Pages

| Route | Purpose |
|---|---|
| `/` | Landing page |
| `/analyze` | Upload file + analysis progress + results redirect |
| `/results` | Full forensic report: heatmap, feature vector, virality card, signals, AI explanation |
| `/investigation` | Deep-dive: frame viewer, SVG authenticity timeline, evidence accordion |
| `/dashboard` | Metrics overview + forensic logs tab (live from `/logs` endpoint) |

### Design system
- **Color palette**: Deep navy (`#050510`) background, teal green (`#06d6a0`) authentic, amber (`#fbbf24`) suspicious, red (`#ff4d6d`) manipulated, purple (`#7b61ff`) UI accents
- **Typography**: System sans-serif stack, monospace for numeric forensic values
- **Components**: All custom, zero UI framework dependency on the component level

---

## How Training Works

The meta-classifier (`ensemble/meta_classifier.py`) is a **LightGBM gradient-boosted binary classifier** trained to distinguish real vs. fake media from the 14-dimensional AMAF feature vector.

### Training data

Currently uses **synthetic training data** (bootstrap approach). Real and fake sample distributions are designed by domain knowledge:

**Real samples** are drawn from Beta distributions that naturally produce low forensic scores:
```python
deepfake_prob  ~ Beta(2, 6)   # Peaks around 0.20–0.35
hfer           ~ Beta(5, 3)   # Higher is real (natural hi-freq content)
noise_score    ~ Beta(2, 8)   # Low consistent noise
```

**Fake samples** use overlapping distributions that are elevated but not perfectly separable:
```python
deepfake_prob  ~ Beta(5, 3)   # Peaks around 0.55–0.70
hfer           ~ Beta(2, 5)   # Lower (GAN suppresses hi-freq)
noise_score    ~ Beta(5, 3)   # Elevated
```

Both are clipped to `[0, 1]`, augmented with ±5% Gaussian noise, and 15% of values are randomly set to `-1` (missing, as LightGBM handles natively).

### Training parameters (regularized to prevent overfit)

```python
num_leaves = 15           # Low complexity
num_boost_round = 80      # Stops before memorizing
min_child_samples = 20    # Min samples per leaf
lambda_l1 = 0.1           # L1 regularization
lambda_l2 = 0.1           # L2 regularization
feature_fraction = 0.7    # Stochastic feature selection
```

### Triggering a retrain

```bash
# Via API
curl -X POST "http://localhost:8000/retrain?n_samples=5000"

# Via browser extension popup
Click "Retrain Model" button

# Via Python directly
python train_meta.py
```

### What "good" metrics look like

| Metric | Current (synthetic) | Target (real data) |
|---|---|---|
| AUC | ~0.9998 | > 0.85 |
| Accuracy | ~0.996 | > 0.80 |
| FPR @ 0.5 | ~0.002 | < 0.05 |

> ⚠️ High AUC on synthetic data is expected and is **not** a reliable metric. It means the model hasn't overfit badly; it doesn't mean it will generalize perfectly. Real-world accuracy is determined by testing on labeled datasets like FaceForensics++ and Celeb-DF.

---

## How the System Improves Over Time

Reality Firewall is designed to get better the more it is used. There are several built-in mechanisms for this:

### 1. Forensic Log Store

Every analysis is logged to `ai-service/logs/analysis_log.jsonl` containing:

```jsonl
{
  "id": "...",
  "timestamp": "...",
  "filename": "photo.jpg",
  "media_type": "image",
  "fake_probability": 0.72,
  "risk_level": "harmful",
  "verdict": "manipulated",
  "feature_vector": { "hfer": 0.18, "svd": 0.38, ... },
  "processing_time_ms": 1420,
  "media_hash": "sha256:abc123..."
}
```

This log is the foundation for future retraining. When you accumulate enough labeled examples (verified real/fake), you can feed them directly into `train_model(X, y)` to replace synthetic data.

### 2. On-demand Retraining via API

```bash
POST /retrain?n_samples=5000
```

Rebuilds the LightGBM meta-classifier from scratch with updated synthetic distributions. The fingerprint cache is cleared automatically so the new model is immediately effective.

### 3. Fingerprint Cache (Phase 9)

Repeated analysis of the same file returns the cached result instantly (SHA-256 LRU, 500 entries). This means the system scales better under load without recomputing identical results.

### 4. Upgrading from Synthetic to Real Data

The most impactful improvement path:

| Step | Action | Impact |
|---|---|---|
| 1 | Download FaceForensics++ (c23 quality) | ~1000 labeled image pairs |
| 2 | Run `python scripts/extract_dataset_features.py --ff-real ... --ff-fake ... --output ff_features.csv` | Creates real `X` matrix |
| 3 | Run `python train_meta.py --data ff_features.csv` | Replaces synthetic distributions |
| 4 | Place `efficientnet_b4_ff.pth` in `model_weights/` | Switches backbone to fine-tuned binary classifier |
| 5 | Test on Celeb-DF (cross-dataset) | Validates generalization |
| 6 | Adjust `PLATT_A/B` on validation set | Recalibrates probability outputs |

See the full **[Training Guide](docs/training_guide.md)** for step-by-step instructions.

### 5. Adding New Feature Extractors

The pipeline is modular. A new forensic signal is added by:
1. Creating a new module in `ai-service/feature_extractors/`
2. Adding its key to `FEATURE_KEYS` in `meta_classifier.py`
3. Adding a baseline entry in `config.py → FEATURE_BASELINES`
4. Calling `POST /retrain` to incorporate the new feature

### 6. Integrating Real Pretrained Models

Currently, `deepfake_classifier.py` uses an EfficientNet-B4 fine-tuned on synthetic-like data. Replacing it with a model trained on FaceForensics++ (available from the original paper authors) is the highest-leverage upgrade:

```python
# In models/deepfake_classifier.py
# Replace: synthetic weights
# With: FaceForensics++ fine-tuned checkpoint
```

No pipeline changes needed — the feature key `deepfake_prob` stays the same.

### 7. LLM Reasoning Evolution

The explanation layer (`llm_explanation.py`) calls Gemini when `GEMINI_API_KEY` is set. As Gemini models improve (or as you swap in a self-hosted model via Ollama), explanations automatically become more detailed without any code changes.

---

## Running Locally

### Prerequisites
- Python 3.10+ with pip
- Node.js 18+
- (Optional) GPU with CUDA for faster video analysis

### AI Service

```bash
cd ai-service
python -m venv venv
.\venv\Scripts\activate          # Windows
# source venv/bin/activate       # macOS/Linux

pip install -r requirements.txt

# Train the meta-classifier (first run)
python train_meta.py

# Start the service
uvicorn main:app --reload --port 8000
```

### Frontend

```bash
# From project root
npm install
npm run dev
# Open http://localhost:3000
```

### Environment Variables

```bash
# .env.local (frontend)
NEXT_PUBLIC_AI_SERVICE_URL=http://localhost:8000

# ai-service environment (optional)
GEMINI_API_KEY=your_key_here    # Enables Gemini-powered explanations
RF_DEVICE=auto                   # auto | cpu | cuda
RF_MAX_FRAMES=60                 # Max video frames to extract
RF_VIDEO_FPS=1.0                 # Frames per second for video sampling
```

---

## API Reference

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/analyze` | Analyze uploaded media file |
| `GET` | `/health` | Service health + loaded models |
| `GET` | `/stats` | Analysis statistics summary |
| `GET` | `/logs?limit=N&offset=M` | Forensic log entries |
| `POST` | `/retrain?n_samples=N` | Retrain meta-classifier |
| `GET` | `/cache/stats` | LRU fingerprint cache stats |
| `DELETE` | `/cache` | Clear fingerprint cache |

### POST /analyze

```bash
curl -X POST http://localhost:8000/analyze \
  -F "file=@/path/to/image.jpg"
```

Response:
```json
{
  "id": "analysis-1709385600",
  "fake_probability": 0.73,
  "risk_level": "harmful",
  "risk_score": 73,
  "verdict": "manipulated",
  "manipulation_type": "Face Swap / Identity Replacement",
  "explanation": "...",
  "llm_explanation": "...",
  "feature_vector": {
    "hfer": 0.18, "svd": 0.42, "pdi": 0.031,
    "deepfake_prob": 0.68, "noise_score": 0.55, ...
  },
  "signals": [ { "name": "...", "confidence": 0.81, "severity": "harmful" } ],
  "virality_analysis": {
    "virality_score": 64.2,
    "misinformation_risk": "harmful",
    "emotional_polarity": 0.71,
    "societal_impact": {
      "polarization_potential": 0.55,
      "panic_potential": 0.42,
      "reputation_damage_likelihood": 0.78
    },
    "risk_factors": ["High deepfake probability detected", "Identity manipulation suspected"]
  }
}
```

---

## Roadmap

| Phase | Status | Description |
|---|---|---|
| 1–3 | ✅ Complete | AMAF framework, feature extractors, media routing |
| 4 | ✅ Complete | Heatmap visualization, LLM explanation layer |
| 5 | ✅ Complete | LightGBM meta-classifier + calibration |
| 6 | ✅ Complete | Virality engine, misinformation risk, societal impact |
| 7 | ✅ Complete | Investigation mode, frame viewer, evidence explorer |
| 8 | ✅ Complete | Chrome extension (MV3), overlay badges, auto-scan |
| 9 | ✅ Complete | Fingerprint cache, on-demand retrain endpoint |
| 10 | ✅ Complete | Real labeled training data (FaceForensics++, Celeb-DF) — see [Training Guide](docs/training_guide.md) |
| 11 | 🔜 Planned | Adversarial robustness testing |
| 12 | 🔜 Planned | Timeline & origin tracking (reverse image search) |
| 13 | 🔜 Planned | Async video queue (Redis + Celery) for long videos |
| 14 | 🔜 Planned | MongoDB metadata store + S3/ImageKit media storage |
| 15 | 🔜 Planned | Pixel-level Grad-CAM heatmaps (requires GPU backend) |

---

*Reality Firewall is an open research platform. The forensic pipeline is designed to be upgraded incrementally — replace any module with a better one and the system adapts automatically.*
