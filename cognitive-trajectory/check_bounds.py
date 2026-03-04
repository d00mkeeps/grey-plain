import json
import numpy as np
import nibabel as nib
from nilearn import datasets

with open("public/brain.json", "r") as f:
    brain_data = json.load(f)

# Find bounds of vertices
# `vertices` is a list of objects like {"x": -10, "y": 20, "z": 5}
vertices = brain_data['vertices']
minX = min(v['x'] for v in vertices); maxX = max(v['x'] for v in vertices)
minY = min(v['y'] for v in vertices); maxY = max(v['y'] for v in vertices)
minZ = min(v['z'] for v in vertices); maxZ = max(v['z'] for v in vertices)

print(f"JS Bounds:")
print(f"X: {minX} to {maxX}")
print(f"Y: {minY} to {maxY}")
print(f"Z: {minZ} to {maxZ}")

# Get Destrieux 2009 atlas
destrieux = datasets.fetch_atlas_destrieux_2009()
atlas_img = nib.load(destrieux['maps'])
atlas_data = atlas_img.get_fdata().astype(np.int32)

print("\nNIfTI Affine:")
print(atlas_img.affine)

# Find bounds of actual non-zero data in the atlas
non_zero = np.where(atlas_data > 0)
if len(non_zero[0]) > 0:
    min_i, max_i = np.min(non_zero[0]), np.max(non_zero[0])
    min_j, max_j = np.min(non_zero[1]), np.max(non_zero[1])
    min_k, max_k = np.min(non_zero[2]), np.max(non_zero[2])
    
    # Get MNI coords of 8 corners of the bounding box
    corners_ijk = [
        [min_i, min_j, min_k], [max_i, min_j, min_k],
        [min_i, max_j, min_k], [max_i, max_j, min_k],
        [min_i, min_j, max_k], [max_i, min_j, max_k],
        [min_i, max_j, max_k], [max_i, max_j, max_k]
    ]
    
    corners_mni = []
    for c in corners_ijk:
        mni = nib.affines.apply_affine(atlas_img.affine, c)
        corners_mni.append(mni)
        
    corners_mni = np.array(corners_mni)
    minX_mni, maxX_mni = np.min(corners_mni[:,0]), np.max(corners_mni[:,0])
    minY_mni, maxY_mni = np.min(corners_mni[:,1]), np.max(corners_mni[:,1])
    minZ_mni, maxZ_mni = np.min(corners_mni[:,2]), np.max(corners_mni[:,2])
    
    print(f"\nMNI Bounds of Non-Zero Atlas Data:")
    print(f"X: {minX_mni} to {maxX_mni}")
    print(f"Y: {minY_mni} to {maxY_mni}")
    print(f"Z: {minZ_mni} to {maxZ_mni}")
