import { useState, useRef, useEffect } from 'react'
import ReactMarkdown from 'react-markdown'
import ThinkingAnimation from './ThinkingAnimation'
// Modal endpoints
const CHAT_URL = 'https://d00mkeeps--cognitive-trajectory-inferencemodel-chat.modal.run'
const REPLAY_URL = 'https://d00mkeeps--cognitive-trajectory-inferencemodel-replay.modal.run'

export function MessageText({ text, isStreaming, onExpand }) {
  const [expanded, setExpanded] = useState(false)
  const MAX_LEN = 280
  const isLong = text.length > MAX_LEN

  return (
    <div style={{ width: '100%', overflowX: 'hidden' }}>
      <div
        style={
          (isLong && !expanded && !isStreaming)
            ? {
                display: '-webkit-box',
                WebkitLineClamp: 5,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
              }
            : {}
        }
      >
        <ReactMarkdown
          components={{
            p: ({node, ...props}) => <p style={{ margin: '0 0 0.5em 0' }} {...props} />,
            pre: ({node, ...props}) => <pre style={{ background: '#0a0c10', padding: '8px', borderRadius: '4px', overflowX: 'auto', margin: '4px 0' }} {...props} />,
            code: ({node, inline, ...props}) => inline 
               ? <code style={{ fontFamily: 'monospace', background: '#0a0c10', padding: '2px 4px', borderRadius: '3px' }} {...props} />
               : <code style={{ fontFamily: 'monospace' }} {...props} />
          }}
        >
          {text}
        </ReactMarkdown>
      </div>
      {isLong && !isStreaming && (
        <button
          onClick={() => {
            const nextExpanded = !expanded
            setExpanded(nextExpanded)
            if (onExpand) onExpand(nextExpanded)
          }}
          style={{
            background: 'none', border: 'none', color: '#5aaa8a',
            padding: 0, marginTop: 4, cursor: 'pointer', fontSize: 10,
            textTransform: 'uppercase', letterSpacing: 0.5,
            opacity: 0.8
          }}
        >
          {expanded ? '▲ Show less' : '▼ Read more'}
        </button>
      )}
    </div>
  )
}

export default function ChatInterface({ onReplayReady, onLiveTurn }) {
  const [messages,       setMessages]       = useState([])
  const [input,          setInput]          = useState('')
  const [isGenerating,   setIsGenerating]   = useState(false)
  const [isReplaying,    setIsReplaying]    = useState(false)
  const [streamingText,  setStreamingText]  = useState('')

  const listRef        = useRef(null)
  const inputRef       = useRef(null)
  const autoScrollRef  = useRef(true)

  const handleScroll = () => {
    if (!listRef.current) return
    const { scrollTop, scrollHeight, clientHeight } = listRef.current
    // If user is within 50px of the bottom, keep auto-scrolling
    autoScrollRef.current = scrollHeight - scrollTop - clientHeight < 50
  }

  useEffect(() => {
    if (listRef.current && autoScrollRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight
    }
  }, [messages, streamingText, isGenerating])

  const sendMessage = async () => {
    const text = input.trim()
    if (!text || isGenerating) return

    const userMsg = { speaker: 'human', text }
    const updatedMessages = [...messages, userMsg]
    setMessages(updatedMessages)
    setInput('')
    setIsGenerating(true)
    setStreamingText('')

    // Immediately show human turn in visualiser
    if (onLiveTurn) {
      onLiveTurn({
        speaker: 'human',
        text,
        human: null,   // brain fires when we get the brain event
        llm:   null,
      })
    }

    try {
      const res = await fetch(CHAT_URL, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          message: text,
          history: messages.map(m => ({ speaker: m.speaker, text: m.text })),
        }),
      })

      const reader  = res.body.getReader()
      const decoder = new TextDecoder()
      let   buffer  = ''
      let   fullText = ''
      let   tokens  = []
      let   layerActivationsList = []
      let   brainData = null

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop()   // keep incomplete line in buffer

        for (const line of lines) {
          if (!line.trim()) continue
          try {
            const event = JSON.parse(line)

            if (event.type === 'brain') {
              brainData = event.data
              // Update visualiser with human turn brain activation
              if (onLiveTurn) {
                onLiveTurn({
                  speaker: 'human',
                  text,
                  human: {
                    regionActivations: event.data.regionActivations,
                    dominantNetwork:   event.data.dominantNetwork,
                    tokens:            [],
                    tokenActivations:  [],
                  },
                  llm: null,
                })
              }
            }

            if (event.type === 'token') {
              tokens.push(event.data.token)
              layerActivationsList.push(event.data.layerActivations)
              fullText += event.data.token
              setStreamingText(fullText)

              // Update LLM layer stack live
              if (onLiveTurn) {
                onLiveTurn(prev => ({
                  speaker: 'llm',
                  text:    fullText,
                  human:   null,
                  llm: {
                    tokens,
                    layerActivations:  layerActivationsList,
                    dominantNetwork:   brainData?.dominantNetwork ?? 'language',
                  },
                }))
              }
            }

            if (event.type === 'done') {
              const assistantMsg = { speaker: 'llm', text: event.data.fullText }
              setMessages(prev => [...prev, assistantMsg])
              setStreamingText('')
              setIsGenerating(false)
            }

          } catch (e) {
            // malformed JSON line, skip
          }
        }
      }

    } catch (err) {
      console.error('Chat error:', err)
      setIsGenerating(false)
      setStreamingText('')
    }
  }

  const handleReplay = async () => {
    if (messages.length === 0 || isReplaying) return
    setIsReplaying(true)

    try {
      // 1. Headless auto-save to local src/data folder FIRST
      // This way we don't lose the raw conversation if Modal times out
      try {
        await fetch('http://localhost:8001/save', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({
             conversation: messages.map((m, i) => ({
               index: i,
               speaker: m.speaker,
               text: m.text,
               human: null,
               llm: null
             }))
          })
        })
      } catch (err) {
        console.warn('Auto-save failed (make sure save_api.py is running):', err)
        alert('Could not auto-save to src/data/. Is save_api.py running?')
      }

      // 2. Get enriched replay from Modal
      const res = await fetch(REPLAY_URL, {
        method:  'POST',
        mode:    'cors',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          conversation: messages.map(m => ({ speaker: m.speaker, text: m.text }))
        }),
      })
      const data = await res.json()
      onReplayReady(data.conversation)

      // 3. Overwrite the raw save with the enriched data
      try {
        await fetch('http://localhost:8001/save', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ conversation: data.conversation })
        })
      } catch (err) {
        console.warn('Enriched auto-save failed:', err)
      }

    } catch (err) {
      console.error('Replay error:', err)
      alert('Modal replay failed or timed out. Your raw conversation was still saved locally.')
    } finally {
      setIsReplaying(false)
    }
  }

  return (
    <div style={{
      flex:          1,
      display:       'flex',
      flexDirection: 'column',
      background:    '#0a0c14',
      fontFamily:    '\'Inter\', sans-serif',
      boxSizing:     'border-box',
      minHeight:     0,
    }}>

      {/* Message list */}
      <div
        ref={listRef}
        onScroll={handleScroll}
        style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', padding: '12px 0', minHeight: 0 }}
      >
        {messages.length === 0 && (
          <div style={{
            padding:   '32px 20px',
            color:     '#2a4a6a',
            fontSize:  12,
            textAlign: 'center',
            lineHeight: 1.6,
          }}>
            Start a conversation.<br />
            When you\'re done, hit Replay<br />
            to visualise the full session.
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} style={{
            padding:    '8px 16px',
            borderLeft: `3px solid ${msg.speaker === 'human' ? '#2a6a4a' : '#2a4a7a'}`,
            margin:     '2px 0',
          }}>
            <div style={{
              fontSize:      10,
              color:         msg.speaker === 'human' ? '#5aaa8a' : '#7a8aaa',
              marginBottom:  4,
              letterSpacing: 1,
              textTransform: 'uppercase',
            }}>
              {msg.speaker === 'human' ? 'you' : 'model'}
            </div>
            <div style={{
              fontSize:   13,
              color:      '#c8d8f0',
              lineHeight: 1.5,
            }}>
              <MessageText 
                text={msg.text} 
                isStreaming={false} 
                onExpand={(isNowExpanded) => {
                  if (isNowExpanded && listRef.current) {
                    setTimeout(() => {
                      if (listRef.current) {
                        listRef.current.scrollTop = listRef.current.scrollHeight
                        autoScrollRef.current = true
                      }
                    }, 50)
                  }
                }}
              />
            </div>
          </div>
        ))}

        {/* Streaming response */}
        {isGenerating && (
          <div style={{
            padding:    '8px 16px',
            borderLeft: '3px solid #2a4a7a',
            margin:     '2px 0',
            opacity:    0.8,
          }}>
            <div style={{
              fontSize:      10,
              color:         '#7a8aaa',
              marginBottom:  4,
              letterSpacing: 1,
              textTransform: 'uppercase',
            }}>
              model
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 13, color: '#c8d8f0', lineHeight: 1.5 }}>
              {!streamingText ? (
                <>
                  <ThinkingAnimation />
                  <span style={{ color: '#7a8aaa', fontStyle: 'italic' }}>
                    Waking up inference server... (cold starts may take ~15s)
                  </span>
                </>
              ) : (
                <div style={{ flex: 1 }}>
                  <MessageText text={streamingText} isStreaming={true} />
                  <span style={{
                    display:    'inline-block',
                    width:      8,
                    height:     12,
                    background: '#3a6aaa',
                    marginLeft: 3,
                    animation:  'blink 1s infinite',
                    verticalAlign: 'middle',
                  }} />
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Replay button */}
      {messages.length >= 2 && (
        <div style={{
          padding:      '8px 16px',
          borderTop:    '1px solid #0e1a2a',
          borderBottom: '1px solid #0e1a2a',
          flexShrink:   0,
        }}>
          <button
            onClick={handleReplay}
            disabled={isReplaying}
            style={{
              width:        '100%',
              background:   isReplaying ? '#0e1a2a' : '#0e2a1a',
              border:       `1px solid ${isReplaying ? '#1a3a5a' : '#1a5a3a'}`,
              borderRadius: 4,
              color:        isReplaying ? '#3a6a5a' : '#5aaa8a',
              padding:      '6px',
              cursor:       isReplaying ? 'not-allowed' : 'pointer',
              fontSize:     11,
              letterSpacing: 1,
            }}
          >
            {isReplaying ? 'PROCESSING REPLAY & AUTO-SAVING...' : '⟳ REPLAY & AUTO-SAVE'}
          </button>
        </div>
      )}

      {/* Input */}
      <div style={{
        padding:    '12px 16px',
        flexShrink: 0,
        display:    'flex',
        gap:        8,
      }}>
        <textarea
          ref={inputRef}
          value={input}
          onChange={e => {
            setInput(e.target.value)
            e.target.style.height = 'auto'
            e.target.style.height = `${Math.min(e.target.scrollHeight, 150)}px`
          }}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              sendMessage()
              if (inputRef.current) {
                inputRef.current.style.height = 'auto'
              }
            }
          }}
          placeholder="Message..."
          disabled={isGenerating}
          rows={1}
          style={{
            flex:        1,
            background:  '#0e1520',
            border:      '1px solid #1a3a5a',
            borderRadius: 4,
            color:       '#c8d8f0',
            fontSize:    13,
            padding:     '8px 10px',
            resize:      'none',
            fontFamily:  '\'Inter\', sans-serif',
            outline:     'none',
            minHeight:   '36px',
            maxHeight:   '150px',
          }}
        />
        <button
          onClick={sendMessage}
          disabled={isGenerating || !input.trim()}
          style={{
            background:   isGenerating ? '#0e1a2a' : '#1a3a5a',
            border:       '1px solid #2a5a8a',
            borderRadius: 4,
            color:        '#7ac0f0',
            padding:      '0 14px',
            cursor:       isGenerating ? 'not-allowed' : 'pointer',
            fontSize:     18,
            alignSelf:    'stretch',
          }}
        >
          ↑
        </button>
      </div>

      <style>{`
        @keyframes blink {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0; }
        }
      `}</style>
    </div>
  )
}
