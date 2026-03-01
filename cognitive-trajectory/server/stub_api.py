"""
Stub inference API — returns realistic-shaped activation data
without running actual Llama inference. Used for frontend
development before Modal deployment.

Realistic behaviour:
- Layer activations follow a bell curve peaking in middle layers
- Brain activations vary by detected semantic content
- Streaming simulates token-by-token generation latency
"""

import asyncio
import json
import numpy as np
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import List

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Region/network definitions ────────────────────────────────────────────────

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

# Flatten to region → network
REGION_TO_NETWORK = {}
for net, regions in REGION_NETWORKS.items():
    for r in regions:
        REGION_TO_NETWORK[r] = net

NUM_LAYERS = 32

# Empirical layer→network from regression
LAYER_NETWORK = (
    ['limbic'] * 6 +
    ['visual'] * 11 +
    ['language'] * 4 +
    ['attention'] * 10 +
    ['visual'] * 1
)

# ── Activation generators ─────────────────────────────────────────────────────

def detect_dominant_network(text: str) -> str:
    """Heuristic network detection from text content."""
    text_lower = text.lower()
    scores = {
        'language':  sum(w in text_lower for w in
                         ['brain', 'language', 'word', 'think', 'concept', 'semantic',
                          'meaning', 'understand', 'explain', 'say', 'tell']),
        'dmn':       sum(w in text_lower for w in
                         ['remember', 'memory', 'past', 'future', 'imagine', 'wonder',
                          'feel', 'sense', 'reflect', 'myself', 'self']),
        'attention': sum(w in text_lower for w in
                         ['focus', 'attention', 'notice', 'aware', 'consider', 'analyse',
                          'question', 'how', 'why', 'what', 'could', 'would']),
        'visual':    sum(w in text_lower for w in
                         ['see', 'look', 'visual', 'image', 'picture', 'colour', 'shape',
                          'space', 'object', 'scene']),
        'limbic':    sum(w in text_lower for w in
                         ['feel', 'emotion', 'fear', 'love', 'stress', 'anxiety',
                          'happy', 'sad', 'excited', 'nervous']),
    }
    return max(scores, key=scores.get) if max(scores.values()) > 0 else 'language'


def generate_brain_activations(text: str, dominant_network: str) -> dict:
    """
    Generate realistic region activations.
    Dominant network regions get higher activation,
    related networks moderate, others low background.
    """
    activations = {}
    rng = np.random.default_rng(abs(hash(text)) % (2**32))

    for region, network in REGION_TO_NETWORK.items():
        if network == dominant_network:
            base = rng.uniform(0.55, 0.92)
        elif network in ['language', 'attention']:
            # always somewhat active for conversational content
            base = rng.uniform(0.25, 0.55)
        else:
            base = rng.uniform(0.05, 0.25)

        activations[region] = round(float(base), 4)

    return activations


def generate_layer_activations(n_tokens: int, dominant_network: str) -> list:
    """
    Generate per-token layer activations.
    Shape follows bell curve peaking at middle layers,
    with network-specific layer emphasis.
    """
    rng = np.random.default_rng(n_tokens * 7)
    result = []

    for t in range(n_tokens):
        token_progress = t / max(n_tokens - 1, 1)   # 0 → 1
        layers = []

        for layer in range(NUM_LAYERS):
            # Bell curve peaking around layer 10-16
            peak      = 12 + token_progress * 4
            bell      = np.exp(-((layer - peak) ** 2) / (2 * 8 ** 2))

            # Network-specific boost
            net       = LAYER_NETWORK[layer]
            net_boost = 0.15 if net == dominant_network else 0.0

            # Token-level variation
            noise     = rng.uniform(-0.05, 0.05)

            act = float(np.clip(0.2 + bell * 0.75 + net_boost + noise, 0, 1))
            layers.append(round(act, 4))

        result.append(layers)

    return result


def tokenize_simple(text: str) -> list:
    """Rough word-level tokenization for stub."""
    import re
    return re.findall(r"\w+|[^\w\s]", text)


# ── Canned LLM responses for stub ────────────────────────────────────────────

STUB_RESPONSES = [
    "That's a fascinating perspective. The relationship between cognitive states and representational geometry is still an open question, but recent work in mechanistic interpretability suggests that meaning is encoded in structured ways across transformer layers.",
    "Exactly. The attractor dynamics framework you're describing has strong empirical support — both in neural trajectory research and in studies of LLM embedding convergence under paraphrasing.",
    "The coupling question is genuinely difficult. Current interfaces are lossy by design — text serialises thought, which means we're always working with a compressed projection of the actual cognitive state.",
    "That's the core insight. The middle layers of transformer models show the strongest alignment with brain association cortex — particularly the language and default mode networks. This isn't coincidental.",
    "Right — and the inverse is interesting too. When the model's representational trajectory diverges from what the human seems to be tracking, that's often when miscommunication occurs.",
]

stub_response_idx = 0

# ── Endpoints ─────────────────────────────────────────────────────────────────

class ChatRequest(BaseModel):
    message: str
    history: list = []


class ReplayRequest(BaseModel):
    conversation: list   # [{speaker, text}, ...]


@app.post("/chat")
async def chat(request: ChatRequest):
    """
    Stream chat response with activation data.
    
    Yields newline-delimited JSON events:
        {type: "brain", data: {regionActivations, dominantNetwork}}
        {type: "token", data: {token, layerActivations}}
        {type: "done",  data: {fullText}}
    """
    global stub_response_idx

    dominant = detect_dominant_network(request.message)
    brain_activations = generate_brain_activations(request.message, dominant)

    # Pick response
    response_text = STUB_RESPONSES[stub_response_idx % len(STUB_RESPONSES)]
    stub_response_idx += 1
    tokens = tokenize_simple(response_text)
    layer_activations = generate_layer_activations(len(tokens), dominant)

    async def event_stream():
        # First event: brain activations (computed from human message)
        yield json.dumps({
            "type": "brain",
            "data": {
                "regionActivations": brain_activations,
                "dominantNetwork":   dominant,
            }
        }) + "\n"

        await asyncio.sleep(0.05)

        # Token events: stream with realistic latency
        for i, (token, layers) in enumerate(zip(tokens, layer_activations)):
            yield json.dumps({
                "type": "token",
                "data": {
                    "token":           token,
                    "layerActivations": layers,
                }
            }) + "\n"
            await asyncio.sleep(0.06)   # ~16 tokens/sec

        # Done event
        yield json.dumps({
            "type": "done",
            "data": {"fullText": response_text}
        }) + "\n"

    return StreamingResponse(event_stream(), media_type="text/plain")


@app.post("/replay")
async def replay(request: ReplayRequest):
    """
    Process a completed conversation and return full enriched data
    in mock conversation contract shape.
    """
    enriched = []

    for i, turn in enumerate(request.conversation):
        speaker = turn.get("speaker", "human")
        text    = turn.get("text", "")
        dominant = detect_dominant_network(text)
        tokens   = tokenize_simple(text)

        if speaker == "human":
            # Token-by-token brain activations
            token_activations = [
                generate_brain_activations(
                    " ".join(tokens[:j+1]),   # progressive context
                    dominant
                )
                for j in range(len(tokens))
            ]
            enriched.append({
                "index":   i,
                "speaker": "human",
                "text":    text,
                "human": {
                    "tokens":           tokens,
                    "tokenActivations": token_activations,
                    "regionActivations": token_activations[-1] if token_activations else {},
                    "dominantNetwork":  dominant,
                },
                "llm": None,
            })
        else:
            layer_acts = generate_layer_activations(len(tokens), dominant)
            enriched.append({
                "index":   i,
                "speaker": "llm",
                "text":    text,
                "human":   None,
                "llm": {
                    "tokens":          tokens,
                    "layerActivations": layer_acts,
                    "dominantNetwork": dominant,
                },
            })

    return {"conversation": enriched}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
