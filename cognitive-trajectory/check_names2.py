import nibabel as nib
from nilearn import datasets

destrieux = datasets.fetch_atlas_destrieux_2009()
labels = destrieux['labels']

print("Nilearn Destrieux Labels:")
for record in labels:
    atlas_id = record[0]
    label = record[1]
    if atlas_id == 0: continue
    
    label_str = label.decode('utf-8') if isinstance(label, bytes) else label
    print(f"{atlas_id}: {label_str}")

