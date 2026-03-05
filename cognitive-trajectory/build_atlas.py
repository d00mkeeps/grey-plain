import json
import numpy as np
import nibabel as nib
from nilearn import datasets
from scipy.ndimage import distance_transform_edt
import sys
import os

print("Downloading Destrieux Atlas...")
# Get Destrieux 2009 atlas in specific resolution
destrieux = datasets.fetch_atlas_destrieux_2009()
atlas_img = nib.load(destrieux['maps'])
atlas_data = atlas_img.get_fdata().astype(np.int32)
labels = destrieux['labels']

print("Loading our Region Map...")
with open("public/regionMap.json", "r") as f:
    region_map = json.load(f)

# Rebuild Name -> Internal ID mapping
our_names_to_id = {}
for k, v in region_map.items():
    if 'name' in v:
        # Some are prefixed with L_ or R_, some are not. We'll strip for matching
        our_names_to_id[v['name']] = int(k)

# 1. Resample to 256x256x256 using exact MNI coordinate bounding box
shape = atlas_data.shape
print(f"Original Atlas Shape: {shape}")

SIZE = 128

# JS Bounding Box MNI Coordinates (derived from brain.json padding)
minX = -73.7943
minY = -109.8264
minZ = -52.8306
maxDim = 184.1668

print("Mapping affine coordinates to 256^3 JS bounding box...")
# Create coordinate grid for 256x256x256 matching JS WebGL space
ix, iy, iz = np.meshgrid(np.arange(SIZE), np.arange(SIZE), np.arange(SIZE), indexing='ij')

x_mni = minX + (ix / SIZE) * maxDim
y_mni = minY + (iy / SIZE) * maxDim
z_mni = minZ + (iz / SIZE) * maxDim

coords_mni = np.stack([x_mni, y_mni, z_mni], axis=-1)

# Apply Inverse Affine to find NIfTI array indices
inv_affine = np.linalg.inv(atlas_img.affine)
coords_ijk = nib.affines.apply_affine(inv_affine, coords_mni)

i_idx = np.round(coords_ijk[..., 0]).astype(int)
j_idx = np.round(coords_ijk[..., 1]).astype(int)
k_idx = np.round(coords_ijk[..., 2]).astype(int)

# Clip to safe bounds
i_idx = np.clip(i_idx, 0, shape[0] - 1)
j_idx = np.clip(j_idx, 0, shape[1] - 1)
k_idx = np.clip(k_idx, 0, shape[2] - 1)

grid = atlas_data[i_idx, j_idx, k_idx]

# 2. Map Atlas IDs to OUR Region IDs
# Labels in nilearn Destrieux are formatted like `(b'L R_G_rectus',)`
# We need to map these byte strings to our internal integer IDs (1-75)
mapped_grid = np.zeros_like(grid)
growth_grid = np.zeros_like(grid, dtype=np.float32)

atlas_id_to_our_id = {}
for atlas_id, label_raw in enumerate(labels):
    if atlas_id == 0: continue
    
    # In nilearn Destrieux, labels is usually a simple list where index = ID.
    # E.g. [b'Background', b'L G_and_S_frontomargin', ...]
    label_str = label_raw[0].decode('utf-8') if isinstance(label_raw, tuple) else (label_raw.decode('utf-8') if hasattr(label_raw, 'decode') else str(label_raw))
    
    # decode byte string
    label_str = label_raw.decode('utf-8') if hasattr(label_raw, 'decode') else str(label_raw)
    # Nilearn puts 'b' as the second element sometimes, we saw 'L G_and_S_frontomargin'
    
    # Our names often omit the L/R prefix or use slightly different formatting.
    best_match_id = 0
    
    # Clean label, remove 'L ' or 'R ' prefix
    clean_label = label_str
    if label_str.startswith('L '): clean_label = label_str[2:]
    elif label_str.startswith('R '): clean_label = label_str[2:]
    
    from thefuzz import process, fuzz
    
    # We will score the label against all our 75 custom names
    # Best score wins if it's above a threshold
    best_score = 0
    best_match_id = 0
    
    for our_name, our_id in our_names_to_id.items():
        # Score the similarity
        score = fuzz.token_sort_ratio(clean_label.replace("_", " "), our_name.replace("_", " "))
        
        # We manually boost the score if it's an exact substring
        if our_name in clean_label or clean_label in our_name:
            score += 20
            
        if score > best_score:
            best_score = score
            best_match_id = our_id
            
    if best_score > 60 and best_match_id > 0:
        atlas_id_to_our_id[atlas_id] = best_match_id
        # Apply to mapped grid
        mapped_grid[grid == atlas_id] = best_match_id
        print(f"Matched '{clean_label}' -> ID {best_match_id} (Score {best_score})")
    else:
        # Only print a few to avoid flooding the console
        if best_match_id > 0 and len(atlas_id_to_our_id) < 10:
             print(f"FAILED '{clean_label}' - Best: ID {best_match_id} (Score {best_score})")

print(f"Mapped {len(atlas_id_to_our_id)} actual anatomical regions to our JSON IDs.")

# 2.5 Fill the Interior Volume (Make it less 'hollow')
# Find all empty space (0) that is INSIDE the brain bounding box and assign it to the nearest cortical region.
# We do this by computing the Euclidean distance transform of the *empty* space 
# and using the indices of the closest background (which are the colored regions)
print("Fleshing out the internal volume to create a solid hologram...")
from scipy.ndimage import distance_transform_edt

empty_mask = (mapped_grid == 0)

# We want to fill the interior, but keep the space outside the brain empty.
# Destrieux puts background as ID 0, but we need a mask of the entire brain volume 
# to keep we don't bleed outward into the cube corners.
# Fortunately, the original atlas has 0 as background. We can build a rough convex hull or 
# simple morphological closing to define the "inside" vs "outside".
from scipy.ndimage import binary_fill_holes

# Any non-zero region in the original atlas is brain tissue
brain_mask = (atlas_data[i_idx, j_idx, k_idx] > 0)
# Fill the 3D holes (the hollow ventricles/white matter)
solid_brain_mask = binary_fill_holes(brain_mask)

# Now, we only want to fill pixels that are inside the solid brain BUT currently empty (i.e. white matter)
interior_empty_mask = solid_brain_mask & empty_mask

# Use distance transform to find the nearest non-empty voxel for every empty voxel
# The output 'indices' tells us the coordinates of the closest colored voxel
distances, indices = distance_transform_edt(empty_mask, return_indices=True)

# Map the empty interior voxels to the color of their closest cortical neighbor
mapped_grid[interior_empty_mask] = mapped_grid[tuple(idx[interior_empty_mask] for idx in indices)]

print("Fleshed out the hollow white matter tracts!")

# 3. Procedural Growth (BFS / Geodesic Distance)
# For every region mapped, find its outer shell and compute distance map inward
print("Computing procedural growth maps...")
for our_id in set(atlas_id_to_our_id.values()):
    mask = (mapped_grid == our_id)
    if not np.any(mask): continue
    
    # SciPy distance transform: Calculates distance from background (0)
    # So edge voxels = distance 1, center voxels = highest distance
    dist = distance_transform_edt(mask)
    
    max_dist = np.max(dist)
    if max_dist > 0:
        # Normalize 0.0 to 1.0 (Outer edge = 1.0, core center = 0.0)
        # We invert it so center is 0 (first to grow), edges are 1 (last to grow)
        norm_dist = 1.0 - (dist[mask] / max_dist)
        
        # Give a slight buffer so center isn't exactly 0, preventing division issues in shader
        norm_dist = (norm_dist * 0.95)
        
        growth_grid[mask] = norm_dist


# 4. Export to Binary Format (Dual Channel: ID, Growth)
# We pack this into a massive 1D flat Uint8Array
print("Exporting atlas geometry to binary...")
# Channel 1: Region ID (0-255)
# Channel 2: Growth Rank (0-255)
output_array = np.zeros(SIZE * SIZE * SIZE * 4, dtype=np.uint8)

# R channel = Region ID
output_array[0::4] = np.clip(mapped_grid.flatten(order='F'), 0, 255).astype(np.uint8)
# G channel = Growth Rank (0=Core, 255=Edge)
output_array[1::4] = (np.clip(growth_grid.flatten(order='F'), 0.0, 1.0) * 255).astype(np.uint8)
# B and A channels remain 0

out_path = "public/atlas_volume.bin"
with open(out_path, "wb") as f:
    f.write(output_array.tobytes())

import os
sz = os.path.getsize(out_path) / (1024*1024)
print(f"Done! Saved {out_path} ({sz:.2f} MB)")


# 5. Volumetric Normals
# Calculate smoothed 3D surface normals by taking the gradient of the solid mask
print("Computing volumetric normals via gradient fields...")
import scipy.ndimage as ndimage

smoothed_volume = ndimage.gaussian_filter(solid_brain_mask.astype(float), sigma=2.0)
grad_x, grad_y, grad_z = np.gradient(smoothed_volume)

magnitude = np.sqrt(grad_x**2 + grad_y**2 + grad_z**2)
magnitude[magnitude == 0] = 1.0

# Inverted so vectors point outward from the solid mass
norm_x = -grad_x / magnitude
norm_y = -grad_y / magnitude
norm_z = -grad_z / magnitude

# Pack -1.0 to 1.0 range into 0-255 RGB bytes
normals_array = np.zeros(SIZE * SIZE * SIZE * 4, dtype=np.uint8)
normals_array[0::4] = np.clip((norm_x.flatten(order='F') + 1.0) / 2.0 * 255, 0, 255).astype(np.uint8)
normals_array[1::4] = np.clip((norm_y.flatten(order='F') + 1.0) / 2.0 * 255, 0, 255).astype(np.uint8)
normals_array[2::4] = np.clip((norm_z.flatten(order='F') + 1.0) / 2.0 * 255, 0, 255).astype(np.uint8)
normals_array[3::4] = 255

normals_out_path = "public/atlas_normals.bin"
with open(normals_out_path, "wb") as f:
    f.write(normals_array.tobytes())

sz_norm = os.path.getsize(normals_out_path) / (1024*1024)
print(f"Done! Saved {normals_out_path} ({sz_norm:.2f} MB)")
