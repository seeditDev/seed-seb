const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '../../../../../../data/articles_backup');
const mappingDir = path.join(root, 'CourseMappingFiles');
const files = fs.readdirSync(mappingDir).filter(f => f.endsWith('-syllabus.json'));

const catalog = [];

for (const f of files) {
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(mappingDir, f), 'utf8'));
    const modules = raw.modules || (raw.data && raw.data.modules) || [];
    let pCount = 0;
    for (const m of modules) {
      for (const s of m.submodules || []) {
        pCount += (s.problems || []).length;
      }
    }
    if (pCount === 0) continue; // skip empty syllabuses
    catalog.push({
      file: f,
      slug: raw.slug || f.replace('-syllabus.json', ''),
      name: raw.courseName || raw.name || raw.title || f.replace('-syllabus.json', ''),
      description: raw.description || '',
      modulesCount: modules.length,
      problemsCount: pCount
    });
  } catch (_) {}
}

// Aptitude
const aptPath = path.join(root, 'course/AptitudeCourses/learn-aptitude-syllabus.json');
if (fs.existsSync(aptPath)) {
  const raw = JSON.parse(fs.readFileSync(aptPath, 'utf8'));
  let pCount = 0;
  for (const m of raw.modules || []) {
    for (const s of m.submodules || []) {
      pCount += (s.problems || []).length;
    }
  }
  catalog.push({
    file: 'learn-aptitude-syllabus.json',
    slug: 'learn-aptitude',
    name: 'Quantitative Aptitude & Logical Reasoning',
    description: raw.description || 'Master quantitative aptitude, analytical reasoning, and verbal ability for competitive exams and campus placements.',
    modulesCount: (raw.modules || []).length,
    problemsCount: pCount
  });
}

console.log(`Total non-empty course syllabuses: ${catalog.length}`);
fs.writeFileSync(path.join(__dirname, 'syllabus_catalog.json'), JSON.stringify(catalog, null, 2));
console.log('Saved syllabus_catalog.json');
