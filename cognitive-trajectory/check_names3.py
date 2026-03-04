import nibabel as nib
from nilearn import datasets

destrieux = datasets.fetch_atlas_destrieux_2009()
print("Keys in destrieux:")
print(destrieux.keys())

labels = destrieux['labels']
for rec in labels[:10]:
    print(rec)
    
print("\nIf there is another label field, checking description:")
print(destrieux['description'][:500])
