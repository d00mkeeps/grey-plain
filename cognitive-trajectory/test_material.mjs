import * as THREE from 'three';

const mat = new THREE.MeshPhongMaterial({
  color: 0xffffff,
  vertexColors: true
});
console.log('Phong with vertexColors has color:', mat.color);
