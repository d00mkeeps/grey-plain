import ConversationTimeline from './ConversationTimeline'
import ChatInterface        from './ChatInterface'

const TAB_STYLE = (active) => ({
  flex:          1,
  padding:       '8px 0',
  background:    active ? '#0e1a2a' : 'transparent',
  border:        'none',
  borderBottom:  `2px solid ${active ? '#2a7aff' : 'transparent'}`,
  color:         active ? '#7ac0f0' : '#3a5a7a',
  cursor:        'pointer',
  fontSize:      10,
  letterSpacing: 1.5,
  textTransform: 'uppercase',
  fontFamily:    "'Inter', sans-serif",
})

export default function RightPanel({
  activeTab,
  onTabChange,
  // playback props
  conversation,
  currentIndex,
  currentTokenIndex,
  isPlaying,
  onSelectTurn,
  onPlay,
  onPause,
  onScrubToken,
  // chat props
  onLiveTurn,
  onReplayReady,
}) {

  return (
    <div style={{
      width:         '100%',
      height:        '100%',
      display:       'flex',
      flexDirection: 'column',
      background:    '#0a0c14',
      borderLeft:    '1px solid #0e1a2a',
      minHeight:     0,
    }}>

      <div style={{
        display:      'flex',
        borderBottom: '1px solid #0e1a2a',
        flexShrink:   0,
      }}>
        <button style={TAB_STYLE(activeTab === 'chat')}
          onClick={() => onTabChange('chat')}>
          Chat
        </button>
        <button style={TAB_STYLE(activeTab === 'playback')}
          onClick={() => onTabChange('playback')}>
          Playback
        </button>
      </div>

      {/* Panel content */}
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        {activeTab === 'chat' ? (
          <ChatInterface
            onLiveTurn={onLiveTurn}
            onReplayReady={onReplayReady}
          />
        ) : (
          <ConversationTimeline
            conversation={conversation}
            currentIndex={currentIndex}
            currentTokenIndex={currentTokenIndex}
            isPlaying={isPlaying}
            onSelectTurn={onSelectTurn}
            onPlay={onPlay}
            onPause={onPause}
            onScrubToken={onScrubToken}
          />
        )}
      </div>
    </div>
  )
}
