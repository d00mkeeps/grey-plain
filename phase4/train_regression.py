"""
Train ridge regression: Llama hidden states → Destrieux region activation.

For each of the 75 Destrieux regions:
    - Input:  per-layer mean-pooled hidden states (n_trs, n_layers)
    - Output: mean BOLD activation in that region (n_trs,)
    - Model:  ridge regression with cross-validated alpha

DIMENSIONALITY:
    Raw hidden states are (n_trs, 32, 4096). We mean-pool the 4096
    hidden dim per layer, giving (n_trs, 32). This is sufficient to
    determine which layers best predict each region, which is all we
    need for the layer→network colour assignment. Full 131K-dim
    regression is intractable with sklearn RidgeCV.
    - Output: mean BOLD activation in that region (n_trs,)
    - Model:  ridge regression with cross-validated alpha

ASSUMPTIONS (documented):
    - We concatenate all layers as predictors. An alternative is to train
      per-layer and select the best — we document layer weights so the
      layer→network colour assignment can be derived post-hoc.
    - BOLD signal is not deconvolved for haemodynamic response. We apply
      a simple 2-TR lag (4 seconds) to account for HRF peak delay.
      A full HRF deconvolution would be more rigorous.
    - We use mean activation within each Destrieux parcel. Voxelwise
      regression (as in the original Huth lab pipeline) would be more
      precise but requires significantly more compute and memory.
    - Stories are concatenated across sessions. Session-level confounds
      (drift, motion) are not modelled. A proper pipeline would include
      nuisance regression.

OUTPUT:
    data/regression/
        weights.h5          — regression weights per region
        region_names.json   — ordered list of region names
        layer_network_map.json — empirical layer→network assignment
        metrics.json        — r² per region (train/test split)
"""

import json
import h5py
import numpy as np
import nibabel as nib
from pathlib import Path
from sklearn.linear_model import RidgeCV
from sklearn.model_selection import KFold
from sklearn.preprocessing import StandardScaler
from nilearn.datasets import fetch_atlas_surf_destrieux, load_fsaverage
from nilearn import surface
from parse_textgrids import get_story_name_from_bold_path

# ── Config ────────────────────────────────────────────────────────────────────

BASE_DIR       = Path(__file__).resolve().parent
DATA_DIR       = BASE_DIR / "data"
BOLD_DIR       = DATA_DIR / "bold"
HS_DIR         = DATA_DIR / "hidden_states"
OUTPUT_DIR     = DATA_DIR / "regression"
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

HRF_LAG_TRS    = 2      # shift BOLD by 2 TRs to account for HRF (~4s)
ALPHAS         = [0.01, 0.1, 1.0, 10.0, 100.0, 1000.0]

# ── Load Destrieux parcellation ───────────────────────────────────────────────

print("Loading Destrieux atlas...")
destrieux    = fetch_atlas_surf_destrieux()
region_names = [
    (r.decode('utf-8') if isinstance(r, bytes) else r)
    for r in destrieux['labels']
]
map_left  = destrieux['map_left']   # vertex → region index, left hemi
map_right = destrieux['map_right']  # vertex → region index, right hemi

# Load fsaverage5 surface for vertex coordinates
fsaverage5   = load_fsaverage('fsaverage5')

print(f"Regions: {len(region_names)}")

# ── Helper: extract mean BOLD per Destrieux region ───────────────────────────

def bold_to_region_timeseries(bold_path: Path):
    """
    Load BOLD NIfTI and extract mean timeseries per Destrieux region.

    The BOLD volume is in MNI space. We project to fsaverage5 surface
    using nilearn's vol_to_surf, then average within Destrieux parcels.

    Returns:
        region_ts: float32 (n_trs, n_regions)
        tr: float
    """
    bold_img = nib.load(str(bold_path))
    tr       = float(bold_img.header.get_zooms()[3])
    n_trs    = bold_img.shape[3]

    region_ts = np.zeros((n_trs, len(region_names)), dtype=np.float32)

    for hemi, hemi_map in [('left', map_left), ('right', map_right)]:
        # Project volume to surface
        surf_data = surface.vol_to_surf(
            bold_img,
            fsaverage5['pial'].parts[hemi],
            interpolation='linear',
        )   # shape: (n_vertices, n_trs)

        # Average within each region
        for region_idx in range(len(region_names)):
            vertex_mask = (hemi_map == region_idx)
            if vertex_mask.sum() == 0:
                continue
            region_ts[:, region_idx] += surf_data[vertex_mask].mean(axis=0)

    # Average across hemispheres (both contribute to bilateral regions)
    region_ts /= 2.0

    return region_ts, tr


# ── Build dataset ─────────────────────────────────────────────────────────────

def build_dataset():
    """
    Concatenate aligned hidden states and region timeseries across all stories.

    Returns:
        X: float32 (total_trs, n_layers * hidden_dim)
        Y: float32 (total_trs, n_regions)
    """
    X_list = []
    Y_list = []

    hs_files = sorted(HS_DIR.glob("*.h5"))
    print(f"Found {len(hs_files)} processed stories")

    for hs_path in hs_files:
        story_name = hs_path.stem

        # Find matching BOLD
        bold_matches = list(BOLD_DIR.rglob(f"*task-{story_name}_bold.nii.gz"))
        if not bold_matches:
            print(f"  No BOLD for {story_name}, skipping")
            continue

        bold_path = bold_matches[0]
        print(f"  Loading {story_name}...")

        try:
            with h5py.File(hs_path, 'r') as f:
                hs = f['hidden_states'][:]

            region_ts, tr = bold_to_region_timeseries(bold_path)

            n_trs = min(hs.shape[0], region_ts.shape[0])
            hs        = hs[:n_trs]
            region_ts = region_ts[:n_trs]

            if HRF_LAG_TRS > 0:
                region_ts = region_ts[HRF_LAG_TRS:]
                hs        = hs[:-HRF_LAG_TRS]

            # Zero-row mask — exclude TRs with no words mapped
            valid_mask = hs.sum(axis=(1, 2)) != 0
            hs        = hs[valid_mask]
            region_ts = region_ts[valid_mask]

            # Z-score BOLD per story to remove session-level offsets
            from scipy.stats import zscore
            region_ts = zscore(region_ts, axis=0, nan_policy='omit')
            # Replace any NaNs from zero-variance regions with 0
            region_ts = np.nan_to_num(region_ts, nan=0.0)

            # Flatten — keep full dimensionality, PCA applied after concatenation
            hs_flat = hs.reshape(hs.shape[0], -1)  # (n_valid_trs, 32*4096)

            X_list.append(hs_flat)
            Y_list.append(region_ts)
            print(f"    X: {hs_flat.shape}, Y: {region_ts.shape}, valid_trs: {valid_mask.sum()}/{len(valid_mask)}")

        except Exception as e:
            print(f"  ERROR on {story_name}: {e} — skipping")

    if not X_list:
        raise ValueError("No data loaded — check paths")

    X = np.concatenate(X_list, axis=0)
    Y = np.concatenate(Y_list, axis=0)
    print(f"\nFull dataset: X={X.shape}, Y={Y.shape}")
    return X, Y


# ── Train regression ──────────────────────────────────────────────────────────

def train(X, Y):
    import pickle
    from sklearn.decomposition import PCA

    print("Applying PCA (n_components=200)...")
    hs_flat = X  # already flattened from build_dataset
    pca = PCA(n_components=200, random_state=42)
    X_pca = pca.fit_transform(hs_flat)
    print(f"Explained variance: {pca.explained_variance_ratio_.sum():.1%}")

    # Save PCA — needed at inference time
    with open('data/regression/pca.pkl', 'wb') as f:
        pickle.dump(pca, f)
    print("Saved PCA → data/regression/pca.pkl")

    print("Scaling PCA features...")
    scaler   = StandardScaler()
    X_scaled = scaler.fit_transform(X_pca)

    # Zero-row mask on full concatenated X
    valid_mask = X_scaled.sum(axis=1) != 0
    X_scaled   = X_scaled[valid_mask]
    Y          = Y[valid_mask]
    print(f"After final zero-row mask: {X_scaled.shape}")

    n_regions  = Y.shape[1]
    n_features = X_scaled.shape[1]

    weights = np.zeros((n_regions, n_features), dtype=np.float32)
    metrics = {}

    # Simple train/test split — last 20% as held-out test
    split    = int(len(X_scaled) * 0.8)
    X_train, X_test = X_scaled[:split], X_scaled[split:]
    Y_train, Y_test = Y[:split],        Y[split:]

    print(f"Training {n_regions} ridge regressions...")
    for region_idx in range(n_regions):
        name    = region_names[region_idx]
        y_train = Y_train[:, region_idx]
        y_test  = Y_test[:,  region_idx]

        # Skip regions with near-zero variance (no signal)
        if y_train.std() < 1e-6:
            print(f"  [{region_idx:3d}] {name}: skipped (no variance)")
            continue

        ridge = RidgeCV(alphas=ALPHAS, cv=5)
        ridge.fit(X_train, y_train)

        weights[region_idx] = ridge.coef_
        r2_test = ridge.score(X_test, y_test)
        metrics[name] = {
            'r2_test': float(r2_test),
            'alpha':   float(ridge.alpha_),
        }

        if region_idx % 10 == 0:
            print(f"  [{region_idx:3d}] {name}: r²={r2_test:.3f}, α={ridge.alpha_}")

    return weights, scaler, metrics


def derive_layer_network_map(weights, n_layers):
    """
    For each layer, find which functional network its weights most strongly predict.
    """
    import pickle
    with open('data/regression/pca.pkl', 'rb') as f:
        pca = pickle.load(f)
    
    # weights: (n_regions, 200)
    # pca.components_: (200, 32*4096)
    # Project weights back into the full hidden state dimension
    full_weights = weights @ pca.components_  # (n_regions, 32*4096)
    
    CANONICAL = {
        'language':  ['G_temporal_sup', 'G_front_inf-Triangul', 'G_pariet_inf-Angular'],
        'dmn':       ['G_cingul-Post-dorsal', 'G_precuneus', 'G_front_sup'],
        'attention': ['G_front_middle', 'G_pariet_inf-Supramar'],
        'motor':     ['G_precentral', 'G_postcentral'],
        'visual':    ['G_occipital_sup', 'G_cuneus'],
        'limbic':    ['G_oc-temp_med-Parahip', 'G_cingul-Post-ventral'],
    }

    hidden_dim = full_weights.shape[1] // n_layers
    layer_network = {}
    for layer_idx in range(n_layers):
        layer_weights    = full_weights[:, layer_idx * hidden_dim:(layer_idx + 1) * hidden_dim]
        layer_importance = np.abs(layer_weights).mean(axis=1)  # per region

        network_scores = {}
        for network, regions in CANONICAL.items():
            region_indices = [
                i for i, name in enumerate(region_names)
                if any(r in name for r in regions)
            ]
            if region_indices:
                network_scores[network] = layer_importance[region_indices].mean()

        best_network = max(network_scores, key=network_scores.get)
        layer_network[str(layer_idx)] = best_network

    return layer_network


# ── Main ──────────────────────────────────────────────────────────────────────

if __name__ == '__main__':
    X, Y = build_dataset()

    weights, scaler, metrics = train(X, Y)

    # Derive layer→network map
    n_layers          = 32
    layer_network_map = derive_layer_network_map(weights, n_layers)

    # Save
    print("\nSaving...")
    with h5py.File(OUTPUT_DIR / 'weights.h5', 'w') as f:
        f.create_dataset('weights',      data=weights,      compression='gzip')
        f.create_dataset('scaler_mean',  data=scaler.mean_, compression='gzip')
        f.create_dataset('scaler_scale', data=scaler.scale_, compression='gzip')

    with open(OUTPUT_DIR / 'region_names.json', 'w') as f:
        json.dump(region_names, f, indent=2)

    with open(OUTPUT_DIR / 'layer_network_map.json', 'w') as f:
        json.dump(layer_network_map, f, indent=2)

    with open(OUTPUT_DIR / 'metrics.json', 'w') as f:
        json.dump(metrics, f, indent=2)

    mean_r2 = np.mean([v['r2_test'] for v in metrics.values()])
    print(f"\nMean r² across regions: {mean_r2:.3f}")
    print(f"Saved to {OUTPUT_DIR}")
    print("\nLayer→network assignments:")
    for layer, net in sorted(layer_network_map.items(), key=lambda x: int(x[0])):
        print(f"  Layer {layer:2s}: {net}")
