import numpy as np
import pickle
import json

with open("phase4/data/regression/pca.pkl", "rb") as f:
    pca = pickle.load(f)

# Mock some weights since we don't have h5py
scaler_mean = np.random.randn(200).astype(np.float32)
scaler_scale = np.ones(200).astype(np.float32)
weights = np.random.randn(76, 200).astype(np.float32)

with open("phase4/data/regression/region_names.json", "r") as f:
    region_names = json.load(f)

# Mock hidden states for last token
hs_flat = np.random.randn(1, 131072).astype(np.float32)

hs_pca = pca.transform(hs_flat)
hs_scaled = (hs_pca - scaler_mean) / scaler_scale

predictions = (weights @ hs_scaled.T).flatten()

print(f"Raw predictions - min: {predictions.min():.4f}, max: {predictions.max():.4f}, mean: {predictions.mean():.4f}")

# The issue is likely that predicted BOLD z-scores are centered around 0 (e.g., -2 to 2)
# so clipping to [0, 1] means almost everything > 0 gets clamped to 1 or small values, losing relative variance.
