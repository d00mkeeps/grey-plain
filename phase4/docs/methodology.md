# Encoding Model Methodology

## What this is

A ridge regression that maps Llama-3.1-8B-Instruct hidden states to predicted
activation across 75 Destrieux cortical regions. Used to generate the human
brain visualisation in the Cognitive Trajectory Visualiser.

---

## Dataset

**Source:** OpenNeuro ds003020 — "Natural speech comprehension" (Huth lab, UT Austin)  
**Subjects:** 1 (sub-UTS01) — see limitation note below  
**Stimuli:** ~28 spoken narrative stories from The Moth Radio Hour  
**fMRI:** 3T, TR=2s, whole-brain BOLD, MNI152 space  
**Parcellation:** Destrieux atlas (aparc.a2009s), 75 regions, fsaverage5 surface

During scanning, subjects listened passively to continuous spoken narratives
while BOLD signal was recorded. No task, no button presses. The stimulus
transcripts are provided as Praat TextGrid files with word-level timing.

---

## Pipeline

### 1. Text extraction

Word timings are parsed from TextGrid files. Each word has an onset and offset
time in seconds from story start.

### 2. Hidden state extraction

Story text is tokenized with the Llama-3.1-8B-Instruct tokenizer and passed
through the model with `output_hidden_states=True`. We extract hidden states
from all 32 transformer layers (excluding the embedding layer) at every token
position. Shape: `(n_tokens, 32, 4096)`.

### 3. TR alignment

Hidden states are aligned to fMRI TRs (2s windows) as follows:

- Each word is assigned to the TR in which its onset falls
- Tokens are grouped back to words using the Llama sentencepiece `▁` prefix
- The last token of each word is used as the word's hidden state representation
- Within each TR, word hidden states are averaged

This introduces timing imprecision of < 1 TR (< 2 seconds), which is within
the temporal resolution of the BOLD signal anyway.

### 4. HRF lag

BOLD signal is shifted forward by 2 TRs (4 seconds) relative to the hidden
states to approximate the haemodynamic response function peak delay.

### 5. Surface projection

BOLD volumes are projected from MNI152 volumetric space to the fsaverage5
surface using nilearn's `vol_to_surf` (linear interpolation). Mean activation
is computed within each Destrieux parcel.

### 6. Ridge regression

For each of the 75 Destrieux regions, a ridge regression is trained:

- Input: flattened hidden states `(n_trs, 32 * 4096)`
- Output: mean BOLD activation in that region `(n_trs,)`
- Alpha selected by 5-fold cross-validation
- Features standardised (zero mean, unit variance)
- Evaluation: r² on held-out last 20% of concatenated timeseries

### 7. Layer→network assignment

For each of the 32 transformer layers, the regression weights are examined to
determine which functional network that layer most strongly predicts. This
grounds the colour system empirically rather than by assumption.

---

## Limitations

### Population average

Training used a single subject (UTS01). Brain activation patterns vary
substantially across individuals. The regression predicts a population-average
proxy, not the actual brain state of any specific user.

**Implication:** Activation patterns are semantically plausible but not
individually accurate.

### Passive listening vs active conversation

The fMRI data was collected during passive listening to pre-recorded speech.
The visualiser applies this model to active conversation — a different cognitive
context recruiting partially different networks (language production, working
memory, executive control).

**Implication:** Language and semantic regions are likely well-predicted;
prefrontal, motor speech, and social cognition regions may be underweighted.

### Instruct fine-tuning

The regression is trained on Llama-3.1-8B-Instruct hidden states, but the
fMRI was collected before this model existed. We assume the instruct
fine-tuning preserves middle-layer semantic representations (supported by
mechanistic interpretability literature) while shifting later layers.

**Implication:** Layer 0–15 predictions are more reliable than layers 16–31.

### HRF approximation

We apply a fixed 2-TR lag rather than full haemodynamic response function
deconvolution. The true HRF varies by brain region and individual.

**Implication:** Temporal precision of predictions is limited to ±1-2 TRs (2-4s).

### Token-word alignment

Llama tokenization does not exactly match TextGrid word boundaries. We use a
heuristic sentencepiece prefix alignment which may misalign for morphologically
complex words or contractions.

**Implication:** Minor timing noise in TR alignment, within BOLD temporal resolution.

### Single session concatenation

Stories from different sessions are concatenated without modelling session-level
confounds (scanner drift, motion, physiological noise).

**Implication:** Low-frequency noise may inflate regression performance slightly.

---

## What the output means

The regression produces predicted activation values per region given a text
input. These values represent:

> "The degree to which this brain region would be expected to activate in a
> population-average listener hearing semantically similar content"

They do **not** represent:

- The actual brain state of the person typing the message
- Emotional or affective states
- Subcortical or cerebellar activity
- Individual differences in neural organisation

---

## Colour system

Layer→network assignments are derived empirically from regression weights:
for each layer, we find which functional network's regions that layer most
strongly predicts. This means the same colour appearing on both the brain and
LLM layer stack reflects a genuine statistical relationship, not an aesthetic
choice.

Network definitions follow the canonical Yeo 7-network parcellation as a
reference framework, applied post-hoc to Destrieux regions.

---

## Run order (on Vast instance)

```bash
cd /workspace

# 1. Install deps
pip install awscli transformers torch nibabel h5py nilearn scikit-learn

# 2. Download data (~50GB for one subject)
bash download_data.sh

# 3. Extract hidden states (GPU, ~1-2 hours)
python extract_hidden_states.py

# 4. Train regression (CPU fine, ~30 mins)
python train_regression.py
```

Outputs to copy back locally:

- `data/regression/weights.h5`
- `data/regression/layer_network_map.json`
- `data/regression/metrics.json`
- `data/regression/region_names.json`
