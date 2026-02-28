import * as THREE from 'three';

const vertices = 10;
const colors = new Float32Array(vertices * 3);
const INACTIVE_COLOR = new THREE.Color('#1a1a2e');
for (let i = 0; i < vertices; i++) {
  INACTIVE_COLOR.toArray(colors, i * 3);
}

const geo = new THREE.BufferGeometry();
geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

const colorAttr = geo.attributes.color;

// simulate update
const activeCol = new THREE.Color('#E87A3A');
for (let i = 0; i < 5; i++) {
  colorAttr.setXYZ(i, activeCol.r, activeCol.g, activeCol.b);
}
colorAttr.needsUpdate = true;

console.log('first vertex color:', colorAttr.getX(0), colorAttr.getY(0), colorAttr.getZ(0));
console.log('last vertex color:', colorAttr.getX(9), colorAttr.getY(9), colorAttr.getZ(9));
