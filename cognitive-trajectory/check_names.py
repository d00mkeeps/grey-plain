import json

with open("public/regionMap.json") as f:
    region_map = json.load(f)

# regionMap is a dictionary where keys are IDs and values are objects with "name"

region_map_names = set(v["name"] for k, v in region_map.items())

# check networks.js names
networks_region_names = [
  'G_temporal_sup',
  'G_front_inf-Triangul',
  'G_pariet_inf-Angular',
  'S_temporal_sup',
  'G_temp_sup-Lateral',
  'Pole_temporal',
  'G_cingul-Post-dorsal',
  'G_precuneus',
  'G_front_sup',
  'G_cingul-Post-ventral',
  'G_front_middle',
  'G_pariet_inf-Supramar',
  'G_and_S_cingul-Mid-Post',
  'G_precentral',
  'G_postcentral',
  'G_and_S_subcentral',
  'G_occipital_sup',
  'G_cuneus',
  'G_oc-temp_lat-fusifor',
  'G_occipital_middle',
  'G_and_S_occipital_inf',
  'G_oc-temp_med-Parahip',
  'G_and_S_cingul-Mid-Ant',
]

missing_from_map = [name for name in networks_region_names if name not in region_map_names]
print(f"Networks regions missing from regionMap: {missing_from_map}")

# Then check inference output
if len(missing_from_map) == 0:
    print("All good, names match.")
