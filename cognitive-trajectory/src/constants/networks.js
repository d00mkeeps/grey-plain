// Functional network definitions
// colours are placeholders — will be replaced by regression-derived assignment in Phase 4

export const NETWORKS = {
  language:  { label: 'Language',       color: '#E87A3A' },
  dmn:       { label: 'Default Mode',   color: '#4A90D9' },
  attention: { label: 'Attention',      color: '#5ABF7A' },
  motor:     { label: 'Sensorimotor',   color: '#9B6DD4' },
  visual:    { label: 'Visual',         color: '#D4C44A' },
  limbic:    { label: 'Limbic',         color: '#D46A8A' },
}

export const REGION_NETWORK_MAP = {
  // Language
  'G_temporal_sup':        'language',
  'G_front_inf-Triangul':  'language',
  'G_pariet_inf-Angular':  'language',
  'S_temporal_sup':        'language',
  'G_temp_sup-Lateral':    'language',
  'Pole_temporal':         'language',

  // Default Mode
  'G_cingul-Post-dorsal':  'dmn',
  'G_precuneus':           'dmn',
  'G_front_sup':           'dmn',
  'G_cingul-Post-ventral': 'dmn',

  // Attention
  'G_front_middle':        'attention',
  'G_pariet_inf-Supramar': 'attention',
  'G_and_S_cingul-Mid-Post':'attention',

  // Sensorimotor
  'G_precentral':          'motor',
  'G_postcentral':         'motor',
  'G_and_S_subcentral':    'motor',

  // Visual
  'G_occipital_sup':       'visual',
  'G_cuneus':              'visual',
  'G_oc-temp_lat-fusifor': 'visual',
  'G_occipital_middle':    'visual',
  'G_and_S_occipital_inf': 'visual',

  // Limbic
  'G_oc-temp_med-Parahip': 'limbic',
  'G_and_S_cingul-Mid-Ant':'limbic',
}
