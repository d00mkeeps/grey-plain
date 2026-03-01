"""
Modal inference server for Cognitive Trajectory Visualiser.

Endpoints mirror stub_api.py exactly — same event format, same data contract.
Frontend needs zero changes.

Swaps:
  stub: keyword heuristics         → real: detect_dominant_network from regression
  stub: generate_brain_activations → real: PCA + ridge regression weights
  stub: generate_layer_activations → real: hidden state norms per layer per token
  stub: asyncio.sleep latency      → real: actual generation latency
"""

import modal

# ── Modal app definition ──────────────────────────────────────────────────────

app = modal.App("cognitive-trajectory")

# Volume holding pca.pkl, weights.h5, region_names.json
model_volume = modal.Volume.from_name("cognitive-trajectory-models")

# Container image — all inference dependencies
image = (
    modal.Image.debian_slim(python_version="3.11")
    .pip_install(
        "transformers>=4.43.0",
        "accelerate>=0.30.0",
        "torch>=2.3.0",
        "numpy>=1.26.0",
        "scikit-learn>=1.4.0",
        "h5py>=3.11.0",
        "fastapi>=0.111.0",
        "uvicorn>=0.30.0",
        "huggingface_hub>=0.23.0",
    )
    .add_local_file("server/prompts.py", remote_path="/root/prompts.py")
)

# ── Constants (match frontend exactly) ───────────────────────────────────────

NUM_LAYERS = 32

REGION_NETWORKS = {
    'language':  ['G_temporal_sup', 'G_front_inf-Triangul', 'G_pariet_inf-Angular',
                  'S_temporal_sup', 'G_temp_sup-Lateral', 'Pole_temporal'],
    'dmn':       ['G_cingul-Post-dorsal', 'G_precuneus', 'G_front_sup',
                  'G_pariet_inf-Angular', 'G_cingul-Post-ventral'],
    'attention': ['G_front_middle', 'G_pariet_inf-Supramar', 'G_front_sup',
                  'G_and_S_cingul-Mid-Post'],
    'motor':     ['G_precentral', 'G_postcentral', 'G_and_S_subcentral'],
    'visual':    ['G_occipital_sup', 'G_cuneus', 'G_oc-temp_lat-fusifor',
                  'G_occipital_middle', 'G_and_S_occipital_inf'],
    'limbic':    ['G_oc-temp_med-Parahip', 'G_cingul-Post-ventral',
                  'Pole_temporal', 'G_and_S_cingul-Mid-Ant'],
}

REGION_TO_NETWORK = {
    region: net
    for net, regions in REGION_NETWORKS.items()
    for region in regions
}

# Empirical layer→network from regression (layer_network_map.json)
LAYER_NETWORK = (
    ['limbic']   * 6  +
    ['visual']   * 11 +
    ['language'] * 4  +
    ['attention']* 10 +
    ['visual']   * 1
)


# ── Model class — loaded once per container, reused across requests ───────────

@app.cls(
    image=image,
    gpu="A10G",                          # 24GB VRAM — fits Llama 8B fp16 cleanly
    secrets=[modal.Secret.from_name("huggingface")],
    volumes={"/models": model_volume},
    container_idle_timeout=300,          # keep warm for 5 min after last request
    timeout=600,
)
class InferenceModel:

    @modal.enter()
    def load(self):
        """
        Called once when the container starts.
        Loads Llama, PCA, regression weights, region names.
        On first ever cold start Llama downloads from HF (~10 min, 16GB).
        Subsequent cold starts load from Modal's layer cache (~60s).
        """
        import torch
        import pickle
        import json
        import h5py
        import numpy as np
        from transformers import AutoTokenizer, AutoModelForCausalLM

        MODEL_ID = "meta-llama/Llama-3.1-8B-Instruct"

        print("Loading tokenizer...")
        self.tokenizer = AutoTokenizer.from_pretrained(
            MODEL_ID,
            token=modal.Secret.from_name("huggingface"),
        )
        if self.tokenizer.pad_token is None:
            self.tokenizer.pad_token = self.tokenizer.eos_token

        print("Loading model...")
        self.model = AutoModelForCausalLM.from_pretrained(
            MODEL_ID,
            torch_dtype=torch.float16,
            device_map="auto",
            token=modal.Secret.from_name("huggingface"),
        )
        self.model.eval()
        print("Model loaded.")

        # Load regression artefacts from volume
        print("Loading regression artefacts...")
        with open("/models/pca.pkl", "rb") as f:
            self.pca = pickle.load(f)

        with h5py.File("/models/weights.h5", "r") as f:
            self.weights = np.array(f["weights"])       # (n_regions, 200)
            self.scaler_mean  = np.array(f["scaler_mean"])
            self.scaler_scale = np.array(f["scaler_scale"])

        with open("/models/region_names.json") as f:
            self.region_names = json.load(f)

        print(f"Ready. Regions: {len(self.region_names)}, weights: {self.weights.shape}")

    # ── Helpers ───────────────────────────────────────────────────────────────

    def _build_prompt(self, message: str, history: list) -> str:
        from prompts import SYSTEM_PROMPT
        """Format conversation history as Llama 3.1 Instruct chat template."""
        messages = [{"role": "system", "content": SYSTEM_PROMPT}]

        for turn in history:
            role = "user" if turn["speaker"] == "human" else "assistant"
            messages.append({"role": role, "content": turn["text"]})

        messages.append({"role": "user", "content": message})

        return self.tokenizer.apply_chat_template(
            messages,
            tokenize=False,
            add_generation_prompt=True,
        )

    def _hidden_states_to_layer_norms(self, hidden_states) -> list:
        """
        Convert raw hidden states to normalised per-layer activation scalars.

        hidden_states: tuple of (n_layers+1) tensors, each (1, n_tokens, hidden_dim)
        Returns: list of float, length NUM_LAYERS, values in [0, 1]
        """
        import torch
        import numpy as np

        # Skip embedding layer (index 0), take transformer layers 1..32
        norms = []
        for layer_hs in hidden_states[1:]:
            # Take last token position, compute L2 norm across hidden dim
            norm = torch.norm(layer_hs[0, -1, :].float()).item()
            norms.append(norm)

        # Normalise to [0, 1]
        norms = np.array(norms)
        if norms.max() > norms.min():
            norms = (norms - norms.min()) / (norms.max() - norms.min())
        else:
            norms = np.ones_like(norms) * 0.5

        return [round(float(v), 4) for v in norms]

    def _hidden_state_to_brain_activations(self, hidden_state) -> dict:
        """
        Map a single hidden state vector (position -1, all layers stacked)
        to predicted activation per Destrieux region.

        hidden_state: tensor (1, n_tokens, hidden_dim) from last transformer layer
                      — we use the full stack via the stored PCA.

        Actually we need the full (n_layers, hidden_dim) representation.
        This is called with the stacked last-token hidden states.
        """
        import numpy as np

        # hidden_state shape: (n_layers, hidden_dim) — last token, all layers
        hs_flat = hidden_state.reshape(1, -1).astype(np.float32)  # (1, n_layers*hidden_dim)

        # Apply PCA then scaler
        print("Applying new PCA logic")
        hs_pca    = self.pca.transform(hs_flat)     # (1, 200)
        hs_scaled = (hs_pca - self.scaler_mean) / self.scaler_scale
        
        # Apply regression weights: (n_regions, 200) @ (200, 1)
        predictions = (self.weights @ hs_scaled.T).flatten()  # (n_regions,)

        # Predictions are roughly BOLD z-scores (e.g., -0.3 to 0.3).
        # We want to highlight only the most active regions relative to the rest of the brain.
        # So we z-score the predictions themselves, and scale such that average=0,
        # +2 std = 1.0 (clipping to [0, 1]). This creates a sparse, contrasty visual.
        p_mean = predictions.mean()
        p_std = predictions.std() + 1e-8
        predictions = (predictions - p_mean) / p_std
        
        predictions = np.clip(predictions / 2.0, 0, 1)

        activations = {
            name: round(float(val), 4)
            for name, val in zip(self.region_names, predictions)
            if float(val) > 0.05
        }
        return activations

    def _detect_dominant_network_from_activations(self, activations: dict) -> str:
        """
        Derive dominant network empirically from predicted region activations,
        rather than keyword heuristics.
        """
        network_scores = {}
        for region, activation in activations.items():
            net = REGION_TO_NETWORK.get(region)
            if net:
                network_scores[net] = network_scores.get(net, 0) + activation

        if not network_scores:
            return 'language'
        return max(network_scores, key=network_scores.get)

    def _get_all_hidden_states_last_token(self, hidden_states_tuple) -> "np.ndarray":
        """
        Stack last-token hidden states from all transformer layers.
        Returns numpy array (n_layers, hidden_dim).
        """
        import numpy as np
        layers = []
        for hs in hidden_states_tuple[1:]:   # skip embedding layer
            layers.append(hs[0, -1, :].float().cpu().numpy())
        return np.stack(layers, axis=0)      # (n_layers, hidden_dim)

    # ── /chat endpoint ─────────────────────────────────────────────────────────

    @modal.fastapi_endpoint(method="POST")
    async def chat(self, request: dict):
        """
        Stream chat response with real activation data.

        Yields newline-delimited JSON:
            {type: "brain", data: {regionActivations, dominantNetwork}}
            {type: "token", data: {token, layerActivations}}
            {type: "done",  data: {fullText}}
        """
        import torch
        import json
        from fastapi.responses import StreamingResponse

        message = request.get("message", "")
        history = request.get("history", [])

        prompt = self._build_prompt(message, history)

        # ── Forward pass on full prompt to get brain activations ─────────────
        inputs = self.tokenizer(prompt, return_tensors="pt").to(self.model.device)

        with torch.no_grad():
            brain_outputs = self.model(
                **inputs,
                output_hidden_states=True,
            )

        # Extract last-token hidden states across all layers
        hs_last_token = self._get_all_hidden_states_last_token(
            brain_outputs.hidden_states
        )
        brain_activations = self._hidden_state_to_brain_activations(hs_last_token)
        dominant_network  = self._detect_dominant_network_from_activations(brain_activations)

        # ── Generation with per-token hidden states ───────────────────────────
        # We generate token by token using greedy decoding so we can stream
        # hidden states as they're produced.

        async def event_stream():
            # Brain activation event — fires before generation starts
            yield json.dumps({
                "type": "brain",
                "data": {
                    "regionActivations": brain_activations,
                    "dominantNetwork":   dominant_network,
                }
            }) + "\n"

            # Generate tokens one at a time
            generated_ids  = inputs["input_ids"].clone()
            generated_text = ""
            max_new_tokens = 1024

            for _ in range(max_new_tokens):
                with torch.no_grad():
                    token_outputs = self.model(
                        input_ids=generated_ids,
                        output_hidden_states=True,
                    )

                # Next token (greedy)
                next_token_id = token_outputs.logits[0, -1, :].argmax(dim=-1, keepdim=True)
                token_str     = self.tokenizer.decode(
                    next_token_id,
                    skip_special_tokens=True,
                )

                # Stop on EOS
                if next_token_id.item() == self.tokenizer.eos_token_id:
                    break

                # Layer activations for this token
                layer_norms = self._hidden_states_to_layer_norms(
                    token_outputs.hidden_states
                )

                generated_ids   = torch.cat([generated_ids, next_token_id.unsqueeze(0)], dim=1)
                generated_text += token_str

                yield json.dumps({
                    "type": "token",
                    "data": {
                        "token":            token_str,
                        "layerActivations": layer_norms,
                    }
                }) + "\n"

            yield json.dumps({
                "type": "done",
                "data": {"fullText": generated_text.strip()}
            }) + "\n"

        return StreamingResponse(event_stream(), media_type="text/plain")

    # ── /replay endpoint ───────────────────────────────────────────────────────

    @modal.fastapi_endpoint(method="POST")
    async def replay(self, request: dict):
        """
        Process completed conversation, return enriched turns in mock contract shape.
        For human turns: runs n forward passes (one per token) for token-by-token brain.
        For LLM turns:   runs one forward pass per token for layer stack.
        """
        import torch
        import numpy as np

        conversation = request.get("conversation", [])
        enriched     = []

        # Build running context so each turn has full history
        context_messages = []

        for i, turn in enumerate(conversation):
            speaker = turn.get("speaker", "human")
            text    = turn.get("text", "")

            if speaker == "human":
                # Token-by-token brain activations
                # Tokenize the human message at word level (split on spaces)
                import re
                tokens = re.findall(r"\w+|[^\w\s]", text)

                token_activations = []
                for j in range(len(tokens)):
                    # Progressive context: tokens up to position j
                    partial_text = " ".join(tokens[:j + 1])

                    # Build prompt with conversation history + partial human message
                    partial_messages = context_messages + [
                        {"role": "user", "content": partial_text}
                    ]
                    partial_prompt = self.tokenizer.apply_chat_template(
                        partial_messages,
                        tokenize=False,
                        add_generation_prompt=False,
                    )
                    inputs = self.tokenizer(
                        partial_prompt, return_tensors="pt"
                    ).to(self.model.device)

                    with torch.no_grad():
                        outputs = self.model(**inputs, output_hidden_states=True)

                    hs = self._get_all_hidden_states_last_token(outputs.hidden_states)
                    token_activations.append(
                        self._hidden_state_to_brain_activations(hs)
                    )

                final_activations = token_activations[-1] if token_activations else {}
                dominant = self._detect_dominant_network_from_activations(final_activations)

                enriched.append({
                    "index":   i,
                    "speaker": "human",
                    "text":    text,
                    "human": {
                        "tokens":            tokens,
                        "tokenActivations":  token_activations,
                        "regionActivations": final_activations,
                        "dominantNetwork":   dominant,
                    },
                    "llm": None,
                })

                context_messages.append({"role": "user", "content": text})

            else:
                # LLM turn — layer activations per token
                import re
                tokens = re.findall(r"\w+|[^\w\s]", text)
                layer_activations_list = []

                for j, token in enumerate(tokens):
                    partial_text = " ".join(tokens[:j + 1])
                    partial_messages = context_messages + [
                        {"role": "assistant", "content": partial_text}
                    ]
                    partial_prompt = self.tokenizer.apply_chat_template(
                        partial_messages,
                        tokenize=False,
                        add_generation_prompt=False,
                    )
                    inputs = self.tokenizer(
                        partial_prompt, return_tensors="pt"
                    ).to(self.model.device)

                    with torch.no_grad():
                        outputs = self.model(**inputs, output_hidden_states=True)

                    layer_activations_list.append(
                        self._hidden_states_to_layer_norms(outputs.hidden_states)
                    )

                # Dominant network from layer weights
                dominant = LAYER_NETWORK[layer_activations_list[-1].index(
                    max(layer_activations_list[-1])
                )] if layer_activations_list else 'language'

                enriched.append({
                    "index":   i,
                    "speaker": "llm",
                    "text":    text,
                    "human":   None,
                    "llm": {
                        "tokens":           tokens,
                        "layerActivations": layer_activations_list,
                        "dominantNetwork":  dominant,
                    },
                })

                context_messages.append({"role": "assistant", "content": text})

        return {"conversation": enriched}
