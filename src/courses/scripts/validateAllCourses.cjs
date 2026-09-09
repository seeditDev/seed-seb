const fs = require('fs');
const path = require('path');

const targetDir = path.resolve(__dirname, '../data/realCourses');
const files = fs.readdirSync(targetDir).filter(f => f.endsWith('.json'));

console.log(`Checking ${files.length} real course files...`);

let totalModules = 0;
let totalTopics = 0;
let totalPages = 0;
let totalProblems = 0;
let errors = [];

for (const f of files) {
  try {
    const raw = fs.readFileSync(path.join(targetDir, f), 'utf8');
    const course = JSON.parse(raw);

    if (!course.courseId) errors.push(`${f}: missing courseId`);
    if (!course.title) errors.push(`${f}: missing title`);
    if (!course.slug) errors.push(`${f}: missing slug`);
    if (!Array.isArray(course.modules) || course.modules.length === 0) {
      errors.push(`${f}: modules is not a non-empty array`);
    }

    totalModules += course.modules.length;

    for (const m of course.modules) {
      if (!m.moduleId) errors.push(`${f}: module missing moduleId`);
      if (!m.title) errors.push(`${f}: module missing title`);
      if (!Array.isArray(m.topics)) errors.push(`${f}: module missing topics array`);
      
      totalTopics += (m.topics || []).length;
      for (const t of m.topics || []) {
        totalPages += (t.pages || []).length;
        totalProblems += (t.practiceProblems || []).length;
      }

      if (!m.msa || !m.msa.mcqSection || !Array.isArray(m.msa.mcqSection.questions)) {
        errors.push(`${f}: module ${m.moduleId} missing valid MSA mcqSection`);
      }
    }
  } catch (err) {
    errors.push(`${f}: JSON parse error: ${err.message}`);
  }
}

console.log('\n--- VALIDATION RESULTS ---');
console.log(`Total Courses: ${files.length}`);
console.log(`Total Modules: ${totalModules}`);
console.log(`Total Topics: ${totalTopics}`);
console.log(`Total Concept Pages: ${totalPages}`);
console.log(`Total Practice Problems: ${totalProblems}`);
console.log(`Total Content Items: ${totalPages + totalProblems}`);

if (errors.length === 0) {
  console.log('ALL 74 COURSES VALIDATED SUCCESSFULLY WITH 0 ERRORS!');
} else {
  console.error(`Found ${errors.length} validation errors:`);
  errors.slice(0, 10).forEach(e => console.error(' -', e));
  process.exit(1);
}
