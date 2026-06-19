import { useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Environment, MeshDistortMaterial, Float, Stars } from '@react-three/drei';

function HeroBlob() {
  const meshRef = useRef(null);
  
  useFrame((state) => {
    if (meshRef.current) {
      meshRef.current.rotation.x = state.clock.elapsedTime * 0.05;
      meshRef.current.rotation.y = state.clock.elapsedTime * 0.08;
    }
  });

  return (
    <Float speed={2.5} rotationIntensity={1.2} floatIntensity={1.5}>
      <mesh ref={meshRef} scale={1.9} position={[1, 0, 0]}>
        <sphereGeometry args={[1, 48, 48]} />
        <MeshDistortMaterial
          color="#2575fc"
          envMapIntensity={1.2}
          clearcoat={1}
          clearcoatRoughness={0.1}
          metalness={0.9}
          roughness={0.1}
          distort={0.4}
          speed={2}
        />
      </mesh>
    </Float>
  );
}

export default function LandingCanvas() {
  return (
    <div className="landing__canvas-wrap" aria-hidden="true" style={{
      position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', zIndex: 0, overflow: 'hidden', pointerEvents: 'none', opacity: 0.8
    }}>
      <Canvas camera={{ position: [0, 0, 5], fov: 50 }} dpr={[1, 1.5]}>
        <color attach="background" args={['#050508']} />
        <ambientLight intensity={0.4} />
        <directionalLight position={[10, 10, 5]} intensity={1.2} />
        <directionalLight position={[-10, -10, -5]} color="#6a11cb" intensity={2.5} />
        <spotLight position={[0, 5, 5]} angle={0.3} penumbra={1} intensity={2} color="#ffffff" />
        <Stars radius={100} depth={50} count={1500} factor={4} saturation={0} fade speed={1} />
        <HeroBlob />
        <Environment preset="city" />
      </Canvas>
    </div>
  );
}
