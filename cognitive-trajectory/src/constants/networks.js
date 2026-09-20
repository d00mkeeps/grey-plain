// Functional network definitions

export const NETWORKS = {
  language:  { label: 'Language',       color: '#E87A3A' },
  dmn:       { label: 'DMN',            color: '#4A90D9' },
  attention: { label: 'Attention',      color: '#5ABF7A' },
  motor:     { label: 'Motor',          color: '#9B6DD4' },
  visual:    { label: 'Visual',         color: '#D4C44A' },
  limbic:    { label: 'Limbic',         color: '#D46A8A' },
}

// All 75 Destrieux atlas regions, mapped to functional networks.
// Previously only ~20 were covered — the rest were silently skipped,
// causing only 5 regions to render despite data arriving correctly.
export const REGION_NETWORK_MAP = {
  // ── Language / Perisylvian ──────────────────────────────────────────────────
  'G_temporal_sup':            'language',
  'G_temp_sup-Lateral':        'language',
  'G_temp_sup-Plan_tempo':     'language',
  'G_temp_sup-Plan_polar':     'language',
  'G_temp_sup-G_T_transv':     'language',
  'G_front_inf-Triangul':      'language',
  'G_front_inf-Opercular':     'language',
  'G_front_inf-Orbital':       'language',
  'G_pariet_inf-Angular':      'language',
  'S_temporal_sup':            'language',
  'S_temporal_inf':            'language',
  'S_temporal_transverse':     'language',
  'Pole_temporal':             'language',
  'Lat_Fis-post':              'language',
  'Lat_Fis-ant-Horizont':      'language',
  'Lat_Fis-ant-Vertical':      'language',
  'G_temporal_inf':            'language',
  'G_temporal_middle':         'language',

  // ── Default Mode Network ────────────────────────────────────────────────────
  'G_cingul-Post-dorsal':      'dmn',
  'G_cingul-Post-ventral':     'dmn',
  'G_precuneus':               'dmn',
  'G_front_sup':               'dmn',
  'G_front_middle':            'dmn',   // medial prefrontal contribution
  'G_parietal_sup':            'dmn',
  'S_parieto_occipital':       'dmn',
  'S_pericallosal':            'dmn',
  'S_subparietal':             'dmn',
  'G_and_S_cingul-Ant':        'dmn',
  'G_and_S_cingul-Mid-Ant':    'dmn',   // also limbic, primary dmn here
  'S_cingul-Marginalis':       'dmn',
  'G_rectus':                  'dmn',
  'G_subcallosal':             'dmn',
  'S_suborbital':              'dmn',
  'G_orbital':                 'dmn',
  'S_orbital-H_Shaped':        'dmn',
  'S_orbital_lateral':         'dmn',
  'S_orbital_med-olfact':      'dmn',
  'G_and_S_frontomargin':      'dmn',
  'G_and_S_transv_frontopol':  'dmn',

  // ── Attention (Dorsal/Ventral) ──────────────────────────────────────────────
  'G_pariet_inf-Supramar':     'attention',
  'G_and_S_cingul-Mid-Post':   'attention',
  'S_intrapariet_and_P_trans': 'attention',
  'S_front_sup':               'attention',
  'S_front_middle':            'attention',
  'S_front_inf':               'attention',

  // ── Sensorimotor ────────────────────────────────────────────────────────────
  'G_precentral':              'motor',
  'G_postcentral':             'motor',
  'G_and_S_subcentral':        'motor',
  'G_and_S_paracentral':       'motor',
  'S_central':                 'motor',
  'S_precentral-inf-part':     'motor',
  'S_precentral-sup-part':     'motor',
  'S_postcentral':             'motor',
  'S_interm_prim-Jensen':      'motor',

  // ── Visual ──────────────────────────────────────────────────────────────────
  'G_occipital_sup':           'visual',
  'G_occipital_middle':        'visual',
  'G_and_S_occipital_inf':     'visual',
  'G_cuneus':                  'visual',
  'G_oc-temp_lat-fusifor':     'visual',
  'G_oc-temp_med-Lingual':     'visual',
  'Pole_occipital':            'visual',
  'S_calcarine':               'visual',
  'S_oc_sup_and_transversal':  'visual',
  'S_oc_middle_and_Lunatus':   'visual',
  'S_oc-temp_lat':             'visual',
  'S_oc-temp_med_and_Lingual': 'visual',
  'S_occipital_ant':           'visual',
  'S_collat_transv_ant':       'visual',
  'S_collat_transv_post':      'visual',

  // ── Limbic / Insular ────────────────────────────────────────────────────────
  'G_oc-temp_med-Parahip':     'limbic',
  'G_and_S_cingul-Mid-Ant':    'limbic',   // duplicate — this wins (last assignment)
  'G_insular_short':           'limbic',
  'G_Ins_lg_and_S_cent_ins':   'limbic',
  'S_circular_insula_ant':     'limbic',
  'S_circular_insula_inf':     'limbic',
  'S_circular_insula_sup':     'limbic',
  'Medial_wall':               'limbic',
}
