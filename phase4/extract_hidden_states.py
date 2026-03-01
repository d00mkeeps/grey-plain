"""
Extract Llama hidden states for fMRI stimulus stories and align to TR.

APPROACH:
    For each story:
    1. Parse TextGrid to get word timings
    2. Load BOLD NIfTI to get TR and number of TRs
    3. Pre-tokenize each word to get token counts
    4. Greedily build chunks of words that fit within MAX_SEQ_LEN tokens
    5. For each chunk run a forward pass with output_hidden_states=True
    6. Reconstruct word boundaries from sentencepiece ▁ prefix heuristic
    7. Accumulate word hidden states into TR bins using word onset times
    8. Save aligned hidden states as (n_trs, n_layers, hidden_dim) array

CHUNKING:
    Long stories (often 8000-10000 words) far exceed 4096 tokens.
    We pre-tokenize each word individually to compute exact token counts,
    then greedily accumulate words into chunks ≤ MAX_SEQ_LEN tokens.
    Each chunk is processed independently; results are accumulated into
    the same TR-indexed array, so coverage approaches 100% for all stories.

ASSUMPTIONS (documented in docs/methodology.md):
    - Hidden states from different chunks are not cross-attending, so words
      near chunk boundaries have slightly degraded contextual representations.
      Chunk size of 4096 tokens (~3000 words, ~100 TRs) keeps this minimal.
    - We use the last token position hidden state per word.
    - Llama-3.1-8B-Instruct instruct fine-tuning; middle layers most reliable.
    - Single subject (UTS01), population average proxy.

OUTPUT:
    data/hidden_states/{story_name}.h5
        'hidden_states': float32 (n_trs, n_layers, hidden_dim)
        'tr': float scalar
        'n_trs': int
        'story': str
        'n_chunks': int
"""

import os
import h5py
import torch
import numpy as np
import nibabel as nib
from pathlib import Path
from transformers import AutoTokenizer, AutoModelForCausalLM
from parse_textgrids import parse_textgrid, get_story_name_from_bold_path

# ── Config ────────────────────────────────────────────────────────────────────

MODEL_ID   = "meta-llama/Llama-3.1-8B-Instruct"
BASE_DIR   = Path(__file__).resolve().parent
DATA_DIR   = BASE_DIR / "data"
TEXTGRID_DIR = DATA_DIR / "textgrids"
BOLD_DIR   = DATA_DIR / "bold"
OUTPUT_DIR = DATA_DIR / "hidden_states"
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

DEVICE      = "cuda" if torch.cuda.is_available() else "cpu"
MAX_SEQ_LEN = 4096   # max tokens per chunk

# ── Load model ────────────────────────────────────────────────────────────────

print(f"Loading {MODEL_ID}...")
tokenizer = AutoTokenizer.from_pretrained(MODEL_ID)
model     = AutoModelForCausalLM.from_pretrained(
    MODEL_ID,
    dtype=torch.float16,
    device_map="auto",
)
model.eval()
print(f"Model loaded on {DEVICE}")

# ── Core: forward pass for one text chunk ─────────────────────────────────────

def get_chunk_hidden_states(text: str):
    """
    Run one forward pass and return (token_strings, hidden_states).

    hidden_states: float32 (n_tokens, n_layers, hidden_dim)
    """
    inputs = tokenizer(text, return_tensors="pt",
                       truncation=True, max_length=MAX_SEQ_LEN)
    inputs = {k: v.to(DEVICE) for k, v in inputs.items()}

    with torch.no_grad():
        outputs = model(**inputs, output_hidden_states=True)

    # Stack transformer layers (skip embedding at index 0)
    hs = torch.stack(outputs.hidden_states[1:], dim=0)  # (n_layers, 1, n_tok, d)
    hs = hs.squeeze(1).permute(1, 0, 2)                 # (n_tok, n_layers, d)
    hs = hs.cpu().float().numpy()

    token_ids     = inputs['input_ids'][0].cpu().numpy()
    token_strings = tokenizer.convert_ids_to_tokens(token_ids)
    return token_strings, hs


# ── Build word groups from sentencepiece tokens ───────────────────────────────

def tokens_to_word_groups(token_strings):
    """
    Split token list into per-word groups.

    Llama uses BPE with a 'Ġ' (U+0120) prefix to mark tokens that start
    a new word (i.e. are preceded by a space). This is different from
    SentencePiece models that use '▁' (U+2581).

    We also skip the BOS token (<|begin_of_text|>) at position 0.
    """
    groups, current = [], []
    for i, tok in enumerate(token_strings):
        # Skip BOS token
        if tok in ('<|begin_of_text|>', '<s>'):
            continue
        if tok.startswith('Ġ') and current:
            groups.append(current)
            current = [i]
        else:
            current.append(i)
    if current:
        groups.append(current)
    return groups


# ── Pre-compute per-word token counts ─────────────────────────────────────────

def word_token_counts(words):
    """
    Tokenize each word individually (no special tokens) to get token counts.
    This lets us build chunks in O(n) without re-tokenizing.
    """
    counts = []
    for w in words:
        ids = tokenizer.encode(w.text, add_special_tokens=False)
        counts.append(max(1, len(ids)))   # at least 1 token per word
    return counts


# ── Chunked processing ────────────────────────────────────────────────────────

def extract_and_align(words, tr, n_trs):
    """
    Process a full story in chunks, accumulating hidden states per TR.

    Returns:
        aligned:  float32 (n_trs, n_layers, hidden_dim)
        coverage: float — fraction of TRs with at least one word
        n_chunks: int
    """
    tok_counts = word_token_counts(words)

    aligned  = None
    counts   = None
    n_chunks = 0

    i = 0
    while i < len(words):
        # Greedily build chunk: accumulate words until MAX_SEQ_LEN would be exceeded
        j         = i
        chunk_len = 0  # token count including BOS + separating spaces
        while j < len(words):
            # +1 for the space token between words (conservative)
            if chunk_len + tok_counts[j] + 1 > MAX_SEQ_LEN and j > i:
                break
            chunk_len += tok_counts[j] + 1
            j += 1

        chunk_words = words[i:j]
        chunk_text  = ' '.join(w.text for w in chunk_words)

        token_strings, hidden_states = get_chunk_hidden_states(chunk_text)

        # Initialise output arrays on first chunk
        if aligned is None:
            n_layers   = hidden_states.shape[1]
            hidden_dim = hidden_states.shape[2]
            aligned    = np.zeros((n_trs, n_layers, hidden_dim), dtype=np.float32)
            counts     = np.zeros(n_trs, dtype=np.int32)

        word_groups = tokens_to_word_groups(token_strings)
        n_match     = min(len(chunk_words), len(word_groups))

        for word_idx in range(n_match):
            word   = chunk_words[word_idx]
            tr_idx = int(word.onset / tr)
            if not (0 <= tr_idx < n_trs):
                continue
            # Last token of word group = richest contextual representation
            token_idx      = word_groups[word_idx][-1]
            aligned[tr_idx] += hidden_states[token_idx]
            counts[tr_idx]  += 1

        n_chunks += 1
        i = j

    # Average TRs with multiple words
    valid = counts > 0
    if valid.any():
        aligned[valid] /= counts[valid, None, None]
    coverage = float(valid.sum()) / n_trs
    return aligned, coverage, n_chunks


# ── Per-story pipeline ────────────────────────────────────────────────────────

def process_story(bold_path: Path):
    story_name = get_story_name_from_bold_path(str(bold_path))
    if story_name is None:
        print(f"  Skipping {bold_path.name} — could not parse story name")
        return

    textgrid_path = TEXTGRID_DIR / f"{story_name}.TextGrid"
    if not textgrid_path.exists():
        print(f"  Skipping {story_name} — no TextGrid found")
        return

    output_path = OUTPUT_DIR / f"{story_name}.h5"
    if output_path.exists():
        print(f"  Skipping {story_name} — already processed")
        return

    print(f"  Processing: {story_name}")

    bold_img = nib.load(str(bold_path))
    tr       = float(bold_img.header.get_zooms()[3])
    n_trs    = bold_img.shape[3]
    print(f"    TR={tr}s, n_trs={n_trs}")

    words = parse_textgrid(str(textgrid_path))
    print(f"    Words: {len(words)}")

    if not words:
        print(f"    Skipping {story_name} — word tier is empty")
        return

    aligned, coverage, n_chunks = extract_and_align(words, tr, n_trs)
    print(f"    Chunks: {n_chunks}, TR coverage: {coverage:.1%}")

    with h5py.File(output_path, 'w') as f:
        f.create_dataset('hidden_states', data=aligned, compression='gzip')
        f.create_dataset('tr',            data=tr)
        f.create_dataset('n_trs',         data=n_trs)
        f.attrs['story']    = story_name
        f.attrs['model']    = MODEL_ID
        f.attrs['n_layers'] = aligned.shape[1]
        f.attrs['n_chunks'] = n_chunks
        f.attrs['coverage'] = coverage

    print(f"    Saved → {output_path}")


# ── Main ──────────────────────────────────────────────────────────────────────

if __name__ == '__main__':
    bold_files = sorted(BOLD_DIR.rglob("*.nii.gz"))
    print(f"Found {len(bold_files)} BOLD files")

    for bold_path in bold_files:
        try:
            process_story(bold_path)
        except Exception as e:
            print(f"  ERROR on {bold_path.name}: {e} — skipping")

    print("\nAll done.")
    print(f"Output: {list(OUTPUT_DIR.glob('*.h5'))}")
