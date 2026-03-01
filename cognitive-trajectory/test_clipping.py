import numpy as np

# Sample predictions resembling what we saw in the logs
predictions = np.array([-0.3204, -0.1, 0.0, 0.1, 0.2642])

# Attempt 1: min-max (old way that washed everything out)
p_min = predictions.min()
p_max = predictions.max()
minmax = (predictions - p_min) / (p_max - p_min)
print("Min-Max:", minmax)

# Attempt 2: z-score then threshold
# We want only the most active regions to light up, e.g. anything above mean.
mean = predictions.mean()
std = predictions.std()
z_scores = (predictions - mean) / (std + 1e-8)
print("Z-scores:", z_scores)

# Scale z-scores so that e.g. z=0 is 0.0, z=2 is 1.0 (clipping below 0 and above 1)
scaled = np.clip(z_scores / 2.0, 0, 1)
print("Scaled Z-scores (robust):", scaled)

