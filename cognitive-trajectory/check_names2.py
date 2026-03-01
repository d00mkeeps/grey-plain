import json

with open("public/regionMap.json") as f:
    region_map = json.load(f)

# regionMap is a dictionary where keys are IDs and values are objects with "name"

region_map_names = set(v["name"] for k, v in region_map.items())

import h5py
f = h5py.File("server/weights_200.h5", "r")
inference_names = set(f["region_names"][:])
inference_names = {n.decode('utf-8') for n in inference_names}

missing_from_map = [name for name in inference_names if name not in region_map_names]
print(f"Inference regions missing from regionMap: {missing_from_map}")

missing_from_inference = [name for name in region_map_names if name not in inference_names]
print(f"RegionMap regions missing from inference: {missing_from_inference}")

