import { useState, useEffect, useRef } from 'react'
import { MessageText } from './ChatInterface'

export default function ConversationTimeline({
  availableConversations = [],
  selectedConvoId,
  onSelectConversation,

  conversation,
  currentIndex,
  currentTokenIndex,
  isPlaying,
  onSelectTurn,
  onPlay,
  onPause,
  onScrubToken,
}) {
  const listRef = useRef(null)

  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-index="${currentIndex}"]`)
    el?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [currentIndex])

  return (
    <div style={{
      width:      '100%',
      height:     '100%',
      display:    'flex',
      flexDirection: 'column',
      background: '#0a0c14',
      fontFamily: "'Inter', sans-serif",
      boxSizing:  'border-box',
    }}>

      {/* Conversation selector */}
      <div style={{
        padding:      '12px 16px',
        borderBottom: '1px solid #151e2a',
        flexShrink:   0,
        display:      'flex',
        alignItems:   'center',
        gap:          12,
      }}>
        <div style={{ fontSize: 10, color: '#3a6a9a', textTransform: 'uppercase', letterSpacing: 1 }}>
          Session:
        </div>
        <select
          value={selectedConvoId}
          onChange={(e) => onSelectConversation(e.target.value)}
          style={{
            flex:         1,
            background:   '#0e1520',
            border:       '1px solid #1a3a5a',
            borderRadius: 4,
            color:        '#c8d8f0',
            padding:      '6px 8px',
            fontSize:     12,
            outline:      'none',
            cursor:       'pointer',
          }}
        >
          {selectedConvoId === 'Just Replayed' && (
            <option value="Just Replayed" disabled>Unsaved Session (Just Replayed)</option>
          )}
          {availableConversations.map(c => (
             <option key={c.id} value={c.id}>
               {c.id.replace('conversation_', '').replace(/_/g, ' ').replace(/-/g, ':')}
             </option>
          ))}
        </select>
      </div>

      {/* Playback controls */}
      <div style={{
        display:    'flex',
        alignItems: 'center',
        gap:        12,
        padding:    '12px 16px',
        borderBottom: '1px solid #151e2a',
        flexShrink: 0,
      }}>
        <button
          onClick={isPlaying ? onPause : onPlay}
          style={{
            background: '#1a2a3a',
            border:     '1px solid #2a4a6a',
            borderRadius: 4,
            color:      '#7ac0f0',
            padding:    '4px 14px',
            cursor:     'pointer',
            fontSize:   13,
          }}
        >
          {isPlaying ? '⏸' : '▶'}
        </button>

        <div style={{ flex: 1, height: 2, background: '#151e2a', borderRadius: 1, position: 'relative' }}>
          <div style={{
            position:   'absolute',
            left:       0,
            top:        0,
            height:     '100%',
            width:      `${((currentIndex) / Math.max(conversation.length - 1, 1)) * 100}%`,
            background: '#2a6aaa',
            borderRadius: 1,
            transition: 'width 0.3s',
          }} />
        </div>

        <div style={{ color: '#3a6a9a', fontSize: 11, flexShrink: 0 }}>
          {currentIndex + 1} / {conversation.length}
        </div>
      </div>

      {/* Turn list */}
      <div ref={listRef} style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
        {conversation.map((turn, i) => {
          const isActive  = i === currentIndex
          const isPast    = i < currentIndex
          const isHuman   = turn.speaker === 'human'

          return (
            <div
              key={i}
              data-index={i}
              onClick={() => onSelectTurn(i)}
              style={{
                padding:    '10px 16px',
                cursor:     'pointer',
                background: isActive ? '#0e1e30' : 'transparent',
                borderLeft: `3px solid ${isActive ? '#2a7aff' : isPast ? '#1a3a5a' : '#0e1520'}`,
                transition: 'background 0.15s',
                opacity:    isPast ? 0.6 : 1,
              }}
            >
              <div style={{
                fontSize:   10,
                color:      isHuman ? '#5aaa8a' : '#7a8aaa',
                marginBottom: 4,
                letterSpacing: 1,
                textTransform: 'uppercase',
              }}>
                {isHuman ? 'human' : 'model'} · turn {i}
              </div>
              <div style={{
                fontSize:   13,
                color:      isActive ? '#c8d8f0' : '#6a8aaa',
                lineHeight: 1.5,
              }}>
                <MessageText text={turn.text} isStreaming={false} />
              </div>

              {/* Token scrubber — shown for active turns with tokens */}
              {isActive && (isHuman ? turn.human?.tokens : turn.llm?.tokens) && (
                <div style={{ marginTop: 8 }}>
                  <input
                    type="range"
                    min={0}
                    max={(isHuman ? turn.human.tokens.length : turn.llm.tokens.length) - 1}
                    value={currentTokenIndex}
                    onChange={e => onScrubToken(Number(e.target.value))}
                    onClick={e => e.stopPropagation()}
                    style={{ width: '100%', accentColor: '#2a7aff' }}
                  />
                  <div style={{ fontSize: 10, color: '#3a6a9a', textAlign: 'right' }}>
                    token {currentTokenIndex + 1} / {isHuman ? turn.human.tokens.length : turn.llm.tokens.length}
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
