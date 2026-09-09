const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '../../../../../../data/articles_backup');
const mappingDir = path.join(root, 'CourseMappingFiles');
const files = fs.readdirSync(mappingDir).filter(f => f.endsWith('-syllabus.json'));

console.log(`Found ${files.length} syllabus files in CourseMappingFiles.`);

const syllabuses = [];
for (const file of files) {
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(mappingDir, file), 'utf8'));
    const modules = raw.modules || (raw.data && raw.data.modules) || [];
    let subCount = 0;
    let probCount = 0;
    for (const m of modules) {
      const subs = m.submodules || [];
      subCount += subs.length;
      for (const s of subs) {
        probCount += (s.problems || []).length;
      }
    }
    syllabuses.push({
      file,
      name: raw.courseName || raw.name || raw.title || file.replace('-syllabus.json', ''),
      modules: modules.length,
      submodules: subCount,
      problems: probCount
    });
  } catch (err) {
    console.error(`Error reading ${file}:`, err.message);
  }
}

// Also check AptitudeCourses
const aptFile = path.join(root, 'course/AptitudeCourses/learn-aptitude-syllabus.json');
if (fs.existsSync(aptFile)) {
  try {
    const raw = JSON.parse(fs.readFileSync(aptFile, 'utf8'));
    const modules = raw.modules || [];
    let subCount = 0;
    let probCount = 0;
    for (const m of modules) {
      const subs = m.submodules || [];
      subCount += subs.length;
      for (const s of subs) {
        probCount += (s.problems || []).length;
      }
    }
    syllabuses.push({
      file: 'learn-aptitude-syllabus.json (AptitudeCourses)',
      name: raw.courseName || 'Aptitude & Reasoning',
      modules: modules.length,
      submodules: subCount,
      problems: probCount
    });
  } catch (err) {
    console.error(`Error reading aptitude syllabus:`, err.message);
  }
}

// Sort by problems descending
syllabuses.sort((a, b) => b.problems - a.problems);

console.log('\n--- TOP 25 SYLLABUSES ---');
for (const s of syllabuses.slice(0, 25)) {
  console.log(`${s.file.padEnd(50)} | ${s.name.padEnd(35)} | Mod: ${String(s.modules).padStart(2)} | Sub: ${String(s.submodules).padStart(3)} | Probs: ${String(s.problems).padStart(4)}`);
}

console.log(`\nTotal syllabuses: ${syllabuses.length} | Total Problems across all syllabuses: ${totalProblems}`);
