const fs = require('fs');
const path = require('path');

const buildDir = path.join(__dirname, '..', 'build');

// Copy .cloudflareignore to build folder so Wrangler skips them
const ignoreSrc = path.join(__dirname, '..', '.cloudflareignore');
const ignoreDest = path.join(buildDir, '.cloudflareignore');
if (fs.existsSync(ignoreSrc)) {
  try {
    fs.copyFileSync(ignoreSrc, ignoreDest);
    console.log('[clean-build-assets] Copied .cloudflareignore to build folder.');
  } catch (e) {}
}

// Copy index.html to 404.html for Cloudflare Pages native SPA fallback routing
const indexHtml = path.join(buildDir, 'index.html');
const fallback404 = path.join(buildDir, '404.html');
if (fs.existsSync(indexHtml)) {
  try {
    fs.copyFileSync(indexHtml, fallback404);
    console.log('[clean-build-assets] Generated 404.html for Cloudflare Pages SPA fallback.');
  } catch (e) {}
}

// Remove local data folders from web build output
['articles', 'seed-contents'].forEach((folder) => {
  const target = path.join(buildDir, folder);
  if (fs.existsSync(target)) {
    try {
      fs.rmSync(target, { recursive: true, force: true });
      console.log(`[clean-build-assets] Removed ${folder} from build folder.`);
    } catch (err) {
      console.warn(`[clean-build-assets] Notice: ${err.message}`);
    }
  }
});
