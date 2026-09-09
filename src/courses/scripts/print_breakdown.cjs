const fs = require('fs');
const path = require('path');

const dir = path.resolve(__dirname, '../data/realCourses');
const files = fs.readdirSync(dir).filter(f => f.endsWith('.json'));

console.log('Location:', dir);
console.log('Total course JSON files:', files.length);

const list = [];
for (const f of files) {
  const c = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
  let pgs = 0;
  let probs = 0;
  for (const m of (c.modules || [])) {
    for (const t of (m.topics || [])) {
      pgs += (t.pages || []).length;
      probs += (t.practiceProblems || []).length;
    }
  }
  list.push({
    file: f,
    title: c.title,
    modules: (c.modules || []).length,
    pages: pgs,
    practice: probs,
    total: pgs + probs
  });
}

list.sort((a, b) => b.total - a.total);

console.log('\n--- ALL COURSES AND CONTENT BREAKDOWN ---');
for (let i = 0; i < list.length; i++) {
  const item = list[i];
  console.log(`${String(i + 1).padStart(2)}. ${item.file.padEnd(35)} | Mod: ${String(item.modules).padStart(2)} | Concept Pgs: ${String(item.pages).padStart(3)} | Practice Probs: ${String(item.practice).padStart(3)} | Total: ${String(item.total).padStart(4)}`);
}
