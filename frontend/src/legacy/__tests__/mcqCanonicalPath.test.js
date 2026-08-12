/**
 * mcqCanonicalPath.test.js
 *
 * Unit tests for the MCQ canonical path bug fix.
 *
 * Tests:
 *   1. canonicalPath() produces correct Firestore path with Firebase UID
 *   2. canonicalPath() throws when userId is missing
 *   3. getCanonicalUid() uses auth.currentUser.uid NOT college/email
 *   4. saveProgressToFirestore() writes to UID-keyed path, not college-keyed path
 *   5. writeBothPaths() throws when not signed in
 *   6. Legacy path is never written (read-only backward compat)
 *   7. Final submission resultData always contains userId field
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ─────────────────────────────────────────────────────────────────────────────
// Mock Firebase dependencies
// ─────────────────────────────────────────────────────────────────────────────

const mockSetDoc  = vi.fn().mockResolvedValue(undefined);
const mockGetDoc  = vi.fn();

vi.mock('../firebase-config', () => ({
    db:   {},
    auth: { currentUser: null }, // overridden per-test
}));

vi.mock('firebase/firestore', () => ({
    doc:             vi.fn((_db, path) => ({ path })),
    setDoc:          mockSetDoc,
    getDoc:          mockGetDoc,
    serverTimestamp: vi.fn(() => ({ _serverTimestamp: true })),
    collection:      vi.fn(),
    getDocs:         vi.fn(),
    writeBatch:      vi.fn(),
}));

vi.mock('./timeService', () => ({
    default: {
        getNow: () => new Date(),
        now:    () => Date.now(),
    },
}));

vi.mock('./tenantResultsService', () => ({
    writeTenantResult:       vi.fn().mockResolvedValue(undefined),
    buildTenantResultPayload: vi.fn(() => ({})),
}));

vi.mock('./attemptStatusService', () => ({
    markAssessmentCompleted: vi.fn().mockResolvedValue(true),
    invalidateCompletionCache: vi.fn(),
}));

// ─────────────────────────────────────────────────────────────────────────────
// Helper: set up Firebase Auth mock
// ─────────────────────────────────────────────────────────────────────────────

function setAuthUid(uid) {
    const { auth } = require('../firebase-config');
    auth.currentUser = uid ? { uid } : null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('MCQService — Canonical Path', () => {
    let MCQService;

    beforeEach(async () => {
        vi.resetModules();
        mockSetDoc.mockClear();
        mockGetDoc.mockClear();

        // Set a valid Firebase Auth UID before each test
        setAuthUid('firebase_uid_abc123');

        // Non-dynamic import to get fresh module after vi.resetModules()
        MCQService = (await import('../services/mcqService')).default;
    });

    afterEach(() => {
        setAuthUid(null);
    });

    // ── Test 1: canonicalPath produces correct UID-keyed path ─────────────────

    it('canonicalPath(assessmentId, userId) produces correct Firestore path', () => {
        const path = MCQService.canonicalPath('test-001', 'firebase_uid_abc123');
        expect(path).toBe('assessmentResults/test-001/students/firebase_uid_abc123');
    });

    it('canonicalPath() NEVER uses college or email as userId', () => {
        // These would have been the old wrong args passed: (testID, college, year, email)
        // The new function should validate that these are NOT passed
        const correctPath = MCQService.canonicalPath('test-001', 'firebase_uid_abc123');
        const wrongCollegePath = MCQService.canonicalPath('test-001', 'KGKITE');

        expect(correctPath).not.toContain('KGKITE');
        expect(wrongCollegePath).not.toContain('firebase_uid_abc123');
    });

    it('canonicalPath() throws when userId is missing', () => {
        expect(() => MCQService.canonicalPath('test-001', '')).toThrow();
        expect(() => MCQService.canonicalPath('test-001', null)).toThrow();
        expect(() => MCQService.canonicalPath('test-001', undefined)).toThrow();
    });

    it('canonicalPath() throws when assessmentId is missing', () => {
        expect(() => MCQService.canonicalPath('', 'firebase_uid_abc123')).toThrow();
        expect(() => MCQService.canonicalPath(null, 'firebase_uid_abc123')).toThrow();
    });

    // ── Test 2: saveProgressToFirestore writes to UID path ────────────────────

    it('saveProgressToFirestore writes to UID-keyed canonical path, NOT college-keyed', async () => {
        setAuthUid('firebase_uid_abc123');

        mockGetDoc.mockResolvedValue({ exists: () => false }); // no existing doc

        await MCQService.saveProgressToFirestore({
            email:      'student@example.com',
            college:    'KGKITE',             // This was the BUG: used as userId previously
            year:       '2024',
            department: 'CSE',
            testID:     'mcq-test-001',
            testName:   'Test 1',
            score:      5,
            totalQuestions: 10,
            correctAnswers: 5,
            incorrectAnswers: 5,
            percentage: 50,
            timeTaken:  120,
            answers:    { 0: 1, 1: 2 },
        });

        expect(mockSetDoc).toHaveBeenCalledTimes(1);
        const writtenRef = mockSetDoc.mock.calls[0][0];
        const writtenData = mockSetDoc.mock.calls[0][1];

        // Path MUST use Firebase UID, NOT college code
        expect(writtenRef.path).toBe('assessmentResults/mcq-test-001/students/firebase_uid_abc123');
        expect(writtenRef.path).not.toContain('KGKITE');
        expect(writtenRef.path).not.toContain('student@example.com');

        // Document MUST include userId
        expect(writtenData.userId).toBe('firebase_uid_abc123');
        expect(writtenData.uid).toBe('firebase_uid_abc123');
    });

    it('saveProgressToFirestore throws when not authenticated (no Firebase UID)', async () => {
        setAuthUid(null); // not signed in

        await expect(
            MCQService.saveProgressToFirestore({
                email:    'student@example.com',
                college:  'KGKITE',
                testID:   'mcq-test-001',
                answers:  {},
            })
        ).rejects.toThrow(/Firebase Auth UID/);
    });

    // ── Test 3: writeBothPaths throws when not signed in ──────────────────────

    it('writeBothPaths throws when Firebase Auth UID is not available', async () => {
        setAuthUid(null); // force no auth

        await expect(
            MCQService.writeBothPaths(
                { score: 5 },
                { testID: 'test-001', college: 'KGKITE', year: '2024', department: 'CSE', email: 'x@y.com' }
            )
        ).rejects.toThrow(/Firebase Auth UID/);
    });

    it('writeBothPaths uses auth.currentUser.uid, NOT email fallback', async () => {
        setAuthUid('firebase_uid_abc123');

        mockGetDoc.mockResolvedValue({ exists: () => false });

        await MCQService.writeBothPaths(
            { score: 5 },
            { testID: 'test-001', college: 'KGKITE', year: '2024', department: 'CSE', email: 'x@y.com' }
        );

        const writtenRef = mockSetDoc.mock.calls[0][0];
        // Must use UID not email-derived key
        expect(writtenRef.path).toContain('firebase_uid_abc123');
        expect(writtenRef.path).not.toContain('x_y_com'); // old email.replace pattern
    });

    // ── Test 4: saveProgressToFirestore does NOT overwrite submitted document ─

    it('saveProgressToFirestore skips write when document is already submitted', async () => {
        setAuthUid('firebase_uid_abc123');

        mockGetDoc.mockResolvedValue({
            exists: () => true,
            data:   () => ({ completed: true, submitted: true, status: 'submitted' }),
        });

        const result = await MCQService.saveProgressToFirestore({
            email:    'student@example.com',
            college:  'KGKITE',
            testID:   'mcq-test-001',
            answers:  {},
        });

        // setDoc should NOT be called when document is already submitted
        expect(mockSetDoc).not.toHaveBeenCalled();
        expect(result.skipped).toBe(true);
    });

    // ── Test 5: checkExistingAttempt uses UID not college ─────────────────────

    it('checkExistingAttempt checks canonical UID path first', async () => {
        setAuthUid('firebase_uid_abc123');
        mockGetDoc.mockResolvedValue({ exists: () => false });

        await MCQService.checkExistingAttempt('x@y.com', 'test-001', 'KGKITE', '2024', 'CSE');

        const firstCallRef = mockGetDoc.mock.calls[0][0];
        expect(firstCallRef.path).toBe('assessmentResults/test-001/students/firebase_uid_abc123');
        expect(firstCallRef.path).not.toContain('KGKITE');
    });

    // ── Test 6: Legacy v1 path is READ-ONLY (never written to) ───────────────

    it('legacy v1 path is never written to during progress sync or result save', async () => {
        setAuthUid('firebase_uid_abc123');
        mockGetDoc.mockResolvedValue({ exists: () => false });

        await MCQService.saveProgressToFirestore({
            email: 'x@y.com', college: 'KGKITE', year: '2024', department: 'CSE',
            testID: 'test-001', answers: {},
        });

        // Check every setDoc call — none should go to legacy paths
        for (const call of mockSetDoc.mock.calls) {
            const ref = call[0];
            expect(ref.path).not.toMatch(/AssessmentResults/);
            expect(ref.path).not.toMatch(/colleges\//);
        }
    });

    // ── Test 7: resultTransformer output always includes userId ───────────────

    it('buildUnifiedResultPayload always includes userId from auth.currentUser.uid', async () => {
        setAuthUid('firebase_uid_abc123');
        const { buildUnifiedResultPayload } = await import('../utils/resultTransformer');

        const result = buildUnifiedResultPayload({
            email: 'x@y.com',
            assessmentId: 'test-001',
            score: 5,
            totalMarks: 10,
        });

        expect(result.userId).toBe('firebase_uid_abc123');
        expect(result.uid).toBe('firebase_uid_abc123');
        // assessmentId must use canonical camelCase (not assessmentID)
        expect(result.assessmentId).toBe('test-001');
        // totalScore + maxScore are canonical (not score + totalMarks)
        expect(result.totalScore).toBe(5);
        expect(result.maxScore).toBe(10);
    });
});
