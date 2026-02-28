import { useState, useEffect, useRef, useCallback } from 'react'
import Workspace3D          from './components/Workspace3D'
import ConversationTimeline from './components/ConversationTimeline'
import conversation         from './data/mockConversation.json'
import { NETWORKS }         from './constants/networks'

const TURN_DURATION_MS  = 2800   // time per turn when playing
const TOKEN_INTERVAL_MS = 180    // time per token when playing

export default function App() {
  const [turnIndex,  setTurnIndex]  = useState(0)
  const [tokenIndex, setTokenIndex] = useState(0)
  const [isPlaying,  setIsPlaying]  = useState(false)
  const [resetCam,   setResetCam]   = useState(0)

  const playTimerRef  = useRef(null)
  const tokenTimerRef = useRef(null)

  const currentTurn = conversation[turnIndex]
  const tokens      = currentTurn?.llm?.tokens ?? []

  // ── Token animation within a turn ─────────────────────────────────────────
  const startTokenAnimation = useCallback((turn) => {
    clearInterval(tokenTimerRef.current)
    setTokenIndex(0)
    
    const tokenList = turn?.speaker === 'human' ? turn?.human?.tokens : turn?.llm?.tokens
    const maxTokens = tokenList?.length ?? 1
    
    let t = 0
    tokenTimerRef.current = setInterval(() => {
      t++
      if (t >= maxTokens) {
        clearInterval(tokenTimerRef.current)
      } else {
        setTokenIndex(t)
      }
    }, TOKEN_INTERVAL_MS)
  }, [])

  // ── Playback ───────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isPlaying) {
      clearTimeout(playTimerRef.current)
      clearInterval(tokenTimerRef.current)
      return
    }

    if (currentTurn) startTokenAnimation(currentTurn)

    playTimerRef.current = setTimeout(() => {
      setTurnIndex(prev => {
        const next = prev + 1
        if (next >= conversation.length) {
          setIsPlaying(false)
          return prev
        }
        return next
      })
    }, TURN_DURATION_MS)

    return () => {
      clearTimeout(playTimerRef.current)
    }
  }, [isPlaying, turnIndex])

  const handleSelectTurn = (i) => {
    setTurnIndex(i)
    setTokenIndex(0)
    clearTimeout(playTimerRef.current)
    clearInterval(tokenTimerRef.current)
  }

  return (
    <div style={{
      width:      '100vw',
      height:     '100vh',
      background: '#060810',
      display:    'grid',
      gridTemplateColumns: '1fr 340px',
      gridTemplateRows:    '48px 1fr',
      fontFamily: "'Inter', sans-serif",
      color:      '#c8d8f0',
      overflow:   'hidden',
    }}>

      {/* Header */}
      <div style={{
        gridColumn:  '1 / -1',
        position:    'relative',
        display:     'flex',
        alignItems:  'center',
        padding:     '0 24px',
        borderBottom: '1px solid #0e1a2a',
        gap:          16,
      }}>
        <span style={{ fontSize: 13, letterSpacing: 2, color: '#3a6a9a' }}>
          COGNITIVE TRAJECTORY VISUALISER
        </span>
        <span style={{ fontSize: 11, color: '#1a3a5a' }}>
          · mock data · phase 3
        </span>
        <div style={{ flex: 1 }} />
        
        {/* Reset Camera Button - Centered */}
        <div style={{
          position: 'absolute',
          left: '50%',
          transform: 'translateX(-50%)'
        }}>
          <button 
            onClick={() => setResetCam(c => c + 1)}
            style={{
              background: '#1a2a3a',
              border:     '1px solid #2a4a6a',
              borderRadius: 4,
              color:      '#7ac0f0',
              padding:    '4px 14px',
              cursor:     'pointer',
              fontSize:   11,
              letterSpacing: 1
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

      {/* Unified 3D Workspace */}
      <div style={{ position: 'relative', background: '#08090f', overflow: 'hidden' }}>
        <Workspace3D
          currentTurn={currentTurn}
          tokenIndex={tokenIndex}
          onResetCamera={resetCam}
        />
      </div>

      {/* Timeline */}
      <div style={{ borderLeft: '1px solid #0e1a2a', overflow: 'hidden' }}>
        <ConversationTimeline
          conversation={conversation}
          currentIndex={turnIndex}
          currentTokenIndex={tokenIndex}
          isPlaying={isPlaying}
          onSelectTurn={handleSelectTurn}
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
          onScrubToken={setTokenIndex}
        />
      </div>
    </div>
  )
}
