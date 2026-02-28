import fs from 'fs';
const brain = JSON.parse(fs.readFileSync('cognitive-trajectory/public/brain.json', 'utf8'));

console.log('first 10 region indices:');
console.log(brain.vertices.slice(0, 10).map(v => v.region));
