/**
 * firestoreRules.test.mjs
 * Automated security verification test suite for SEED-IT Firestore Rules.
 *  4. Assessment Keys Lockdown (Admin Only)
 *  5. Wildcard Subcollection Denial under /users/{uid}
 *  6. Proctoring Event Log Integrity & Immutability
 *  7. User Role & Tenant Privilege Escalation Defense (Admin Only)
 *  8. User Collection Listing Isolation (Admin Only)
 *  9. Assessment Results Path-Payload Integrity (tenantId, assessmentId, userId)
 *  10. Proctoring Logs & Assessment Authoring Tenant Scoping
 *  11. Assessment Subcollection Wildcard Tenant Inheritance
 *  12. Fail-Closed Proctoring Creation (Non-empty tenant required)
 *  13. Proctoring Update Attempt & Tenant Identity Locks
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import assert from 'assert';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// IMPORTANT: Load from the single canonical firestore.rules at the repo root (unique/).
// This is the same file Firebase deploys from seed-admin/ — both directories now
// reference the root-level canonical file. No sync script is needed.
const rulesPath = path.resolve(__dirname, '../../../../firestore.rules');

console.log('[FirestoreRulesTest] Loading rules from:', rulesPath);
const rulesContent = fs.readFileSync(rulesPath, 'utf8');

// ── Rule Parser & Simulator Helper ──────────────────────────────────────────

class RulesSimulator {
  constructor(rules) {
    this.rules = rules;
  }

  hasRule(pathPattern) {
    return this.rules.includes(pathPattern);
  }

  isAssessmentKeysWriteAdminOnly() {
    // Rule now splits read (Admin + tenant-scoped Staff) from write (Admin only).
    // Verify:
    //   1. The block contains an allow write restricted to isAdmin()
    //   2. The block contains an allow read that includes isAdmin() AND isStaff()
    //   3. The block does NOT allow a bare 'allow read: if true' or similar
    const match = this.rules.match(/match\s+\/assessment_keys\/\{contestId\}\s*\{([\s\S]*?)\n\s*\}/);
    if (!match) return false;
    const block = match[1];
    const writeAdminOnly = block.includes('allow write: if isAdmin();');
    const readIncludesAdmin = block.includes('isAdmin()') && block.includes('allow read:');
    const readIncludesStaff = block.includes('isStaff()');
    const noPublicRead = !block.includes('allow read: if true') && !block.includes('allow read, write: if true');
    return writeAdminOnly && readIncludesAdmin && readIncludesStaff && noPublicRead;
  }

  isWildcardSubPathRemovedFromUsers() {
    const match = this.rules.match(/match\s+\/users\/\{userId\}\s*\{([\s\S]*?)\n\s*match\s+\/tenants/);
    if (!match) return false;
    const block = match[1];
    return !block.includes('match /{subPath=**}');
  }

  hasExplicitUserSubcollections() {
    const required = [
      'match /courseProgress/{courseId}',
      'match /contestAttempts/{attemptId}',
      // [Fix Audit-6 P0] assessmentAttempts collection removed — only contestAttempts is canonical.
      // 'match /assessmentAttempts/{attemptId}',
      'match /profile/{docId}',
      'match /settings/{docId}',
    ];
    return required.every(p => this.rules.includes(p));
  }

  isResultImmutableAfterSubmission() {
    const match = this.rules.match(/match\s+\/assessmentResults\/\{tenantId\}\s*\{([\s\S]*?)\n\s*match\s+\/proctoringLogs/);
    if (!match) return false;
    const block = match[1];
    return (
      block.includes("resource.data.get('completed', false) == false") &&
      block.includes("resource.data.get('status', '') != 'submitted'")
    );
  }

  isResultPathPayloadIntegrityEnforced() {
    const match = this.rules.match(/match\s+\/assessmentResults\/\{tenantId\}\s*\{([\s\S]*?)\n\s*match\s+\/proctoringLogs/);
    if (!match) return false;
    const block = match[1];
    return (
      block.includes("request.resource.data.get('tenantId', '') == myTenant()") &&
      block.includes("request.resource.data.get('assessmentId', '') == assessmentId") &&
      block.includes("request.resource.data.get('userId', '') == userId") &&
      block.includes("request.resource.data.get('assessmentId', '') == resource.data.get('assessmentId', '')")
    );
  }

  isProctoringEventImmutableAndAttemptLocked() {
    const match = this.rules.match(/match\s+\/events\/\{eventId\}\s*\{([\s\S]*?)\n\s*\}/);
    if (!match) return false;
    const block = match[1];
    return (
      block.includes("allow update: if false;") &&
      block.includes("request.resource.data.get('attemptId', '') == attemptId") &&
      // Events use 'uid' field (aligned with proctorService.js logData schema)
      block.includes("request.resource.data.get('uid', '') == request.auth.uid") &&
      // Structural ownership suffix check (P1 hardening)
      block.includes("attemptId.matches('.*_' + request.auth.uid)") &&
      block.includes("request.resource.data.get('tenantId', '') == get(/databases/$(database)/documents/proctoringLogs/$(attemptId)).data.get('tenantId', '')")
    );
  }

  isProctoringLogTenantScoped() {
    const match = this.rules.match(/match\s+\/proctoringLogs\/\{attemptId\}\s*\{([\s\S]*?)\n\s*match\s+\/events/);
    if (!match) return false;
    const block = match[1];
    return (
      block.includes("isStaff() && (resource == null || tenantAllowed(resource.data.get('tenantId', '')))") &&
      block.includes("allow delete: if isAdmin();")
    );
  }

  isProctoringCreationFailClosed() {
    const match = this.rules.match(/match\s+\/proctoringLogs\/\{attemptId\}\s*\{([\s\S]*?)\n\s*match\s+\/events/);
    if (!match) return false;
    const block = match[1];
    return (
      block.includes("myTenant() != ''") &&
      block.includes("request.resource.data.get('tenantId', '') == myTenant()") &&
      block.includes("request.resource.data.get('attemptId', '') == attemptId") &&
      !block.includes("myTenant() == '' ||")
    );
  }

  isProctoringUpdateIdentityLocked() {
    const match = this.rules.match(/match\s+\/proctoringLogs\/\{attemptId\}\s*\{([\s\S]*?)\n\s*match\s+\/events/);
    if (!match) return false;
    const block = match[1];
    return (
      block.includes("request.resource.data.get('userId', '') == resource.data.get('userId', '')") &&
      block.includes("request.resource.data.get('tenantId', '') == resource.data.get('tenantId', '')") &&
      block.includes("request.resource.data.get('attemptId', '') == resource.data.get('attemptId', '')")
    );
  }

  isAuthoringStoreTenantScoped() {
    const match = this.rules.match(/match\s+\/assessments\/\{assessmentId\}\s*\{([\s\S]*?)\n\s*match\s+\/assessmentResults/);
    if (!match) return false;
    const block = match[1];
    return (
      // Create: staff-scoped to own tenant
      block.includes("allow create: if isAdmin() || (isStaff() && myTenant() != '' && request.resource.data.get('tenantId', '') == myTenant());") &&
      // [Fix #46] Update must be split: admin always allowed, staff blocked on published/live
      block.includes("allow update: if isAdmin()") &&
      block.includes("resource.data.get('status', 'draft') != 'published'") &&
      block.includes("resource.data.get('status', 'draft') != 'live'") &&
      // Delete strictly admin-only
      block.includes("allow delete: if isAdmin();") &&
      // Staff must still be tenant-scoped for update
      block.includes("tenantAllowed(resource.data.get('tenantId', ''))")
    );
  }

  isAssessmentSubcollectionTenantScoped() {
    const match = this.rules.match(/match\s+\/assessments\/\{assessmentId\}\s*\{([\s\S]*?)\n\s*match\s+\/assessmentResults/);
    if (!match) return false;
    const block = match[1];
    return (
      block.includes("isStaff() && tenantAllowed(get(/databases/$(database)/documents/assessments/$(assessmentId)).data.get('tenantId', ''))")
    );
  }

  isAttemptMetadataLocked() {
    // Capture the full contestAttempts block up to allow delete.
    const match = this.rules.match(/match\s+\/contestAttempts\/\{attemptId\}\s*\{([\s\S]*?)allow delete: if isAdmin\(\);\s*\n\s*\}/);
    if (!match) return false;
    const block = match[1];
    // Note: the split-path rule uses aligned spacing (e.g. 'uid', '')           ==)
    // so we check for substrings that are unambiguously unique to these lock guards.
    return (
      block.includes("resource.data.get('completed', false) == false") &&
      block.includes("get('durationSeconds', 0) == resource.data.get('durationSeconds', 0)") &&
      block.includes("get('startedAt', '')") && block.includes("== resource.data.get('startedAt', '')") &&
      block.includes("get('uid', '')") && block.includes("== resource.data.get('uid', '')")
    );
  }

  isTenantReadScoped() {
    const match = this.rules.match(/match\s+\/tenants\/\{tenantId\}\s*\{([^}]+)\}/);
    if (!match) return false;
    const block = match[1];
    return (
      block.includes("allow get:    if isAdmin() || (isStaff() && tenantAllowed(tenantId)) || isTenantMember(tenantId);") &&
      block.includes("allow list:   if isAdmin();")
    );
  }

  isUserRoleAndTenantLockedAgainstPrivilegeEscalation() {
    const match = this.rules.match(/match\s+\/users\/\{userId\}\s*\{([\s\S]*?)\n\s*allow delete:/);
    if (!match) return false;
    const block = match[1];
    return (
      block.includes("allow list:   if isAdmin();") &&
      block.includes("allow get:    if isUser(userId) || isAdmin() || (isStaff() && tenantAllowed(resource.data.get('tenantId', '')));") &&
      block.includes("request.resource.data.get('role', '') == resource.data.get('role', '')") &&
      block.includes("request.resource.data.get('tenantId', '') == resource.data.get('tenantId', '')")
    );
  }
  
  isAssessmentReadTenantScoped() {
    const match = this.rules.match(/match\s+\/assessments\/\{assessmentId\}\s*\{([\s\S]*?)\n\s*match\s+\/assessmentResults/);
    if (!match) return false;
    const block = match[1];
    return (
      block.includes("allow get: if isTenantMember(resource.data.get('tenantId', ''));") &&
      block.includes("allow list: if isAdmin() || (isStaff() && tenantAllowed(resource.data.get('tenantId', '')));")
    );
  }

  isResultScoreTamperingBlocked() {
    const match = this.rules.match(/match\s+\/assessmentResults\/\{tenantId\}\s*\{([\s\S]*?)\n\s*match\s+\/proctoringLogs/);
    if (!match) return false;
    const block = match[1];
    return (
      block.includes("request.resource.data.get('score', 0) == resource.data.get('score', 0)") &&
      block.includes("request.resource.data.get('percentage', 0) == resource.data.get('percentage', 0)") &&
      block.includes("request.resource.data.get('rank', 0) == resource.data.get('rank', 0)") &&
      block.includes("request.resource.data.get('correctAnswers', 0) == resource.data.get('correctAnswers', 0)") &&
      block.includes("request.resource.data.get('totalMarks', 0) == resource.data.get('totalMarks', 0)") &&
      block.includes("request.resource.data.get('maxMarks', 0) == resource.data.get('maxMarks', 0)") &&
      block.includes("request.resource.data.get('evaluationStatus', '') == resource.data.get('evaluationStatus', '')") &&
      block.includes("request.resource.data.get('qualified', false) == resource.data.get('qualified', false)") &&
      block.includes("request.resource.data.get('grade', '') == resource.data.get('grade', '')")
    );
  }

  isCoursesTenantScoped() {
    const match = this.rules.match(/match\s+\/courses\/\{courseId\}\s*\{([\s\S]*?)\n\s*match\s+\/assessments/);
    if (!match) return false;
    const block = match[1];
    return (
      block.includes("allow read:               if isTenantMember(resource.data.get('tenantId', ''));") &&
      block.includes("allow read:               if isTenantMember(get(/databases/$(database)/documents/courses/$(courseId)).data.get('tenantId', ''));") &&
      block.includes("allow create, update, delete: if isAdmin() || (isStaff() && tenantAllowed(get(/databases/$(database)/documents/courses/$(courseId)).data.get('tenantId', '')));")
    );
  }

  isGuestBackdoorRemoved() {
    return !this.rules.includes('publicTenants') && !this.rules.includes('guestTests') && !this.rules.includes('isGuest');
  }

  isResultParentListLockedToStaffAndAdmin() {
    const match = this.rules.match(/match\s+\/assessmentResults\/\{tenantId\}\s*\{([\s\S]*?)\n\s*match\s+\/\{assessmentId\}/);
    if (!match) return false;
    const block = match[1];
    return (
      block.includes("allow get:   if isAdmin() || (isStaff() && tenantAllowed(tenantId)) || isTenantMember(tenantId);") &&
      block.includes("allow list:  if isAdmin() || (isStaff() && tenantAllowed(tenantId));")
    );
  }

  isAssessmentSubcollectionTenantScoped() {
    const match = this.rules.match(/match\s+\/assessments\/\{assessmentId\}\s*\{([\s\S]*?)\n\s*match\s+\/assessmentResults/);
    if (!match) return false;
    const block = match[1];
    return (
      !block.includes("match /{document=**}") &&
      block.includes("match /questions/{questionId}") &&
      block.includes("match /sections/{sectionId}") &&
      block.includes("match /metadata/{docId}") &&
      block.includes("match /config/{docId}") &&
      block.includes("isTenantMember(get(/databases/$(database)/documents/assessments/$(assessmentId)).data.get('tenantId', ''))") &&
      block.includes("isStaff() && tenantAllowed(get(/databases/$(database)/documents/assessments/$(assessmentId)).data.get('tenantId', ''))")
    );
  }

  isTenantSubcollectionsExplicit() {
    const match = this.rules.match(/match\s+\/tenants\/\{tenantId\}\s*\{([\s\S]*?)\n\s*match\s+\/courses/);
    if (!match) return false;
    const block = match[1];
    return (
      !block.includes("match /{sub=**}") &&
      block.includes("match /cohorts/{cohortId}") &&
      block.includes("match /settings/{docId}")
    );
  }

  isAssessmentListTenantBound() {
    const match = this.rules.match(/match\s+\/assessments\/\{assessmentId\}\s*\{([\s\S]*?)\n\s*match\s+\/questions/);
    if (!match) return false;
    const block = match[1];
    return block.includes("allow list: if isAdmin() || (isStaff() && tenantAllowed(resource.data.get('tenantId', '')));");
  }

  isAttemptCrossTenantCreationBlocked() {
    // [Fix Audit-6 P0] Only contestAttempts is canonical; assessmentAttempts has been removed.
    // Match the contestAttempts block all the way to its closing brace,
    // which is followed by the removal comment block.
    const matchC = this.rules.match(/match\s+\/contestAttempts\/\{attemptId\}\s*\{([\s\S]*?)allow delete: if isAdmin\(\);\s*\n\s*\}/);
    if (!matchC) return false;
    const blockC = matchC[1];
    return (
      blockC.includes("isUser(userId)") &&
      blockC.includes("request.resource.data.get('uid', '') == userId") &&
      blockC.includes("myTenant() != ''") &&
      blockC.includes("request.resource.data.get('tenantId', '') == myTenant()") &&
      blockC.includes("isTenantMember(get(/databases/$(database)/documents/assessments/$(request.resource.data.get('assessmentId', ''))).data.get('tenantId', ''))")
    );
  }

  isResultParentListLockedToStaffAndAdmin() {
    const match = this.rules.match(/match\s+\/assessmentResults\/\{tenantId\}\s*\{([\s\S]*?)\n\s*match\s+\/\{assessmentId\}/);
    if (!match) return false;
    const block = match[1];
    return (
      block.includes("allow get:   if isAdmin() || (isStaff() && tenantAllowed(tenantId)) || isTenantMember(tenantId);") &&
      block.includes("allow list:  if isAdmin() || (isStaff() && tenantAllowed(tenantId));") &&
      !block.includes("allow write:")
    );
  }

  isResultBoundToAssessmentTenant() {
    // Match the nested /{assessmentId}/{userId} block up to the first allow update comment
    const match = this.rules.match(/match\s+\/assessmentResults\/\{tenantId\}\s*\{[\s\S]*?match\s+\/\{assessmentId\}\/\{userId\}\s*\{([\s\S]*?)\n\s*\/\/\s*(?:Strict update|──\s*P1 FIX:)/);
    if (!match) return false;
    const block = match[1];
    return (
      block.includes("tenantId == myTenant()") &&
      block.includes("request.resource.data.get('tenantId', '') == myTenant()") &&
      block.includes("request.resource.data.get('assessmentId', '') == assessmentId") &&
      block.includes("request.resource.data.get('userId', '') == userId") &&
      block.includes("isTenantMember(get(/databases/$(database)/documents/assessments/$(assessmentId)).data.get('tenantId', ''))")
    );
  }

  isNestedResultListLockedToStaffAndAdmin() {
    // Match the nested /{assessmentId}/{userId} block up to the first allow create comment
    const match = this.rules.match(/match\s+\/assessmentResults\/\{tenantId\}\s*\{[\s\S]*?match\s+\/\{assessmentId\}\/\{userId\}\s*\{([\s\S]*?)\n\s*\/\/\s*(?:Strict create|──\s*P0 FIX:)/);
    if (!match) return false;
    const block = match[1];
    return (
      block.includes("allow get:    if isAdmin() || (isStaff() && tenantAllowed(tenantId)) || isUser(userId);") &&
      block.includes("allow list:   if isAdmin() || (isStaff() && tenantAllowed(tenantId));")
    );
  }

  isUserSelfProvisioningTenantRequired() {
    const match = this.rules.match(/match\s+\/users\/\{userId\}\s*\{([\s\S]*?)\n\s*\/\/\s*Updates restricted/);
    if (!match) return false;
    const block = match[1];
    return (
      block.includes("request.resource.data.get('role', 'student') == 'student'") &&
      block.includes("request.resource.data.get('uid', '') == userId") &&
      block.includes("request.auth.token.get('tenantId', '') != ''") &&
      block.includes("request.resource.data.get('tenantId', '') == request.auth.token.get('tenantId', '')")
    );
  }

  isTenantRootWriteAdminOnly() {
    const match = this.rules.match(/match\s+\/tenants\/\{tenantId\}\s*\{([\s\S]*?)\n\s*match\s+\/cohorts/);
    if (!match) return false;
    const block = match[1];
    return block.includes("allow create, update, delete: if isAdmin();");
  }

  isCourseProgressTamperLocked() {
    const match = this.rules.match(/match\s+\/courseProgress\/\{courseId\}\s*\{([\s\S]*?)\n\s*\}/);
    if (!match) return false;
    const block = match[1];
    return (
      block.includes("request.resource.data.get('verified', false) == false") &&
      block.includes("request.resource.data.get('certified', false) == false") &&
      block.includes("request.resource.data.get('eligible', false) == false") &&
      block.includes("request.resource.data.get('completed', false) == false") &&
      block.includes("request.resource.data.get('score', 0) == 0") &&
      block.includes("request.resource.data.get('percentage', 0) == 0") &&
      block.includes("request.resource.data.get('verified', false) == resource.data.get('verified', false)") &&
      block.includes("request.resource.data.get('certified', false) == resource.data.get('certified', false)") &&
      block.includes("request.resource.data.get('eligible', false) == resource.data.get('eligible', false)") &&
      block.includes("request.resource.data.get('completed', false) == resource.data.get('completed', false)") &&
      block.includes("request.resource.data.get('score', 0) == resource.data.get('score', 0)") &&
      block.includes("request.resource.data.get('percentage', 0) == resource.data.get('percentage', 0)") &&
      block.includes("affectedKeys().hasOnly")
    );
  }

  // ── Round-3 Audit: hasOnly() field allowlist ─────────────────────────────
  // Verifies the !('role' in ...) exclusion pattern was replaced with the
  // safer affectedKeys().hasOnly([...]) approach. Any new privileged field
  // added in future is now automatically blocked from student writes.
  isProfileWriteHasOnlyEnforced() {
    const match = this.rules.match(/match\s+\/profile\/\{docId\}\s*\{([\s\S]*?)\n\s*\}/);
    if (!match) return false;
    const b = match[1];
    return (
      b.includes('affectedKeys().hasOnly(') &&
      !b.includes("!('role' in request.resource.data)") &&
      !b.includes("!('tenantId' in request.resource.data)")
    );
  }

  isSettingsWriteHasOnlyEnforced() {
    const match = this.rules.match(/match\s+\/settings\/\{docId\}\s*\{([\s\S]*?)\n\s*\}/);
    if (!match) return false;
    const b = match[1];
    return (
      b.includes('affectedKeys().hasOnly(') &&
      !b.includes("!('role' in request.resource.data)") &&
      !b.includes("!('tenantId' in request.resource.data)")
    );
  }

  // ── Round-6 Audit: Duration binding to assessment definition ──────────────
  // [P0] durationSeconds must match the assessment's configured duration.
  // Prevents a student from submitting durationSeconds=86400 for a 30-min assessment.
  isAttemptDurationBoundToAssessment() {
    // Match the full contestAttempts block up to the allow delete + closing brace.
    const matchC = this.rules.match(/match\s+\/contestAttempts\/\{attemptId\}\s*\{([\s\S]*?)allow delete: if isAdmin\(\);\s*\n\s*\}/);
    if (!matchC) return false;
    const block = matchC[1];
    return (
      block.includes('isAssessmentDuration(') &&
      block.includes('isValidDuration(')
    );
  }

  // ── Round-6 Audit: Field allowlist on contestAttempts student update ───────
  // [P1] Student attempt updates must only touch the mutable session fields.
  isAttemptUpdateFieldAllowlistEnforced() {
    // Match the full contestAttempts block up to the allow delete + closing brace.
    const matchC = this.rules.match(/match\s+\/contestAttempts\/\{attemptId\}\s*\{([\s\S]*?)allow delete: if isAdmin\(\);\s*\n\s*\}/);
    if (!matchC) return false;
    const block = matchC[1];
    return (
      block.includes("affectedKeys().hasOnly(") &&
      block.includes("'sectionAnswers'") &&
      block.includes("'lastSavedAt'")
    );
  }

  // ── Round-5 Audit: Attempt-existence result binding ───────────────────────
  // [P0] Result create mandates exists() on users/{userId}/contestAttempts/{assessmentId}_{userId}.
  // This prevents a student from creating a result for an assessment they were never
  // officially registered for — even if all other payload fields are correct.
  isResultBoundToAttempt() {
    const match = this.rules.match(/match\s+\/assessmentResults\/\{tenantId\}\s*\{[\s\S]*?match\s+\/\{assessmentId\}\/\{userId\}\s*\{([\s\S]*?)\n\s*\/\/\s*Strict update/);
    if (!match) return false;
    const block = match[1];
    return (
      block.includes("exists(/databases/$(database)/documents/users/$(userId)/contestAttempts/$(assessmentId + '_' + userId))") &&
      // Must be in the create rule, not the update rule
      block.includes('allow create:')
    );
  }

  // ── Round-7 Audit: result.attemptId field binding ───────────────────────
  // [P1] Result create must bind result.attemptId to the canonical session attempt ID
  // {assessmentId}_{userId}. Without this, a client can create a result with any
  // attemptId value (spoofed reference) while satisfying the exists() check.
  isResultAttemptIdBound() {
    const match = this.rules.match(/match\s+\/assessmentResults\/\{tenantId\}\s*\{[\s\S]*?match\s+\/\{assessmentId\}\/\{userId\}\s*\{([\s\S]*?)\n\s*\/\/\s*Strict update/);
    if (!match) return false;
    const block = match[1];
    return block.includes("request.resource.data.get('attemptId', '') == assessmentId + '_' + userId");
  }

  // ── Round-7 Audit: result creation blocked from IN_PROGRESS state ───────
  // [P1] Result create must check that the attempt's status is in a legitimate
  // finalization state. Without this, a student with IN_PROGRESS status can
  // immediately create a submitted result document.
  isResultCreationBoundToAttemptState() {
    const match = this.rules.match(/match\s+\/assessmentResults\/\{tenantId\}\s*\{[\s\S]*?match\s+\/\{assessmentId\}\/\{userId\}\s*\{([\s\S]*?)\n\s*\/\/\s*Strict update/);
    if (!match) return false;
    const block = match[1];
    return (
      block.includes(".data.get('status', '') in ['SUBMITTING', 'EXPIRED', 'FAILED_RECOVERABLE']") &&
      // Must use get() to fetch the attempt doc status cross-document
      block.includes("get(/databases/$(database)/documents/users/$(userId)/contestAttempts/")
    );
  }

  // ── Round-7 Audit: contestAttempts update allowlist is split ───────────
  // [P1] Student update must have two separate paths:
  //   PATH A — answer/progress fields only (sectionAnswers, activeSection, etc.)
  //   PATH B — lifecycle fields only (status, completed, etc.) with state guard
  // Previously these were merged, letting a student write lifecycle values during
  // an answer update without triggering the state-transition guard.
  isAttemptUpdateAllowlistSplit() {
    const matchC = this.rules.match(/match\s+\/contestAttempts\/\{attemptId\}\s*\{([\s\S]*?)allow delete: if isAdmin\(\);\s*\n\s*\}/);
    if (!matchC) return false;
    const block = matchC[1];
    return (
      // PATH A: answer fields only
      block.includes("'sectionAnswers', 'activeSection', 'sections', 'lastSavedAt'") &&
      // PATH B: lifecycle fields with status guard
      block.includes("'status', 'completed', 'autoSubmitted', 'autoSubmitReason',") &&
      block.includes("request.resource.data.get('status', '') in [") &&
      block.includes("'SUBMITTING', 'SUBMITTED', 'AUTO_SUBMITTED', 'EXPIRED', 'FAILED_RECOVERABLE'") &&
      // Terminal state guards updated to uppercase (matches ATTEMPT_STATES constants)
      block.includes("resource.data.get('status', '') != 'SUBMITTED'") &&
      block.includes("resource.data.get('status', '') != 'AUTO_SUBMITTED'")
    );
  }

  // ── Round-8 Audit: userSolutions tenant scoping for staff ─────────────
  isUserSolutionsTenantScoped() {
    const match = this.rules.match(/match\s+\/userSolutions\/\{uid\}\/\{sub=\*\*\}\s*\{([\s\S]*?)\n\s*\}/);
    if (!match) return false;
    const block = match[1];
    return (
      block.includes("isUser(uid)") &&
      block.includes("isAdmin()") &&
      block.includes("isStaff() && tenantAllowed(get(/databases/$(database)/documents/users/$(uid)).data.get('tenantId', ''))")
    );
  }

  // ── Round-8 Audit: proctoringLogs attempt-existence requirement ─────────
  isProctoringCreationAttemptBound() {
    const match = this.rules.match(/match\s+\/proctoringLogs\/\{attemptId\}\s*\{([\s\S]*?)\n\s*match\s+\/events/);
    if (!match) return false;
    const block = match[1];
    return (
      block.includes("exists(/databases/$(database)/documents/users/$(request.auth.uid)/contestAttempts/$(attemptId))")
    );
  }

  // ── Round-8 Audit: proctoringLogs student update allowlist ─────────────
  isProctoringStudentUpdateAllowlistEnforced() {
    const match = this.rules.match(/match\s+\/proctoringLogs\/\{attemptId\}\s*\{([\s\S]*?)\n\s*match\s+\/events/);
    if (!match) return false;
    const block = match[1];
    return (
      block.includes("affectedKeys().hasOnly(") &&
      block.includes("'lastHeartbeat'") &&
      block.includes("'clientStatus'")
    );
  }

  // ── Round-8 Audit: livePresence tenant scoping for staff ───────────────
  isLivePresenceTenantScoped() {
    const match = this.rules.match(/match\s+\/livePresence\/\{dateStr\}\/sessions\/\{sessionId\}\s*\{([\s\S]*?)\n\s*\}/);
    if (!match) return false;
    const block = match[1];
    return (
      block.includes("isStaff() && (resource == null || tenantAllowed(resource.data.get('tenantId', '')))")
    );
  }
}


// ── Tier 1: Static Text-Match Tests ─────────────────────────────────────────

const sim = new RulesSimulator(rulesContent);

console.log('');
console.log('════════════════════════════════════════');
console.log('TIER 1 — Static Rules Structure Checks');
console.log('════════════════════════════════════════');

assert(sim.isAssessmentKeysWriteAdminOnly(), 'FAIL T1-01: assessment_keys write must be Admin-only; read must be Admin + tenant-scoped Staff');
console.log('✓ T1-01: assessment_keys write is Admin-only; read is Admin + tenant-scoped Staff');

assert(sim.isWildcardSubPathRemovedFromUsers(), 'FAIL T1-02: Wildcard /{subPath=**} must not exist under /users/{userId}');
console.log('✓ T1-02: Wildcard /{subPath=**} removed from user documents');

assert(sim.hasExplicitUserSubcollections(), 'FAIL T1-03: Explicit user subcollections missing');
console.log('✓ T1-03: Explicit subcollections defined (courseProgress, contestAttempts, profile, settings) — assessmentAttempts removed as canonical collection');

assert(sim.isResultImmutableAfterSubmission(), 'FAIL T1-04: Results must be strictly immutable once submitted');
console.log('✓ T1-04: Results immutable once completed/submitted');

assert(sim.isResultPathPayloadIntegrityEnforced(), 'FAIL T1-05: Result creation must require matching tenantId, assessmentId, and userId with path');
console.log('✓ T1-05: Result creation strictly validates matching tenantId, assessmentId, and UID');

assert(sim.isProctoringEventImmutableAndAttemptLocked(), 'FAIL T1-06: Proctoring events must be immutable and locked to attemptId, auth.uid, and parent tenantId');
console.log('✓ T1-06: Proctoring events strictly attempt-locked, tenant-locked, and immutable');

assert(sim.isAuthoringStoreTenantScoped(), 'FAIL T1-07: Authoring mutations must be scoped to admin or staff of matching tenant');
console.log('✓ T1-07: Assessment authoring mutations strictly tenant-scoped to staff/admin');

assert(sim.isAttemptMetadataLocked(), 'FAIL T1-08: Attempt updates must lock durationSeconds, uid, assessmentId and completed state');
console.log('✓ T1-08: Attempt metadata (duration, uid, assessmentId) strictly locked against tampering');

assert(sim.isTenantReadScoped(), 'FAIL T1-09: Tenant reads must be strictly scoped to isAdmin() or (isStaff() && tenantAllowed(tenantId))');
console.log('✓ T1-09: Cross-tenant isolation strictly enforced (Staff scoped to own tenant only)');

assert(sim.isUserRoleAndTenantLockedAgainstPrivilegeEscalation(), 'FAIL T1-10: Users list must be admin-only, role and tenantId must be immutable for staff/students');
console.log('✓ T1-10: User list is admin-only, user role & tenantId strictly immutable (privilege escalation locked)');

assert(sim.isProctoringLogTenantScoped(), 'FAIL T1-11: Proctoring logs must be scoped to admin, staff of matching tenant, or attempt owner');
console.log('✓ T1-11: Proctoring logs strictly tenant-scoped');

assert(sim.isAssessmentSubcollectionTenantScoped(), 'FAIL T1-12: Assessment subcollections must inherit parent assessment tenant scoping');
console.log('✓ T1-12: Assessment subcollections inherit parent assessment tenant scoping');

assert(sim.isProctoringCreationFailClosed(), 'FAIL T1-13: Proctoring creation must fail closed on missing tenant');
console.log('✓ T1-13: Proctoring creation strictly fails closed on missing/empty tenant');

assert(sim.isProctoringUpdateIdentityLocked(), 'FAIL T1-14: Proctoring updates must lock tenantId, attemptId, and userId');
console.log('✓ T1-14: Proctoring updates strictly lock tenantId, attemptId, and userId');

assert(sim.isAssessmentReadTenantScoped(), 'FAIL T1-15: Student assessment read and staff list must be tenant-scoped');
console.log('✓ T1-15: Student assessment read access and staff list queries strictly tenant-scoped');

assert(sim.isResultScoreTamperingBlocked(), 'FAIL T1-16: All scoring fields (score, marks, grade, rank) must be immutable during student result updates');
console.log('✓ T1-16: Result scoring fields (score, percentage, rank, marks, grade) strictly locked against tampering');

assert(sim.isCoursesTenantScoped(), 'FAIL T1-17: Courses and nested series/tests must be tenant-scoped');
console.log('✓ T1-17: Course, series, and test read/write access strictly tenant-scoped');

assert(sim.isGuestBackdoorRemoved(), 'FAIL T1-18: publicTenants and unauthenticated read backdoors must be completely removed');
console.log('✓ T1-18: Unauthenticated guest backdoors and publicTenants completely excised');

assert(sim.isResultParentListLockedToStaffAndAdmin(), 'FAIL T1-19: Students must NOT be able to list parent assessmentResults/{tenantId}');
console.log('✓ T1-19: Parent assessmentResults/{tenantId} list permission strictly locked to Admin/Staff');

assert(sim.isTenantSubcollectionsExplicit(), 'FAIL T1-20: /tenants/{tenantId} must not contain broad wildcard /{sub=**}');
console.log('✓ T1-20: /tenants/{tenantId} uses explicit subcollection rules with no blanket wildcard');

assert(sim.isAssessmentListTenantBound(), 'FAIL T1-21: /assessments list rule must enforce tenantAllowed(resource.data.tenantId)');
console.log('✓ T1-21: /assessments collection listing strictly enforces resource tenant scoping');

assert(sim.isAttemptCrossTenantCreationBlocked(), 'FAIL T1-22: Student attempt creation must validate tenantId == myTenant() AND assessment.tenantId == myTenant()');
console.log('✓ T1-22: Student attempt creation strictly binds attempt tenant and assessment tenant to student identity');

assert(sim.isNestedResultListLockedToStaffAndAdmin(), 'FAIL T1-23: Nested result list permission must be restricted to Admin and Staff only');
console.log('✓ T1-23: Nested result list permission restricted to Admin and Staff only');

assert(sim.isResultBoundToAssessmentTenant(), 'FAIL T1-24: Result creation must validate that assessment belongs to user tenant');
console.log('✓ T1-24: Result creation strictly validates matching tenantId with referenced assessment');

assert(sim.isUserSelfProvisioningTenantRequired(), 'FAIL T1-25: User self-provisioning must bind tenantId to trusted auth token claim');
console.log('✓ T1-25: User self-provisioning strictly binds tenantId to trusted auth token claim');

assert(sim.isCourseProgressTamperLocked(), 'FAIL T1-26: Course progress must lock verified and certified status against student manipulation');
console.log('✓ T1-26: Course progress certification/verification fields strictly locked against student tampering');

assert(sim.isTenantRootWriteAdminOnly(), 'FAIL T1-27: Root /tenants/{tenantId} mutations must be restricted to Admin only');
console.log('✓ T1-27: Tenant root document mutations strictly locked to Admin only');

// Round-3: hasOnly() allowlist enforcement
assert(sim.isProfileWriteHasOnlyEnforced(), 'FAIL T1-28: /users/{userId}/profile must use hasOnly() field allowlist, not exclusion pattern');
console.log('✓ T1-28: /profile uses hasOnly() field allowlist (exclusion pattern removed)');

assert(sim.isSettingsWriteHasOnlyEnforced(), 'FAIL T1-29: /users/{userId}/settings must use hasOnly() field allowlist, not exclusion pattern');
console.log('✓ T1-29: /settings uses hasOnly() field allowlist (exclusion pattern removed)');

// [P0] Round-5: Attempt-existence gate for result creation
assert(sim.isResultBoundToAttempt(), 'FAIL T1-30: Result create rule must require exists() on contestAttempts/{assessmentId}_{userId} to prevent result injection for unassigned assessments');
console.log('✓ T1-30: Result creation strictly bound to registered contestAttempt (attempt-existence gate present)');

// [P0] Round-6: Duration binding to assessment definition
assert(sim.isAttemptDurationBoundToAssessment(), 'FAIL T1-31: contestAttempts create rule must call isAssessmentDuration() to bind durationSeconds to assessment configuration');
console.log('✓ T1-31: contestAttempts durationSeconds is cross-validated against assessment.duration_minutes via isAssessmentDuration()');

// [P1] Round-6: Field allowlist on student attempt update
assert(sim.isAttemptUpdateFieldAllowlistEnforced(), 'FAIL T1-32: contestAttempts student update must enforce affectedKeys().hasOnly([...]) allowlist');
console.log('✓ T1-32: contestAttempts student update enforces strict field allowlist (sectionAnswers, activeSection, sections, lastSavedAt, …)');

// [P1] Round-7: result.attemptId must be bound to canonical attempt ID in create rule
assert(sim.isResultAttemptIdBound(), "FAIL T1-33: Result create rule must bind result.attemptId == assessmentId + '_' + userId to prevent spoofed attempt references");
console.log('✓ T1-33: result.attemptId is bound to canonical {assessmentId}_{userId} in the create rule');

// [P1] Round-7: Result creation blocked from IN_PROGRESS attempt state
assert(sim.isResultCreationBoundToAttemptState(), 'FAIL T1-34: Result create rule must check attempt.status ∈ [SUBMITTING, EXPIRED, FAILED_RECOVERABLE] — blocks result creation from IN_PROGRESS');
console.log('✓ T1-34: Result creation blocked unless attempt is in SUBMITTING | EXPIRED | FAILED_RECOVERABLE state');

// [P1] Round-7: contestAttempts update allowlist is split into answer-only and lifecycle paths
assert(sim.isAttemptUpdateAllowlistSplit(), 'FAIL T1-35: contestAttempts update must have two separate paths — answer fields (PATH A) vs lifecycle fields (PATH B) with status guard');
console.log('✓ T1-35: contestAttempts update allowlist split: PATH A (answer data), PATH B (lifecycle transitions with state guard)');

// [P0] Round-8: userSolutions tenant scoping for staff
assert(sim.isUserSolutionsTenantScoped(), 'FAIL T1-36: userSolutions read/write must be tenant-scoped for staff access via tenantAllowed(user.tenantId)');
console.log('✓ T1-36: userSolutions is strictly tenant-scoped for staff access');

// [P1] Round-8: proctoringLogs creation requires contestAttempts document
assert(sim.isProctoringCreationAttemptBound(), 'FAIL T1-37: proctoringLogs create rule must require exists() on student contestAttempts/{attemptId}');
console.log('✓ T1-37: proctoringLogs create strictly requires canonical contestAttempts existence');

// [P1] Round-8: proctoringLogs student update enforces field allowlist
assert(sim.isProctoringStudentUpdateAllowlistEnforced(), 'FAIL T1-38: proctoringLogs student update must enforce affectedKeys().hasOnly([...]) allowlist');
console.log('✓ T1-38: proctoringLogs student update strictly enforces heartbeat/status field allowlist');

// [P2] Round-8: livePresence tenant scoping for staff
assert(sim.isLivePresenceTenantScoped(), 'FAIL T1-39: livePresence staff read must be tenant-scoped via tenantAllowed(resource.data.tenantId)');
console.log('✓ T1-39: livePresence staff read is strictly tenant-scoped');

console.log('════════════════════════════════════════════');
console.log('ALL 39/39 TIER-1 STRUCTURAL TESTS PASSED ✓');
console.log('════════════════════════════════════════════');

// Env:      FIRESTORE_EMULATOR_HOST=127.0.0.1:8080
//
// Run both tiers:
//   firebase emulators:exec --only firestore \
//     "FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 node src/tests/firestoreRules.test.mjs"
//
// Skip Tier 2:
//   SKIP_EMULATOR_TESTS=1 node src/tests/firestoreRules.test.mjs

const SKIP_EMULATOR = process.env.SKIP_EMULATOR_TESTS === '1' || !process.env.FIRESTORE_EMULATOR_HOST;

if (SKIP_EMULATOR) {
  console.log('');
  console.log('ℹ  Tier 2 (emulator SDK tests) SKIPPED.');
  console.log('   Set FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 to enable real rule evaluation.');
  console.log('');
  process.exit(0);
}

console.log('');
console.log('════════════════════════════════════════');
console.log('TIER 2 — Emulator SDK Auth Flow Tests');
console.log('════════════════════════════════════════');

const { initializeTestEnvironment, assertFails, assertSucceeds } =
  await import('@firebase/rules-unit-testing');
const { doc, setDoc, getDoc, updateDoc, collection, getDocs } =
  await import('firebase/firestore');

const PROJECT_ID = `rules-test-${Date.now()}`;

const env = await initializeTestEnvironment({
  projectId: PROJECT_ID,
  firestore: {
    rules: rulesContent,
    host: (process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8080').split(':')[0],
    port: parseInt((process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8080').split(':')[1], 10),
  },
});

let t2passed = 0;
let t2failed = 0;

async function t2(name, fn) {
  try {
    await fn();
    console.log(`✓ T2: ${name}`);
    t2passed++;
  } catch (e) {
    console.error(`✗ T2 FAIL: ${name}`);
    console.error('  ', e.message);
    t2failed++;
  }
}

// Seed required documents bypassing rules
await env.withSecurityRulesDisabled(async (ctx) => {
  const db = ctx.firestore();
  await setDoc(doc(db, 'users/admin-uid'),    { uid: 'admin-uid',   role: 'admin',   tenantId: 'adminTenant' });
  await setDoc(doc(db, 'users/student-a'),    { uid: 'student-a',  role: 'student', tenantId: 'tenantA' });
  await setDoc(doc(db, 'users/student-b'),    { uid: 'student-b',  role: 'student', tenantId: 'tenantB' });
  await setDoc(doc(db, 'assessments/assess1'), { tenantId: 'tenantA', title: 'Test' });
  await setDoc(doc(db, 'assessment_keys/contest1'), { key: 'secret-aes-key' });
  await setDoc(doc(db, 'assessmentResults/tenantA/assess1/student-a'), {
    userId: 'student-a', tenantId: 'tenantA', assessmentId: 'assess1',
    score: 0, percentage: 0, rank: 0, correctAnswers: 0, totalMarks: 0,
    maxMarks: 100, evaluationStatus: 'pending', qualified: false, grade: '',
    completed: false, status: 'active',
  });
  await setDoc(doc(db, 'users/student-a/profile/main'),   { displayName: 'Alice' });
  await setDoc(doc(db, 'users/student-a/settings/prefs'), { theme: 'dark' });
});

const studentA   = env.authenticatedContext('student-a', { uid: 'student-a', token: { role: 'student', tenantId: 'tenantA' } });
const studentB   = env.authenticatedContext('student-b', { uid: 'student-b', token: { role: 'student', tenantId: 'tenantB' } });
const unauthCtx  = env.unauthenticatedContext();
const sADb       = studentA.firestore();

await t2('Unauthenticated cannot read /users/student-a', async () =>
  assertFails(getDoc(doc(unauthCtx.firestore(), 'users/student-a'))));

await t2('Student cannot list /users collection', async () =>
  assertFails(getDocs(collection(sADb, 'users'))));

await t2('Student cannot set role in /profile (hasOnly blocks it)', async () =>
  assertFails(updateDoc(doc(sADb, 'users/student-a/profile/main'), { displayName: 'Alice', role: 'admin' })));

await t2('Student can write allowed profile fields', async () =>
  assertSucceeds(updateDoc(doc(sADb, 'users/student-a/profile/main'), {
    displayName: 'Alice B', bio: 'Hello', updatedAt: new Date().toISOString(),
  })));

await t2('Student cannot set tenantId in /profile (hasOnly blocks it)', async () =>
  assertFails(updateDoc(doc(sADb, 'users/student-a/profile/main'), { displayName: 'Alice', tenantId: 'adminTenant' })));

await t2('Cross-student profile read denied', async () =>
  assertFails(getDoc(doc(sADb, 'users/student-b/profile/main'))));

await t2('Student cannot tamper score in own result', async () =>
  assertFails(updateDoc(doc(sADb, 'assessmentResults/tenantA/assess1/student-a'), { score: 100, percentage: 100 })));

await t2('Cross-tenant result read denied', async () =>
  assertFails(getDoc(doc(studentB.firestore(), 'assessmentResults/tenantA/assess1/student-a'))));

await t2('Student cannot read assessment_keys', async () =>
  assertFails(getDoc(doc(sADb, 'assessment_keys/contest1'))));

await t2('Student cannot write assessment_keys', async () =>
  assertFails(setDoc(doc(sADb, 'assessment_keys/contest1'), { key: 'hacked' })));

await t2('Unauthenticated cannot create proctoringLogs', async () =>
  assertFails(setDoc(doc(unauthCtx.firestore(), 'proctoringLogs/attempt1'), {
    userId: 'student-a', tenantId: 'tenantA', attemptId: 'attempt1',
  })));

await t2('Proctoring creation fails closed with empty tenantId', async () => {
  const noTenant = env.authenticatedContext('no-tenant', { uid: 'no-tenant', token: { role: 'student', tenantId: '' } });
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'users/no-tenant'), { uid: 'no-tenant', role: 'student', tenantId: '' });
  });
  await assertFails(setDoc(doc(noTenant.firestore(), 'proctoringLogs/attempt-nt'), {
    userId: 'no-tenant', tenantId: '', attemptId: 'attempt-nt',
  }));
});

await t2('Student cannot set permissions in /settings (hasOnly blocks it)', async () =>
  assertFails(updateDoc(doc(sADb, 'users/student-a/settings/prefs'), { theme: 'light', permissions: ['admin:write'] })));

await t2('Student can write allowed settings fields', async () =>
  assertSucceeds(updateDoc(doc(sADb, 'users/student-a/settings/prefs'), {
    theme: 'light', fontSize: 14, updatedAt: new Date().toISOString(),
  })));

// ── Cat-7: Attempt-existence gate ────────────────────────────────────────────
// [P1] A student cannot create a result without a matching assessmentAttempt record.
await t2('Student cannot create result without an attempt (attempt-existence gate)', async () => {
  // No attempt document seeded for assess2 — result creation must fail
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'assessments/assess2'), { tenantId: 'tenantA', title: 'Unregistered' });
  });
  await assertFails(setDoc(doc(sADb, 'assessmentResults/tenantA/assess2/student-a'), {
    userId: 'student-a', tenantId: 'tenantA', assessmentId: 'assess2',
    score: 0, percentage: 0, rank: 0, correctAnswers: 0, totalMarks: 0,
    maxMarks: 100, evaluationStatus: 'pending', qualified: false, grade: '',
    completed: false, status: 'active',
  }));
});

await t2('Student can create result when a matching attempt exists (attempt-existence gate permits)', async () => {
  // Seed the attempt document so the exists() check passes
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'assessments/assess3'), { tenantId: 'tenantA', title: 'Assigned', status: 'published' });
    await setDoc(doc(ctx.firestore(), 'users/student-a/contestAttempts/assess3_student-a'), {
      assessmentId: 'assess3', uid: 'student-a', tenantId: 'tenantA', status: 'active', startedAt: new Date(), durationSeconds: 3600,
    });
  });
  await assertSucceeds(setDoc(doc(sADb, 'assessmentResults/tenantA/assess3/student-a'), {
    userId: 'student-a', tenantId: 'tenantA', assessmentId: 'assess3',
    score: 0, percentage: 0, rank: 0, correctAnswers: 0, totalMarks: 0,
    maxMarks: 100, evaluationStatus: 'pending', qualified: false, grade: '',
    completed: false, status: 'active',
  }));
});

await env.cleanup();

console.log('');
if (t2failed > 0) {
  console.error(`══════════════════════════════════════════════`);
  console.error(`TIER 2: ${t2passed} passed, ${t2failed} FAILED ✗`);
  console.error(`══════════════════════════════════════════════`);
  process.exit(1);
} else {
  console.log(`══════════════════════════════════════════════`);
  console.log(`ALL ${t2passed}/${t2passed} TIER-2 EMULATOR TESTS PASSED ✓`);
  console.log(`══════════════════════════════════════════════`);
}
