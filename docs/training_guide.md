# Phase 10 — Training with Real Labeled Data

This document explains how to train the Reality Firewall meta-classifier and EfficientNet-B4 backbone
using all four real deepfake datasets: **FaceForensics++**, **Celeb-DF**, **Google DFD**, and **DFDC**.

---

## Overview

Reality Firewall's detection pipeline has two trainable components:

| Component | File | What it does |
|---|---|---|
| **Meta-classifier** | `ensemble/meta_classifier.py` | LightGBM combining all 14 AMAF features — **upgrade this first** |
| **Deepfake backbone** | `models/deepfake_classifier.py` | EfficientNet-B4 binary visual classifier — optional, needs GPU |

---

## Data Storage Layout

> **Rule:** Dataset files must **never** live inside the app repo. Keep them on a dedicated root.

Recommended root: `D:\RFW_Data\` (or `C:\RFW_Data\` if you have a single drive).

```
D:\RFW_Data\
├── FaceForensics++\                          ← downloaded via Python script
│   ├── original_sequences\youtube\c23\videos\     (real)
│   └── manipulated_sequences\
│       ├── Deepfakes\c23\videos\
│       ├── Face2Face\c23\videos\
│       ├── FaceSwap\c23\videos\
│       └── NeuralTextures\c23\videos\
│
├── Celeb-DF\                                 ← download videos here (see below)
│   ├── Celeb-real\
│   └── Celeb-synthesis\
│
├── GoogleDFD\                                ← Kaggle download
│   ├── real\
│   └── fake\
│
├── DFDC\                                     ← Kaggle download (largest, ~470 GB)
│   ├── train\                                    contains dfdc_train_part_XX/ sub-dirs
│   └── test\
│
└── features\                                 ← output CSVs go here
    ├── ff_features.csv
    ├── celebdf_features.csv
    ├── googledfd_features.csv
    ├── dfdc_features.csv
    └── combined_features.csv
```

Add `D:\RFW_Data\` to `.gitignore` if you ever symlink it into the repo; also ensure these patterns stay in `.gitignore`:

```gitignore
# Dataset files — never commit
*.mp4
*.avi
*.zip
*_features.csv
celeb-deepfakeforensics-master/
D:/RFW_Data/
```

---

## Dataset 1 — FaceForensics++

**Status: script ready, data not yet downloaded.**

### Access

Request access at: https://github.com/ondyari/FaceForensics  
You will receive a download password by email. The script (`download-FaceForensics.py`) is already in the repo root.

### Download

Run from the repo root (PowerShell):

```powershell
# c23 = H.264 compressed (recommended balance of size vs quality)
# Downloads all manipulation methods + original videos (~90 GB for c23 videos)
python download-FaceForensics.py D:\RFW_Data\FaceForensics++ `
    -d all `
    -c c23 `
    -t videos `
    --server EU
```

**Key arguments:**

| Argument | Options | Recommendation |
|---|---|---|
| `-d` | `all`, `original`, `Deepfakes`, `Face2Face`, `FaceSwap`, `NeuralTextures` | `all` for best coverage |
| `-c` | `raw` (lossless, ~1.5 TB), `c23` (~90 GB), `c40` (~10 GB) | `c23` — best tradeoff |
| `-t` | `videos`, `masks`, `models` | `videos` for training |
| `--server` | `EU`, `EU2`, `CA` | Switch if download is slow |

If disk space is tight, download `original` + `Deepfakes` only (~30 GB c23) as a minimum viable set:

```powershell
python download-FaceForensics.py D:\RFW_Data\FaceForensics++ -d original -c c23 -t videos
python download-FaceForensics.py D:\RFW_Data\FaceForensics++ -d Deepfakes -c c23 -t videos
```

### Expected directory after download

```
D:\RFW_Data\FaceForensics++\
├── original_sequences\youtube\c23\videos\    # 1,000 real videos
└── manipulated_sequences\
    ├── Deepfakes\c23\videos\                 # 1,000 deepfake videos
    ├── Face2Face\c23\videos\
    ├── FaceSwap\c23\videos\
    └── NeuralTextures\c23\videos\
```

---

## Dataset 2 — Celeb-DF

**Status: repo cloned (celeb-deepfakeforensics-master\), video data NOT yet downloaded.**

The existing `celeb-deepfakeforensics-master\` directory in the repo contains only README/images — the actual videos need to be downloaded separately.

### Access

Request access at: https://github.com/yuezunli/celeb-deepfakeforensics  
Fill out the Google Form; you'll receive a Google Drive link.

### Download

Download the videos from the provided Drive link and organize them as:

```
D:\RFW_Data\Celeb-DF\
├── Celeb-real\          # ~590 real celebrity videos
└── Celeb-synthesis\     # ~5,639 synthesized deepfake videos
```

> **Note:** Celeb-DF-v2 is recommended over v1 — it has higher-quality fakes and is the standard benchmark.

---

## Dataset 3 — Google DFD (DeepFakeDetection)

**Status: to be downloaded via Kaggle.**

Google DFD is part of FaceForensics++ and is also hosted on Kaggle.

### Setup Kaggle CLI (one-time)

```powershell
pip install kaggle

# Place your kaggle.json API key (from kaggle.com/settings) at:
# C:\Users\SOUMADEEP\.kaggle\kaggle.json
```

### Download

```powershell
# ~36 GB compressed
kaggle datasets download -d `
    "google-deepfakes-detection-dataset/deepfake-detection" `
    --path D:\RFW_Data\GoogleDFD `
    --unzip
```

Alternatively, download the FaceForensics++ `DeepFakeDetection` subset using the FF++ download script:

```powershell
python download-FaceForensics.py D:\RFW_Data\FaceForensics++ `
    -d DeepFakeDetection `
    -c c23 -t videos
python download-FaceForensics.py D:\RFW_Data\FaceForensics++ `
    -d DeepFakeDetection_original `
    -c c23 -t videos
```

This places the data under `D:\RFW_Data\FaceForensics++\manipulated_sequences\DeepFakeDetection\`.

### Expected structure

```
D:\RFW_Data\GoogleDFD\
├── real\     # original actor videos
└── fake\     # manipulated actor videos
```

---

## Dataset 4 — DFDC (Deepfake Detection Challenge)

**Status: some parts already on disk, rest to be downloaded via Kaggle.**

DFDC is the largest dataset (~470 GB total, split into 50 training parts). You do **not** need all parts — even 5–10 parts (~50 GB) give strong training signal.

### Download

```powershell
# Install Kaggle CLI if not done
pip install kaggle

# Download a specific subset of training parts (e.g. parts 0-4 = ~50 GB)
# List all files first:
kaggle competitions files -c deepfake-detection-challenge

# Download individual parts (replace XX with part number 00-49):
kaggle competitions download -c deepfake-detection-challenge `
    -f dfdc_train_part_00.zip `
    --path D:\RFW_Data\DFDC\train

kaggle competitions download -c deepfake-detection-challenge `
    -f dfdc_train_part_01.zip `
    --path D:\RFW_Data\DFDC\train

# ... repeat for as many parts as you can store

# Unzip each part (PowerShell loop):
Get-ChildItem D:\RFW_Data\DFDC\train\*.zip | ForEach-Object {
    Expand-Archive $_.FullName -DestinationPath D:\RFW_Data\DFDC\train -Force
}

# Download the test set (~6 GB):
kaggle competitions download -c deepfake-detection-challenge `
    -f test_videos.zip `
    --path D:\RFW_Data\DFDC\test
Expand-Archive D:\RFW_Data\DFDC\test\test_videos.zip `
    -DestinationPath D:\RFW_Data\DFDC\test
```

> **Note:** DFDC requires accepting the competition rules at https://www.kaggle.com/c/deepfake-detection-challenge before the CLI will work.

### Expected structure

```
D:\RFW_Data\DFDC\
└── train\
    ├── dfdc_train_part_00\
    │   ├── metadata.json          ← label file per part
    │   └── *.mp4                  ← mixed real + fake videos
    ├── dfdc_train_part_01\
    └── ...
```

The `metadata.json` in each part folder maps filenames to labels:
```json
{
  "atvmxvwyns.mp4": { "label": "FAKE", "split": "train", "original": "qzimuostzs.mp4" },
  "qzimuostzs.mp4": { "label": "REAL", "split": "train" }
}
```

---

## Step 1 — Extract AMAF Features

The `extract_dataset_features.py` script walks directories, runs the full 6-layer AMAF pipeline on each file, and writes a labeled CSV.

### FaceForensics++ (natively supported)

```powershell
cd C:\Users\SOUMADEEP\Documents\realityfirewall\ai-service

python scripts\extract_dataset_features.py `
    --ff-real  "D:\RFW_Data\FaceForensics++\original_sequences\youtube\c23\videos" `
    --ff-fake  "D:\RFW_Data\FaceForensics++\manipulated_sequences\Deepfakes\c23\videos" `
    --output   D:\RFW_Data\features\ff_features.csv `
    --limit    500
```

Remove `--limit` for the full dataset. Processing time: ~2–5 min per video on CPU; expect several hours for the full 1,000 video set.

### Celeb-DF (natively supported)

```powershell
python scripts\extract_dataset_features.py `
    --celebdf-real  "D:\RFW_Data\Celeb-DF\Celeb-real" `
    --celebdf-fake  "D:\RFW_Data\Celeb-DF\Celeb-synthesis" `
    --output        D:\RFW_Data\features\celebdf_features.csv `
    --limit         300
```

### Google DFD / DFDC (generic directory mode)

`extract_dataset_features.py` does not currently have dedicated flags for DFD/DFDC, so pass them via `--ff-real`/`--ff-fake` as a generic real/fake split equivalent:

```powershell
# Google DFD
python scripts\extract_dataset_features.py `
    --ff-real  "D:\RFW_Data\GoogleDFD\real" `
    --ff-fake  "D:\RFW_Data\GoogleDFD\fake" `
    --output   D:\RFW_Data\features\googledfd_features.csv `
    --limit    300
```

For DFDC, because labels live in `metadata.json` rather than separate folders, you need to pre-sort a sample into real/fake subdirectories first:

```powershell
# One-time sort script — run from PowerShell
python - << 'EOF'
import json, shutil, pathlib

dfdc_parts = pathlib.Path(r"D:\RFW_Data\DFDC\train")
real_out   = pathlib.Path(r"D:\RFW_Data\DFDC\sorted\real")
fake_out   = pathlib.Path(r"D:\RFW_Data\DFDC\sorted\fake")
real_out.mkdir(parents=True, exist_ok=True)
fake_out.mkdir(parents=True, exist_ok=True)

LIMIT = 400  # videos per class; increase for more data

real_count = fake_count = 0
for part_dir in sorted(dfdc_parts.iterdir()):
    meta_file = part_dir / "metadata.json"
    if not meta_file.exists():
        continue
    meta = json.loads(meta_file.read_text())
    for fname, info in meta.items():
        src = part_dir / fname
        if not src.exists():
            continue
        label = info.get("label", "").upper()
        if label == "REAL" and real_count < LIMIT:
            shutil.copy2(src, real_out / fname)
            real_count += 1
        elif label == "FAKE" and fake_count < LIMIT:
            shutil.copy2(src, fake_out / fname)
            fake_count += 1
        if real_count >= LIMIT and fake_count >= LIMIT:
            break

print(f"Sorted: {real_count} real, {fake_count} fake")
EOF
```

Then extract:

```powershell
python scripts\extract_dataset_features.py `
    --ff-real  "D:\RFW_Data\DFDC\sorted\real" `
    --ff-fake  "D:\RFW_Data\DFDC\sorted\fake" `
    --output   D:\RFW_Data\features\dfdc_features.csv
```

### Combine all CSVs

```powershell
# Simple Python combine — run from any directory
python -c "
import pandas as pd, glob
files = glob.glob(r'D:\RFW_Data\features\*_features.csv')
df = pd.concat([pd.read_csv(f) for f in files], ignore_index=True)
df.to_csv(r'D:\RFW_Data\features\combined_features.csv', index=False)
print(f'Combined: {len(df)} rows from {len(files)} files')
print(df.groupby([\"dataset\",\"label\"]).size())
"
```

---

## Step 2 — Train the Meta-Classifier

All commands run from `ai-service\`:

```powershell
cd C:\Users\SOUMADEEP\Documents\realityfirewall\ai-service
```

### Full combined training (recommended)

```powershell
python train_meta.py --data D:\RFW_Data\features\combined_features.csv
```

### Train on a single dataset

```powershell
python train_meta.py --data D:\RFW_Data\features\ff_features.csv
```

### Real data + synthetic augmentation (good for small datasets)

```powershell
python train_meta.py `
    --data     D:\RFW_Data\features\combined_features.csv `
    --augment `
    --samples  2000
```

### One-shot: extract FF++ features + train in a single command

```powershell
python train_meta.py `
    --ff-real  "D:\RFW_Data\FaceForensics++\original_sequences\youtube\c23\videos" `
    --ff-fake  "D:\RFW_Data\FaceForensics++\manipulated_sequences\Deepfakes\c23\videos" `
    --limit    300 `
    --augment  --samples 1000
```

After training, the model is automatically saved to:
```
ai-service\model_weights\meta_classifier.lgb
```
The fingerprint cache is cleared automatically on next request.

---

## Step 3 — Fine-tune EfficientNet-B4 (Optional — Higher Visual Accuracy)

> **Requires:** CUDA GPU. Without GPU, use a Kaggle Notebook (free T4) and download the resulting `.pth` checkpoint.

```python
# train_efficientnet_ff.py
import timm, torch, torch.nn as nn
from torch.utils.data import DataLoader
from torchvision import transforms, datasets

backbone = timm.create_model("efficientnet_b4", pretrained=True, num_classes=0)
head = nn.Linear(1792, 1)

# Dataset — point ImageFolder at real/ and fake/ subdirs:
transform = transforms.Compose([
    transforms.Resize((380, 380)),
    transforms.ToTensor(),
    transforms.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225]),
])
dataset = datasets.ImageFolder(r"D:\RFW_Data\FaceForensics++\frames", transform=transform)
loader = DataLoader(dataset, batch_size=16, shuffle=True, num_workers=4)

optimizer = torch.optim.AdamW(list(backbone.parameters()) + list(head.parameters()), lr=1e-4)
criterion = nn.BCEWithLogitsLoss()

# Training loop
backbone.train(); head.train()
for epoch in range(10):
    for imgs, labels in loader:
        feats = backbone(imgs)
        logits = head(feats).squeeze(1)
        loss = criterion(logits, labels.float())
        optimizer.zero_grad(); loss.backward(); optimizer.step()
    print(f"Epoch {epoch+1} done")

# Save in the format Reality Firewall expects:
torch.save(
    {"backbone": backbone.state_dict(), "head": head.state_dict()},
    r"C:\Users\SOUMADEEP\Documents\realityfirewall\ai-service\model_weights\efficientnet_b4_ff.pth"
)
```

Once `efficientnet_b4_ff.pth` is placed in `model_weights\`, the classifier automatically switches to binary classification mode on next startup. No code changes required.

---

## Step 4 — Cross-Dataset Validation

Always validate the model trained on one dataset against another to check generalization.

```powershell
# Train on FF++, validate on Celeb-DF:
python scripts\extract_dataset_features.py `
    --celebdf-real "D:\RFW_Data\Celeb-DF\Celeb-real" `
    --celebdf-fake "D:\RFW_Data\Celeb-DF\Celeb-synthesis" `
    --output       D:\RFW_Data\features\celebdf_val.csv

# Train on Celeb-DF + FF++, validate on DFDC (out-of-distribution test):
python scripts\extract_dataset_features.py `
    --ff-real  "D:\RFW_Data\DFDC\sorted\real" `
    --ff-fake  "D:\RFW_Data\DFDC\sorted\fake" `
    --output   D:\RFW_Data\features\dfdc_val.csv
```

Then evaluate the trained model against the held-out validation CSV manually, or add `--eval` to `train_meta.py` when that flag is implemented.

---

## Step 5 — Recalibrate Platt Scaling (Optional)

After training on real data, recalibrate the sigmoid parameters in `ai-service/config.py`:

```python
from scipy.optimize import minimize
from sklearn.metrics import log_loss
import numpy as np

def calibrate_platt(raw_scores, true_labels):
    def objective(params):
        A, B = params
        calibrated = 1 / (1 + np.exp(-(A * raw_scores + B)))
        return log_loss(true_labels, calibrated)
    result = minimize(objective, [1.0, 0.0], method="Nelder-Mead")
    return result.x  # [A, B] → update PLATT_A, PLATT_B in config.py
```

Update `PLATT_A` and `PLATT_B` in `config.py`, then call `POST /retrain` to rebuild the meta-classifier.

---

## Dataset Summary

| Dataset | Size (c23/compressed) | Labels | Download Method | Script Support |
|---|---|---|---|---|
| **FaceForensics++** | ~90 GB (all methods) | per-folder | `download-FaceForensics.py` | `--ff-real` / `--ff-fake` ✅ |
| **Celeb-DF v2** | ~2.5 GB | per-folder | Google Drive (request form) | `--celebdf-real` / `--celebdf-fake` ✅ |
| **Google DFD** | ~36 GB | per-folder | Kaggle / FF++ script | via `--ff-real/fake` generic ⚠️ |
| **DFDC** | ~470 GB (50 parts) | `metadata.json` | Kaggle CLI per-part | pre-sort then `--ff-real/fake` ⚠️ |

> ⚠️ = Use the pre-sort step to create real/fake subdirectories before running feature extraction.

---

## Expected Metrics After Upgrade

| Metric | Synthetic (current) | Target (real data) |
|---|---|---|
| AUC-ROC (meta) | ~0.9998 | > 0.85 |
| Accuracy | ~0.996 | > 0.80 |
| FPR @ 0.5 | ~0.002 | < 0.05 |

> The synthetic AUC of ~0.9998 is misleadingly high — synthetic distributions are perfectly separable by design. Real-world accuracy will be lower but far more meaningful and generalizable.
