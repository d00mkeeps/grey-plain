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

    Promise.all([
      fetch("/brain.json").then((r) => r.json()),
      fetch("/regionMap.json").then((r) => r.json()),
    ]).then(([brainData, regionMap]) => {
      const { vertices, faces } = brainData;
      const geometry = new THREE.BufferGeometry();
      const positions = new Float32Array(vertices.length * 3);
      const colors = new Float32Array(vertices.length * 3);

      vertices.forEach((v, i) => {
        positions[i * 3] = v.x;
        positions[i * 3 + 1] = v.y;
        positions[i * 3 + 2] = v.z;
        INACTIVE_COLOR.toArray(colors, i * 3);
      });

      const indices = new Uint32Array(faces.flat());
      geometry.setAttribute(
        "position",
        new THREE.BufferAttribute(positions, 3),
      );
      geometry.setAttribute(
        "color", 
        new THREE.BufferAttribute(colors, 3).setUsage(THREE.DynamicDrawUsage)
      );
      geometry.setIndex(new THREE.BufferAttribute(indices, 1));
      geometry.computeVertexNormals();

      const material = new THREE.MeshPhongMaterial({
        vertexColors: true,
        side: THREE.DoubleSide,
        shininess: 30,
      });

      const mesh = new THREE.Mesh(geometry, material);
      brainGroup.add(mesh);

      // ─ Precompute per-region sorted vertex lists (centroid → outward) ─
      // This lets us fill a fraction of each region proportional to activation.
      const regionVerts = {}; // regionIdx → [{ vertexIndex, dist }]
      vertices.forEach((v, i) => {
        const k = v.region;
        if (!regionVerts[k]) regionVerts[k] = [];
        regionVerts[k].push({ i, x: v.x, y: v.y, z: v.z });
      });
      // Sort each region's vertices from centroid outward
      const regionSortedLists = {};
      Object.keys(regionVerts).forEach((k) => {
        const vlist = regionVerts[k];
        const cx = vlist.reduce((s, v) => s + v.x, 0) / vlist.length;
        const cy = vlist.reduce((s, v) => s + v.y, 0) / vlist.length;
        const cz = vlist.reduce((s, v) => s + v.z, 0) / vlist.length;
        vlist.sort((a, b) => {
          const da = (a.x - cx) ** 2 + (a.y - cy) ** 2 + (a.z - cz) ** 2;
          const db = (b.x - cx) ** 2 + (b.y - cy) ** 2 + (b.z - cz) ** 2;
          // Sort by distance from centroid (closest first) for center-out expansion
          return da - db; 
        });
        regionSortedLists[k] = vlist.map((v) => v.i); // just keep index
      });

      // Build fast reverse-lookup: region name → regionMap key string
      const regionNameToKey = {};
      Object.keys(regionMap).forEach((k) => {
        const name = regionMap[k]?.name;
        if (name) regionNameToKey[name] = k;
      });

      sceneRef.current.brainMesh = mesh;
      sceneRef.current.vertexRegions = vertices.map((v) => v.region);
      sceneRef.current.regionMap = regionMap;
      sceneRef.current.regionNameToKey = regionNameToKey;
      sceneRef.current.regionSortedLists = regionSortedLists;
      console.log('[Brain] Loaded. Regions in map:', Object.keys(regionMap).length, '| Names indexed:', Object.keys(regionNameToKey).length);
      setModelsLoaded(true);
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

    const onResize = () => {
      camera.aspect = mount.clientWidth / mount.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(mount.clientWidth, mount.clientHeight);
    };
    window.addEventListener("resize", onResize);

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener("resize", onResize);
      renderer.dispose();
      if (mount.contains(renderer.domElement))
        mount.removeChild(renderer.domElement);
    };
  }, []);

  // ── Update activations per token ─────────────────────────────────────────────
  useEffect(() => {
    const { brainMesh, vertexRegions, regionMap, llmLayers } = sceneRef.current;
    const renderer = rendererRef.current;
    const { scene, camera } = sceneRef.current;

    sceneRef.current.targetHumanColor = humanData
      ? new THREE.Color("#7ac0f0")
      : new THREE.Color("#3a5a7a");
    sceneRef.current.targetLlmColor = llmData
      ? new THREE.Color("#7ac0f0")
      : new THREE.Color("#3a5a7a");

    // Brain vertex colours — partial region fill
    if (brainMesh && vertexRegions && regionMap && renderer) {
      const colorAttr       = brainMesh.geometry.attributes.color;
      const regionNameToKey = sceneRef.current.regionNameToKey || {};
      const sortedLists     = sceneRef.current.regionSortedLists;

      let activationByName = null;
      if (humanData?.tokenActivations && humanData.tokenActivations.length > tokenIndex) {
        activationByName = humanData.tokenActivations[tokenIndex];
      }
      // Fall back to regionActivations (live chat / end of token list)
      if (!activationByName || Object.keys(activationByName).length === 0) {
        activationByName = humanData?.regionActivations || {};
      }

      const totalIncoming = Object.keys(activationByName).length;
      let skippedLowActivation = 0;
      let skippedNoNetwork    = 0;
      let skippedNoRegionKey  = 0;
      let activeCount         = 0;

      // Reset all vertices to inactive
      for (let i = 0; i < vertexRegions.length; i++) {
        colorAttr.setXYZ(i, INACTIVE_COLOR.r, INACTIVE_COLOR.g, INACTIVE_COLOR.b);
      }

      if (humanData && sortedLists) {
        Object.entries(activationByName).forEach(([name, activation]) => {
          if (activation <= 0.05) { skippedLowActivation++; return; }

          const networkKey = REGION_NETWORK_MAP[name];
          if (!networkKey) { skippedNoNetwork++; return; }

          // Fast O(1) lookup via pre-built reverse map
          const regionIdx = regionNameToKey[name];
          if (!regionIdx || !sortedLists[regionIdx]) { skippedNoRegionKey++; return; }

          activeCount++;
          const vlist = sortedLists[regionIdx];
          // Linear count from center outward. 
          // Color is full network color with no modulation per user request.
          const t     = Math.min(1, Math.max(0, activation));
          const count = Math.max(1, Math.round(t * vlist.length));
          const netCol = networkColor(networkKey);
          for (let j = 0; j < count; j++) {
            colorAttr.setXYZ(vlist[j], netCol.r, netCol.g, netCol.b);
          }
        });
      }

      console.log(
        `[Brain] token=${tokenIndex} | incoming=${totalIncoming}`,
        `| low-activation=${skippedLowActivation}`,
        `| no-network=${skippedNoNetwork}`,
        `| no-regionKey=${skippedNoRegionKey}`,
        `| PAINTED=${activeCount}`
      );

      const debugEl = document.getElementById("debug-overlay");
      if (debugEl) {
        debugEl.innerText = `Token: ${tokenIndex} | Painted: ${activeCount} / ${totalIncoming}`;
      }

      colorAttr.needsUpdate = true;
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
      <div
        style={{
          position: "absolute",
          top: "16px",
          right: "16px",
          color: "#8a9ab0",
          fontFamily: "Inter, sans-serif",
          fontSize: "14px",
          pointerEvents: "none",
          zIndex: 10,
        }}
      >
        Relative activation — normalised for observability
      </div>
      <div
        style={{
          position: "absolute",
          top: "40px",
          right: "16px",
          color: "#ff0000",
          fontFamily: "Inter, sans-serif",
          fontSize: "14px",
          pointerEvents: "none",
          zIndex: 10,
        }}
        id="debug-overlay"
      >
      </div>
      <div ref={mountRef} style={{ width: "100%", height: "100%" }} />
    </div>
  );
}
