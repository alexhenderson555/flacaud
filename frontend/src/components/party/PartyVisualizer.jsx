import { useEffect, useRef, useState, useMemo } from 'react';
import { Canvas, useFrame, createPortal } from '@react-three/fiber';
import { getAudioAnalyser, initAudioEngine } from '../../utils/audioEngine';
import * as THREE from 'three';
import { MeshDistortMaterial, Float, useFBO } from '@react-three/drei';

const simulationVertexShader = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const simulationFragmentShader = `
uniform sampler2D tPositions;
uniform float uTime;
uniform float uAudioFrequency;
uniform float uSpeed;

vec4 permute(vec4 x){return mod(((x*34.0)+1.0)*x, 289.0);}
vec4 taylorInvSqrt(vec4 r){return 1.79284291400159 - 0.85373472095314 * r;}

float snoise(vec3 v){ 
  const vec2  C = vec2(1.0/6.0, 1.0/3.0) ;
  const vec4  D = vec4(0.0, 0.5, 1.0, 2.0);
  vec3 i  = floor(v + dot(v, C.yyy) );
  vec3 x0 = v - i + dot(i, C.xxx) ;
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min( g.xyz, l.zxy );
  vec3 i2 = max( g.xyz, l.zxy );
  vec3 x1 = x0 - i1 + 1.0 * C.xxx;
  vec3 x2 = x0 - i2 + 2.0 * C.xxx;
  vec3 x3 = x0 - 1.0 + 3.0 * C.xxx;
  i = mod(i, 289.0 ); 
  vec4 p = permute( permute( permute( 
             i.z + vec4(0.0, i1.z, i2.z, 1.0 ))
           + i.y + vec4(0.0, i1.y, i2.y, 1.0 )) 
           + i.x + vec4(0.0, i1.x, i2.x, 1.0 ));
  float n_ = 1.0/7.0;
  vec3  ns = n_ * D.wyz - D.xzx;
  vec4 j = p - 49.0 * floor(p * ns.z *ns.z);
  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_ );
  vec4 x = x_ *ns.x + ns.yyyy;
  vec4 y = y_ *ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);
  vec4 b0 = vec4( x.xy, y.xy );
  vec4 b1 = vec4( x.zw, y.zw );
  vec4 s0 = floor(b0)*2.0 + 1.0;
  vec4 s1 = floor(b1)*2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));
  vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy ;
  vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww ;
  vec3 p0 = vec3(a0.xy,h.x);
  vec3 p1 = vec3(a0.zw,h.y);
  vec3 p2 = vec3(a1.xy,h.z);
  vec3 p3 = vec3(a1.zw,h.w);
  vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2, p2), dot(p3,p3)));
  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
  vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
  m = m * m;
  return 42.0 * dot( m*m, vec4( dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3) ) );
}

vec3 snoise3( vec3 x ){
  float s  = snoise(vec3( x ));
  float s1 = snoise(vec3( x.y - 19.1 , x.z + 33.4 , x.x + 47.2 ));
  float s2 = snoise(vec3( x.z + 74.2 , x.x - 124.5 , x.y + 99.4 ));
  return vec3( s , s1 , s2 );
}

vec3 curlNoise(vec3 p) {
  float e = 0.1;
  vec3 dx = vec3(e, 0.0, 0.0);
  vec3 dy = vec3(0.0, e, 0.0);
  vec3 dz = vec3(0.0, 0.0, e);
  vec3 p_x0 = snoise3(p - dx); vec3 p_x1 = snoise3(p + dx);
  vec3 p_y0 = snoise3(p - dy); vec3 p_y1 = snoise3(p + dy);
  vec3 p_z0 = snoise3(p - dz); vec3 p_z1 = snoise3(p + dz);
  float x = p_z1.y - p_z0.y - p_y1.z + p_y0.z;
  float y = p_x1.z - p_x0.z - p_z1.x + p_z0.x;
  float z = p_y1.x - p_y0.x - p_x1.y + p_x0.y;
  return normalize(vec3(x, y, z));
}

varying vec2 vUv;

void main() {
  vec3 pos = texture2D(tPositions, vUv).xyz;
  float noiseScale = 0.5 + (uAudioFrequency * 2.0);
  vec3 curl = curlNoise(pos * noiseScale + uTime * 0.1 * uSpeed);
  float dist = length(pos);
  vec3 attract = -normalize(pos) * (dist * 0.005);
  pos += curl * (0.01 * uSpeed + uAudioFrequency * 0.05 * uSpeed) + attract;
  gl_FragColor = vec4(pos, 1.0);
}
`;

const renderVertexShader = `
uniform sampler2D tPositions;
uniform float uAudioFrequency;
uniform float uGlowIntensity;
varying vec2 vUv;
varying float vDist;

void main() {
  vUv = position.xy; 
  vec3 pos = texture2D(tPositions, vUv).xyz;
  vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
  gl_PointSize = (1.5 + uAudioFrequency * 3.0) * (10.0 / -mvPosition.z) * uGlowIntensity;
  gl_Position = projectionMatrix * mvPosition;
  vDist = length(pos);
}
`;

const renderFragmentShader = `
uniform vec3 uColor;
varying float vDist;

void main() {
  vec2 circCoord = 2.0 * gl_PointCoord - 1.0;
  if (dot(circCoord, circCoord) > 1.0) {
    discard;
  }
  float alpha = 1.0 - smoothstep(0.5, 1.0, length(circCoord));
  alpha *= smoothstep(15.0, 5.0, vDist);
  gl_FragColor = vec4(uColor, alpha * 0.6);
}
`;

const getInitialPositions = (size) => {
  const data = new Float32Array(size * size * 4);
  for (let i = 0; i < size; i++) {
    for (let j = 0; j < size; j++) {
      const index = (i * size + j) * 4;
      const r = Math.random() * 5 + 0.1;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos((Math.random() * 2) - 1);
      data[index] = r * Math.sin(phi) * Math.cos(theta);
      data[index + 1] = r * Math.sin(phi) * Math.sin(theta);
      data[index + 2] = r * Math.cos(phi);
      data[index + 3] = 1.0;
    }
  }
  return data;
};

const MODES = ['bars', 'particles', 'gridbars', 'spiral', 'bouncing', 'orb', 'landscape'];

function readColors() {
  const root = document.documentElement;
  const accent = getComputedStyle(root).getPropertyValue('--cover-accent').trim()
    || getComputedStyle(root).getPropertyValue('--accent-solid').trim()
    || '#2575fc';
  return { accent };
}

function BarsMode({ analyser, isPlaying }) {
  const count = 128;
  const meshRef = useRef();
  const ringRef = useRef();
  const dataRef = useRef(new Uint8Array(256));
  const { accent } = useMemo(() => readColors(), []);
  const dummy = useMemo(() => new THREE.Object3D(), []);

  useFrame(() => {
    let bass = 0;
    if (analyser && isPlaying) {
      analyser.getByteFrequencyData(dataRef.current);
      bass = dataRef.current.slice(0, 10).reduce((a, b) => a + b, 0) / (10 * 255);
    }
    
    if (meshRef.current) {
      for (let i = 0; i < count; i++) {
        let dataIndex = i < count / 2 ? i : count - 1 - i;
        dataIndex = Math.floor((dataIndex / (count / 2)) * 100);
        const value = dataRef.current[dataIndex] || 2;
        
        const normalized = value / 255;
        const scaleY = 0.1 + Math.pow(normalized, 2.5) * 8;
        
        const angle = (i / count) * Math.PI * 2 + Math.PI / 2;
        const radius = 3.5;
        const dist = radius + scaleY / 2;
        
        dummy.position.set(Math.cos(angle) * dist, Math.sin(angle) * dist, 0);
        dummy.rotation.set(0, 0, angle + Math.PI / 2);
        dummy.scale.set(0.12, scaleY, 0.12);
        dummy.updateMatrix();
        
        meshRef.current.setMatrixAt(i, dummy.matrix);
      }
      meshRef.current.instanceMatrix.needsUpdate = true;
      
      const targetScale = 1 + bass * 0.15;
      ringRef.current.scale.lerp(new THREE.Vector3(targetScale, targetScale, targetScale), 0.15);
    }
  });

  return (
    <group ref={ringRef}>
      <instancedMesh ref={meshRef} args={[null, null, count]}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={3} roughness={0.1} metalness={0.9} />
      </instancedMesh>
      <mesh>
        <circleGeometry args={[3.3, 64]} />
        <meshBasicMaterial color="#080808" />
      </mesh>
      <mesh position={[0,0,-0.1]}>
        <circleGeometry args={[3.45, 64]} />
        <meshBasicMaterial color={accent} transparent opacity={0.5} />
      </mesh>
    </group>
  );
}

function OrbMode({ analyser, isPlaying }) {
  const meshRef = useRef();
  const wireRef = useRef();
  const dataRef = useRef(new Uint8Array(256));
  const { accent } = useMemo(() => readColors(), []);

  useFrame((state) => {
    let energy;
    if (analyser && isPlaying) {
      analyser.getByteFrequencyData(dataRef.current);
      energy = dataRef.current.reduce((a, b) => a + b, 0) / (256 * 255);
    } else {
      energy = 0.2 + Math.sin(state.clock.elapsedTime * 2) * 0.1;
    }
    
    if (meshRef.current) {
      meshRef.current.rotation.x = state.clock.elapsedTime * 0.2;
      meshRef.current.rotation.y = state.clock.elapsedTime * 0.3;
      
      const targetScale = 1 + energy * 1.5;
      meshRef.current.scale.lerp(new THREE.Vector3(targetScale, targetScale, targetScale), 0.1);
      
      meshRef.current.material.distort = THREE.MathUtils.lerp(meshRef.current.material.distort, 0.3 + energy * 1.5, 0.1);
      meshRef.current.material.speed = THREE.MathUtils.lerp(meshRef.current.material.speed, 1 + energy * 10, 0.1);
    }

    if (wireRef.current) {
      wireRef.current.rotation.x = state.clock.elapsedTime * -0.1;
      wireRef.current.rotation.y = state.clock.elapsedTime * -0.2;
      const wireScale = 1.1 + energy * 1.6;
      wireRef.current.scale.lerp(new THREE.Vector3(wireScale, wireScale, wireScale), 0.1);
      wireRef.current.material.opacity = THREE.MathUtils.lerp(wireRef.current.material.opacity, 0.1 + energy * 0.6, 0.1);
    }
  });

  return (
    <Float floatIntensity={4} rotationIntensity={3}>
      <mesh ref={meshRef}>
        <sphereGeometry args={[1.5, 128, 128]} />
        <MeshDistortMaterial color={accent} emissive={accent} emissiveIntensity={1.5} roughness={0.1} metalness={1} />
      </mesh>
      <mesh ref={wireRef}>
        <sphereGeometry args={[1.6, 32, 32]} />
        <meshBasicMaterial color={accent} wireframe transparent opacity={0.3} blending={THREE.AdditiveBlending} />
      </mesh>
    </Float>
  );
}

function ParticlesMode({ analyser, isPlaying, colorPalette, glowIntensity = 1, speedModifier = 1 }) {
  const size = 350;
  const count = size * size;
  
  const { accent } = useMemo(() => readColors(), []);
  const finalColor = colorPalette?.accent || accent;

  const fboA = useFBO(size, size, {
    minFilter: THREE.NearestFilter,
    magFilter: THREE.NearestFilter,
    format: THREE.RGBAFormat,
    type: THREE.FloatType,
  });
  const fboB = useFBO(size, size, {
    minFilter: THREE.NearestFilter,
    magFilter: THREE.NearestFilter,
    format: THREE.RGBAFormat,
    type: THREE.FloatType,
  });

  const fboRef = useRef({ read: fboA, write: fboB });
  const isFirstFrame = useRef(true);
  const dataRef = useRef(new Uint8Array(256));

  const [scene] = useState(() => new THREE.Scene());
  const [camera] = useState(() => new THREE.OrthographicCamera(-1, 1, 1, -1, 1 / Math.pow(2, 53), 1));
  
  const simMaterialRef = useRef();
  const renderMaterialRef = useRef();

  const positionsTexture = useMemo(() => {
    const data = getInitialPositions(size);
    const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat, THREE.FloatType);
    tex.needsUpdate = true;
    return tex;
  }, [size]);

  const particlesGeometry = useMemo(() => {
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    
    for (let i = 0; i < size; i++) {
      for (let j = 0; j < size; j++) {
        const index = (i * size + j);
        positions[index * 3 + 0] = (j + 0.5) / size; 
        positions[index * 3 + 1] = (i + 0.5) / size;
        positions[index * 3 + 2] = 0;
      }
    }
    
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    return geometry;
  }, [count, size]);

  useFrame((state) => {
    let bass;
    if (analyser && isPlaying) {
      analyser.getByteFrequencyData(dataRef.current);
      bass = dataRef.current.slice(0, 10).reduce((a, b) => a + b, 0) / (10 * 255);
    } else {
      bass = 0.1 + Math.sin(state.clock.elapsedTime * 2) * 0.05;
    }

    const { read, write } = fboRef.current;

    if (simMaterialRef.current) {
      simMaterialRef.current.uniforms.uTime.value = state.clock.elapsedTime;
      simMaterialRef.current.uniforms.uAudioFrequency.value = bass;
      simMaterialRef.current.uniforms.uSpeed.value = speedModifier;
      
      if (isFirstFrame.current) {
        simMaterialRef.current.uniforms.tPositions.value = positionsTexture;
        isFirstFrame.current = false;
      } else {
        simMaterialRef.current.uniforms.tPositions.value = read.texture;
      }
    }

    state.gl.setRenderTarget(write);
    state.gl.render(scene, camera);
    state.gl.setRenderTarget(null);

    if (renderMaterialRef.current) {
      renderMaterialRef.current.uniforms.tPositions.value = write.texture;
      renderMaterialRef.current.uniforms.uAudioFrequency.value = bass;
      renderMaterialRef.current.uniforms.uGlowIntensity.value = glowIntensity;
      renderMaterialRef.current.uniforms.uColor.value.set(finalColor);
    }

    fboRef.current.read = write;
    fboRef.current.write = read;
  });

  return (
    <>
      {createPortal(
        <mesh>
          <planeGeometry args={[2, 2]} />
          <shaderMaterial
            ref={simMaterialRef}
            vertexShader={simulationVertexShader}
            fragmentShader={simulationFragmentShader}
            uniforms={{
              tPositions: { value: null },
              uTime: { value: 0 },
              uAudioFrequency: { value: 0 },
              uSpeed: { value: speedModifier }
            }}
          />
        </mesh>,
        scene
      )}
      
      <points geometry={particlesGeometry}>
        <shaderMaterial
          ref={renderMaterialRef}
          vertexShader={renderVertexShader}
          fragmentShader={renderFragmentShader}
          uniforms={{
            tPositions: { value: null },
            uColor: { value: new THREE.Color(finalColor) },
            uAudioFrequency: { value: 0 },
            uGlowIntensity: { value: glowIntensity }
          }}
          transparent
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </points>
    </>
  );
}

function LandscapeMode({ analyser, isPlaying }) {
  const count = 1600;
  const gridSize = 40;
  const meshRef = useRef();
  const dataRef = useRef(new Uint8Array(256));
  const { accent } = useMemo(() => readColors(), []);
  const dummy = useMemo(() => new THREE.Object3D(), []);

  useFrame((state) => {
    let energy;
    if (analyser && isPlaying) {
      analyser.getByteFrequencyData(dataRef.current);
      energy = dataRef.current.reduce((a, b) => a + b, 0) / (256 * 255);
    } else {
      energy = 0.1 + Math.sin(state.clock.elapsedTime) * 0.05;
    }
    
    if (meshRef.current) {
      const time = state.clock.elapsedTime * 1.5;
      for (let x = 0; x < gridSize; x++) {
        for (let z = 0; z < gridSize; z++) {
          const i = x * gridSize + z;
          const dx = x - gridSize / 2;
          const dz = z - gridSize / 2;
          const dist = Math.sqrt(dx * dx + dz * dz);
          
          const freqIndex = Math.floor((dist / (gridSize / 2)) * 64) % 256;
          const freq = dataRef.current[freqIndex] / 255;
          
          const wave = Math.sin(dist * 0.5 - time) * 0.5 + 0.5;
          const h = wave * 0.5 + freq * 6 * (1 + energy * 2);
          const scaleY = Math.max(0.1, h);
          
          dummy.position.set(dx * 0.6, scaleY / 2 - 4, dz * 0.6);
          dummy.scale.set(0.4, scaleY, 0.4);
          dummy.updateMatrix();
          meshRef.current.setMatrixAt(i, dummy.matrix);
        }
      }
      meshRef.current.instanceMatrix.needsUpdate = true;
      meshRef.current.rotation.y = time * 0.1;
      meshRef.current.rotation.x = 0.2;
    }
  });

  return (
    <instancedMesh ref={meshRef} args={[null, null, count]}>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={0.8} roughness={0.1} metalness={0.9} />
    </instancedMesh>
  );
}

function SpiralWaveMode({ analyser, isPlaying }) {
  const count = 200;
  const meshRef = useRef();
  const dataRef = useRef(new Uint8Array(256));
  const { accent } = useMemo(() => readColors(), []);
  const dummy = useMemo(() => new THREE.Object3D(), []);

  useFrame((state) => {
    if (analyser && isPlaying) {
      analyser.getByteFrequencyData(dataRef.current);
    }
    
    if (meshRef.current) {
      const time = state.clock.elapsedTime;
      for (let i = 0; i < count; i++) {
        const dataIndex = Math.floor((i / count) * 128); 
        const value = dataRef.current[dataIndex] || 5;
        const scaleX = Math.max(0.1, Math.pow(value / 255, 2) * 10);
        
        const angle = i * 0.15 + time * 0.5;
        const radius = i * 0.05;
        const y = i * 0.08 - 8;
        
        dummy.position.set(Math.cos(angle) * radius, y, Math.sin(angle) * radius);
        dummy.rotation.set(0, -angle, 0);
        dummy.scale.set(scaleX, 0.2, 0.2);
        dummy.updateMatrix();
        
        meshRef.current.setMatrixAt(i, dummy.matrix);
      }
      meshRef.current.instanceMatrix.needsUpdate = true;
      meshRef.current.rotation.y = time * 0.2;
    }
  });

  return (
    <instancedMesh ref={meshRef} args={[null, null, count]}>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={2} roughness={0.2} metalness={0.8} />
    </instancedMesh>
  );
}

function GridBarsMode({ analyser, isPlaying }) {
  const count = 64;
  const meshRef = useRef();
  const dataRef = useRef(new Uint8Array(256));
  const dummy = useMemo(() => new THREE.Object3D(), []);

  useFrame(() => {
    if (analyser && isPlaying) {
      analyser.getByteFrequencyData(dataRef.current);
    }
    
    if (meshRef.current) {
      for (let i = 0; i < count; i++) {
        const dataIndex = i < count / 2 ? i : count - 1 - i;
        const mappedIndex = Math.floor((dataIndex / (count / 2)) * 60);
        const value = dataRef.current[mappedIndex] || 2;
        
        const scaleY = Math.max(0.1, Math.pow(value / 255, 2) * 8);
        const x = (i - count / 2) * 0.6;
        
        dummy.position.set(x, scaleY / 2, 0);
        dummy.scale.set(0.5, scaleY, 0.5);
        dummy.updateMatrix();
        
        meshRef.current.setMatrixAt(i, dummy.matrix);
      }
      meshRef.current.instanceMatrix.needsUpdate = true;
    }
  });

  return (
    <group position={[0, -2, 0]}>
      <gridHelper args={[40, 40, '#444444', '#222222']} />
      <instancedMesh ref={meshRef} args={[null, null, count]}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color="#ffffff" emissive="#ffffff" emissiveIntensity={0.5} roughness={0.1} metalness={0.5} />
      </instancedMesh>
    </group>
  );
}

function createBouncePositions(cubeCount) {
  return Array.from({ length: cubeCount }, () => ({
    x: (Math.random() - 0.5) * 20,
    z: (Math.random() - 0.5) * 20,
    speed: Math.random() * 2 + 1,
  }));
}

function BouncingCubesMode({ analyser, isPlaying }) {
  const count = 100;
  const meshRef = useRef();
  const dataRef = useRef(new Uint8Array(256));
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const positionsRef = useRef(null);
  if (!positionsRef.current) {
    positionsRef.current = createBouncePositions(count);
  }
  const positions = positionsRef.current;

  useFrame((state) => {
    let bass = 0;
    if (analyser && isPlaying) {
      analyser.getByteFrequencyData(dataRef.current);
      bass = dataRef.current.slice(0, 5).reduce((a, b) => a + b, 0) / (5 * 255);
    }
    
    if (meshRef.current) {
      const time = state.clock.elapsedTime;
      for (let i = 0; i < count; i++) {
        const p = positions[i];
        const jump = Math.max(0, Math.sin(time * p.speed * 4) * bass * 10);
        
        dummy.position.set(p.x, jump + 0.5, p.z);
        dummy.rotation.set(
          jump > 0.1 ? time * p.speed : 0,
          jump > 0.1 ? time * p.speed * 1.5 : 0,
          0
        );
        dummy.scale.setScalar(jump > 0.1 ? 1 : 0.8);
        dummy.updateMatrix();
        meshRef.current.setMatrixAt(i, dummy.matrix);
      }
      meshRef.current.instanceMatrix.needsUpdate = true;
    }
  });

  return (
    <group position={[0, -2, 0]}>
      <gridHelper args={[40, 40, '#444444', '#222222']} />
      <instancedMesh ref={meshRef} args={[null, null, count]}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color="#ffffff" emissive="#ffffff" emissiveIntensity={0.5} roughness={0.1} metalness={0.5} />
      </instancedMesh>
    </group>
  );
}

function Scene({ audioRef, isPlaying, mode, ...props }) {
  const [analyser, setAnalyser] = useState(null);

  useEffect(() => {
    if (audioRef?.current && isPlaying) {
      initAudioEngine(audioRef);
      setAnalyser(getAudioAnalyser(audioRef));
    }
  }, [audioRef, isPlaying]);

  return (
    <>
      <ambientLight intensity={0.2} />
      <directionalLight position={[5, 5, 5]} intensity={1} />
      <spotLight position={[-5, 5, -5]} angle={0.4} penumbra={1} intensity={3} color="#ffffff" />
      
      {mode === 'bars' && <BarsMode analyser={analyser} isPlaying={isPlaying} {...props} />}
      {mode === 'orb' && <OrbMode analyser={analyser} isPlaying={isPlaying} {...props} />}
      {mode === 'particles' && <ParticlesMode analyser={analyser} isPlaying={isPlaying} {...props} />}
      {mode === 'landscape' && <LandscapeMode analyser={analyser} isPlaying={isPlaying} {...props} />}
      {mode === 'gridbars' && <GridBarsMode analyser={analyser} isPlaying={isPlaying} {...props} />}
      {mode === 'spiral' && <SpiralWaveMode analyser={analyser} isPlaying={isPlaying} {...props} />}
      {mode === 'bouncing' && <BouncingCubesMode analyser={analyser} isPlaying={isPlaying} {...props} />}
    </>
  );
}

export { MODES };

export default function PartyVisualizer({ audioRef, isPlaying, mode = 'bars', ...props }) {
  return (
    <div className="party-viz__canvas-wrap" style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 1 }}>
      <Canvas camera={{ position: [0, 0, 8], fov: 60 }} gl={{ alpha: true }}>
        <Scene audioRef={audioRef} isPlaying={isPlaying} mode={mode} {...props} />
      </Canvas>
    </div>
  );
}
