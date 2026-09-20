import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls";
import { NETWORKS, REGION_NETWORK_MAP } from "../constants/networks";

const INACTIVE_COLOR = new THREE.Color("#4a5068");
const LLM_GHOST_COLOR = new THREE.Color("#1e2a3a");

const NUM_LAYERS = 32;
const LAYER_NETWORK = [
  "motor",
  "motor",
  "motor",
  "visual",
  "visual",
  "visual",
  "language",
  "language",
  "language",
  "language",
  "language",
  "language",
  "language",
  "language",
  "attention",
  "attention",
  "attention",
  "attention",
  "dmn",
  "dmn",
  "dmn",
  "dmn",
  "attention",
  "attention",
  "attention",
  "attention",
  "language",
  "language",
  "dmn",
  "dmn",
  "dmn",
  "dmn",
];

function networkColor(networkKey) {
  const net = NETWORKS[networkKey];
  return net ? new THREE.Color(net.color) : new THREE.Color("#ffffff");
}

function createTextSprite(text) {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 44px Inter, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text.split("").join("  "), 256, 64);
  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  const material = new THREE.SpriteMaterial({
    map: texture,
    color: 0xffffff,
    transparent: true,
    opacity: 1,
    depthTest: false,
    sizeAttenuation: true,
  });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(120, 30, 1);
  return sprite;
}

async function fetchWithProgress(url, onChunk, responseType = 'json') {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to load ${url}: ${response.statusText}`);
  
  const contentLength = response.headers.get('content-length');
  const total = contentLength ? parseInt(contentLength, 10) : 0;
  
  if (!response.body) {
    if (responseType === 'json') return response.json();
    return response.arrayBuffer();
  }

  const reader = response.body.getReader();
  let received = 0;
  const chunks = [];

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.length;
    if (onChunk) onChunk(value.length, received, total);
  }

  const allChunks = new Uint8Array(received);
  let pos = 0;
  for (const chunk of chunks) {
    allChunks.set(chunk, pos);
    pos += chunk.length;
  }

  if (responseType === 'json') {
    const text = new TextDecoder('utf-8').decode(allChunks);
    return JSON.parse(text);
  } else {
    return allChunks.buffer;
  }
}

export default function Workspace3D({
  currentTurn,
  tokenIndex,
  onResetCamera,
}) {
  const mountRef = useRef(null);
  const sceneRef = useRef({});
  const rendererRef = useRef(null); // dedicated ref — always fresh

  const isHumanTurn = currentTurn?.speaker === "human";
  const isLlmTurn = currentTurn?.speaker === "llm";
  const humanData = isHumanTurn ? currentTurn?.human : null;
  const llmData = isLlmTurn ? currentTurn?.llm : null;

  const [modelsLoaded, setModelsLoaded] = useState(false);
  const [loadProgress, setLoadProgress] = useState(0);
  const [loadStage, setLoadStage] = useState('Downloading 3D cortical mesh & voxel atlas...');
  const [downloadedBytes, setDownloadedBytes] = useState(0);
  const [selectedRegion, setSelectedRegion] = useState(null);

  // Dedicated ref so the Three.js handler can always call the latest setter
  // without being affected by sceneRef.current being replaced on init.
  const setRegionRef = useRef(setSelectedRegion);
  useEffect(() => { setRegionRef.current = setSelectedRegion; });

  // ── Init Three.js scene (once) ───────────────────────────────────────────────
  useEffect(() => {
    const mount = mountRef.current;
    const w = mount.clientWidth;
    const h = mount.clientHeight;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(w, h);
    renderer.setPixelRatio(window.devicePixelRatio);
    mount.appendChild(renderer.domElement);
    rendererRef.current = renderer; // store for useEffect access

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 1500);
    camera.position.set(0, 0, 320);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.target.set(0, 0, 0);

    scene.add(new THREE.AmbientLight("#ffffff", 0.5));
    const dirLight = new THREE.DirectionalLight("#ffffff", 0.8);
    dirLight.position.set(100, 100, 100);
    scene.add(dirLight);

    sceneRef.current = {
      scene,
      camera,
      controls,
      brainMesh: null,
      vertexRegions: null,
      regionMap: null,
      llmLayers: [],
    };

    // ── Human Brain ────────────────────────────────────────────────────────────
    const brainGroup = new THREE.Group();
    brainGroup.position.set(-70, 0, 0);
    brainGroup.scale.set(0.75, 0.75, 0.75);
    scene.add(brainGroup);
    sceneRef.current.brainGroup = brainGroup;

    const humanSprite = createTextSprite("HUMAN");
    humanSprite.position.set(0, -110, 0);
    brainGroup.add(humanSprite);
    sceneRef.current.humanSprite = humanSprite;
    sceneRef.current.targetHumanColor = new THREE.Color("#3a5a7a");

    const loadedSizes = { brain: 0, regionMap: 0, volume: 0, normals: 0 };
    const TOTAL_EXPECTED = 60 * 1024 * 1024; // ~60MB estimated total

    const updateOverallProgress = (filename) => {
      const totalDownloaded = loadedSizes.brain + loadedSizes.regionMap + loadedSizes.volume + loadedSizes.normals;
      setDownloadedBytes(totalDownloaded);
      const pct = Math.min(98, Math.max(1, Math.round((totalDownloaded / TOTAL_EXPECTED) * 100)));
      setLoadProgress(pct);
      setLoadStage(`Downloading neural data (${(totalDownloaded / (1024 * 1024)).toFixed(1)} MB / ~60 MB)...`);
    };

    Promise.all([
      fetchWithProgress("/brain.json", (delta) => {
        loadedSizes.brain += delta;
        updateOverallProgress("brain.json");
      }, 'json'),
      fetchWithProgress("/regionMap.json", (delta) => {
        loadedSizes.regionMap += delta;
        updateOverallProgress("regionMap.json");
      }, 'json'),
      fetchWithProgress('/atlas_volume.bin?v=' + Date.now(), (delta) => {
        loadedSizes.volume += delta;
        updateOverallProgress("atlas_volume.bin");
      }, 'buffer'),
      fetchWithProgress('/atlas_normals.bin?v=' + Date.now(), (delta) => {
        loadedSizes.normals += delta;
        updateOverallProgress("atlas_normals.bin");
      }, 'buffer'),
    ]).then(([brainData, regionMap, volBuffer, normalsBuffer]) => {
      setLoadStage("Building 3D MRI raymarching volume & shaders...");
      setLoadProgress(99);

      const { vertices } = brainData;

      // ── Voxelization for MRI Raymarching ──────────────────────────────────
      const regionNameToKey = {};
      Object.keys(regionMap).forEach((k) => {
        const name = regionMap[k]?.name;
        if (name) regionNameToKey[name] = k;
      });

      const regionVertsTemp = {};
      vertices.forEach((v) => {
        if (!regionVertsTemp[v.region]) regionVertsTemp[v.region] = [];
        regionVertsTemp[v.region].push(v);
      });
      const regionCentroids = {};
      Object.keys(regionVertsTemp).forEach((k) => {
        const vlist = regionVertsTemp[k];
        regionCentroids[k] = {
          x: vlist.reduce((s, v) => s + v.x, 0) / vlist.length,
          y: vlist.reduce((s, v) => s + v.y, 0) / vlist.length,
          z: vlist.reduce((s, v) => s + v.z, 0) / vlist.length,
        };
      });

      let minX = 999, maxX = -999, minY = 999, maxY = -999, minZ = 999, maxZ = -999;
      vertices.forEach(v => {
         minX = Math.min(minX, v.x); maxX = Math.max(maxX, v.x);
         minY = Math.min(minY, v.y); maxY = Math.max(maxY, v.y);
         minZ = Math.min(minZ, v.z); maxZ = Math.max(maxZ, v.z);
      });
      // Pad bounds
      minX -= 5; maxX += 5; minY -= 5; maxY += 5; minZ -= 5; maxZ += 5;
      const sizeX = maxX - minX;
      const sizeY = maxY - minY;
      const sizeZ = maxZ - minZ;
      const maxDim = Math.max(sizeX, sizeY, sizeZ);
      const SIZE = 128;

      // Allocate and assign 3D Volume Texture
      const volData = new Uint8Array(volBuffer);
      const volumeTex = new THREE.Data3DTexture(volData, SIZE, SIZE, SIZE);
      volumeTex.format = THREE.RGBAFormat;
      volumeTex.type = THREE.UnsignedByteType;
      volumeTex.minFilter = volumeTex.magFilter = THREE.NearestFilter;
      volumeTex.unpackAlignment = 1;
      volumeTex.needsUpdate = true;
      sceneRef.current.volData = volData;

      // Allocate and assign normal map 3D Texture
      const normalsData = new Uint8Array(normalsBuffer);
      const normalsTex = new THREE.Data3DTexture(normalsData, SIZE, SIZE, SIZE);
      normalsTex.format = THREE.RGBAFormat;
      normalsTex.type = THREE.UnsignedByteType;
      normalsTex.minFilter = normalsTex.magFilter = THREE.NearestFilter;
      normalsTex.unpackAlignment = 1;
      normalsTex.needsUpdate = true;

      // 1D palette texture for dynamic coloring per region (max 255 regions)
      const paletteData = new Uint8Array(256 * 4); // RGBA
      const paletteTex = new THREE.DataTexture(paletteData, 256, 1, THREE.RGBAFormat, THREE.UnsignedByteType);
      paletteTex.minFilter = paletteTex.magFilter = THREE.NearestFilter;
      paletteTex.unpackAlignment = 1;
      paletteTex.needsUpdate = true;
      sceneRef.current.paletteData = paletteData;
      sceneRef.current.paletteTex  = paletteTex;

      // ─ Shader Material for Raymarching ─
      const boxGeo = new THREE.BoxGeometry(1, 1, 1);
      
      const vertexShader = `
          out vec3 vOrigin;
          out vec3 vDirection;
          
          void main() {
            vec4 worldPosition = modelMatrix * vec4(position, 1.0);
            vOrigin = vec3(inverse(modelMatrix) * vec4(cameraPosition, 1.0));
            vDirection = position - vOrigin;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `;

      const fragmentShader = `
          precision highp float;
          precision highp sampler3D;
          uniform sampler3D map;       // RGBA 3D Atlas
          uniform sampler3D normalMap; // 3D Prebaked Surface Normals
          uniform sampler2D palette;   // 1D Color/Activation lookup
          in vec3 vOrigin;
          in vec3 vDirection;
          out vec4 color;
          
          vec2 hitBox( vec3 orig, vec3 dir ) {
            // Box is in local standard unit space
            vec3 box_min = vec3( -0.5 );
            vec3 box_max = vec3( 0.5 );
            vec3 inv_dir = 1.0 / dir;
            vec3 tmin_tmp = ( box_min - orig ) * inv_dir;
            vec3 tmax_tmp = ( box_max - orig ) * inv_dir;
            vec3 tmin = min( tmin_tmp, tmax_tmp );
            vec3 tmax = max( tmin_tmp, tmax_tmp );
            float t0 = max( tmin.x, max( tmin.y, tmin.z ) );
            float t1 = min( tmax.x, min( tmax.y, tmax.z ) );
            return vec2( t0, t1 );
          }
          
          void main(){
            vec3 rayDir = normalize(vDirection);
            vec2 bounds = hitBox(vOrigin, rayDir);
            if (bounds.x > bounds.y) discard;
            bounds.x = max(bounds.x, 0.0);
            
            vec3 p = vOrigin + bounds.x * rayDir;
            vec3 inc = 1.0 / abs(rayDir);
            float delta = min(inc.x, min(inc.y, inc.z)) / 128.0;
            vec3 dirStep = rayDir * delta;
            
            vec4 result = vec4(0.0);
            // March
            for (int i = 0; i < 200; i++) {
              p += dirStep;
              // Map local P (-0.5 -> 0.5) to texture space (0.0 -> 1.0)
              vec3 tpos = p + vec3(0.5);
              
              if (tpos.x < 0.0 || tpos.y < 0.0 || tpos.z < 0.0 || 
                  tpos.x > 1.0 || tpos.y > 1.0 || tpos.z > 1.0) break;
                  
              vec4 voxel = texture(map, tpos);
              // In UnsignedByteType data textures, the shader gets values from 0.0 to 1.0 automatically 
              // UNLESS they are read raw. Since we packed 0-255 into uint8, WebGL gives us floats 0.0-1.0
              // rId is voxel.r * 255.0 to get back the index. Using floor(val + 0.5) to fix float precision bugs.
              float rId = floor(voxel.r * 255.0 + 0.5);      
              // gRank must also remain 0.0 to 1.0 natively. We don't reconstruct an int for it.
              float gRank = voxel.g;            
              
              if (rId > 0.0) {
                 vec4 pColor = texture(palette, vec2((rId + 0.5)/256.0, 0.5));
                 float activ = clamp(pColor.a, 0.0, 1.0);
                 
                 if (activ > 0.05 && activ >= gRank) {
                    float leadEdge = 1.0 - smoothstep(max(0.0, activ - 0.2), activ, gRank);
                    float finalActiv = activ * leadEdge;
                    
                    if (finalActiv > 0.01) {
                        // Sample prebaked Volumetric Normal (-1.0 to 1.0 range)
                        vec3 voxelNormal = texture(normalMap, tpos).rgb * 2.0 - 1.0;
                        voxelNormal = normalize(voxelNormal);
                        
                        // Fake directional light (Top-Left-Front relative to camera space)
                        vec3 lightDir = normalize(vec3(-1.0, 1.0, 1.0));
                        
                        // Lambertian diffuse
                        float diffuse = max(dot(voxelNormal, lightDir), 0.0);
                        
                        // Mix ambient and dynamic diffuse lighting
                        float lighting = 0.4 + (0.6 * diffuse);
                        
                        result.rgb += (pColor.rgb * lighting) * finalActiv * 0.16;
                        result.a += finalActiv * 0.16;
                    }
                 }
              }
              if (result.a >= 1.0) {
                 result.a = 1.0;
                 break;
              }
            }
            if (result.a == 0.0) discard;
            color = result;
          }
        `; // End fragmentShader

      const brainMat = new THREE.ShaderMaterial({
        glslVersion: THREE.GLSL3,
        transparent: true,
        depthWrite: false,
        side: THREE.BackSide,
        uniforms: {
          map: { value: volumeTex },
          palette: { value: paletteTex },
          normalMap: { value: normalsTex },
        },
        vertexShader: vertexShader,
        fragmentShader: fragmentShader
      });

      // ── GPU Picking Shader ─────────────────────────────────────────────────────
      // Renders region ID as encoded color into an offscreen buffer.
      // On click we read the single pixel under the mouse — R channel = region ID.
      // This is the only reliable approach for BackSide raymarching volumes.
      const pickingFragmentShader = `
          precision highp float;
          precision highp sampler3D;
          uniform sampler3D map;
          in vec3 vOrigin;
          in vec3 vDirection;
          out vec4 color;

          vec2 hitBox( vec3 orig, vec3 dir ) {
            vec3 box_min = vec3( -0.5 );
            vec3 box_max = vec3( 0.5 );
            vec3 inv_dir = 1.0 / dir;
            vec3 tmin_tmp = ( box_min - orig ) * inv_dir;
            vec3 tmax_tmp = ( box_max - orig ) * inv_dir;
            vec3 tmin = min( tmin_tmp, tmax_tmp );
            vec3 tmax = max( tmin_tmp, tmax_tmp );
            float t0 = max( tmin.x, max( tmin.y, tmin.z ) );
            float t1 = min( tmax.x, min( tmax.y, tmax.z ) );
            return vec2( t0, t1 );
          }

          void main(){
            vec3 rayDir = normalize(vDirection);
            vec2 bounds = hitBox(vOrigin, rayDir);
            if (bounds.x > bounds.y) discard;
            bounds.x = max(bounds.x, 0.0);
            vec3 p = vOrigin + bounds.x * rayDir;
            vec3 inc = 1.0 / abs(rayDir);
            float delta = min(inc.x, min(inc.y, inc.z)) / 128.0;
            vec3 dirStep = rayDir * delta;
            for (int i = 0; i < 400; i++) {
              p += dirStep;
              vec3 tpos = p + vec3(0.5);
              if (tpos.x < 0.0 || tpos.y < 0.0 || tpos.z < 0.0 ||
                  tpos.x > 1.0 || tpos.y > 1.0 || tpos.z > 1.0) break;
              float rId = floor(texture(map, tpos).r * 255.0 + 0.5);
              if (rId > 0.0) {
                // Encode rId in both R and G — robust to RGBA/BGRA driver swaps.
                // A=1.0 is our sentinel meaning "voxel was hit".
                color = vec4(rId / 255.0, rId / 255.0, 0.0, 1.0);
                return;
              }
            }
            // Nothing hit — transparent black
            color = vec4(0.0);
          }
        `;

      const pickingMat = new THREE.ShaderMaterial({
        glslVersion: THREE.GLSL3,
        side: THREE.BackSide,
        uniforms: {
          map: { value: volumeTex },
        },
        vertexShader: vertexShader,
        fragmentShader: pickingFragmentShader,
      });

      const pickTarget = new THREE.WebGLRenderTarget(1, 1);
      sceneRef.current.pickingMat = pickingMat;
      sceneRef.current.pickTarget  = pickTarget;

      const brainMesh = new THREE.Mesh(boxGeo, brainMat);
      // Scale to dimensions of voxel grid, position at center
      brainMesh.scale.set(maxDim, maxDim, maxDim);
      brainMesh.position.set(minX + maxDim/2, minY + maxDim/2, minZ + maxDim/2);
      brainGroup.add(brainMesh);
      sceneRef.current.brainMesh = brainMesh;

      console.log(`[Raymarch Debug] brainMesh at: ${brainMesh.position.x.toFixed(1)}, ${brainMesh.position.y.toFixed(1)}, ${brainMesh.position.z.toFixed(1)} scale: ${brainMesh.scale.x.toFixed(1)}`);

      // ─ Detailed Outlines (Faint shell) ─
      // Hologram wireframe of the outer boundaries
      const meshGeo = new THREE.BufferGeometry();
      const meshPos = new Float32Array(vertices.length * 3);
      vertices.forEach((v, i) => {
        meshPos[i * 3] = v.x; meshPos[i * 3 + 1] = v.y; meshPos[i * 3 + 2] = v.z;
      });
      meshGeo.setAttribute("position", new THREE.BufferAttribute(meshPos, 3));
      meshGeo.setIndex(new THREE.BufferAttribute(new Uint32Array(brainData.faces.flat()), 1));
      const wireframeGeo = new THREE.WireframeGeometry(meshGeo);
      const wireframe = new THREE.LineSegments(wireframeGeo, new THREE.LineBasicMaterial({
        color: 0x3a5a7a, transparent: true, opacity: 0.04, depthWrite: false
      }));
      brainGroup.add(wireframe);

      sceneRef.current.regionMap = regionMap;
      sceneRef.current.regionNameToKey = regionNameToKey;
      console.log('[Brain] Loaded. Rayserizer done. Regions in map:', Object.keys(regionMap).length);
      setLoadProgress(100);
      setLoadStage("Ready");
      setTimeout(() => {
        setModelsLoaded(true);
      }, 350);
    });

    // ── LLM Stack ─────────────────────────────────────────────────────────────
    const llmGroup = new THREE.Group();
    llmGroup.position.set(90, -45, 0);
    scene.add(llmGroup);
    sceneRef.current.llmGroup = llmGroup;

    const llmSprite = createTextSprite("LLM");
    llmSprite.position.set(0, -20, 0);
    llmGroup.add(llmSprite);
    sceneRef.current.llmSprite = llmSprite;
    sceneRef.current.targetLlmColor = new THREE.Color("#3a5a7a");

    const llmLayers = [];
    const DISC_H = 1.6;
    const DISC_R = 35;
    const GAP = 1.2;

    for (let i = 0; i < NUM_LAYERS; i++) {
      const geo = new THREE.CylinderGeometry(
        DISC_R,
        DISC_R,
        DISC_H,
        32,
        1,
        false,
        0,
        Math.PI * 2,
      );
      const ghostMat = new THREE.MeshPhongMaterial({
        color: LLM_GHOST_COLOR,
        transparent: true,
        opacity: 0.2,
        shininess: 30,
        wireframe: true,
      });
      const ghostMesh = new THREE.Mesh(geo, ghostMat);
      ghostMesh.position.y = i * (DISC_H + GAP);

      const fillGeo = new THREE.CylinderGeometry(
        DISC_R * 0.98,
        DISC_R * 0.98,
        DISC_H * 0.98,
        32,
      );
      const fillMat = new THREE.MeshPhongMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0,
        shininess: 50,
      });
      const fillMesh = new THREE.Mesh(fillGeo, fillMat);
      fillMesh.position.y = i * (DISC_H + GAP);
      fillMesh.scale.set(0.001, 1, 0.001);
      fillMesh.userData = {
        targetScale: 0.001,
        targetOpacity: 0,
        targetColor: new THREE.Color(0xffffff),
      };

      llmGroup.add(ghostMesh);
      llmGroup.add(fillMesh);
      llmLayers.push({ ghost: ghostMesh, fill: fillMesh, layerIdx: i });
    }
    sceneRef.current.llmLayers = llmLayers;

    // ── Animate ───────────────────────────────────────────────────────────────
    let rafId;
    const animate = () => {
      rafId = requestAnimationFrame(animate);
      controls.update();

      if (sceneRef.current.humanSprite && sceneRef.current.targetHumanColor)
        sceneRef.current.humanSprite.material.color.lerp(
          sceneRef.current.targetHumanColor,
          0.1,
        );
      if (sceneRef.current.llmSprite && sceneRef.current.targetLlmColor)
        sceneRef.current.llmSprite.material.color.lerp(
          sceneRef.current.targetLlmColor,
          0.1,
        );

      if (sceneRef.current.llmLayers) {
        sceneRef.current.llmLayers.forEach(({ fill }) => {
          if (fill.userData.targetScale !== undefined) {
            const s = fill.userData.targetScale < 0.01 ? 0.3 : 0.12;
            fill.scale.x += (fill.userData.targetScale - fill.scale.x) * s;
            fill.scale.z += (fill.userData.targetScale - fill.scale.z) * s;
            fill.material.opacity +=
              (fill.userData.targetOpacity - fill.material.opacity) * s;
            fill.material.color.lerp(fill.userData.targetColor, s);
            fill.visible = fill.material.opacity > 0.005;
          }
        });
      }

      renderer.render(scene, camera);
    };
    animate();

    sceneRef.current.resetCamera = () => {
      camera.position.set(0, 0, 320);
      controls.target.set(0, 0, 0);
    };



    // ── Click vs drag detection ────────────────────────────────────────────────
    // Run the GPU pick only when the pointer barely moved — i.e. a deliberate
    // "tap" rather than an orbit drag. 5px threshold feels right in practice.
    const PICK_THRESHOLD_PX = 5;
    let pointerDownAt = null;

    const onPointerDown = (event) => {
      if (event.button !== 0) return;
      pointerDownAt = { x: event.clientX, y: event.clientY };
    };

    const onPointerUp = (event) => {
      if (event.button !== 0 || !pointerDownAt) return;
      const dx = event.clientX - pointerDownAt.x;
      const dy = event.clientY - pointerDownAt.y;
      pointerDownAt = null;
      if (Math.sqrt(dx * dx + dy * dy) > PICK_THRESHOLD_PX) return; // was a drag

      const { brainMesh, pickingMat, pickTarget, regionNameToKey } = sceneRef.current;
      if (!brainMesh || !pickingMat || !pickTarget) return;

      const rect = renderer.domElement.getBoundingClientRect();
      const px = Math.round(event.clientX - rect.left);
      const py = Math.round(event.clientY - rect.top);

      // ── GPU Picking pass ──────────────────────────────────────────────────────
      const tmpMesh = new THREE.Mesh(brainMesh.geometry, pickingMat);
      tmpMesh.matrixAutoUpdate = false;
      brainMesh.updateWorldMatrix(true, false);
      tmpMesh.matrix.copy(brainMesh.matrixWorld);
      tmpMesh.matrixWorld.copy(brainMesh.matrixWorld);
      const tmpScene = new THREE.Scene();
      tmpScene.add(tmpMesh);

      const pixel = new Uint8Array(4);
      try {
        renderer.setRenderTarget(pickTarget);
        camera.setViewOffset(rect.width, rect.height, px, py, 1, 1);
        renderer.render(tmpScene, camera);
        renderer.readRenderTargetPixels(pickTarget, 0, 0, 1, 1, pixel);
      } finally {
        // Always restore — a stale setViewOffset causes the whole scene
        // to render into a 1×1 viewport and appear completely blank.
        camera.clearViewOffset();
        camera.updateProjectionMatrix();
        renderer.setRenderTarget(null);
      }


      if (pixel[3] === 255 && (pixel[0] > 0 || pixel[1] > 0)) {
        const rId = pixel[0] > 0 ? pixel[0] : pixel[1];
        let foundName = 'Unknown';
        if (regionNameToKey) {
          for (const [name, key] of Object.entries(regionNameToKey)) {
            if (parseInt(key) === rId) { foundName = name; break; }
          }
        }

        // Derive hemisphere and clean name
        let cleanName = foundName;
        let hemisphere = null;
        if (cleanName.startsWith('L_')) { hemisphere = 'Left';  cleanName = cleanName.slice(2); }
        else if (cleanName.startsWith('R_')) { hemisphere = 'Right'; cleanName = cleanName.slice(2); }

        // Network membership
        const networkKey = REGION_NETWORK_MAP[cleanName];
        const network    = networkKey ? NETWORKS[networkKey] : null;

        // Live activation from the palette (A channel written each token)
        const paletteData  = sceneRef.current.paletteData;
        const activationRaw = paletteData ? paletteData[rId * 4 + 3] : 0;
        const activation    = activationRaw / 255;

        const displayName = cleanName.replace(/_/g, ' ');

        console.log(
          `%c[Brain] Tapped → ${displayName}${hemisphere ? ' (' + hemisphere[0] + ')' : ''} | ${network?.label ?? 'Unmapped'} | act=${(activation * 100).toFixed(0)}%`,
          'color: #00ff00; font-weight: bold; font-size: 13px; background: #111; padding: 2px 8px; border-radius: 4px;'
        );

        setRegionRef.current({
          rId,
          displayName,
          rawName: foundName,
          hemisphere,
          networkKey,
          networkLabel: network?.label ?? null,
          networkColor: network?.color ?? '#8a9ab0',
          activation,
        });
      }
    };

    renderer.domElement.addEventListener('pointerdown', onPointerDown);
    renderer.domElement.addEventListener('pointerup', onPointerUp);

    const onResize = () => {
      camera.aspect = mount.clientWidth / mount.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(mount.clientWidth, mount.clientHeight);
    };
    window.addEventListener("resize", onResize);

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener("resize", onResize);
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      renderer.domElement.removeEventListener('pointerup', onPointerUp);
      renderer.dispose();
      if (mount.contains(renderer.domElement))
        mount.removeChild(renderer.domElement);
    };
  }, []);

  // ── Update activations per token ─────────────────────────────────────────────
  useEffect(() => {
    const { llmLayers } = sceneRef.current;
    const renderer = rendererRef.current;
    const { scene, camera } = sceneRef.current;

    sceneRef.current.targetHumanColor = humanData
      ? new THREE.Color("#7ac0f0")
      : new THREE.Color("#3a5a7a");
    sceneRef.current.targetLlmColor = llmData
      ? new THREE.Color("#7ac0f0")
      : new THREE.Color("#3a5a7a");

    // Raymarching Palette Update
    if (sceneRef.current.paletteData && sceneRef.current.paletteTex) {
      const paletteData = sceneRef.current.paletteData;
      const paletteTex  = sceneRef.current.paletteTex;
      const regionNameToKey = sceneRef.current.regionNameToKey || {};

      let activationByName = null;
      if (humanData?.tokenActivations && humanData.tokenActivations.length > tokenIndex) {
        activationByName = humanData.tokenActivations[tokenIndex];
      }
      if (!activationByName || Object.keys(activationByName).length === 0) {
        activationByName = humanData?.regionActivations || {};
      }

      const totalIncoming = Object.keys(activationByName).length;
      let activeCount     = 0;

      // Force a new buffer allocation to prevent WebGL caching the same memory pointer
      // and silently dropping hot-reloaded or rapid continuous updates.
      const newData = new Uint8Array(256 * 4);

      if (humanData) {
        let maxAct = 0;
        let activeRegionsCount = 0;
        const sampleLogs = [];
        let sampleCount = 0;
        
        Object.entries(activationByName).forEach(([name, activation]) => {
          if (activation <= 0.05) return;
          
          let cleanName = name;
          if (cleanName.startsWith('L_') || cleanName.startsWith('R_')) {
              cleanName = cleanName.substring(2);
          }
          const networkKey = REGION_NETWORK_MAP[cleanName];
          if (!networkKey) return;
          
          const regionIdxStr = regionNameToKey[name];
          if (!regionIdxStr) return;
          
          const rId = parseInt(regionIdxStr) || 0;
          if (rId === 0) return;
          
          activeCount++;
          activeRegionsCount++;
          if (activation > maxAct) maxAct = activation;
          
          const netCol = networkColor(networkKey);
          
          const idx = rId * 4;
          newData[idx + 0] = Math.round(netCol.r * 255);
          newData[idx + 1] = Math.round(netCol.g * 255);
          newData[idx + 2] = Math.round(netCol.b * 255);
          const actByte = Math.round(activation * 255);
          newData[idx + 3] = actByte;
          
          if (activation > 0.1 && sampleCount < 3) {
             sampleLogs.push(`${name}(ID:${rId})=byte[${actByte}]`);
             sampleCount++;
          }
        });

        // Re-bind the freshly written buffer specifically to break detached memory reference bugs
        sceneRef.current.paletteTex.image.data.set(newData);
        sceneRef.current.paletteTex.needsUpdate = true;
        
        // --- EXTERNAL DEBUG TALLY ---
        console.log(`[Diagnostic] Token: ${tokenIndex} | Active Regions (>0.05): ${activeRegionsCount} | Peak Activation: ${maxAct.toFixed(3)} | VRAM Samples: ${sampleLogs.join(', ')}`);
      }

      console.log(
        `[Brain] token=${tokenIndex} | incoming=${totalIncoming}`,
        `| PAINTED=${activeCount}`,
        `| Raymarching=TRUE`
      );

      paletteTex.needsUpdate = true;
      renderer.render(scene, camera);
    }

    // LLM layer targets
    if (llmLayers?.length > 0) {
      const layerData =
        llmData?.layerActivations?.[tokenIndex] ?? Array(NUM_LAYERS).fill(0);
      llmLayers.forEach(({ fill, layerIdx }) => {
        const act = llmData ? (layerData[layerIdx] ?? 0) : 0;
        const netKey = LAYER_NETWORK[layerIdx];
        const netHex = NETWORKS[netKey]?.color ?? "#334455";
        fill.userData.targetScale = Math.max(act, 0.001);
        fill.userData.targetOpacity = act > 0.01 ? 0.4 + act * 0.6 : 0;
        fill.userData.targetColor = new THREE.Color(netHex);
      });
    }
  }, [currentTurn, tokenIndex, humanData, llmData, modelsLoaded]);

  useEffect(() => {
    if (onResetCamera) sceneRef.current?.resetCamera?.();
  }, [onResetCamera]);

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>

      {/* ── Region Info Card ─────────────────────────────────────────────── */}
      {selectedRegion && (
        <div style={{
          position: "absolute",
          top: "16px",
          left: "16px",
          zIndex: 20,
          width: "220px",
          background: "rgba(12, 16, 28, 0.82)",
          backdropFilter: "blur(12px)",
          WebkitBackdropFilter: "blur(12px)",
          border: `1px solid ${selectedRegion.networkColor}44`,
          borderRadius: "12px",
          padding: "14px 16px 16px",
          fontFamily: "Inter, sans-serif",
          color: "#e2e8f0",
          boxShadow: `0 0 24px ${selectedRegion.networkColor}22, 0 4px 20px rgba(0,0,0,0.5)`,
          animation: "fadeSlideIn 0.2s ease",
        }}>
          {/* Header row */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "10px" }}>
            <div style={{ flex: 1, paddingRight: "8px" }}>
              <div style={{ fontSize: "13px", fontWeight: 600, lineHeight: 1.35, color: "#f0f4ff" }}>
                {selectedRegion.displayName}
              </div>
              {selectedRegion.hemisphere && (
                <div style={{
                  display: "inline-block",
                  marginTop: "4px",
                  fontSize: "10px",
                  fontWeight: 600,
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                  color: "#94a3b8",
                  background: "rgba(255,255,255,0.07)",
                  borderRadius: "4px",
                  padding: "1px 6px",
                }}>
                  {selectedRegion.hemisphere}
                </div>
              )}
            </div>
            <button
              onClick={() => setSelectedRegion(null)}
              style={{
                background: "none", border: "none", cursor: "pointer",
                color: "#64748b", fontSize: "16px", lineHeight: 1,
                padding: "0", marginTop: "-2px", flexShrink: 0,
              }}
              title="Dismiss"
            >×</button>
          </div>

          {/* Network row */}
          {selectedRegion.networkLabel && (
            <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "12px" }}>
              <div style={{
                width: "8px", height: "8px", borderRadius: "50%",
                background: selectedRegion.networkColor,
                boxShadow: `0 0 6px ${selectedRegion.networkColor}`,
                flexShrink: 0,
              }} />
              <span style={{ fontSize: "11px", color: "#94a3b8", letterSpacing: "0.03em" }}>
                {selectedRegion.networkLabel} Network
              </span>
            </div>
          )}

          {/* Activation */}
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "5px" }}>
              <span style={{ fontSize: "10px", textTransform: "uppercase", letterSpacing: "0.07em", color: "#64748b" }}>
                Activation
              </span>
              <span style={{ fontSize: "11px", fontWeight: 600, color: selectedRegion.networkColor }}>
                {selectedRegion.activation > 0
                  ? `${(selectedRegion.activation * 100).toFixed(0)}%`
                  : "—"}
              </span>
            </div>
            <div style={{
              height: "4px", borderRadius: "2px",
              background: "rgba(255,255,255,0.08)",
              overflow: "hidden",
            }}>
              <div style={{
                height: "100%",
                width: `${selectedRegion.activation * 100}%`,
                borderRadius: "2px",
                background: `linear-gradient(90deg, ${selectedRegion.networkColor}99, ${selectedRegion.networkColor})`,
                transition: "width 0.4s ease",
              }} />
            </div>
          </div>
        </div>
      )}

      {/* Loading Overlay */}
      <div style={{
        position: "absolute",
        inset: 0,
        background: "radial-gradient(ellipse at center, rgba(14, 22, 38, 0.96) 0%, rgba(6, 8, 16, 0.98) 100%)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 50,
        fontFamily: "'Inter', sans-serif",
        backdropFilter: "blur(8px)",
        transition: "opacity 0.6s ease, visibility 0.6s ease",
        opacity: modelsLoaded ? 0 : 1,
        visibility: modelsLoaded ? "hidden" : "visible",
        pointerEvents: modelsLoaded ? "none" : "auto",
      }}>
        <div style={{
          width: 380,
          maxWidth: "88vw",
          padding: "30px 24px",
          background: "rgba(10, 16, 28, 0.85)",
          border: "1px solid #1a3555",
          borderRadius: "12px",
          boxShadow: "0 0 40px rgba(10, 40, 90, 0.5), inset 0 1px 0 rgba(255,255,255,0.06)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 16,
        }}>
          {/* Animated pulsing spinner */}
          <div style={{
            position: "relative",
            width: 56,
            height: 56,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}>
            <div style={{
              position: "absolute",
              inset: 0,
              borderRadius: "50%",
              border: "2px solid rgba(58, 138, 255, 0.15)",
              borderTopColor: "#3a8aff",
              animation: "spin 1.2s linear infinite",
            }} />
            <span style={{ fontSize: 24, filter: "drop-shadow(0 0 8px rgba(90, 191, 122, 0.4))" }}>🧠</span>
          </div>

          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: 2, color: "#90d4ff", textTransform: "uppercase" }}>
              Loading Neural Atlas
            </div>
            <div style={{ fontSize: 11, color: "#5a7a9a", marginTop: 4, letterSpacing: 0.5 }}>
              {loadStage}
            </div>
          </div>

          {/* Progress Bar Container */}
          <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{
              width: "100%",
              height: 6,
              background: "rgba(255, 255, 255, 0.06)",
              borderRadius: 3,
              overflow: "hidden",
              border: "1px solid rgba(255, 255, 255, 0.05)",
            }}>
              <div style={{
                height: "100%",
                width: `${loadProgress}%`,
                background: "linear-gradient(90deg, #1e6acc, #3a8aff, #7ac0f0)",
                borderRadius: 3,
                boxShadow: "0 0 10px rgba(58, 138, 255, 0.6)",
                transition: "width 0.25s ease-out",
              }} />
            </div>

            <div style={{
              display: "flex",
              justifyContent: "space-between",
              fontSize: 10,
              color: "#4a6a8a",
              letterSpacing: 0.5,
              fontFamily: "monospace",
            }}>
              <span>{(downloadedBytes / (1024 * 1024)).toFixed(1)} MB / ~60.0 MB</span>
              <span style={{ color: "#7ac0f0", fontWeight: 600 }}>{loadProgress}%</span>
            </div>
          </div>
        </div>
      </div>

      {/* Keyframe styles */}
      <style>{`
        @keyframes fadeSlideIn {
          from { opacity: 0; transform: translateY(-6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes spin {
          0%   { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>

      {/* Top-right label */}
      <div style={{
        position: "absolute", top: "16px", right: "16px",
        color: "#8a9ab0", fontFamily: "Inter, sans-serif",
        fontSize: "14px", pointerEvents: "none", zIndex: 10,
      }}>
        Relative activation — normalised for observability
      </div>

      <div
        style={{ position: "absolute", top: "40px", right: "16px",
          color: "#ff0000", fontFamily: "Inter, sans-serif",
          fontSize: "14px", pointerEvents: "none", zIndex: 10 }}
        id="debug-overlay"
      />

      <div ref={mountRef} style={{ width: "100%", height: "100%" }} />
    </div>
  );
}
