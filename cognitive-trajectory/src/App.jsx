import { useState, useEffect, useRef, useCallback } from 'react'
import Workspace3D from './components/Workspace3D'
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

// Fallback to empty if nothing is saved yet
const defaultConvos = availableConversations.length > 0 
  ? availableConversations 
  : [{ id: 'empty', data: [] }]

export default function App() {
  // ── Playback mode state ────────────────────────────────────────────────────
  const [selectedConvoId, setSelectedConvoId] = useState(defaultConvos[0].id)
  const [playbackConversation, setPlaybackConversation] = useState(defaultConvos[0].data)
  const [turnIndex,   setTurnIndex]   = useState(0)
  const [tokenIndex,  setTokenIndex]  = useState(0)
  const [isPlaying,   setIsPlaying]   = useState(false)
  const [resetCam,    setResetCam]    = useState(0)

  // Turn currently feeding Workspace3D
  const currentTurn = playbackConversation[turnIndex]

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
    if (currentTurn) startTokenAnimation(currentTurn)
    
    // Calculate enough time for all tokens to animate (plus a small pause)
    const tokenList = currentTurn?.speaker === 'human'
      ? currentTurn?.human?.tokens
      : currentTurn?.llm?.tokens
    const maxTokens = tokenList?.length ?? 1
    const dynamicDuration = Math.max(TURN_DURATION_MS, (maxTokens * TOKEN_INTERVAL_MS) + 400)

    playTimerRef.current = setTimeout(() => {
      setTurnIndex(prev => {
        const next = prev + 1
        if (next >= playbackConversation.length) {
          setIsPlaying(false)
          return 0
        }
        return next
      })
    }, dynamicDuration)
    return () => clearTimeout(playTimerRef.current)
  }, [isPlaying, turnIndex, playbackConversation, currentTurn, startTokenAnimation])

  const togglePlay = () => {
    if (!isPlaying) {
      if (turnIndex >= playbackConversation.length - 1) {
        setTurnIndex(0)
        setTokenIndex(0)
      }
      setIsPlaying(true)
    } else {
      setIsPlaying(false)
    }
  }

  const handleSelectConversation = (id) => {
    const convo = defaultConvos.find(c => c.id === id)
    if (convo) {
      setSelectedConvoId(id)
      setPlaybackConversation(convo.data)
      setTurnIndex(0)
      setTokenIndex(0)
      setIsPlaying(false)
    }
  }

  return (
    <div style={{
      width:      '100vw',
      height:     '100vh',
      background: '#060810',
      display:    'flex',
      flexDirection: 'column',
      fontFamily: "'Inter', sans-serif",
      color:      '#c8d8f0',
      overflow:   'hidden',
    }}>

      {/* Header */}
      <div style={{
        height:       48,
        display:      'flex',
        alignItems:   'center',
        padding:      '0 20px',
        borderBottom: '1px solid #0e1a2a',
        gap:          16,
        background:   '#080a12',
        flexShrink:   0,
        zIndex:       10,
      }}>
        {/* Title */}
        <span style={{ fontSize: 13, letterSpacing: 2, color: '#3a6a9a', fontWeight: 600 }}>
          COGNITIVE TRAJECTORY VISUALISER
        </span>

        {/* Center controls: Play/Pause, Session selector, Turn info, Reset camera */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginLeft: 'auto', marginRight: 'auto' }}>
          {/* Play / Pause button */}
          <button
            onClick={togglePlay}
            title={isPlaying ? "Pause Playback" : "Start Playback"}
            style={{
              display:        'flex',
              alignItems:     'center',
              justifyContent: 'center',
              gap:            6,
              background:     isPlaying ? '#1b3a5a' : '#142030',
              border:         `1px solid ${isPlaying ? '#3a8aff' : '#224060'}`,
              borderRadius:   6,
              color:          isPlaying ? '#90d4ff' : '#7ac0f0',
              padding:        '5px 14px',
              cursor:         'pointer',
              fontSize:       12,
              letterSpacing:  1,
              fontWeight:     600,
              boxShadow:      isPlaying ? '0 0 10px rgba(58, 138, 255, 0.3)' : 'none',
              transition:     'all 0.2s ease',
            }}>
            <span>{isPlaying ? '⏸' : '▶'}</span>
            <span>{isPlaying ? 'PAUSE' : 'PLAY'}</span>
          </button>

          {/* Session Selector */}
          {defaultConvos.length > 1 && (
            <select
              value={selectedConvoId}
              onChange={(e) => handleSelectConversation(e.target.value)}
              style={{
                background:   '#0e1520',
                border:       '1px solid #1a3a5a',
                borderRadius: 4,
                color:        '#c8d8f0',
                padding:      '5px 10px',
                fontSize:     11,
                outline:      'none',
                cursor:       'pointer',
                letterSpacing: 0.5,
              }}
            >
              {defaultConvos.map(c => (
                <option key={c.id} value={c.id}>
                  {c.id.replace('conversation_', '').replace(/_/g, ' ').replace(/-/g, ':')}
                </option>
              ))}
            </select>
          )}

          {/* Turn status */}
          {playbackConversation.length > 0 && (
            <span style={{ fontSize: 11, color: '#4a6a8a', letterSpacing: 1 }}>
              TURN {turnIndex + 1} / {playbackConversation.length}
            </span>
          )}

          {/* Reset camera */}
          <button
            onClick={() => setResetCam(c => c + 1)}
            title="Reset 3D camera position"
            style={{
              background:   '#101824',
              border:       '1px solid #1a3048',
              borderRadius: 4,
              color:        '#5a8ab8',
              padding:      '5px 12px',
              cursor:       'pointer',
              fontSize:     10,
              letterSpacing: 1,
              transition:   'all 0.15s ease',
            }}>
            RESET CAMERA
          </button>
        </div>

        {/* Network legend */}
        <div style={{ display: 'flex', gap: 14 }}>
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

      {/* Fullscreen 3D workspace */}
      <div style={{ flex: 1, position: 'relative', background: '#08090f', overflow: 'hidden' }}>
        <Workspace3D
          currentTurn={currentTurn}
          tokenIndex={tokenIndex}
          onResetCamera={resetCam}
        />
      </div>
    </div>
  )
}
