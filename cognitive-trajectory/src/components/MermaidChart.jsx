import { useEffect, useRef } from 'react'
import mermaid from 'mermaid'

mermaid.initialize({
  startOnLoad: false,
  theme: 'dark',
  themeVariables: {
    background:       '#0a0c14',
    primaryColor:     '#0e1a2a',
    primaryTextColor: '#c8d8f0',
    primaryBorderColor: '#1a3a5a',
    lineColor:        '#2a5a8a',
    secondaryColor:   '#0e1a2a',
    tertiaryColor:    '#060810',
    fontSize:         '13px',
    fontFamily:       "'Inter', sans-serif",
  },
  flowchart: { curve: 'basis', useMaxWidth: true },
})

let idCounter = 0

export default function MermaidChart({ chart }) {
  const ref = useRef(null)
  const id  = useRef(`mermaid-${++idCounter}`)

  useEffect(() => {
    if (!ref.current) return
    mermaid.render(id.current, chart).then(({ svg }) => {
      if (ref.current) ref.current.innerHTML = svg
    })
  }, [chart])

  return (
    <div
      ref={ref}
      style={{
        background:   '#0a0c14',
        borderRadius: 6,
        padding:      '16px 8px',
        overflowX:    'auto',
      }}
    />
  )
}
