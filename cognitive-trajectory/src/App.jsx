import { useState, useEffect, useRef, useCallback } from 'react'
import Workspace3D from './components/Workspace3D'
import RightPanel  from './components/RightPanel'
import mockData    from './data/mockConversation.json'
import { NETWORKS } from './constants/networks'

const TURN_DURATION_MS  = 2800
const TOKEN_INTERVAL_MS = 180

// Load all available conversations dynamically via Vite
const conversationFiles = import.meta.glob('./data/conversation_*.json', { eager: true })
const availableConversations = Object.entries(conversationFiles)
  .map(([path, module]) => ({
    id: path.split('/').pop().replace('.json', ''),
    data: module.default,
  }))
  .sort((a, b) => b.id.localeCompare(a.id)) // Newest first

// Fallback to mock if nothing is saved yet
const defaultConvos = availableConversations.length > 0 
  ? availableConversations 
  : [{ id: 'mockConversation', data: mockData }]

export default function App() {
  // ── Playback mode state ────────────────────────────────────────────────────
  const [selectedConvoId, setselectedConvoId] = useState(defaultConvos[0].id)
  const [playbackConversation, setPlaybackConversation] = useState(defaultConvos[0].data)
  const [turnIndex,   setTurnIndex]   = useState(0)
  const [tokenIndex,  setTokenIndex]  = useState(0)
  const [isPlaying,   setIsPlaying]   = useState(false)
  const [resetCam,    setResetCam]    = useState(0)

  // ── Chat mode state ────────────────────────────────────────────────────────
  const [liveTurn, setLiveTurn] = useState(null)

  const [activeTab, setActiveTab] = useState('docs')

  // Dispatch a resize event after the grid-template-columns transition (300ms)
  // so Three.js re-measures the canvas container and clears the black strip.
  useEffect(() => {
    const t = setTimeout(() => window.dispatchEvent(new Event('resize')), 320)
    return () => clearTimeout(t)
  }, [activeTab])

  // ── Which turn feeds Workspace3D ───────────────────────────────────────────
  // liveTurn takes priority when it exists (chat mode active)
  // falls back to playback turn
  const playbackTurn  = playbackConversation[turnIndex]
  const currentTurn   = activeTab === 'chat' ? (liveTurn ?? playbackTurn) : playbackTurn

  const displayTokenIndex = (activeTab === 'chat' && liveTurn)
    ? (liveTurn.speaker === 'llm'
        ? Math.max(0, (liveTurn.llm?.tokens?.length || 1) - 1)
        : Math.max(0, (liveTurn.human?.tokens?.length || 1) - 1))
    : tokenIndex

  const playTimerRef  = useRef(null)
  const tokenTimerRef = useRef(null)

  const startTokenAnimation = useCallback((turn) => {
    clearInterval(tokenTimerRef.current)
    setTokenIndex(0)
    const tokenList = turn?.speaker === 'human'
      ? turn?.human?.tokens
      : turn?.llm?.tokens
    const maxTokens = tokenList?.length ?? 1
    let t = 0
    tokenTimerRef.current = setInterval(() => {
      t++
      if (t >= maxTokens) clearInterval(tokenTimerRef.current)
      else setTokenIndex(t)
    }, TOKEN_INTERVAL_MS)
  }, [])

  useEffect(() => {
    if (!isPlaying) {
      clearTimeout(playTimerRef.current)
      clearInterval(tokenTimerRef.current)
      return
    }
    if (playbackTurn) startTokenAnimation(playbackTurn)
    
    // Calculate enough time for all tokens to animate (plus a small pause)
    const tokenList = playbackTurn?.speaker === 'human'
      ? playbackTurn?.human?.tokens
      : playbackTurn?.llm?.tokens
    const maxTokens = tokenList?.length ?? 1
    const dynamicDuration = Math.max(TURN_DURATION_MS, (maxTokens * TOKEN_INTERVAL_MS) + 400)

    playTimerRef.current = setTimeout(() => {
      setTurnIndex(prev => {
        const next = prev + 1
        if (next >= playbackConversation.length) {
          setIsPlaying(false)
          return prev
        }
        return next
      })
    }, dynamicDuration)
    return () => clearTimeout(playTimerRef.current)
  }, [isPlaying, turnIndex, playbackConversation])

  const handleSelectTurn = (i) => {
    setTurnIndex(i)
    setTokenIndex(0)
    clearTimeout(playTimerRef.current)
    clearInterval(tokenTimerRef.current)
    setLiveTurn(null)   // clear live turn when scrubbing playback
  }

  const handleReplayReady = (enrichedConversation) => {
    // When a replay finishes, we switch to it immediately as the active playback
    // (Note: it will also be saved to disk by the API, so a hard refresh will load it into the list)
    setPlaybackConversation(enrichedConversation)
    setselectedConvoId('Just Replayed')
    setTurnIndex(0)
    setTokenIndex(0)
    setLiveTurn(null)
    setIsPlaying(false)
    setActiveTab('playback')
  }

  const handleSelectConversation = (id) => {
    const convo = defaultConvos.find(c => c.id === id)
    if (convo) {
      setselectedConvoId(id)
      setPlaybackConversation(convo.data)
      setTurnIndex(0)
      setTokenIndex(0)
      setLiveTurn(null)
      setIsPlaying(false)
    }
  }

  return (
    <div style={{
      width:      '100vw',
      height:     '100vh',
      background: '#060810',
      display:    'grid',
      gridTemplateColumns: activeTab === 'docs' ? '30% 70%' : '1fr 340px',
      transition: 'grid-template-columns 0.3s ease',
      gridTemplateRows:    '48px 1fr',
      fontFamily: "'Inter', sans-serif",
      color:      '#c8d8f0',
      overflow:   'hidden',
    }}>

      {/* Header */}
      <div style={{
        gridColumn:   '1 / -1',
        position:     'relative',
        display:      'flex',
        alignItems:   'center',
        padding:      '0 24px',
        borderBottom: '1px solid #0e1a2a',
        gap:          16,
      }}>
        <span style={{ fontSize: 13, letterSpacing: 2, color: '#3a6a9a' }}>
          COGNITIVE TRAJECTORY VISUALISER
        </span>

        <div style={{ flex: 1 }} />

        {/* Reset camera */}
        <div style={{ position: 'absolute', left: '50%', transform: 'translateX(-50%)' }}>
          <button
            onClick={() => setResetCam(c => c + 1)}
            style={{
              background:   '#1a2a3a',
              border:       '1px solid #2a4a6a',
              borderRadius: 4,
              color:        '#7ac0f0',
              padding:      '4px 14px',
              cursor:       'pointer',
              fontSize:     11,
              letterSpacing: 1,
            }}>
            RESET CAMERA
          </button>
        </div>

        {/* Network legend */}
        <div style={{ display: 'flex', gap: 16 }}>
          {Object.entries(NETWORKS).map(([key, net]) => (
            <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <div style={{ width: 8, height: 8, borderRadius: 4, background: net.color }} />
              <span style={{ fontSize: 10, color: '#4a6a8a', letterSpacing: 1 }}>
                {net.label.toUpperCase()}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* 3D workspace */}
      <div style={{ position: 'relative', background: '#08090f', overflow: 'hidden' }}>
        <Workspace3D
          currentTurn={currentTurn}
          tokenIndex={displayTokenIndex}
          onResetCamera={resetCam}
        />
      </div>

      {/* Right panel with tabs */}
      <RightPanel
        activeTab={activeTab}
        onTabChange={setActiveTab}
        
        // Playback list
        availableConversations={defaultConvos}
        selectedConvoId={selectedConvoId}
        onSelectConversation={handleSelectConversation}

        conversation={playbackConversation}
        currentIndex={turnIndex}
        currentTokenIndex={tokenIndex}
        isPlaying={isPlaying}
        onSelectTurn={handleSelectTurn}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onScrubToken={setTokenIndex}
        onLiveTurn={setLiveTurn}
        onReplayReady={handleReplayReady}
      />
    </div>
  )
}
