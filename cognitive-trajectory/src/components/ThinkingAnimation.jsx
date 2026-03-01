import { useRef } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { Icosahedron, Float } from '@react-three/drei'

function ThinkingMesh() {
  const meshRef = useRef(null)

  useFrame((state, delta) => {
    if (meshRef.current) {
      meshRef.current.rotation.x += delta * 0.4
      meshRef.current.rotation.y += delta * 0.6
      meshRef.current.scale.setScalar(1 + Math.sin(state.clock.elapsedTime * 3) * 0.08)
    }
  })

  return (
    <Float speed={2} rotationIntensity={0.5} floatIntensity={1}>
      <Icosahedron ref={meshRef} args={[1, 1]}>
        <meshBasicMaterial color="#7ac0f0" wireframe opacity={0.6} transparent />
      </Icosahedron>
    </Float>
  )
}

export default function ThinkingAnimation() {
  return (
    <div style={{ width: 40, height: 40, flexShrink: 0 }}>
      <Canvas camera={{ position: [0, 0, 3], fov: 50 }}>
        <ThinkingMesh />
      </Canvas>
    </div>
  )
}
