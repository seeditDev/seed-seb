const fs = require('fs');
const path = require('path');

const targetFile = path.resolve(__dirname, '../.output/server/index.mjs');

if (fs.existsSync(targetFile)) {
  let content = fs.readFileSync(targetFile, 'utf8');
  if (!content.includes('export { AssessmentSessionDO }')) {
    content += '\nexport { AssessmentSessionDO } from "./_ssr/ssr.mjs";\n';
    fs.writeFileSync(targetFile, content, 'utf8');
    console.log('[patch-worker] Successfully exported AssessmentSessionDO in .output/server/index.mjs');
  } else {
    console.log('[patch-worker] AssessmentSessionDO already exported in .output/server/index.mjs');
  }
} else {
  console.error('[patch-worker] ERROR: .output/server/index.mjs not found!');
  process.exit(1);
}

