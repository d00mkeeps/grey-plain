import numpy as np
import json
from nilearn.datasets import fetch_atlas_surf_destrieux, load_fsaverage
from nilearn import surface
from scipy.spatial import KDTree

def export_brain():
    print("Fetching Destrieux atlas...")
    destrieux = fetch_atlas_surf_destrieux()

    region_names = [
        (r.decode('utf-8') if isinstance(r, bytes) else r)
        for r in destrieux['labels']
    ]

    print("Fetching fsaverage mesh (full resolution) and fsaverage5...")
    fsaverage = load_fsaverage('fsaverage')
    fsaverage5 = load_fsaverage('fsaverage5')

    all_vertices  = []
    all_faces     = []
    region_map    = {}
    vertex_offset = 0

    hemi_map = {
        'left':  destrieux['map_left'],
        'right': destrieux['map_right'],
    }

    for hemi in ['left', 'right']:
        coords, faces = surface.load_surf_mesh(fsaverage['pial'].parts[hemi])
        
        # Map labels from fsaverage5 to fsaverage
        coords5, _ = surface.load_surf_mesh(fsaverage5['pial'].parts[hemi])
        labels5 = hemi_map[hemi]
        
        print(f"Mapping {hemi} labels from fsaverage5 to fsaverage...")
        tree = KDTree(coords5)
        _, indices = tree.query(coords)
        vertex_labels = labels5[indices]

        for i in range(len(coords)):
            all_vertices.append({
                "x":      round(float(coords[i, 0]), 4),
                "y":      round(float(coords[i, 1]), 4),
                "z":      round(float(coords[i, 2]), 4),
                "region": int(vertex_labels[i]),
                "hemi":   hemi
            })

        all_faces.extend((faces + vertex_offset).tolist())

        for local_idx, label in enumerate(vertex_labels):
            global_idx = local_idx + vertex_offset
            label = int(label)
            if label not in region_map:
                region_map[label] = {
                    "name":     region_names[label] if label < len(region_names) else f"region_{label}",
                    "hemi":     hemi,
                    "vertices": []
                }
            region_map[label]["vertices"].append(global_idx)

        vertex_offset += len(coords)

    print(f"Vertices : {len(all_vertices)}")
    print(f"Faces    : {len(all_faces)}")
    print(f"Regions  : {len(region_map)}")
    print(f"Sample regions: {[v['name'] for v in list(region_map.values())[:5]]}")

    with open('brain.json', 'w') as f:
        json.dump({"vertices": all_vertices, "faces": all_faces}, f)

    with open('regionMap.json', 'w') as f:
        json.dump(region_map, f)

    print("Done → brain.json, regionMap.json")

if __name__ == '__main__':
    export_brain()