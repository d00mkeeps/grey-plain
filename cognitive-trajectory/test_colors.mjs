import * as THREE from 'three';
const INACTIVE_COLOR = new THREE.Color('#1a1a2e');
const activeCol = new THREE.Color('#E87A3A'); // language
const activation = 0.58;

const col = INACTIVE_COLOR.clone().lerp(activeCol, activation);
console.log('Lerped col:', col.r, col.g, col.b);
