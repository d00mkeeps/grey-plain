import { useRef } from 'react'
import MermaidChart from './MermaidChart'

const SECTIONS = [
  { id: 'overview',      label: 'Overview' },
  { id: 'hypothesis',    label: 'Hypothesis' },
  { id: 'dataset',       label: 'Dataset' },
  { id: 'pipeline',      label: 'Encoding Pipeline' },
  { id: 'inference',     label: 'Inference' },
  { id: 'architecture',  label: 'Architecture' },
  { id: 'limitations',   label: 'Limitations' },
  { id: 'engineering',   label: 'Engineering Decisions' },
  { id: 'literature',    label: 'Literature' },
]

const s = {
  root: {
    display: 'flex',
    height: '100%',
    overflow: 'hidden',
    minHeight: 0,
  },
  nav: {
    width: 100,
    flexShrink: 0,
    borderRight: '1px solid #0e1a2a',
    overflowY: 'auto',
    padding: '16px 0',
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
  },
  navBtn: (active) => ({
    background: active ? '#0e1a2a' : 'transparent',
    border: 'none',
    borderLeft: `2px solid ${active ? '#2a7aff' : 'transparent'}`,
    color: active ? '#7ac0f0' : '#3a5a7a',
    cursor: 'pointer',
    fontSize: 10,
    letterSpacing: 1,
    textTransform: 'uppercase',
    padding: '6px 10px',
    textAlign: 'left',
    fontFamily: "'Inter', sans-serif",
    lineHeight: 1.4,
    transition: 'color 0.15s',
  }),
  content: {
    flex: 1,
    overflowY: 'auto',
    padding: '20px 18px',
    display: 'flex',
    flexDirection: 'column',
    gap: 32,
  },
  section: {
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
  },
  h2: {
    fontSize: 13,
    letterSpacing: 2,
    color: '#3a6a9a',
    textTransform: 'uppercase',
    margin: 0,
    paddingBottom: 8,
    borderBottom: '1px solid #0e1a2a',
  },
  p: {
    fontSize: 15,
    lineHeight: 1.75,
    color: '#8aaccc',
    margin: 0,
  },
  strong: {
    color: '#c8d8f0',
    fontWeight: 600,
  },
  blockquote: {
    borderLeft: '2px solid #2a7aff',
    margin: '6px 0',
    paddingLeft: 12,
    color: '#7ab0d8',
    fontSize: 15,
    lineHeight: 1.7,
    fontStyle: 'italic',
  },
  code: {
    background: '#0e1a2a',
    border: '1px solid #1a2a3a',
    borderRadius: 3,
    padding: '10px 12px',
    fontSize: 14,
    color: '#6aa8d8',
    fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
    lineHeight: 1.7,
    whiteSpace: 'pre',
    overflowX: 'auto',
  },
  inlineCode: {
    background: '#0e1a2a',
    border: '1px solid #1a2a3a',
    borderRadius: 2,
    padding: '1px 5px',
    fontSize: 14,
    color: '#7ac0f0',
    fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: 14,
  },
  th: {
    background: '#0e1a2a',
    color: '#4a8abA',
    padding: '5px 8px',
    textAlign: 'left',
    fontWeight: 600,
    letterSpacing: 0.5,
    borderBottom: '1px solid #1a2a3a',
  },
  td: {
    padding: '5px 8px',
    color: '#8aaccc',
    borderBottom: '1px solid #0e1a2a',
    verticalAlign: 'top',
    lineHeight: 1.5,
  },
  chip: (color) => ({
    display: 'inline-block',
    width: 8,
    height: 8,
    borderRadius: '50%',
    background: color,
    marginRight: 6,
    verticalAlign: 'middle',
    flexShrink: 0,
  }),
  metaRow: {
    display: 'flex',
    gap: 4,
    flexWrap: 'wrap',
  },
  metaBadge: {
    background: '#0e1a2a',
    border: '1px solid #1a2a3a',
    borderRadius: 3,
    padding: '2px 7px',
    fontSize: 12,
    color: '#4a8aba',
    letterSpacing: 0.5,
  },
  bullet: {
    fontSize: 15,
    lineHeight: 1.7,
    color: '#8aaccc',
    margin: '2px 0',
    paddingLeft: 14,
    position: 'relative',
  },
}

function C({ children }) {
  return <code style={s.inlineCode}>{children}</code>
}

function Bullet({ children }) {
  return (
    <div style={s.bullet}>
      <span style={{ position: 'absolute', left: 0, color: '#2a5a8a' }}>›</span>
      {children}
    </div>
  )
}

export default function DocsPanel() {
  const contentRef = useRef(null)

  const scrollTo = (id) => {
    const el = contentRef.current?.querySelector(`#doc-${id}`)
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <div style={s.root}>
      {/* Mini nav */}
      <nav style={s.nav}>
        {SECTIONS.map(sec => (
          <button
            key={sec.id}
            style={s.navBtn(false)}
            onClick={() => scrollTo(sec.id)}
            onMouseEnter={e => { e.currentTarget.style.color = '#c8d8f0' }}
            onMouseLeave={e => { e.currentTarget.style.color = '#3a5a7a' }}
          >
            {sec.label}
          </button>
        ))}
      </nav>

      {/* Scrollable content */}
      <div style={s.content} ref={contentRef}>

        {/* ── Overview ───────────────────────────────── */}
        <section id="doc-overview" style={s.section}>
          <h2 style={s.h2}>Overview</h2>
          <p style={{
            fontSize: 22,
            fontWeight: 700,
            color: '#c8d8f0',
            lineHeight: 1.4,
            margin: '0 0 12px 0',
            letterSpacing: '-0.3px',
          }}>
            This software models an AI's cognitive activation and predicts human brain activity during response.
          </p>
          <p style={s.p}>
            The Cognitive Trajectory Visualiser simultaneously displays the internal representational
            states of a <span style={s.strong}>human brain</span> and a <span style={s.strong}>large language model</span> during
            live conversation. It is a <span style={s.strong}>measurement tool</span>, not a demonstration of a known effect.
          </p>
          <Bullet>
            <span style={s.strong}>Human side:</span> Predicted activation across 75 cortical regions (Destrieux atlas),
            derived from a ridge regression encoding model trained on real fMRI data
          </Bullet>
          <Bullet>
            <span style={s.strong}>LLM side:</span> Per-layer hidden state activation across all 32 transformer
            layers of Llama 3.1 8B Instruct, extracted during live inference
          </Bullet>
          <p style={s.p}>
            Both representations are expressed in the same shared colour space, grounded in
            functional neural network assignments derived empirically from the regression weights.
          </p>
        </section>

        {/* ── Hypothesis ─────────────────────────────── */}
        <section id="doc-hypothesis" style={s.section}>
          <h2 style={s.h2}>Core Hypothesis</h2>
          <div style={s.blockquote}>
            The degree of alignment between the cognitive activity of an AI system and a human
            collaborator has a meaningful impact on the effectiveness of their joint reasoning process.
          </div>
          <p style={s.p}>
            This is a <span style={s.strong}>measurement hypothesis</span> — the primary contribution is making
            alignment <em>observable</em>. The visualiser is the instrument; downstream studies would
            test behavioural predictions.
          </p>
          <p style={s.p}>
            <span style={s.strong}>Operational definition:</span> Two systems are "aligned" when the dominant
            functional network active in each corresponds to the same canonical network (Language,
            Default Mode, Attention, Visual, Limbic, Motor). Visible in the prototype as shared colour
            between the brain mesh and LLM layer stack.
          </p>
          <p style={s.p}>
            <span style={s.strong}>What alignment might predict (future research):</span> higher task performance,
            more efficient conversations, higher subjective ratings of helpfulness, detectable coupling
            direction between systems.
          </p>
        </section>

        {/* ── Dataset ────────────────────────────────── */}
        <section id="doc-dataset" style={s.section}>
          <h2 style={s.h2}>Dataset</h2>
          <table style={s.table}>
            <tbody>
              {[
                ['Source',    'OpenNeuro ds003020'],
                ['Title',     '"Narratives" — fMRI responses to natural speech (Huth Lab, UT Austin)'],
                ['Access',    'Fully public, no approval required'],
                ['Subject',   'UTS01 (single subject)'],
                ['Sessions',  'ses-2 through ses-20'],
                ['Stories',   '~80 stories processed (~14 dropped for corrupt/empty TextGrids)'],
                ['BOLD',      'NIfTI format, MNI152 space, ~280 MB per story'],
              ].map(([k, v]) => (
                <tr key={k}>
                  <td style={{ ...s.td, color: '#4a8aba', width: 80, whiteSpace: 'nowrap' }}>{k}</td>
                  <td style={s.td}>{v}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p style={s.p}>
            Subjects listened passively to spoken narrative stories from The Moth Radio Hour while
            whole-brain BOLD fMRI was recorded at 3T. No task, no button presses. Stimulus transcripts
            provided as Praat TextGrid files with word-level timing.
          </p>
        </section>

        {/* ── Encoding Pipeline ──────────────────────── */}
        <section id="doc-pipeline" style={s.section}>
          <h2 style={s.h2}>Encoding Pipeline</h2>
          <p style={s.p}>For each story:</p>
          {['Parse TextGrid → word timings',
            'Run story text through Llama 3.1 8B → hidden states per token',
            'Align hidden states to fMRI TRs (2 s windows)',
            'Project BOLD volume to cortical surface → mean activation per Destrieux region',
            'Train ridge regression: aligned hidden states → region activation',
          ].map((step, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', margin: '2px 0' }}>
              <span style={{ color: '#2a7aff', fontSize: 10, fontFamily: 'monospace', minWidth: 16 }}>{i + 1}.</span>
              <p style={{ ...s.p, margin: 0 }}>{step}</p>
            </div>
          ))}

          <p style={{ ...s.p, marginTop: 8 }}>
            <span style={s.strong}>Dimensionality reduction:</span> Hidden states are shape{' '}
            <C>(n_trs, 32, 4096)</C> — flattened to 131,072 features. Mean pooling (→ 32 features)
            produced r² = −0.063. Fixed with PCA (200 components, ~85% variance explained) → r² up to 0.240.
          </p>

          <p style={s.p}>
            <span style={s.strong}>Regression:</span> RidgeCV, 5-fold CV, alphas [0.01 → 1000],
            per Destrieux region. 80/20 sequential train/test split.
          </p>

          <table style={s.table}>
            <thead>
              <tr>
                <th style={s.th}>Metric</th>
                <th style={s.th}>Value</th>
                <th style={s.th}>Region / Network</th>
              </tr>
            </thead>
            <tbody>
              <tr><td style={s.td}>Mean r² (75 regions)</td><td style={s.td}>0.020</td><td style={s.td}>—</td></tr>
              <tr><td style={s.td}>Max r²</td><td style={s.td}>0.240</td><td style={s.td}>G_occipital_sup (Visual)</td></tr>
              <tr><td style={s.td}>Top network</td><td style={s.td}>Visual</td><td style={s.td}>Moth Radio Hour = rich visual narrative</td></tr>
            </tbody>
          </table>

          <p style={s.p}>
            <span style={s.strong}>Layer → network assignments</span> (from regression weight projection):
            Layers 0–5 → Limbic · 6–16 → Visual · 17–20 → Language · 21–30 → Attention · 31 → Visual
          </p>
        </section>

        {/* ── Inference ──────────────────────────────── */}
        <section id="doc-inference" style={s.section}>
          <h2 style={s.h2}>Inference Pipeline</h2>
          <div style={{ background: '#0e1a2a', border: '1px solid #1a3a2a', borderLeft: '3px solid #2a7a4a', borderRadius: 4, padding: '8px 12px', marginBottom: 4 }}>
            <p style={{ ...s.p, color: '#6abf8a', margin: 0 }}>
              <span style={{ color: '#8adfa8', fontWeight: 600 }}>Hosted prototype: </span>
              Live inference is disabled. No GPU is running. Users interact exclusively through
              playback of pre-recorded conversations. The inference pipeline is fully implemented
              and can be re-enabled for a private session by restoring the Modal deployment.
            </p>
          </div>
          <p style={s.p}>
            <span style={s.strong}>Model:</span> <C>meta-llama/Llama-3.1-8B-Instruct</C> — 32 layers, 4096 hidden dim.
            Instruct variant matches conversational deployment; middle layers (strongest brain alignment) are
            relatively preserved by instruction fine-tuning.
          </p>
          <p style={s.p}>
            <span style={s.strong}>/chat endpoint (offline):</span> Build chat template → single forward pass with{' '}
            <C>output_hidden_states=True</C> → PCA → ridge regression → brain activations. Streams
            token generation with per-token hidden state norms for the layer stack.
          </p>
          <p style={s.p}>
            <span style={s.strong}>/replay endpoint (offline):</span> O(n) forward passes — one per progressive
            token prefix for human turns, one per output token for LLM turns. Used to generate{' '}
            <C>mockConversation.json</C>. ~2–3 min on A10G per conversation.
          </p>
        </section>

        {/* ── Architecture ───────────────────────────── */}
        <section id="doc-architecture" style={s.section}>
          <h2 style={s.h2}>System Architecture</h2>
          <p style={{ ...s.p, color: '#4a8aba', fontSize: 12, margin: '0 0 8px 0' }}>Hosted · Playback-only</p>
          <MermaidChart chart={`flowchart TD
    A([mockConversation.json]) --> B[App.jsx]
    B --> C[ConversationTimeline\\nScrubber / Play]
    B --> D[Workspace3D]
    D --> E([Brain Mesh\\nregionActivations])
    D --> F([LLM Layer Stack\\nlayerActivations])`} />
          <p style={{ ...s.p, color: '#4a8aba', fontSize: 12, margin: '16px 0 8px 0' }}>Full Inference · Disabled for public use</p>
          <MermaidChart chart={`flowchart TD
    U([User message]) --> CI[ChatInterface.jsx]
    CI -->|POST /chat| API[Modal inference_api.py]
    API --> FP[Forward pass]
    FP --> PCA[PCA]
    PCA --> W[weights.h5]
    W --> RA([regionActivations])
    API --> TG[Token generation loop]
    TG --> LA([layerActivations])
    RA --> App[App.jsx]
    LA --> App
    App --> W3[Workspace3D]
    W3 --> BM([Brain Mesh])
    W3 --> LS([LLM Layer Stack])`} />
        </section>

        {/* ── Limitations ────────────────────────────── */}
        <section id="doc-limitations" style={s.section}>
          <h2 style={s.h2}>Assumptions &amp; Limitations</h2>
          {[
            ['Population average', 'Trained on single subject (UTS01). Patterns are semantically plausible but not individually accurate.'],
            ['Passive listening → active conversation', 'fMRI collected during passive listening. Language production, working memory, and social cognition regions are likely underweighted.'],
            ['Instruct fine-tuning', 'Encoding model trained on Instruct hidden states; fMRI predates this model. Layers 0–20 predictions more reliable than 20–31.'],
            ['HRF approximation', 'Fixed 2-TR lag rather than full HRF deconvolution. Temporal precision limited to ±2–4 seconds.'],
            ['Token-by-token human animation', 'Assumes typed token order reflects thought formation order (likely false). Aesthetically meaningful, not neurally accurate.'],
            ['No preprocessing', 'BOLD projected without motion correction, physiological noise regression, or drift removal. r² values likely underestimate a proper pipeline.'],
            ['Session concatenation', 'No session-level nuisance regression. Scanner drift and physiological noise vary across sessions.'],
          ].map(([title, body]) => (
            <div key={title} style={{ borderLeft: '2px solid #1a2a3a', paddingLeft: 10, marginBottom: 6 }}>
              <p style={{ ...s.p, color: '#c8d8f0', marginBottom: 2 }}><strong>{title}</strong></p>
              <p style={s.p}>{body}</p>
            </div>
          ))}
        </section>

        {/* ── Engineering Decisions ──────────────────── */}
        <section id="doc-engineering" style={s.section}>
          <h2 style={s.h2}>Engineering Decisions</h2>
          <div style={{ overflowX: 'auto' }}>
            <table style={s.table}>
              <thead>
                <tr>
                  <th style={s.th}>Decision</th>
                  <th style={s.th}>Chosen</th>
                  <th style={s.th}>Reason</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ['Brain mesh resolution',   'fsaverage (160k vertices)',            'fsaverage5 appeared faceted'],
                  ['Dimensionality reduction','PCA (200 components)',                  'Mean pooling → r²= −0.063'],
                  ['Model',                   'Llama 3.1 8B Instruct',                'Richer than 3.2 3B (distilled)'],
                  ['Hosting',                 'Modal (GPU) + Vast (training)',         'Modal scales; Vast cheaper for batch'],
                  ['Region click detection',  'GPU picking (offscreen render)',        'Raycaster unreliable at 160k vertices'],
                  ['Volumetric normals',      'Prebaked 3D gradient field',           'No mesh normals inside atlas volume'],
                  ['Inference serving',       'Raw transformers',                      'vLLM overkill for prototype'],
                ].map(([d, c, r]) => (
                  <tr key={d}>
                    <td style={{ ...s.td, color: '#c8d8f0' }}>{d}</td>
                    <td style={{ ...s.td, color: '#7ac0f0' }}>{c}</td>
                    <td style={s.td}>{r}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* ── Literature ─────────────────────────────── */}
        <section id="doc-literature" style={s.section}>
          <h2 style={s.h2}>Key Literature</h2>
          {[
            ['Huth et al. (2016)', 'Nature', '"Natural speech reveals the semantic maps that tile human cerebral cortex." Ridge regression encoding model on fMRI; semantic maps from word2vec.'],
            ['Schrimpf et al. (2021)', 'PNAS', 'Transformers substantially outperform static embeddings for brain encoding; layer-specific neural predictivity peaks differ by region.'],
            ['Caucheteux & King (2022)', 'Comm. Biology', 'Hierarchical layer→region correspondence; early layers ↔ auditory cortex, middle ↔ temporal, late ↔ prefrontal.'],
            ['Goldstein et al. (2022)', 'Nature Neuroscience', 'Layer activations predict neural responses in a temporally and anatomically specific way.'],
            ['Toneva & Wehbe (2019)', 'NeurIPS', 'Contextual transformer representations align more strongly with brain activity than context-free embeddings.'],
            ['Baars (1988)', '—', 'Global Workspace Theory — attention as broadcast mechanism analogue.'],
            ['Hopfield (1982)', '—', 'Neural attractor dynamics — state space traversal framework.'],
          ].map(([author, venue, desc]) => (
            <div key={author} style={{ display: 'flex', gap: 10, marginBottom: 8 }}>
              <div style={{ flexShrink: 0, minWidth: 130 }}>
                <p style={{ ...s.p, color: '#c8d8f0', margin: 0 }}>{author}</p>
                <p style={{ ...s.p, color: '#3a6a9a', margin: 0, fontSize: 12, letterSpacing: 0.5 }}>{venue}</p>
              </div>
              <p style={{ ...s.p, margin: 0 }}>{desc}</p>
            </div>
          ))}
        </section>

      </div>
    </div>
  )
}
