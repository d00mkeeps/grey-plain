# Cognitive Trajectory Visualiser — Research Documentation

**Status:** Prototype complete (Phases 1–5)  
**Date:** March 2026  
**Author:** Miles Hillary

---

## 1. Overview

The Cognitive Trajectory Visualiser models an AI's cognitive activation and predicts human brain activity during response. It is a **measurement tool**, not a demonstration of a known effect.

The system maps natural language conversation onto two parallel visualisations:

- **Human side:** Predicted activation across 75 cortical regions of the brain, derived from an encoding model trained on real fMRI data
- **LLM side:** Per-layer hidden state activation across all 32 transformer layers of Llama 3.1 8B Instruct, extracted during live inference

Both representations are expressed in the same shared colour space, grounded in functional neural network assignments derived empirically from the encoding model's regression weights.

---

## 2. Core Hypothesis

**Broad hypothesis:**

> The degree of alignment between the cognitive activity of an AI system and a human collaborator has a meaningful impact on the effectiveness of their joint reasoning process.

This is a **measurement hypothesis** — the primary contribution of this project is to make the alignment observable, not to demonstrate that it has a particular effect. The visualiser is the instrument. Studies using the instrument would test downstream predictions.

**Operational definition of alignment:**

Two systems are "aligned" at a given moment if the dominant functional network active in each system corresponds to the same canonical network (language, default mode, attention, visual, limbic, motor). This is visible in the prototype as shared colour between the brain mesh and the LLM layer stack.

**What alignment might predict (future research):**

- Higher task performance on collaborative problems
- More efficient conversations (fewer clarification exchanges)
- Higher subjective ratings of helpfulness and understanding
- Detectable coupling direction — does the LLM's state predict the human's next state, or vice versa?

---

## 3. Theoretical Framework

### 3.1 Global Workspace Theory

Baars (1988) proposed that conscious cognition involves a "global workspace" — a broadcast mechanism by which specialised neural modules share information. Content that reaches the global workspace becomes available to the whole system rather than remaining locally encapsulated.

**Applied here:** LLM attention mechanisms are interpreted as a functional analogue to global workspace broadcasting. When attention is distributed broadly across a long context, it resembles global workspace activation. When attention is narrow and local, it resembles modular processing.

### 3.2 Neural Attractor Dynamics

Hopfield (1982) and subsequent work established that neural networks settle into stable attractor states — low-energy configurations that represent learned patterns. Biological neural trajectories during cognition can be understood as movement through a high-dimensional state space, settling into attractors corresponding to concepts, memories, and schemas.

**Applied here:** Both biological and artificial neural networks process information by traversing state spaces. The hypothesis is that these trajectories share geometric structure when both systems are processing semantically related content — that is, the "shape" of processing a concept about memory looks similar in both systems.

### 3.3 Encoding Models (Huth et al.)

Huth, de Heer, Griffiths, Theunissen & Gallant (2016) — "Natural speech reveals the semantic maps that tile human cerebral cortex" — demonstrated that word-level semantic content can predict cortical activation patterns using ridge regression. Their encoding model trained on fMRI data from subjects listening to natural speech stories showed that semantic dimensions (derived from word2vec embeddings) predict activation across language, default mode, and association cortex with r² values of 0.1–0.3.

**Applied here:** We extend this approach by replacing word2vec embeddings with Llama 3.1 8B Instruct hidden states as the semantic representation. The hypothesis is that transformer hidden states are richer semantic representations than word2vec and should yield better or comparable encoding model performance.

### 3.4 LLM Representational Geometry

Recent mechanistic interpretability work (Elhage et al., 2022; Anthropic; various) has established that:

- Early transformer layers (0–5) encode syntactic and positional structure
- Middle layers (6–20) encode rich semantic content — these show strongest alignment with brain data
- Late layers (20+) specialise for next-token prediction and output formatting

This layer-function gradient is reflected in our empirical layer→network assignments from the regression.

---

## 4. Dataset

**Source:** OpenNeuro ds003020  
**Title:** "Narratives" — fMRI responses to natural speech  
**Lab:** Huth Lab, UT Austin  
**Access:** Fully public, no approval required  
**URL:** `s3://openneuro.org/ds003020/`

### 4.1 Description

Subjects listened passively to spoken narrative stories from The Moth Radio Hour while whole-brain BOLD fMRI was recorded at 3T. No task, no button presses. Stimulus transcripts are provided as Praat TextGrid files with word-level timing.

### 4.2 What We Used

- **Subject:** UTS01 (single subject)
- **Sessions:** ses-2 through ses-20 (narrative listening sessions; ses-1 is localizer only)
- **Stories processed:** 80 stories (approximately 14 dropped due to empty or corrupted TextGrid files)
- **BOLD files:** ~280MB per story, NIfTI format, MNI152 space
- **TextGrids:** Word-tier intervals with onset/offset times in seconds

### 4.3 What Was Excluded

- Session 1 (CategoryLocalizer, MotorLocalizer, AudioMotorLocalizer tasks)
- Stories where TextGrid word tier contained only phoneme labels rather than words (parsing produced 9000+ "words" that were actually phonemes — detected and excluded)
- One corrupted BOLD file that caused pipeline abort

---

## 5. Encoding Model Pipeline

### 5.1 Overview

For each story:

1. Parse TextGrid → word timings
2. Run story text through Llama 3.1 8B Instruct → hidden states per token
3. Align hidden states to fMRI TRs (2s windows)
4. Project BOLD volume to cortical surface → mean activation per Destrieux region
5. Train ridge regression: aligned hidden states → region activation
6. Export weights for inference-time use

### 5.2 Text Extraction

The TextGrid word tier was parsed using regex matching on `xmin`, `xmax`, `text` interval blocks. Silence labels (`sp`, `sil`, `{BR}`, `{NS}`, `{LG}`) were excluded. Final word counts: 1500–2500 real words per story, well within Llama's 4096-token context window.

**Issue encountered:** Initial parsing hit the phoneme tier rather than the word tier, producing thousands of phoneme labels per story. Fixed by filtering on word-plausible tokens.

### 5.3 Hidden State Extraction

Stories were tokenized and run through Llama 3.1 8B Instruct with `output_hidden_states=True`. Hidden states were extracted from all 32 transformer layers (excluding the embedding layer) at every token position.

**Word-token alignment:** Llama uses sentencepiece tokenization. Words are reconstructed by grouping tokens by the `▁` (sentencepiece space) prefix. The last token of each word group is used as the word's hidden state representation.

**TR alignment:** Each word is assigned to the TR in which its onset falls. Within each TR, word hidden states are averaged. TRs with no words (zero rows) are masked out before regression.

**Coverage:** Approximately 90% of TRs per story had at least one word mapped.

### 5.4 Surface Projection

BOLD volumes (MNI152 space) were projected to the fsaverage5 cortical surface using nilearn's `vol_to_surf` (linear interpolation). Mean activation was computed within each Destrieux parcel for each TR.

**HRF lag:** BOLD signal was shifted forward by 2 TRs (4 seconds) relative to hidden states to approximate haemodynamic response function peak delay.

**Per-story z-scoring:** Each story's BOLD timeseries was z-scored before concatenation to remove session-level mean offsets.

### 5.5 Dimensionality Reduction

Hidden states were originally shape `(n_trs, 32, 4096)` — flattened to `(n_trs, 131,072)` features. This is too high-dimensional for direct ridge regression.

**First attempt — mean pooling:** Mean across hidden_dim axis → `(n_trs, 32)`. Produced mean r² of **-0.063**. Negative r² indicates the regression was performing worse than predicting the mean — a failed model, not a null result. Root cause: 32 features is insufficient to capture the semantic structure in the data.

**Fix — PCA:** Applied PCA (200 components) to the full `(n_trs, 131,072)` matrix before regression. Explained variance: approximately 85%. Produced mean r² of **+0.020**, max r² of **0.240**.

### 5.6 Regression

Ridge regression (scikit-learn RidgeCV) trained per Destrieux region with 5-fold cross-validated alpha selection. Alphas searched: [0.01, 0.1, 1.0, 10, 100, 1000].

Train/test split: 80/20 sequential split on the concatenated timeseries. Sequential (not random) to preserve temporal structure and avoid data leakage.

**Results:**

| Metric                   | Value                   |
| ------------------------ | ----------------------- |
| Mean r² (all 75 regions) | 0.020                   |
| Max r²                   | 0.240 (G_occipital_sup) |
| Top network              | Visual                  |

**Top 10 predicted regions:**

1. `G_occipital_sup` — 0.240 (Visual)
2. `G_and_S_occipital_inf` — 0.199 (Visual)
3. `G_occipital_middle` — 0.196 (Visual)
4. `G_parietal_sup` — 0.152 (Attention/Spatial)
5. `G_pariet_inf-Angular` — 0.134 (Language/Semantic)
6. `G_oc-temp_med-Parahip` — 0.092 (Limbic/Memory)
7. `S_oc-temp_lat` — 0.091 (Visual/Object Recognition)
8. `S_temporal_transverse` — 0.089 (Auditory/Language)
9. `G_temp_sup-Lateral` — 0.086 (Language/Auditory)
10. `Pole_temporal` — 0.079 (Language/Semantic)

**Interpretation:** Visual cortex dominance in the top regions is expected — The Moth Radio Hour stories are rich in concrete visual description. Angular gyrus, superior temporal gyrus, and temporal pole are canonical language and semantic integration regions, consistent with the original Huth et al. findings.

### 5.7 Layer→Network Assignment

Regression weights were projected back to full dimensional space (`weights @ pca.components_`) to recover per-layer importance scores. For each layer, the canonical network whose key regions were most strongly predicted was assigned as that layer's network label.

**Empirical assignments:**

| Layers | Network   |
| ------ | --------- |
| 0–5    | Limbic    |
| 6–16   | Visual    |
| 17–20  | Language  |
| 21–30  | Attention |
| 31     | Visual    |

**Interpretation:** Early limbic dominance reflects emotional narrative content (personal stories). Visual dominance in middle layers reflects concrete perceptual language. Language and attention networks emerge in later layers, consistent with mechanistic interpretability literature placing semantic and contextual processing in upper-middle layers.

---

## 6. Brain Mesh

**Surface:** FreeSurfer fsaverage (full resolution, ~160,000 vertices)  
**Parcellation:** Destrieux atlas (aparc.a2009s), 75 regions  
**Export:** nilearn `fetch_atlas_surf_destrieux()`, exported to `brain.json` and `regionMap.json`

**fsaverage5 was used initially** (~20,000 vertices) but appeared faceted and low-resolution despite correct geometry. Upgraded to full fsaverage for smooth surface appearance.

**Visualisation approach:** Vertex colours mapped to predicted activation levels. Active regions pulse between 75–100% brightness using a sine wave in the animation loop (`pulse = 0.5 + 0.5 * sin(Date.now() / 900)`). Partial fill growing outward from region centroid gives a sense of graded activation rather than binary on/off.

**GPU picking:** Brain regions are made clickable via GPU picking. An offscreen render pass draws each region in a unique flat colour encoding its region ID into the RGB channels. On click, a 1×1 pixel readback identifies the region under the cursor. This is more reliable than Three.js raycasting on a high-vertex irregular mesh.

**Volumetric lighting:** Directional shading is driven by a prebaked 3D normal field (`atlas_normals.bin`) — a 128³ RGBA volume where each voxel stores the outward surface normal of the nearest cortex boundary, computed via Gaussian-smoothed gradient of the solid brain mask. This gives interior regions plausible lighting without requiring mesh normals.

---

## 7. Inference Pipeline

### 7.1 Model

**Model:** `meta-llama/Llama-3.1-8B-Instruct`  
**Justification for Instruct over Base:** Inference use case is instruction-style conversation. Instruct fine-tuning shifts later layers most; middle layers (strongest brain alignment) are relatively preserved. Training on Instruct matches the deployment context.  
**Justification for 8B over 3B:** Llama 3.2 3B is a pruned/distilled model optimised for edge deployment, with compressed representations. 8B provides richer 32-layer hidden state geometry for regression.

### 7.2 /chat Endpoint

1. Build Llama 3.1 Instruct chat template from message + history
2. Single forward pass on full prompt with `output_hidden_states=True`
3. Extract last-token hidden states across all 32 layers → PCA → regression → brain activations
4. Stream token generation with per-token hidden state norms for layer stack
5. Yield events: `{type: "brain"}` → n × `{type: "token"}` → `{type: "done"}`

### 7.3 /replay Endpoint

Takes completed conversation. For each human turn: n forward passes (one per progressive token prefix) → token-by-token brain activation sequence. For each LLM turn: one pass per token → layer stack sequence. Returns enriched conversation in full mock data contract shape.

**Computational cost:** Replay is expensive — O(n) forward passes where n = total tokens in conversation. A 10-turn conversation of moderate length takes approximately 2–3 minutes on an A10G GPU. Acceptable for a prototype, not for production.

### 7.4 Hosting

**Development:** Stub API (FastAPI, localhost:8000) with heuristic activation generation — keyword-based network detection, bell-curve layer activations, seeded random brain activations. Realistic shape, no real inference.

**Production (hosted prototype):** Live inference is intentionally **disabled** in the hosted version. The `/chat` and `/replay` endpoints are not exposed. Modal is not running. There is no ongoing GPU cost. Users interact exclusively through **playback of pre-recorded conversations** — the `mockConversation.json` dataset that was generated offline. This keeps the prototype freely hostable indefinitely without inference spend.

**Inference capability:** The full inference pipeline (Modal, A10G, streaming `/chat`) is implemented and was used to generate the playback dataset. It can be re-enabled for a private session or future study by restoring the Modal deployment and wiring `ChatInterface.jsx` back into the tab bar.

---

## 8. System Architecture

### 8.1 Hosted (Playback-only)

```
mockConversation.json  (pre-recorded, generated offline via inference pipeline)
    │
    ▼
App.jsx (playbackConversation state)
    │
    ▼
ConversationTimeline.jsx  — turn scrubber, play/pause
    │
    ▼
Workspace3D.jsx
    ├─ BrainMesh — vertex colours from regionActivations
    └─ LLM cylinder stack — fill opacity/colour from layerActivations
```

### 8.2 Full Inference (Development / Future)

```
User message
    │
    ▼
ChatInterface.jsx
    │  POST /chat
    ▼
Modal inference_api.py
    │
    ├─ Forward pass (full prompt) ──► PCA ──► weights.h5 ──► regionActivations
    │                                                              │
    │  {type: "brain"} ◄────────────────────────────────────────┘
    │
    ├─ Token generation loop
    │     │ per token: hidden state norms ──► layerActivations
    │     │  {type: "token"} ◄────────────────────────────────
    │
    └─ {type: "done"}
         │
         ▼
App.jsx (liveTurn state)
    │
    ▼
Workspace3D.jsx
    ├─ BrainMesh — vertex colours from regionActivations
    └─ LLM cylinder stack — fill opacity/colour from layerActivations
```

---

## 9. Assumptions and Limitations

### 9.1 Population Average

Training used a single subject (UTS01). Brain activation patterns vary substantially across individuals. The regression predicts a population-average proxy, not the actual brain state of any specific user.

**Implication:** Activation patterns are semantically plausible but not individually accurate.

### 9.2 Passive Listening → Active Conversation

The fMRI data was collected during passive listening to pre-recorded speech. The visualiser applies this model to active conversation — a different cognitive context recruiting additional networks (language production, working memory, executive control, social cognition).

**Implication:** Language and semantic regions are likely well-predicted; prefrontal, motor speech, and social cognition regions may be systematically underweighted.

### 9.3 Instruct Fine-Tuning

The encoding model was trained using Llama 3.1 8B Instruct hidden states, but the fMRI was collected before this model existed. We assume instruct fine-tuning preserves middle-layer semantic representations.

**Implication:** Layers 0–20 predictions are more reliable than layers 20–31.

### 9.4 HRF Approximation

Fixed 2-TR lag rather than full haemodynamic response function deconvolution. True HRF varies by brain region and individual, with peaks at 4–6 seconds and undershoot lasting 15–20 seconds.

**Implication:** Temporal precision of predictions is limited to ±1–2 TRs (2–4 seconds).

### 9.5 Token-by-Token Human Brain Animation

The replay mode animates human brain activation token-by-token by running n progressive forward passes. This assumes:

- Typed token order reflects thought formation order (likely false — thought precedes utterance)
- The same passive-listening regression applies to the moment-by-moment reading of typed text

**Implication:** The animation is aesthetically meaningful and tracks semantic accumulation, but does not represent actual neural dynamics during speech production. Clearly documented, not hidden.

### 9.6 Surface Projection Without Preprocessing

BOLD volumes were projected to surface without standard preprocessing (no motion correction, no physiological noise regression, no drift removal). This introduces noise that may reduce regression performance.

**Implication:** r² values likely underestimate what a properly preprocessed pipeline would achieve.

### 9.7 Session Concatenation Without Confound Modelling

Stories from different sessions were concatenated without session-level nuisance regression. Scanner drift, motion artefacts, and physiological noise vary across sessions.

**Implication:** Low-frequency noise may slightly inflate or deflate regression performance.

---

## 10. Key Engineering Decisions

| Decision                 | Options Considered                                                     | Chosen                                  | Reason                                                                     |
| ------------------------ | ---------------------------------------------------------------------- | --------------------------------------- | -------------------------------------------------------------------------- |
| Brain mesh resolution    | fsaverage5 (20k vertices) vs fsaverage (160k)                          | fsaverage                               | fsaverage5 appeared faceted; smooth surface needed                         |
| Dimensionality reduction | Mean pooling vs PCA                                                    | PCA (200 components)                    | Mean pooling produced negative r² — insufficient features                  |
| Model                    | Llama 3.2 3B vs 3.1 8B                                                 | 3.1 8B                                  | Richer representations; 3.2 is distilled for edge deployment               |
| Base vs Instruct         | Base (matches fMRI passive listening) vs Instruct (matches deployment) | Instruct                                | Deployment context is conversational; middle layers preserved              |
| Hosting                  | Vast.ai vs Modal                                                       | Modal for production, Vast for training | Modal handles scaling and idle cost; Vast better for sustained batch jobs  |
| Real-time vs Replay      | Live token-by-token vs post-hoc replay                                 | Both                                    | /chat streams LLM in real-time; /replay does human token-by-token post-hoc |
| Serving framework        | Raw transformers vs vLLM                                               | Raw transformers                        | Sufficient for prototype; vLLM needed at scale                             |
| Region click detection   | Three.js raycaster vs GPU picking                                      | GPU picking (offscreen atlas render)    | Raycaster unreliable on 160k-vertex irregular mesh; GPU readback is exact  |
| Volumetric normals       | Mesh surface normals only vs prebaked 3D gradient field                | Prebaked 3D gradient field              | Atlas volume lacks usable mesh normals; gradient of solid mask is cheaper  |

---

## 11. Key Issues Encountered

**TextGrid phoneme tier parsing:** Initial regex hit the phoneme tier, producing 9000+ "words" per story that were actually phonemes (AO2, L, R etc.). Fixed by filtering plausible word tokens and checking word count per story.

**Mean pooling dimensionality collapse:** Pooling 4096 hidden dimensions to a single mean per layer left only 32 features — insufficient for ridge regression. Produced mean r² = -0.063. Fixed with PCA (200 components), producing mean r² = +0.020.

**Zero-row contamination:** TRs with no words mapped contributed zero vectors as X but real BOLD signal as Y, adding noise to regression. Fixed by masking zero rows before training.

**Corrupt BOLD file:** One NIfTI file caused pipeline abort partway through data loading. Fixed with try/except per story and skip logic.

**fsaverage5 faceted appearance:** Initial brain export at fsaverage5 resolution (~20k vertices) appeared low-resolution. Fixed by upgrading to full fsaverage (~160k vertices).

**HF token access in Modal:** Secret must be passed both to `modal.Secret.from_name()` in the decorator and explicitly to `from_pretrained()` calls. Not obvious from documentation.

**Atlas coordinate space mismatch:** The Destrieux NIfTI atlas is in RAS voxel space; the JavaScript bounding box is in MNI world coordinates. Initial sampling produced a badly misaligned volume. Fixed in `build_atlas.py` by applying the inverse NIfTI affine to convert each 128³ grid point from MNI coordinates to voxel indices before lookup.

**GPU picking channel bleed:** The offscreen picking render target was compositing the LLM cylinder stack and other scene objects alongside the brain mesh, producing garbage region ID readbacks. Fixed by isolating the pick pass to render only the brain mesh geometry with the flat-colour picking shader.

---

## 12. Colour System

Six functional networks, colours assigned to be visually distinct on dark background:

| Network      | Colour | Hex     |
| ------------ | ------ | ------- |
| Language     | Orange | #E87A3A |
| Default Mode | Blue   | #4A90D9 |
| Attention    | Green  | #5ABF7A |
| Motor        | Purple | #9B6DD4 |
| Visual       | Yellow | #D4C44A |
| Limbic       | Pink   | #D46A8A |

**Grounding:** Layer→network colour assignments are derived empirically from regression weight analysis, not aesthetic choice. The same colour appearing simultaneously on brain mesh and LLM layer stack reflects a genuine statistical relationship — both systems are engaged in the same functional network at that moment.

---

## 13. Transformer Hidden States vs Word2vec

### 13.1 Why the Field Started with Word2vec

Huth et al. (2016) used word2vec embeddings as their semantic representation — fixed 300-dimensional vectors encoding distributional semantics trained on large text corpora. This was the best available dense semantic representation at the time and produced the landmark results the field is built on.

Word2vec has a meaningful practical advantage: it is static, cheap to compute, and was specifically validated as a semantic similarity measure. Each word maps to exactly one vector regardless of context, making TR alignment straightforward.

### 13.2 Why Transformer Hidden States Are a Better Choice

**Contextual representations:** The fundamental limitation of word2vec is that it is context-free. "Bank" next to "river" gets the same vector as "bank" next to "loan." A transformer produces a different hidden state for each, reflecting the full surrounding discourse. Brain responses to words in naturalistic speech are demonstrably context-dependent — the BOLD response to "bank" differs based on preceding context. A contextual model should capture this; word2vec cannot.

**Representational richness:** Transformer hidden states exist across 32 layers, each encoding different levels of abstraction — from surface form to syntax to semantics to pragmatics. Word2vec collapses all of this into a single layer. The multi-layer structure maps naturally onto the cortical hierarchy, where different regions process different levels of linguistic abstraction.

**Empirical support:** The literature has now largely confirmed that transformer representations outperform word2vec for brain encoding:

- **Schrimpf et al. (2021)** — "The neural architecture of language: Integrative modeling converges on predictive processing." _PNAS._ Benchmarked dozens of language models against neural data and found that transformer-based models substantially outperform static embedding models including word2vec. GPT-2 and similar models predicted brain responses significantly better across all cortical language regions.

- **Toneva & Wehbe (2019)** — "Interpreting and improving natural language processing with the brain." _NeurIPS._ Showed that contextual transformer representations align with brain activity during reading more strongly than context-free embeddings, and that the alignment is layer-specific.

- **Caucheteux & King (2022)** — "Brains and algorithms partially share algorithms for speech processing." _Communications Biology._ Demonstrated that large language models predict neural responses in a hierarchical, context-sensitive manner that static embeddings cannot replicate.

### 13.3 The Trade-off We Accept

Replacing word2vec with Llama 3.1 8B Instruct hidden states introduces a dimensionality problem that word2vec does not have. Word2vec gives 300 features per TR; Llama gives 131,072. This requires PCA compression before regression, introducing information loss and a hyperparameter choice (number of components). Huth et al. did not face this problem.

This is an engineering cost for a theoretical gain. The literature supports the trade-off — contextual representations are better predictors of brain activity. Our r² results in top regions (0.20–0.24) are comparable to Huth et al.'s published figures despite our significantly less rigorous preprocessing pipeline, which suggests the representation quality is doing real work.

---

## 14. Layer-to-Brain-Region Correspondence

### 14.1 Scientific Basis

The alignment sphere (see Future Directions) requires a principled mapping between transformer layers and brain regions — not an arbitrary grouping, but one grounded in what the regression actually shows about which layers predict which regions.

This is supported by a body of literature establishing that the correspondence between transformer layers and cortical regions is **structured and hierarchical**, mirroring the cortical processing hierarchy:

**Caucheteux & King (2022)** — _Communications Biology._ Found that early transformer layers best predict early auditory cortex (primary auditory, Heschl's gyrus), middle layers best predict lateral temporal and inferior frontal cortex (language regions), and later layers best predict prefrontal and association cortex. This is a direct empirical demonstration of the layer→region hierarchy.

**Caucheteux, Gramfort & King (2022)** — "Disentangling syntax and semantics in the brain with deep networks." _ICML._ Showed that syntactic and semantic dimensions of transformer representations map onto anatomically distinct cortical regions — Broca's area for syntax, temporal cortex for semantics. Different layers carry different dimensions, and the brain dissociates them anatomically.

**Goldstein et al. (2022)** — "Shared computational principles for language processing in humans and deep language models." _Nature Neuroscience._ Found that transformer layer activations predict neural responses in a temporally and anatomically specific way — not uniformly, but with specific layers predicting specific regions at specific latencies.

**Schrimpf et al. (2021)** — _PNAS._ Established a "neural predictivity" metric and showed that it peaks at different layers for different brain regions, confirming that the layer→region relationship is not uniform.

### 14.2 What Our Regression Adds

The studies above used various language models and brain datasets. Our regression provides this mapping specifically for Llama 3.1 8B Instruct on the Huth ds003020 dataset — the same model used for live inference. This means our layer→region assignments are not borrowed from the literature but derived from the actual system in use.

The projection `weights @ pca.components_` recovers a `(75 regions, 32 layers, 4096 hidden_dim)` importance tensor. For each region, the layer with highest mean absolute weight is the layer most predictive of that region's activation. Clustering regions by their most predictive layer gives empirically grounded sphere segments.

### 14.3 Interpretation of Our Empirical Layer Assignments

Our regression produced the following layer→network mapping:

| Layers | Network   | Interpretation                                                                                               |
| ------ | --------- | ------------------------------------------------------------------------------------------------------------ |
| 0–5    | Limbic    | Emotional/narrative content; consistent with early layers encoding surface and affective features            |
| 6–16   | Visual    | Concrete perceptual language dominant in Moth Radio Hour stories; middle layers encode rich semantic content |
| 17–20  | Language  | Classic language network; upper-middle layers encoding linguistic structure                                  |
| 21–30  | Attention | Late layers encoding contextual integration and discourse-level processing                                   |
| 31     | Visual    | Output layer pulling back toward concrete grounding                                                          |

The visual dominance in middle layers is stronger than typical in the literature — likely reflecting the corpus. The Moth Radio Hour stories are first-person personal narratives rich in concrete visual description. A more abstract corpus (academic text, code) would be expected to shift the middle-layer assignment toward language and attention networks.

---

---

## 15. Studies This Builds Upon

**Core encoding model:**

- **Huth, de Heer, Griffiths, Theunissen & Gallant (2016)** — "Natural speech reveals the semantic maps that tile human cerebral cortex." _Nature._ Ridge regression encoding model on naturalistic speech fMRI; Destrieux parcellation; semantic maps.

**Transformer representations and brain alignment:**

- **Schrimpf et al. (2021)** — "The neural architecture of language: Integrative modeling converges on predictive processing." _PNAS._ Transformers outperform static embeddings for brain prediction; layer-specific neural predictivity.
- **Caucheteux & King (2022)** — "Brains and algorithms partially share algorithms for speech processing." _Communications Biology._ Hierarchical layer→region correspondence; contextual representations outperform word2vec.
- **Caucheteux, Gramfort & King (2022)** — "Disentangling syntax and semantics in the brain with deep networks." _ICML._ Syntactic and semantic transformer dimensions map to anatomically distinct cortical regions.
- **Goldstein et al. (2022)** — "Shared computational principles for language processing in humans and deep language models." _Nature Neuroscience._ Layer-specific, anatomically specific neural prediction during naturalistic speech.
- **Toneva & Wehbe (2019)** — "Interpreting and improving natural language processing with the brain." _NeurIPS._ Contextual transformer representations align more strongly with brain activity than context-free embeddings.

**Theoretical grounding:**

- **Baars (1988)** — Global Workspace Theory. Attention as broadcast mechanism analogue.
- **Hopfield (1982)** — Neural network attractor dynamics. State space traversal framework.
- **Destrieux et al. (2010)** — Destrieux cortical atlas. Parcellation scheme used throughout.
- **Elhage et al. (2022)** — "A Mathematical Framework for Transformer Circuits." Mechanistic interpretability; layer-function gradient.
- **Tononi & Koch (2015)** — Integrated Information Theory. Background context for consciousness and information integration.

---

## 16. Future Directions

### 16.1 fNIRS Study (Proposed)

**Design:** Within-subject comparison. Same participant completes matched cognitive tasks under two conditions: (A) with LLM assistance, (B) unaided (pen and paper). fNIRS records haemodynamic response from prefrontal, temporal, and parietal cortex simultaneously.

**Four data streams per trial:**

- fNIRS — cortical haemodynamics
- LLM hidden states — 32 layers, every token
- Behavioural — task performance, response time
- Conversation log — full text

**Novel contribution:** Every existing cognitive offloading study treats the tool as a black box. This study opens it — recording the LLM's internal state simultaneously with the human's brain state.

**Equipment:** Research-grade fNIRS (NIRx NIRSport2 or Artinis Brite) — 48–64 channels covering prefrontal, temporal, parietal cortex. ~£15,000–30,000. Likely accessible through university neuroimaging facilities rather than purchased.

**Realistic scope for MSc:** 10–15 participants, prefrontal and temporal fNIRS only, specific constrained tasks rather than open-ended conversation, claims scoped to observable regions.

### 16.2 Retrain Encoding Model on fNIRS Data

The current encoding model is trained on passive listening fMRI. An fNIRS study generating paired (hidden states, cortical activation during active LLM use) data would enable retraining on ecologically valid data — directly addressing the most significant limitation.

### 16.3 Individual Differences

The current model is trained on a single subject. Multi-subject training would reveal how much individual variation exists in the brain-LLM alignment signal and whether it correlates with collaborative task performance.

### 16.4 Alignment Metric

Formalise the "alignment" concept as a scalar metric computed from the overlap between active networks on both sides. Use this metric to study whether high-alignment moments correlate with subjective or objective markers of effective collaboration.

---

## 17. Repository Structure

```
/
├── cognitive-trajectory/              # React visualiser frontend
│   ├── src/
│   │   ├── App.jsx
│   │   ├── components/
│   │   │   ├── Workspace3D.jsx        # Three.js brain + LLM stack
│   │   │   ├── ConversationTimeline.jsx
│   │   │   ├── ChatInterface.jsx
│   │   │   ├── DocsPanel.jsx          # Inline docs tab
│   │   │   ├── ThinkingAnimation.jsx  # Three.js icosahedron loading indicator
│   │   │   └── RightPanel.jsx         # Tab wrapper
│   │   ├── constants/networks.js      # Network colours + region assignments
│   │   └── data/
│   │       ├── mockConversation.json
│   │       └── layer_network_map.json
│   ├── public/
│   │   ├── brain.json                 # fsaverage mesh (~160k vertices)
│   │   ├── regionMap.json             # Destrieux parcellation (75 regions)
│   │   ├── atlas_volume.bin           # 128³ RGBA: R=region ID, G=growth rank
│   │   ├── atlas_normals.bin          # 128³ RGBA: prebaked surface normals
│   │   └── model/
│   │       ├── pca.pkl                # PCA (200 components)
│   │       ├── weights.h5             # Ridge regression weights
│   │       └── region_names.json
│   └── build_atlas.py                 # Generates atlas_volume.bin + atlas_normals.bin
├── phase4/
│   ├── download_data.sh               # OpenNeuro data download
│   ├── parse_textgrids.py             # TextGrid word extraction
│   ├── extract_hidden_states.py       # Llama hidden state extraction
│   └── train_regression.py            # Ridge regression training
└── scripts/
    ├── export_brain.py                # FreeSurfer mesh export
    └── update_mock.py                 # Backfills token activations in mockConversation.json
```
