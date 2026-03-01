import h5py
import json
import numpy as np
import pickle

with h5py.File('weights.h5', 'r') as f:
    weights = f['weights'][:]

with open('pca.pkl', 'rb') as f:
    pca = pickle.load(f)

with open('region_names.json', 'r') as f:
    region_names = json.load(f)

# Project back to full space
full_weights = weights @ pca.components_  # (76, 131072)
n_layers = 32
hidden_dim = full_weights.shape[1] // n_layers

CANONICAL = {
    'language':  ['G_temporal_sup', 'G_front_inf-Triangul', 'G_pariet_inf-Angular'],
    'dmn':       ['G_cingul-Post-dorsal', 'G_precuneus', 'G_front_sup'],
    'attention': ['G_front_middle', 'G_pariet_inf-Supramar'],
    'motor':     ['G_precentral', 'G_postcentral'],
    'visual':    ['G_occipital_sup', 'G_cuneus'],
    'limbic':    ['G_oc-temp_med-Parahip', 'G_cingul-Post-ventral'],
}

# 1. Compute basic layer importances (76 regions, 32 layers)
layer_importance_matrix = np.zeros((len(region_names), n_layers))
for layer_idx in range(n_layers):
    layer_weights = full_weights[:, layer_idx * hidden_dim:(layer_idx + 1) * hidden_dim]
    layer_importance_matrix[:, layer_idx] = np.abs(layer_weights).mean(axis=1)

# 2. Z-score the importances ACROSS layers for each region.
# This prevents highly-predicted regions (like visual) from dominating every layer.
# It highlights which layer is *distinctively* important for a region.
from scipy.stats import zscore
layer_importance_z = zscore(layer_importance_matrix, axis=1)

layer_network = {}
for layer_idx in range(n_layers):
    network_scores = {}
    for network, regions in CANONICAL.items():
        region_indices = [
            i for i, name in enumerate(region_names)
            if any(r in name for r in regions)
        ]
        if region_indices:
            # Mean z-scored importance for this network's regions at this layer
            network_scores[network] = layer_importance_z[region_indices, layer_idx].mean()
            
    best_network = max(network_scores, key=network_scores.get)
    layer_network[str(layer_idx)] = best_network

print(json.dumps(layer_network, indent=2))

with open('layer_network_map.json', 'w') as f:
    json.dump(layer_network, f, indent=2)
print("Saved corrected layer_network_map.json")
