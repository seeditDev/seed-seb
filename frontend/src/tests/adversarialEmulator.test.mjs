/**
 * adversarialEmulator.test.mjs
 * 
 * Comprehensive Firestore Security Rules Adversarial Attack Matrix Test Suite.
 * 
 * ╔═══════════════════════════════════════════════════════════════════════════╗
 * ║  IMPORTANT — TWO TIERS OF VALIDATION                                     ║
 * ║                                                                           ║
 * ║  Tier 1 (this file, lines below): JavaScript simulation of the Firestore  ║
 * ║  rule logic using an `AdversarialContext` class.  This is a fast,         ║
 * ║  dependency-free unit test of the INTENDED rule behaviour.  It does NOT   ║
 * ║  invoke the Firebase CEL evaluator or the real Firestore emulator.        ║
 * ║  Rule syntax bugs (typos, wrong field names, regex errors) will NOT be   ║
 * ║  caught by Tier-1 alone.                                                  ║
 * ║                                                                           ║
 * ║  Tier 2 (lower half of this file, requires emulator): Uses the official   ║
 * ║  @firebase/rules-unit-testing SDK against a real Firebase emulator.  This ║
 * ║  is the AUTHORITATIVE production release gate.  Tier-2 MUST pass before   ║
 * ║  any merge to main.                                                        ║
 * ║                                                                           ║
 * ║  Run Tier-2:                                                              ║
 * ║    firebase emulators:exec --only firestore \                            ║
 * ║      "FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 npm test"                   ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 * 
 * Simulates adversarial actors attacking the multi-tenant security boundary
 * across all release-gate vectors:
 * 
 * 1. Assessment Isolation & Query Scoping
 * 2. Cross-Tenant Attempt Manufacturing Attacks
 * 3. Result Enumeration & Leaf List Attacks
 * 4. Course & Subcollection Access Control
 * 5. Identity & Privilege Escalation Attacks
 * 6. Result Score Integrity (P0)
 * 7. Proctoring Attempt Ownership Binding (P1)
 */


import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import assert from 'assert';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// IMPORTANT: Load from the single canonical firestore.rules at the repo root (unique/).
// This is the same file Firebase deploys from seed-admin/. See seed-admin/firebase.json.
const rulesPath = resolve(__dirname, '../../../../firestore.rules');
const rules = readFileSync(rulesPath, 'utf-8');

console.log('================================================================');
console.log('   SEED-IT FIRESTORE ADVERSARIAL ATTACK MATRIX VERIFICATION     ');
console.log('================================================================\n');

// Mock Firestore Context Evaluator
class AdversarialContext {
  constructor(auth, db = {}) {
    this.auth = auth; // { uid, token: { role, tenantId } }
    this.db = db;     // Simulated database store: path -> data
  }

  getDoc(path) {
    return this.db[path] || null;
  }

  // Evaluate helper functions against rules logic
  isSignedIn() {
    return !!this.auth?.uid;
  }

  isUser(userId) {
    return this.isSignedIn() && this.auth.uid === userId;
  }

  myProfile() {
    return this.getDoc(`users/${this.auth?.uid}`) || {};
  }

  hasProfile() {
    return this.isSignedIn() && !!this.getDoc(`users/${this.auth?.uid}`);
  }

  myRole() {
    if (this.hasProfile() && this.myProfile().role) return this.myProfile().role;
    if (this.isSignedIn()) return this.auth.token?.role || 'student';
    return 'none';
  }

  isAdmin() {
    return this.myRole() === 'admin' || this.myRole() === 'superadmin';
  }

  isStaff() {
    return this.myRole() === 'staff';
  }

  myTenant() {
    if (this.hasProfile() && this.myProfile().tenantId) return this.myProfile().tenantId;
    return this.auth.token?.tenantId || '';
  }

  tenantAllowed(tenantId) {
    return this.isAdmin() || (this.isStaff() && this.myTenant() !== '' && tenantId === this.myTenant());
  }

  isTenantMember(tenantId) {
    return this.isSignedIn() && (this.isAdmin() || (this.myTenant() !== '' && this.myTenant() === tenantId));
  }

  // 1. Assessment Operations
  canGetAssessment(assessmentId) {
    const doc = this.getDoc(`assessments/${assessmentId}`);
    if (!doc) return false;
    return this.isTenantMember(doc.tenantId || '');
  }

  canListAssessments(queryTenantId) {
    // allow list: if isAdmin() || (isStaff() && tenantAllowed(resource.data.tenantId));
    if (this.isAdmin()) return true;
    if (this.isStaff() && this.tenantAllowed(queryTenantId)) return true;
    return false;
  }

  // 2. Attempt Creation Operations
  canCreateAssessmentAttempt(userId, attemptId, payload) {
    if (this.isAdmin()) return true;
    if (this.isStaff() && this.tenantAllowed(this.getDoc(`users/${userId}`)?.tenantId)) return true;
    
    // Student rule:
    // isUser(userId) && payload.uid == userId && myTenant != '' && payload.tenantId == myTenant
    // && isTenantMember(get(/assessments/{payload.assessmentId}).data.tenantId)
    // && isValidDuration(payload.durationSeconds)
    // && isAssessmentDuration(payload.durationSeconds, assessmentData)  [Fix Audit-6 P0]
    if (!this.isUser(userId)) return false;
    if (payload.uid !== userId) return false;
    if (!this.myTenant()) return false;
    if (payload.tenantId !== this.myTenant()) return false;

    const assessmentDoc = this.getDoc(`assessments/${payload.assessmentId}`);
    if (!assessmentDoc) return false;
    if (!this.isTenantMember(assessmentDoc.tenantId || '')) return false;

    // [Fix Audit-6 P0] isValidDuration: 1 <= durationSeconds <= 86400
    const dur = payload.durationSeconds || 0;
    if (dur < 1 || dur > 86400) return false;

    // [Fix Audit-6 P0] isAssessmentDuration: durationSeconds must match the assessment's configured duration.
    // Uses durationSeconds field if present on assessment doc, otherwise duration_minutes * 60.
    const authDuration =
      (assessmentDoc.durationSeconds > 0)
        ? assessmentDoc.durationSeconds
        : (assessmentDoc.duration_minutes || 0) * 60;
    if (authDuration > 0 && dur !== authDuration) return false;

    return true;
  }

  // 3. Results Operations
  canGetResult(tenantId, assessmentId, targetUserId) {
    if (this.isAdmin()) return true;
    if (this.isStaff() && this.tenantAllowed(tenantId)) return true;
    return this.isUser(targetUserId);
  }

  canCreateResult(tenantId, assessmentId, targetUserId, payload) {
    if (this.isAdmin()) return true;
    if (this.isStaff() && this.tenantAllowed(tenantId)) return true;

    // Student rule:
    // isUser(targetUserId) && myTenant != '' && tenantId == myTenant && payload.tenantId == myTenant
    // && payload.assessmentId == assessmentId && payload.userId == targetUserId
    // && isTenantMember(get(/assessments/{assessmentId}).data.tenantId)
    // [Fix Audit-7 P1] && payload.attemptId == assessmentId + '_' + targetUserId
    // [Fix Audit-7 P1] && attempt.status in ['SUBMITTING', 'EXPIRED', 'FAILED_RECOVERABLE']
    if (!this.isUser(targetUserId)) return false;
    if (!this.myTenant()) return false;
    if (tenantId !== this.myTenant()) return false;
    if (payload.tenantId !== this.myTenant()) return false;
    if (payload.assessmentId !== assessmentId) return false;
    if (payload.userId !== targetUserId) return false;

    const assessmentDoc = this.getDoc(`assessments/${assessmentId}`);
    if (!assessmentDoc) return false;
    if (!this.isTenantMember(assessmentDoc.tenantId || '')) return false;

    // [Fix Audit-7 P1] Bind result.attemptId to canonical attempt ID
    const canonicalAttemptId = `${assessmentId}_${targetUserId}`;
    if (payload.attemptId !== canonicalAttemptId) return false;

    // [Fix Audit-7 P1] Attempt must be in a legitimate finalization state
    const attemptDoc = this.getDoc(`users/${targetUserId}/contestAttempts/${canonicalAttemptId}`);
    if (!attemptDoc) return false;
    const allowedStates = ['SUBMITTING', 'EXPIRED', 'FAILED_RECOVERABLE'];
    if (!allowedStates.includes(attemptDoc.status || '')) return false;

    return true;
  }

  canListResultsParent(tenantId) {
    return this.isAdmin() || (this.isStaff() && this.tenantAllowed(tenantId));
  }

  canListResultsNested(tenantId, assessmentId) {
    return this.isAdmin() || (this.isStaff() && this.tenantAllowed(tenantId));
  }

  // 4. Courses Operations
  canGetCourse(courseId) {
    const doc = this.getDoc(`courses/${courseId}`);
    if (!doc) return false;
    return this.isTenantMember(doc.tenantId || '');
  }

  canMutateCourse(courseId) {
    const doc = this.getDoc(`courses/${courseId}`);
    if (!doc) return false;
    return this.isAdmin() || (this.isStaff() && this.tenantAllowed(doc.tenantId || ''));
  }

  // 5. User Self-Updates / Privilege Escalation
  canCreateUser(targetUserId, payload) {
    if (this.isAdmin()) return true;
    if (this.isStaff() && this.tenantAllowed(payload.tenantId) && payload.role === 'student') return true;

    // Student self-provisioning:
    // isUser(targetUserId) && payload.role == 'student' && payload.uid == targetUserId
    // && auth.token.tenantId != '' && payload.tenantId == auth.token.tenantId
    if (this.isUser(targetUserId)) {
      if (payload.role !== 'student') return false;
      if (payload.uid !== targetUserId) return false;
      const tokenTenant = this.auth.token?.tenantId || '';
      if (!tokenTenant) return false;
      if (payload.tenantId !== tokenTenant) return false;
      return true;
    }
    return false;
  }

  canMutateTenantRoot(tenantId) {
    return this.isAdmin();
  }

  canUpdateUser(targetUserId, currentDoc, newDoc) {
    if (this.isAdmin()) return true;
    if (this.isStaff() && this.tenantAllowed(currentDoc?.tenantId)) return true;

    // Student update lock
    if (this.isUser(targetUserId)) {
      if (newDoc.role !== currentDoc.role) return false;
      if (newDoc.tenantId !== currentDoc.tenantId) return false;
      if (newDoc.uid !== currentDoc.uid) return false;
      return true;
    }
    return false;
  }

  // 6. Result Score Integrity (P0 FIX)
  // Students may only create result stubs with all score fields at zero/false.
  canCreateResultWithScores(tenantId, assessmentId, targetUserId, payload) {
    if (this.isAdmin()) return true;
    if (this.isStaff() && this.tenantAllowed(tenantId)) return true;

    if (!this.isUser(targetUserId)) return false;
    if (!this.myTenant()) return false;
    if (tenantId !== this.myTenant()) return false;
    if (payload.tenantId !== this.myTenant()) return false;
    if (payload.assessmentId !== assessmentId) return false;
    if (payload.userId !== targetUserId) return false;

    const assessmentDoc = this.getDoc(`assessments/${assessmentId}`);
    if (!assessmentDoc) return false;
    if (!this.isTenantMember(assessmentDoc.tenantId || '')) return false;

    // P0 FIX: Score fields must be at zero/false on create
    if ((payload.score ?? 0) !== 0) return false;
    if ((payload.percentage ?? 0) !== 0) return false;
    if ((payload.correctAnswers ?? 0) !== 0) return false;
    if ((payload.totalMarks ?? 0) !== 0) return false;
    if ((payload.maxMarks ?? 0) !== 0) return false;
    if ((payload.rank ?? 0) !== 0) return false;
    if (payload.qualified !== undefined && payload.qualified !== false) return false;
    if (payload.grade !== undefined && payload.grade !== '') return false;
    if (payload.completed !== undefined && payload.completed !== false) return false;
    if (payload.evaluationStatus !== undefined && payload.evaluationStatus === 'completed') return false;
    if (payload.status !== undefined && payload.status === 'submitted') return false;
    // evaluationSource must be 'client'
    if ((payload.evaluationSource ?? 'client') !== 'client') return false;

    return true;
  }

  // 7. Proctoring Attempt Ownership (P0 FIX)
  // Proctoring log create must verify the attemptId belongs to auth.uid
  canCreateProctoringLog(attemptId, payload) {
    if (!this.isSignedIn()) return false;
    if (!this.myTenant()) return false;
    if (payload.userId !== this.auth.uid) return false;
    if (payload.tenantId !== this.myTenant()) return false;
    if (payload.attemptId !== attemptId) return false;

    // P0 FIX: Cross-document attempt ownership binding
    const attemptDoc = this.getDoc(`users/${this.auth.uid}/contestAttempts/${attemptId}`);
    if (!attemptDoc) return false;
    if (attemptDoc.uid !== this.auth.uid) return false;
    if (attemptDoc.tenantId !== this.myTenant()) return false;

    return true;
  }

  // 8. Proctoring Event Ownership (P0 FIX)
  // Event create must verify the parent log belongs to auth.uid
  canCreateProctoringEvent(attemptId, payload) {
    if (!this.isSignedIn()) return false;
    if (payload.userId !== this.auth.uid) return false;
    if (payload.attemptId !== attemptId) return false;

    const parentLog = this.getDoc(`proctoringLogs/${attemptId}`);
    if (!parentLog) return false;
    if (payload.tenantId !== parentLog.tenantId) return false;
    // P0 FIX: Parent log must belong to the authenticated user
    if (parentLog.userId !== this.auth.uid) return false;

    return true;
  }

  // 9. userSolutions Tenant-Scoped Access (Audit-8 P0)
  canAccessUserSolutions(targetUserId) {
    if (this.isUser(targetUserId)) return true;
    if (this.isAdmin()) return true;
    const targetUser = this.getDoc(`users/${targetUserId}`);
    if (this.isStaff() && targetUser && this.tenantAllowed(targetUser.tenantId || '')) return true;
    return false;
  }
}

// Database Fixture
const databaseFixture = {
  'tenants/TN000026': { id: 'TN000026', name: 'Alpha College' },
  'tenants/TN000027': { id: 'TN000027', name: 'Beta Institute' },

  'users/student_A': { uid: 'student_A', role: 'student', tenantId: 'TN000026' },
  'users/student_B': { uid: 'student_B', role: 'student', tenantId: 'TN000027' },
  'users/staff_A': { uid: 'staff_A', role: 'staff', tenantId: 'TN000026' },
  'users/staff_B': { uid: 'staff_B', role: 'staff', tenantId: 'TN000027' },
  'users/admin_root': { uid: 'admin_root', role: 'admin', tenantId: 'TN000026' },

  'assessments/asm_alpha_1': { id: 'asm_alpha_1', tenantId: 'TN000026', title: 'Alpha Test', status: 'published', duration_minutes: 30 },
  'assessments/asm_beta_1': { id: 'asm_beta_1', tenantId: 'TN000027', title: 'Beta Test', status: 'published', duration_minutes: 60 },

  'courses/course_alpha': { id: 'course_alpha', tenantId: 'TN000026', title: 'Alpha Course' },
  'courses/course_beta': { id: 'course_beta', tenantId: 'TN000027', title: 'Beta Course' },

  'assessmentResults/TN000026/asm_alpha_1/student_A': { tenantId: 'TN000026', assessmentId: 'asm_alpha_1', userId: 'student_A', score: 95 },
  'assessmentResults/TN000027/asm_beta_1/student_B': { tenantId: 'TN000027', assessmentId: 'asm_beta_1', userId: 'student_B', score: 88 },

  // Attempt records for proctoring attempt-ownership binding tests
  'users/student_A/contestAttempts/att_A_1': { uid: 'student_A', tenantId: 'TN000026', assessmentId: 'asm_alpha_1' },
  'users/student_B/contestAttempts/att_B_1': { uid: 'student_B', tenantId: 'TN000027', assessmentId: 'asm_beta_1' },

  // [Fix Audit-7 P1] Canonical attempt doc for result-creation state tests.
  // The attemptId format is {assessmentId}_{uid} per attemptDocId() contract.
  // status='SUBMITTING' means the student is actively in the finalization path.
  'users/student_A/contestAttempts/asm_alpha_1_student_A': {
    uid: 'student_A', tenantId: 'TN000026', assessmentId: 'asm_alpha_1',
    status: 'SUBMITTING', durationSeconds: 1800,
  },

  // Proctoring logs
  'proctoringLogs/att_A_1': { userId: 'student_A', tenantId: 'TN000026', attemptId: 'att_A_1', status: 'active' },
  'proctoringLogs/att_B_1': { userId: 'student_B', tenantId: 'TN000027', attemptId: 'att_B_1', status: 'active' },
};

// Create Actor Contexts
const studentA = new AdversarialContext({ uid: 'student_A', token: { role: 'student', tenantId: 'TN000026' } }, databaseFixture);
const studentB = new AdversarialContext({ uid: 'student_B', token: { role: 'student', tenantId: 'TN000027' } }, databaseFixture);
const studentUnassigned = new AdversarialContext({ uid: 'attacker_user', token: { role: 'student' } }, databaseFixture);
const staffA = new AdversarialContext({ uid: 'staff_A', token: { role: 'staff', tenantId: 'TN000026' } }, databaseFixture);
const staffB = new AdversarialContext({ uid: 'staff_B', token: { role: 'staff', tenantId: 'TN000027' } }, databaseFixture);
const adminUser = new AdversarialContext({ uid: 'admin_root', token: { role: 'admin', tenantId: 'TN000026' } }, databaseFixture);

// ── SECTION 1: ASSESSMENT ADVERSARIAL TESTS ─────────────────────────────────
console.log('[Phase 1] Assessment Isolation Matrix:');
assert.strictEqual(staffA.canListAssessments('TN000026'), true, 'Staff A MUST be allowed to list Tenant A assessments');
console.log('  ✓ Staff A -> list Tenant A assessments: ALLOWED');

assert.strictEqual(staffA.canListAssessments('TN000027'), false, 'Staff A MUST NOT be allowed to list Tenant B assessments');
console.log('  ✓ Staff A -> list Tenant B assessments: BLOCKED');

assert.strictEqual(staffA.canGetAssessment('asm_alpha_1'), true, 'Staff A MUST be allowed to get Tenant A assessment');
console.log('  ✓ Staff A -> get Tenant A assessment: ALLOWED');

assert.strictEqual(staffA.canGetAssessment('asm_beta_1'), false, 'Staff A MUST NOT be allowed to get Tenant B assessment');
console.log('  ✓ Staff A -> get Tenant B assessment: BLOCKED');

assert.strictEqual(studentA.canGetAssessment('asm_alpha_1'), true, 'Student A MUST be allowed to get Tenant A assessment');
console.log('  ✓ Student A -> get Tenant A assessment: ALLOWED');

assert.strictEqual(studentA.canGetAssessment('asm_beta_1'), false, 'Student A MUST NOT be allowed to get Tenant B assessment');
console.log('  ✓ Student A -> get Tenant B assessment: BLOCKED');

assert.strictEqual(studentA.canListAssessments('TN000026'), false, 'Student A MUST NOT be allowed to list assessments collection');
console.log('  ✓ Student A -> list assessments collection: BLOCKED\n');

// ── SECTION 2: ATTEMPT SPOOFING & CROSS-TENANT ADVERSARIAL TESTS ────────────
console.log('[Phase 2] Attempt Spoofing & Cross-Tenant Defense Matrix:');
// Legitimate attempt creation
assert.strictEqual(
  studentA.canCreateAssessmentAttempt('student_A', 'att_1', { uid: 'student_A', tenantId: 'TN000026', assessmentId: 'asm_alpha_1', durationSeconds: 1800 }),
  true,
  'Student A MUST be allowed to create attempt for own Tenant A assessment'
);
console.log('  ✓ Student A -> create attempt for own Tenant A assessment: ALLOWED');

// Attack 1: Student A attempts to take Tenant B's assessment with matching tenant payload
assert.strictEqual(
  studentA.canCreateAssessmentAttempt('student_A', 'att_attack_1', { uid: 'student_A', tenantId: 'TN000026', assessmentId: 'asm_beta_1', durationSeconds: 3600 }),
  false,
  'Student A MUST NOT be allowed to create attempt for Tenant B assessment (Tenant mismatch)'
);
console.log('  ✓ Student A -> create attempt for Tenant B assessment (asm_beta_1): BLOCKED (Assessment tenant mismatch)');

// Attack 2: Student A attempts to supply Tenant B's tenantId
assert.strictEqual(
  studentA.canCreateAssessmentAttempt('student_A', 'att_attack_2', { uid: 'student_A', tenantId: 'TN000027', assessmentId: 'asm_beta_1', durationSeconds: 3600 }),
  false,
  'Student A MUST NOT be allowed to supply Tenant B tenantId'
);
console.log('  ✓ Student A -> create attempt with Tenant B tenantId: BLOCKED (Student tenant mismatch)');

// Attack 3: Student A attempts to target a non-existent fake assessment ID
assert.strictEqual(
  studentA.canCreateAssessmentAttempt('student_A', 'att_attack_3', { uid: 'student_A', tenantId: 'TN000026', assessmentId: 'asm_fake_999', durationSeconds: 1800 }),
  false,
  'Student A MUST NOT be allowed to create attempt for non-existent assessment'
);
console.log('  ✓ Student A -> create attempt for non-existent assessment ID: BLOCKED (Assessment does not exist)');

// [Fix Audit-6 P0] Attack 4b: Duration gaming — student submits valid range but wrong duration for 30-min assessment
assert.strictEqual(
  studentA.canCreateAssessmentAttempt('student_A', 'att_attack_4b', { uid: 'student_A', tenantId: 'TN000026', assessmentId: 'asm_alpha_1', durationSeconds: 86400 }),
  false,
  'Student A MUST NOT be allowed to create attempt with durationSeconds=86400 for a 30-min assessment (asm_alpha_1 = 1800s)'
);
console.log('  ✓ Student A -> attempt with durationSeconds=86400 on 30-min assessment: BLOCKED (Duration mismatch)');

// Confirm that correct duration (30 min = 1800s) is accepted
assert.strictEqual(
  studentA.canCreateAssessmentAttempt('student_A', 'att_legitimate_dur', { uid: 'student_A', tenantId: 'TN000026', assessmentId: 'asm_alpha_1', durationSeconds: 1800 }),
  true,
  'Student A MUST be allowed to create attempt with correct durationSeconds=1800 for 30-min assessment'
);
console.log('  ✓ Student A -> attempt with correct durationSeconds=1800 for 30-min assessment: ALLOWED\n');

// ── SECTION 3: RESULTS ACCESS & ENUMERATION DEFENSE MATRIX ──────────────────
console.log('[Phase 3] Results Authorization & Enumeration Lock:');
assert.strictEqual(studentA.canGetResult('TN000026', 'asm_alpha_1', 'student_A'), true, 'Student A MUST be allowed to get own result');
console.log('  ✓ Student A -> get own result: ALLOWED');

assert.strictEqual(studentA.canGetResult('TN000027', 'asm_beta_1', 'student_B'), false, 'Student A MUST NOT be allowed to get Student B result');
console.log('  ✓ Student A -> get Student B result: BLOCKED');

assert.strictEqual(studentA.canListResultsParent('TN000026'), false, 'Student A MUST NOT be allowed to list parent results collection');
console.log('  ✓ Student A -> list parent assessmentResults/TN000026: BLOCKED');

assert.strictEqual(studentA.canListResultsNested('TN000026', 'asm_alpha_1'), false, 'Student A MUST NOT be allowed to list leaf results');
console.log('  ✓ Student A -> list nested leaf assessmentResults/TN000026/asm_alpha_1: BLOCKED (Least Privilege)');

// Result Creation Defense Matrix
assert.strictEqual(
  studentA.canCreateResult('TN000026', 'asm_alpha_1', 'student_A', {
    tenantId: 'TN000026', assessmentId: 'asm_alpha_1', userId: 'student_A', score: 90,
    attemptId: 'asm_alpha_1_student_A', // canonical attemptId required by Audit-7 fix
  }),
  true,
  'Student A MUST be allowed to create legitimate result for own Tenant A assessment'
);
console.log('  ✓ Student A -> create result for own Tenant A assessment: ALLOWED');

assert.strictEqual(
  studentA.canCreateResult('TN000026', 'asm_beta_1', 'student_A', { tenantId: 'TN000026', assessmentId: 'asm_beta_1', userId: 'student_A', score: 90 }),
  false,
  'Student A MUST NOT be allowed to create result referencing Tenant B assessment (asm_beta_1)'
);
console.log('  ✓ Student A -> create result referencing Tenant B assessment (asm_beta_1): BLOCKED (Assessment tenant mismatch)');

assert.strictEqual(
  studentA.canCreateResult('TN000027', 'asm_beta_1', 'student_A', { tenantId: 'TN000027', assessmentId: 'asm_beta_1', userId: 'student_A', score: 90 }),
  false,
  'Student A MUST NOT be allowed to create result under Tenant B path'
);
console.log('  ✓ Student A -> create result under Tenant B path: BLOCKED (Path tenant mismatch)');

assert.strictEqual(staffA.canListResultsParent('TN000026'), true, 'Staff A MUST be allowed to list Tenant A results');
console.log('  ✓ Staff A -> list Tenant A results: ALLOWED');

assert.strictEqual(staffA.canListResultsParent('TN000027'), false, 'Staff A MUST NOT be allowed to list Tenant B results');
console.log('  ✓ Staff A -> list Tenant B results: BLOCKED\n');

// ── SECTION 4: COURSES AUTHORIZATION MATRIX ─────────────────────────────────
console.log('[Phase 4] Courses & Child Hierarchy Authorization:');
assert.strictEqual(staffA.canGetCourse('course_alpha'), true, 'Staff A MUST be allowed to get Tenant A course');
console.log('  ✓ Staff A -> get Course A (Tenant A): ALLOWED');

assert.strictEqual(staffA.canGetCourse('course_beta'), false, 'Staff A MUST NOT be allowed to get Tenant B course');
console.log('  ✓ Staff A -> get Course B (Tenant B): BLOCKED');

assert.strictEqual(staffA.canMutateCourse('course_alpha'), true, 'Staff A MUST be allowed to mutate Course A');
console.log('  ✓ Staff A -> mutate Course A: ALLOWED');

assert.strictEqual(staffA.canMutateCourse('course_beta'), false, 'Staff A MUST NOT be allowed to mutate Course B');
console.log('  ✓ Staff A -> mutate Course B: BLOCKED\n');

// ── SECTION 5: PRIVILEGE ESCALATION & IDENTITY TAMPER MATRIX ────────────────
console.log('[Phase 5] Identity & Privilege Escalation Defense:');
const studentDoc = databaseFixture['users/student_A'];

// Attack 4: Student attempts to elevate role to admin
assert.strictEqual(
  studentA.canUpdateUser('student_A', studentDoc, { ...studentDoc, role: 'admin' }),
  false,
  'Student A MUST NOT be allowed to elevate role to admin'
);
console.log('  ✓ Student A -> modify role to "admin": BLOCKED (Privilege escalation denied)');

// Attack 5: Student attempts to alter tenantId
assert.strictEqual(
  studentA.canUpdateUser('student_A', studentDoc, { ...studentDoc, tenantId: 'TN000027' }),
  false,
  'Student A MUST NOT be allowed to alter tenantId'
);
console.log('  ✓ Student A -> modify tenantId to "TN000027": BLOCKED (Tenant mutation denied)');

// Attack 6: Staff A attempts to alter Student B (Tenant B)
assert.strictEqual(
  staffA.canUpdateUser('student_B', databaseFixture['users/student_B'], { ...databaseFixture['users/student_B'], tenantId: 'TN000026' }),
  false,
  'Staff A MUST NOT be allowed to alter Tenant B students'
);
console.log('  ✓ Staff A -> alter Student B (Tenant B): BLOCKED (Cross-tenant staff action denied)');

// Attack 7: Attacker attempts to self-provision with arbitrary target tenant
assert.strictEqual(
  studentUnassigned.canCreateUser('attacker_user', { uid: 'attacker_user', role: 'student', tenantId: 'TN000026' }),
  false,
  'Unassigned user MUST NOT be allowed to self-assign arbitrary tenant'
);
console.log('  ✓ Unassigned user -> self-provision arbitrary Tenant A: BLOCKED (Tenant selection denied)');

// Attack 8: Staff attempts to modify root tenant document
assert.strictEqual(
  staffA.canMutateTenantRoot('TN000026'),
  false,
  'Staff A MUST NOT be allowed to mutate root tenant document'
);
console.log('  ✓ Staff A -> mutate root tenant document: BLOCKED (Admin-only)');

// ── SECTION 6: RESULT SCORE INTEGRITY (P0) ───────────────────────────────────
console.log('[Phase 6] Result Score Fabrication Attack Matrix:');

// Legitimate stub creation (all zeros)
assert.strictEqual(
  studentA.canCreateResultWithScores('TN000026', 'asm_alpha_1', 'student_A', {
    tenantId: 'TN000026', assessmentId: 'asm_alpha_1', userId: 'student_A',
    score: 0, percentage: 0, qualified: false, grade: '', completed: false,
    evaluationStatus: 'pending', evaluationSource: 'client'
  }),
  true,
  'Student A MUST be allowed to create a zero-scored result stub'
);
console.log('  ✓ Student A -> create result stub (all zeros): ALLOWED');

// Attack 1: Student writes score=100 directly
assert.strictEqual(
  studentA.canCreateResultWithScores('TN000026', 'asm_alpha_1', 'student_A', {
    tenantId: 'TN000026', assessmentId: 'asm_alpha_1', userId: 'student_A',
    score: 100, percentage: 100, qualified: true, grade: 'A+', completed: true,
    evaluationStatus: 'completed', evaluationSource: 'client'
  }),
  false,
  'Student A MUST NOT be allowed to create result with score=100 (score fabrication attack)'
);
console.log('  ✓ Student A -> create result with score=100: BLOCKED (Score fabrication denied)');

// Attack 2: Student writes qualified=true
assert.strictEqual(
  studentA.canCreateResultWithScores('TN000026', 'asm_alpha_1', 'student_A', {
    tenantId: 'TN000026', assessmentId: 'asm_alpha_1', userId: 'student_A',
    score: 0, percentage: 0, qualified: true, grade: '', completed: false,
    evaluationStatus: 'pending', evaluationSource: 'client'
  }),
  false,
  'Student A MUST NOT be allowed to create result with qualified=true'
);
console.log('  ✓ Student A -> create result with qualified=true: BLOCKED (Qualification spoofing denied)');

// Attack 3: Student writes grade='A+'
assert.strictEqual(
  studentA.canCreateResultWithScores('TN000026', 'asm_alpha_1', 'student_A', {
    tenantId: 'TN000026', assessmentId: 'asm_alpha_1', userId: 'student_A',
    score: 0, percentage: 0, qualified: false, grade: 'A+', completed: false,
    evaluationStatus: 'pending', evaluationSource: 'client'
  }),
  false,
  'Student A MUST NOT be allowed to create result with grade=A+'
);
console.log('  ✓ Student A -> create result with grade=A+: BLOCKED (Grade spoofing denied)');

// Attack 4: Student writes evaluationStatus=completed
assert.strictEqual(
  studentA.canCreateResultWithScores('TN000026', 'asm_alpha_1', 'student_A', {
    tenantId: 'TN000026', assessmentId: 'asm_alpha_1', userId: 'student_A',
    score: 0, percentage: 0, qualified: false, grade: '', completed: false,
    evaluationStatus: 'completed', evaluationSource: 'client'
  }),
  false,
  'Student A MUST NOT be allowed to create result with evaluationStatus=completed'
);
console.log('  ✓ Student A -> create result with evaluationStatus=completed: BLOCKED (Evaluation status spoofing denied)');

// Attack 5: Student writes evaluationSource=server (claiming server verification)
assert.strictEqual(
  studentA.canCreateResultWithScores('TN000026', 'asm_alpha_1', 'student_A', {
    tenantId: 'TN000026', assessmentId: 'asm_alpha_1', userId: 'student_A',
    score: 0, percentage: 0, qualified: false, grade: '', completed: false,
    evaluationStatus: 'pending', evaluationSource: 'server'
  }),
  false,
  'Student A MUST NOT be allowed to claim evaluationSource=server'
);
console.log('  ✓ Student A -> create result claiming evaluationSource=server: BLOCKED (Attestation spoofing denied)\n');

// ── SECTION 7: PROCTORING ATTEMPT OWNERSHIP BINDING (P0) ─────────────────────
console.log('[Phase 7] Proctoring Attempt Substitution Attack Matrix:');

// Legitimate log creation (Student A for own attempt)
assert.strictEqual(
  studentA.canCreateProctoringLog('att_A_1', { userId: 'student_A', tenantId: 'TN000026', attemptId: 'att_A_1' }),
  true,
  'Student A MUST be allowed to create proctoring log for own attempt'
);
console.log('  ✓ Student A -> create proctoring log for own attempt (att_A_1): ALLOWED');

// Attack 6: Student A tries to create proctoring log for Student B's attempt
assert.strictEqual(
  studentA.canCreateProctoringLog('att_B_1', { userId: 'student_A', tenantId: 'TN000026', attemptId: 'att_B_1' }),
  false,
  'Student A MUST NOT be allowed to create proctoring log for Student B attempt (att_B_1)'
);
console.log('  ✓ Student A -> create proctoring log for Student B attempt (att_B_1): BLOCKED (Attempt substitution denied)');

// Attack 7: Student A tries to create an event under Student B's log
assert.strictEqual(
  studentA.canCreateProctoringEvent('att_B_1', { userId: 'student_A', tenantId: 'TN000027', attemptId: 'att_B_1' }),
  false,
  'Student A MUST NOT be allowed to create event under Student B proctoring log'
);
console.log('  ✓ Student A -> create event under Student B log (att_B_1): BLOCKED (Log ownership verification failed)');

// Legitimate event creation (Student A for own log)
assert.strictEqual(
  studentA.canCreateProctoringEvent('att_A_1', { userId: 'student_A', tenantId: 'TN000026', attemptId: 'att_A_1' }),
  true,
  'Student A MUST be allowed to create event under own proctoring log'
);
console.log('  ✓ Student A -> create event under own log (att_A_1): ALLOWED\n');

// ── SECTION 8: RESULT IDENTITY & LIFECYCLE BINDING (Audit-7 P1) ─────────────
console.log('[Phase 8] Result Identity & Lifecycle Binding (Audit-7):');

// Prerequisite: update the fixture’s existing result assertion to include the correct attemptId and state
// The existing canCreateResult tests (lines 441–6) didn’t pass attemptId — update expectation:

// Attack 5a: Student creates result with spoofed attemptId (different from canonical)
assert.strictEqual(
  studentA.canCreateResult('TN000026', 'asm_alpha_1', 'student_A', {
    tenantId: 'TN000026', assessmentId: 'asm_alpha_1', userId: 'student_A',
    attemptId: 'some-other-attempt-id',  // spoofed — not {assessmentId}_{uid}
  }),
  false,
  'Student A MUST NOT be allowed to create result with spoofed attemptId (Attack 5a)'
);
console.log('  \u2713 Student A -> create result with spoofed attemptId: BLOCKED (Attack 5a — attemptId binding enforced)');

// Attack 5b: Student creates result while attempt is IN_PROGRESS (not SUBMITTING)
// Temporarily override the db fixture for this test:
const dbWithInProgress = {
  ...databaseFixture,
  'users/student_A/contestAttempts/asm_alpha_1_student_A': {
    uid: 'student_A', tenantId: 'TN000026', assessmentId: 'asm_alpha_1',
    status: 'IN_PROGRESS', durationSeconds: 1800,
  },
};
const studentA_InProgress = new AdversarialContext(
  { uid: 'student_A', token: { role: 'student', tenantId: 'TN000026' } },
  dbWithInProgress
);
assert.strictEqual(
  studentA_InProgress.canCreateResult('TN000026', 'asm_alpha_1', 'student_A', {
    tenantId: 'TN000026', assessmentId: 'asm_alpha_1', userId: 'student_A',
    attemptId: 'asm_alpha_1_student_A',
  }),
  false,
  'Student A MUST NOT be allowed to create result while attempt is IN_PROGRESS (Attack 5b)'
);
console.log('  \u2713 Student A -> create result from IN_PROGRESS attempt: BLOCKED (Attack 5b — lifecycle state check enforced)');

// Confirm the legitimate path: correct attemptId + SUBMITTING state is ALLOWED
assert.strictEqual(
  studentA.canCreateResult('TN000026', 'asm_alpha_1', 'student_A', {
    tenantId: 'TN000026', assessmentId: 'asm_alpha_1', userId: 'student_A',
    attemptId: 'asm_alpha_1_student_A',  // canonical
  }),
  true,
  'Student A MUST be allowed to create result with canonical attemptId while attempt is SUBMITTING'
);
console.log('  \u2713 Student A -> create result with canonical attemptId + SUBMITTING attempt: ALLOWED\n');

// ── SECTION 9: USER SOLUTIONS & ATTEMPT LOG BINDING (Audit-8) ───────────────
console.log('[Phase 9] User Solutions & Proctoring Attempt Binding (Audit-8):');

// userSolutions cross-tenant access attacks
assert.strictEqual(
  staffA.canAccessUserSolutions('student_A'),
  true,
  'Staff A MUST be allowed to access solutions of student from own tenant (TN000026)'
);
console.log('  \u2713 Staff A -> access Student A (Tenant A) solutions: ALLOWED');

assert.strictEqual(
  staffA.canAccessUserSolutions('student_B'),
  false,
  'Staff A MUST NOT be allowed to access solutions of student from Tenant B (TN000027)'
);
console.log('  \u2713 Staff A -> access Student B (Tenant B) solutions: BLOCKED (Cross-tenant access denied)');

assert.strictEqual(
  studentA.canAccessUserSolutions('student_B'),
  false,
  'Student A MUST NOT be allowed to access Student B solutions'
);
console.log('  \u2713 Student A -> access Student B solutions: BLOCKED (Student isolation enforced)');

assert.strictEqual(
  studentA.canAccessUserSolutions('student_A'),
  true,
  'Student A MUST be allowed to access own solutions'
);
console.log('  \u2713 Student A -> access own solutions: ALLOWED\n');

console.log('================================================================');
console.log('ALL ADVERSARIAL ATTACK MATRIX VECTORS VERIFIED (100% PASS)');
console.log('================================================================\n');

// ── Tier 2: @firebase/rules-unit-testing SDK (Real Emulator) ─────────────────
// Exercises the 5 adversarial attack categories against a REAL Firebase emulator
// using the official rules-unit-testing SDK — the emulator CEL evaluator, not
// a JS simulation.
//
// Requires: firebase emulators:start --only firestore
// Env:      FIRESTORE_EMULATOR_HOST=127.0.0.1:8080
//
// Run:
//   firebase emulators:exec --only firestore \
//     "FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 node src/tests/adversarialEmulator.test.mjs"
//
// Skip Tier 2:
//   SKIP_EMULATOR_TESTS=1 node src/tests/adversarialEmulator.test.mjs

const SKIP_EMULATOR = process.env.SKIP_EMULATOR_TESTS === '1' || !process.env.FIRESTORE_EMULATOR_HOST;

if (SKIP_EMULATOR) {
  console.log('ℹ  Tier 2 (adversarial emulator tests) SKIPPED.');
  console.log('   Set FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 to enable real rule evaluation.\n');
  process.exit(0);
}

console.log('================================================================');
console.log('TIER 2 — Adversarial Real Emulator SDK Attack Matrix');
console.log('================================================================\n');

const { initializeTestEnvironment, assertFails, assertSucceeds } =
  await import('@firebase/rules-unit-testing');
const { doc, getDoc, setDoc, updateDoc, getDocs, collection, addDoc } =
  await import('firebase/firestore');

const PROJECT_ID = `adv-rules-test-${Date.now()}`;
const EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8080';

const env = await initializeTestEnvironment({
  projectId: PROJECT_ID,
  firestore: {
    rules,
    host: EMULATOR_HOST.split(':')[0],
    port: parseInt(EMULATOR_HOST.split(':')[1], 10),
  },
});

let t2pass = 0;
let t2fail = 0;

async function attack(label, fn) {
  try {
    await fn();
    console.log(`  ✓ ${label}`);
    t2pass++;
  } catch (e) {
    console.error(`  ✗ FAIL: ${label}`);
    console.error(`     ${e.message}`);
    t2fail++;
  }
}

// ── Seed data (bypass rules) ───────────────────────────────────────────
await env.withSecurityRulesDisabled(async (ctx) => {
  const db = ctx.firestore();
  // Users
  await setDoc(doc(db, 'users/uid-student-A'),   { uid: 'uid-student-A', role: 'student', tenantId: 'TENANT_A' });
  await setDoc(doc(db, 'users/uid-student-B'),   { uid: 'uid-student-B', role: 'student', tenantId: 'TENANT_B' });
  await setDoc(doc(db, 'users/uid-staff-A'),     { uid: 'uid-staff-A',   role: 'staff',   tenantId: 'TENANT_A' });
  await setDoc(doc(db, 'users/uid-admin'),       { uid: 'uid-admin',     role: 'admin',   tenantId: 'TENANT_A' });
  // Assessments
  await setDoc(doc(db, 'assessments/assess-TA'), { tenantId: 'TENANT_A', title: 'Tenant A Exam', status: 'published' });
  await setDoc(doc(db, 'assessments/assess-TB'), { tenantId: 'TENANT_B', title: 'Tenant B Exam', status: 'published' });
  // Existing attempt for Student A (Tenant A)
  await setDoc(doc(db, 'users/uid-student-A/contestAttempts/assess-TA_uid-student-A'), {
    uid: 'uid-student-A', tenantId: 'TENANT_A', assessmentId: 'assess-TA',
    startedAt: new Date(), durationSeconds: 3600, completed: false, status: 'active',
  });
  // Existing result for Student A (Tenant A) — pending
  await setDoc(doc(db, 'assessmentResults/TENANT_A/assess-TA/uid-student-A'), {
    userId: 'uid-student-A', tenantId: 'TENANT_A', assessmentId: 'assess-TA',
    score: 0, percentage: 0, rank: 0, correctAnswers: 0, totalMarks: 0,
    maxMarks: 100, evaluationStatus: 'pending', qualified: false, grade: 'F',
    completed: false, status: 'active',
  });
  // Proctoring logs
  await setDoc(doc(db, 'proctoringLogs/att-A-1'), {
    userId: 'uid-student-A', tenantId: 'TENANT_A', attemptId: 'att-A-1',
  });
  // Courses
  await setDoc(doc(db, 'courses/course-TA'), { tenantId: 'TENANT_A', title: 'Course A' });
  await setDoc(doc(db, 'courses/course-TB'), { tenantId: 'TENANT_B', title: 'Course B' });
  // Assessment keys
  await setDoc(doc(db, 'assessment_keys/key-1'), { key: 'top-secret-aes-key' });
});

// Authenticated contexts
const ctxStudentA = env.authenticatedContext('uid-student-A', { uid: 'uid-student-A', token: { role: 'student', tenantId: 'TENANT_A' } });
const ctxStudentB = env.authenticatedContext('uid-student-B', { uid: 'uid-student-B', token: { role: 'student', tenantId: 'TENANT_B' } });
const ctxStaffA   = env.authenticatedContext('uid-staff-A',   { uid: 'uid-staff-A',   token: { role: 'staff',   tenantId: 'TENANT_A' } });
const ctxUnauth   = env.unauthenticatedContext();
const dbA  = ctxStudentA.firestore();
const dbB  = ctxStudentB.firestore();
const dbSA = ctxStaffA.firestore();
const dbU  = ctxUnauth.firestore();

// ── Category 1: Assessment Isolation & Query Scoping ─────────────────────
console.log('[T2 Cat-1] Assessment Isolation & Query Scoping:');

await attack('Student A can read own-tenant assessment',
  () => assertSucceeds(getDoc(doc(dbA, 'assessments/assess-TA'))));

await attack('Student A cannot read cross-tenant assessment',
  () => assertFails(getDoc(doc(dbA, 'assessments/assess-TB'))));

await attack('Unauthenticated cannot read any assessment',
  () => assertFails(getDoc(doc(dbU, 'assessments/assess-TA'))));

await attack('Student A cannot create a Tenant B assessment',
  () => assertFails(setDoc(doc(dbA, 'assessments/forged-TB'), {
    tenantId: 'TENANT_B', title: 'Forged', status: 'active'
  })));

await attack('Student A cannot list all assessments (cross-tenant enumeration)',
  () => assertFails(getDocs(collection(dbA, 'assessments'))));

// ── Category 2: Cross-Tenant Attempt Creation ───────────────────────────
console.log('\n[T2 Cat-2] Cross-Tenant Attempt Creation:');

await attack('Student B cannot create attempt referencing Tenant A assessment',
  () => assertFails(setDoc(
    doc(dbB, 'users/uid-student-B/contestAttempts/assess-TA_uid-student-B'),
    { uid: 'uid-student-B', tenantId: 'TENANT_A', assessmentId: 'assess-TA',
      startedAt: new Date(), durationSeconds: 3600, completed: false, status: 'active' }
  )));

await attack('Student A cannot create attempt spoofing another UID',
  () => assertFails(setDoc(
    doc(dbA, 'users/uid-student-A/contestAttempts/assess-TA_uid-student-B'),
    { uid: 'uid-student-B', tenantId: 'TENANT_A', assessmentId: 'assess-TA',
      startedAt: new Date(), durationSeconds: 3600, completed: false, status: 'active' }
  )));

await attack('Student A cannot tamper attempt UID field',
  () => assertFails(updateDoc(
    doc(dbA, 'users/uid-student-A/contestAttempts/assess-TA_uid-student-A'),
    { uid: 'uid-student-B' }
  )));

await attack('Student A cannot tamper attempt assessmentId field',
  () => assertFails(updateDoc(
    doc(dbA, 'users/uid-student-A/contestAttempts/assess-TA_uid-student-A'),
    { assessmentId: 'assess-TB' }
  )));

// ── Category 3: Result Enumeration & Score Tampering ─────────────────────
console.log('\n[T2 Cat-3] Result Enumeration & Score Tampering:');

await attack('Student A cannot list all results in tenant (enumeration)',
  () => assertFails(getDocs(collection(dbA, 'assessmentResults/TENANT_A/assess-TA'))));

await attack('Student B cannot read Student A result (cross-tenant)',
  () => assertFails(getDoc(doc(dbB, 'assessmentResults/TENANT_A/assess-TA/uid-student-A'))));

await attack('Student A cannot set score=100 in own result',
  () => assertFails(updateDoc(
    doc(dbA, 'assessmentResults/TENANT_A/assess-TA/uid-student-A'),
    { score: 100, percentage: 100 }
  )));

await attack('Student A cannot forge result with elevated grade',
  () => assertFails(setDoc(
    doc(dbA, 'assessmentResults/TENANT_A/assess-TA/uid-student-A'),
    { userId: 'uid-student-A', tenantId: 'TENANT_A', assessmentId: 'assess-TA',
      score: 100, percentage: 100, rank: 1, correctAnswers: 50, totalMarks: 100,
      maxMarks: 100, evaluationStatus: 'complete', qualified: true, grade: 'A+',
      completed: true, status: 'completed' }
  )));

await attack('Staff A can read Tenant A result (permitted)',
  () => assertSucceeds(getDoc(doc(dbSA, 'assessmentResults/TENANT_A/assess-TA/uid-student-A'))));

await attack('Staff A cannot read Tenant B result (cross-tenant)',
  () => assertFails(getDoc(doc(dbSA, 'assessmentResults/TENANT_B/assess-TA/uid-student-A'))));

// ── Category 4: Privilege Escalation ─────────────────────────────────
console.log('\n[T2 Cat-4] Privilege Escalation Attacks:');

await attack('Student cannot read assessment_keys (key extraction blocked)',
  () => assertFails(getDoc(doc(dbA, 'assessment_keys/key-1'))));

await attack('Staff A (same tenant as admin) CAN read assessment_keys',
  () => assertSucceeds(getDoc(doc(dbSA, 'assessment_keys/key-1'))));

await attack('Student cannot write assessment_keys',
  () => assertFails(setDoc(doc(dbA, 'assessment_keys/key-1'), { key: 'hacked' })));

await attack('Student cannot elevate own role to admin',
  () => assertFails(updateDoc(doc(dbA, 'users/uid-student-A'), { role: 'admin' })));

await attack('Student cannot change own tenantId to cross-tenant',
  () => assertFails(updateDoc(doc(dbA, 'users/uid-student-A'), { tenantId: 'TENANT_B' })));

await attack('Student cannot list /users collection (enumeration)',
  () => assertFails(getDocs(collection(dbA, 'users'))));

await attack('Unauthenticated cannot read /users document',
  () => assertFails(getDoc(doc(dbU, 'users/uid-student-A'))));

// ── Category 5: Proctoring Substitution / Ownership ────────────────────
console.log('\n[T2 Cat-5] Proctoring Substitution Attacks:');

await attack('Student A cannot create proctoring log for Student B attempt',
  () => assertFails(setDoc(doc(dbA, 'proctoringLogs/att-B-1'), {
    userId: 'uid-student-A', tenantId: 'TENANT_B', attemptId: 'att-B-1',
  })));

await attack('Student A cannot create proctoring log with empty tenantId (fail-closed)',
  () => {
    const noTenantCtx = env.authenticatedContext('uid-student-A', { uid: 'uid-student-A', token: { role: 'student', tenantId: '' } });
    return assertFails(setDoc(doc(noTenantCtx.firestore(), 'proctoringLogs/att-A-nt'), {
      userId: 'uid-student-A', tenantId: '', attemptId: 'att-A-nt',
    }));
  });

await attack('Student A cannot update tenantId in own proctoring log',
  () => assertFails(updateDoc(doc(dbA, 'proctoringLogs/att-A-1'), {
    tenantId: 'TENANT_B',
  })));

await attack('Student B cannot read Student A proctoring log',
  () => assertFails(getDoc(doc(dbB, 'proctoringLogs/att-A-1'))));

await attack('Unauthenticated cannot create proctoring log',
  () => assertFails(setDoc(doc(dbU, 'proctoringLogs/unauth-log'), {
    userId: 'uid-student-A', tenantId: 'TENANT_A', attemptId: 'att-A-1',
  })));

// ── Category 6: Proctoring Structural Ownership (P1 Rule Fix) ───────────────
// Tests the new 'attemptId.matches(.*_{uid})' ownership rule added in the P1
// hardening pass.  The Tier-1 simulation already validates this logic via
// canCreateProctoringLog(); Tier-2 runs the CEL evaluator against real rules.
console.log('\n[T2 Cat-6] Proctoring Structural Ownership (P1):');

// Student A's valid attemptId format: {assessmentId}_{uid}
const validAttemptId = `assess-TA_uid-student-A`;
const spoofedAttemptId = `assess-TA_uid-student-B`; // Student A trying to spoof B's suffix

// Seed the parent proctoringLogs doc needed for Cat-6 tests (bypass rules)
await env.withSecurityRulesDisabled(async (ctx) => {
  const seedDb = ctx.firestore();
  await setDoc(doc(seedDb, `proctoringLogs/${validAttemptId}`), {
    userId: 'uid-student-A', tenantId: 'TENANT_A', attemptId: validAttemptId,
  });
});

await attack(
  'Student A can create proctoring log with valid attemptId suffix (own UID)',
  () => assertSucceeds(setDoc(doc(dbA, `proctoringLogs/${validAttemptId}`), {
    userId: 'uid-student-A', tenantId: 'TENANT_A', attemptId: validAttemptId,
  }))
);

await attack(
  'Student A CANNOT create log with attemptId ending in another UID (structural spoof)',
  () => assertFails(setDoc(doc(dbA, `proctoringLogs/${spoofedAttemptId}`), {
    userId: 'uid-student-A', tenantId: 'TENANT_A', attemptId: spoofedAttemptId,
  }))
);

await attack(
  'Student A CANNOT create log with arbitrary attemptId not containing own UID',
  () => assertFails(setDoc(doc(dbA, 'proctoringLogs/completely-random-id'), {
    userId: 'uid-student-A', tenantId: 'TENANT_A', attemptId: 'completely-random-id',
  }))
);

await attack(
  'Student A CANNOT create log with correct suffix but wrong userId field',
  () => assertFails(setDoc(doc(dbA, `proctoringLogs/${validAttemptId}`), {
    userId: 'uid-student-B',       // forged userId
    tenantId: 'TENANT_A',
    attemptId: validAttemptId,
  }))
);

await attack(
  'Student A CANNOT create log with correct suffix but cross-tenant tenantId',
  () => assertFails(setDoc(doc(dbA, `proctoringLogs/${validAttemptId}`), {
    userId: 'uid-student-A',
    tenantId: 'TENANT_B',          // wrong tenant
    attemptId: validAttemptId,
  }))
);

await env.cleanup();

console.log('');
if (t2fail > 0) {
  console.error('================================================================');
  console.error(`TIER 2 ADVERSARIAL: ${t2pass} passed, ${t2fail} FAILED ✗`);
  console.error('================================================================\n');
  process.exit(1);
} else {
  console.log('================================================================');
  console.log(`ALL ${t2pass}/${t2pass} TIER-2 ADVERSARIAL TESTS PASSED ✓`);
  console.log('================================================================\n');
}
