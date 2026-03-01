"""
Parse Praat TextGrid files to extract word-level timing.

TextGrids for ds003020 have two tiers:
    1. "phone"  — ARPAbet phoneme labels (AO2, L, R, ...)
    2. "word"   — actual word tokens (all, right, thank, ...)

We extract only the "word" tier. Failing to filter by tier name
causes the phoneme tier to be returned instead, giving near-zero
TR coverage because phoneme tokens are meaningless for alignment.

TextGrid format (Praat ooTextFile):
    item [N]:
        class = "IntervalTier"
        name = "word"
        xmin = ...
        xmax = ...
        intervals: size = ...
        intervals [1]:
            xmin = <onset>
            xmax = <offset>
            text = "<word>"
"""

import re
import os
from dataclasses import dataclass
from typing import List, Optional


@dataclass
class Word:
    text:   str
    onset:  float   # seconds from story start
    offset: float   # seconds from story start


def parse_textgrid(path: str) -> List[Word]:
    """
    Parse a .TextGrid file and return Word objects from the 'word' tier only.
    Silences and non-lexical markers are excluded.
    """
    with open(path, 'r', encoding='utf-8', errors='replace') as f:
        content = f.read()

    # ── 1. Find the 'word' tier block ────────────────────────────────────────
    # Tier blocks start with `name = "word"` and end at the next `name = ...`
    # or end of file.
    word_tier_match = re.search(r'name\s*=\s*"word"', content)
    if word_tier_match is None:
        # Fall back to full content if tier not found (shouldn't happen)
        tier_content = content
    else:
        tier_start = word_tier_match.start()
        # Find the start of the *next* tier (if any) to bound our search
        next_tier = re.search(r'name\s*=\s*"', content[tier_start + 1:])
        if next_tier:
            tier_end = tier_start + 1 + next_tier.start()
        else:
            tier_end = len(content)
        tier_content = content[tier_start:tier_end]

    # ── 2. Extract all intervals from the word tier ───────────────────────────
    interval_pattern = re.compile(
        r'xmin\s*=\s*([\d.]+)\s*\n\s*xmax\s*=\s*([\d.]+)\s*\n\s*text\s*=\s*"([^"]*)"'
    )

    SILENCES = {'', 'sp', 'sil', '{BR}', '{NS}', '{LG}', '{AH}', '{UM}'}

    words = []
    for match in interval_pattern.finditer(tier_content):
        onset  = float(match.group(1))
        offset = float(match.group(2))
        text   = match.group(3).strip()

        if text and text not in SILENCES:
            words.append(Word(text=text, onset=onset, offset=offset))

    return words


def words_to_tr_bins(words: List[Word], tr: float, n_trs: int) -> List[List[Word]]:
    """
    Bin words into TR windows.

    Each TR covers [i*tr, (i+1)*tr) seconds.
    A word is assigned to the TR in which its onset falls.

    Args:
        words:  list of Word objects
        tr:     repetition time in seconds (typically 2.0 for this dataset)
        n_trs:  total number of TRs in the BOLD run

    Returns:
        List of length n_trs, each element is a list of Words in that TR
    """
    bins = [[] for _ in range(n_trs)]

    for word in words:
        tr_idx = int(word.onset / tr)
        if 0 <= tr_idx < n_trs:
            bins[tr_idx].append(word)

    return bins


def get_story_name_from_bold_path(bold_path: str) -> Optional[str]:
    """
    Extract story name from BOLD filename.
    e.g. sub-UTS01_ses-2_task-alternateithicatom_bold.nii.gz
         → alternateithicatom
    """
    filename = os.path.basename(bold_path)
    match = re.search(r'task-([^_]+)_bold', filename)
    return match.group(1) if match else None


if __name__ == '__main__':
    # Smoke test
    import sys
    if len(sys.argv) > 1:
        words = parse_textgrid(sys.argv[1])
        print(f"Parsed {len(words)} words")
        print("First 10:", [(w.text, round(w.onset, 2)) for w in words[:10]])
