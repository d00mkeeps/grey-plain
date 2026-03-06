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
import os
import json

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
            token=True,
        )
        if self.tokenizer.pad_token is None:
            self.tokenizer.pad_token = self.tokenizer.eos_token

        print("Loading model...")
        self.model = AutoModelForCausalLM.from_pretrained(
            MODEL_ID,
            torch_dtype=torch.float16,
            device_map="auto",
            token=True,
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

    def _hidden_states_to_layer_norms(self, hidden_states, running_stats=None) -> tuple[list, dict]:
        """
        Convert raw hidden states to normalised per-layer activation scalars.

        hidden_states: tuple of (n_layers+1) tensors, each (1, n_tokens, hidden_dim)
        running_stats: {layer_idx: {'mean': float, 'm2': float, 'n': int}}
        Returns: (layer_activations, updated_running_stats)
        """
        import torch
        import numpy as np

        if running_stats is None:
            running_stats = {}

        is_first_token = (len(running_stats) == 0)

        # Skip embedding layer (index 0), take transformer layers 1..32
        norms = []
        for i, layer_hs in enumerate(hidden_states[1:]):
            # Take last token position, compute L2 norm across hidden dim
            norm = torch.norm(layer_hs[0, -1, :].float()).item()
            norms.append(norm)

            if i not in running_stats:
                running_stats[i] = {'mean': 0.0, 'm2': 0.0, 'n': 0}
            
            stats = running_stats[i]
            stats['n'] += 1
            delta = norm - stats['mean']
            stats['mean'] += delta / stats['n']
            delta2 = norm - stats['mean']
            stats['m2'] += delta * delta2

        norms = np.array(norms)
        
        if is_first_token:
            if norms.max() > norms.min():
                norms = (norms - norms.min()) / (norms.max() - norms.min())
            else:
                norms = np.ones_like(norms) * 0.5
        else:
            z_scores = []
            for i, norm in enumerate(norms):
                stats = running_stats[i]
                std = np.sqrt(stats['m2'] / stats['n']) if stats['n'] > 1 else 1e-8
                std = max(std, 1e-8)
                z = (norm - stats['mean']) / std
                z_scores.append(z)
            z_scores = np.array(z_scores)
            norms = np.clip(z_scores / 2.0, 0, 1)

        return [round(float(v), 4) for v in norms], running_stats

    def _hidden_state_to_brain_activations(self, hidden_state, running_stats: dict = None) -> tuple[dict, dict]:
        """
        Map a single hidden state vector (position -1, all layers stacked)
        to predicted activation per Destrieux region.
        
        Returns: (activations_dict, updated_running_stats)
        """
        import numpy as np
        
        if running_stats is None:
            running_stats = {}

        # hidden_state shape: (n_layers, hidden_dim) — last token, all layers
        hs_flat = hidden_state.reshape(1, -1).astype(np.float32)  # (1, n_layers*hidden_dim)

        # Apply PCA then scaler
        print("Applying new PCA logic")
        hs_pca    = self.pca.transform(hs_flat)     # (1, 200)
        hs_scaled = (hs_pca - self.scaler_mean) / self.scaler_scale
        
        # Apply regression weights: (n_regions, 200) @ (200, 1)
        predictions = (self.weights @ hs_scaled.T).flatten()  # (n_regions,)

        is_first_token = len(running_stats) == 0
        if is_first_token:
            for i, p in enumerate(predictions):
                running_stats[i] = {'n': 1, 'mean': p, 'm2': 0.0}
        else:
            for i, p in enumerate(predictions):
                st = running_stats[i]
                st['n'] += 1
                delta = p - st['mean']
                st['mean'] += delta / st['n']
                delta2 = p - st['mean']
                st['m2'] += delta * delta2

        if is_first_token:
            p_mean = predictions.mean()
            p_std = predictions.std() + 1e-8
            z_scores = (predictions - p_mean) / p_std
            norms = np.clip(z_scores / 2.0, 0, 1)
        else:
            z_scores = []
            for i, p in enumerate(predictions):
                stats = running_stats[i]
                std = np.sqrt(stats['m2'] / stats['n']) if stats['n'] > 1 else 1e-8
                std = max(std, 1e-8)
                z = (p - stats['mean']) / std
                z_scores.append(z)
            z_scores = np.array(z_scores)
            norms = np.clip(z_scores / 2.0, 0, 1)

        activations = {
            name: round(float(val), 4)
            for name, val in zip(self.region_names, norms)
        }
        active_count = sum(1 for v in activations.values() if v > 0.05)
        print(f"Computed activations for {len(activations)} regions, {active_count} active >0.05")
        return activations, running_stats

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
        brain_activations, _ = self._hidden_state_to_brain_activations(hs_last_token)
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
            
            running_stats = {}

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
                layer_norms, running_stats = self._hidden_states_to_layer_norms(
                    token_outputs.hidden_states, running_stats
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

        return StreamingResponse(
            event_stream(), 
            media_type="text/plain",
            headers={
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
                "Access-Control-Allow-Headers": "Content-Type",
            }
        )

    # ── /replay endpoint ───────────────────────────────────────────────────────

    @modal.fastapi_endpoint(method="POST", timeout=300)
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
                running_stats = {}
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
                    act, running_stats = self._hidden_state_to_brain_activations(hs, running_stats)
                    token_activations.append(act)
                    print(f"Token {j} '{tokens[j]}' -> {sum(1 for v in act.values() if v > 0.05)} active regions")

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
                running_stats = {}

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

                    layer_norms, running_stats = self._hidden_states_to_layer_norms(outputs.hidden_states, running_stats)
                    layer_activations_list.append(layer_norms)

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

        from fastapi import Response
        return Response(
            content=json.dumps({"conversation": enriched}),
            media_type="application/json",
            headers={
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
                "Access-Control-Allow-Headers": "Content-Type",
            }
        )
