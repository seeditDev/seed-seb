const fs = require('fs');
const path = require('path');

const targetFiles = [
  'node_modules/face-api.js/dist/face-api.js',
  'node_modules/face-api.js/dist/face-api.min.js',
  'node_modules/face-api.js/node_modules/@tensorflow/tfjs-core/benchmarks/util.js',
  'node_modules/face-api.js/node_modules/@tensorflow/tfjs-core/dist/engine.js',
  'node_modules/face-api.js/node_modules/@tensorflow/tfjs-core/dist/tf-core.esm.js',
  'node_modules/face-api.js/node_modules/@tensorflow/tfjs-core/dist/tf-core.js',
  'node_modules/face-api.js/node_modules/@tensorflow/tfjs-core/dist/tf-core.min.js',
  'node_modules/face-api.js/node_modules/@tensorflow/tfjs-core/dist/miniprogram/index.js'
];

let count = 0;
for (const rel of targetFiles) {
  const filePath = path.resolve(__dirname, '..', rel);
  if (fs.existsSync(filePath)) {
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      if (content.includes('_tfengine')) {
        const updated = content.replaceAll('_tfengine', '_faceapi_tfengine');
        fs.writeFileSync(filePath, updated, 'utf8');
        count++;
      }
    } catch (e) {
      console.warn(`[patch-faceapi] Failed to patch ${rel}:`, e.message);
    }
  }
}

if (count > 0) {
  console.log(`[patch-faceapi] Isolated _tfengine in ${count} face-api.js files to prevent conflict with @tensorflow/tfjs`);
}
