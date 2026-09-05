/**
 * supportService.js
 *
 * Client-side service for creating and tracking student support requests
 * in the Firestore `supportTickets` collection for SEED-SEB frontend.
 */

import {
  collection,
  doc,
  addDoc,
  updateDoc,
  onSnapshot,
  query,
  where,
  orderBy,
  serverTimestamp,
} from 'firebase/firestore';
import { db, auth } from '../lib/firebase-config';

export const TICKET_CATEGORIES = [
  { value: 'download_seb', label: 'SEED-SEB Desktop App / Lockdown', badge: 'Desktop App' },
  { value: 'widget_android', label: 'Android Native Widget Setup', badge: 'Mobile Widget' },
  { value: 'assessment', label: 'Assessment / Exam Issue', badge: 'Exam Proctoring' },
  { value: 'account', label: 'Student Profile / Login Help', badge: 'Account' },
  { value: 'other', label: 'General Technical Inquiry', badge: 'General' },
];

export const TICKET_PRIORITIES = [
  { value: 'LOW', label: 'Low', color: '#64748b', bg: '#f1f5f9' },
  { value: 'MEDIUM', label: 'Medium', color: '#2563eb', bg: '#eff6ff' },
  { value: 'HIGH', label: 'High', color: '#f59e0b', bg: '#fffbeb' },
  { value: 'CRITICAL', label: 'Critical (Exam Blocker)', color: '#ef4444', bg: '#fef2f2' },
];

export const TICKET_STATUSES = {
  OPEN: { label: 'Open', color: '#3b82f6', bg: 'rgba(59, 130, 246, 0.1)' },
  IN_PROGRESS: { label: 'In Progress', color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.1)' },
  RESOLVED: { label: 'Resolved', color: '#10b981', bg: 'rgba(16, 185, 129, 0.1)' },
  CLOSED: { label: 'Closed', color: '#64748b', bg: 'rgba(100, 116, 139, 0.1)' },
};

/**
 * Generate a clean, readable ticket reference code, e.g. "TICK-7A9B"
 */
function generateTicketNumber() {
  const rand = Math.floor(1000 + Math.random() * 9000);
  const suffix = Date.now().toString(36).slice(-3).toUpperCase();
  return `TICK-${rand}-${suffix}`;
}

/**
 * Create a new support ticket in Firestore
 */
export async function createSupportTicket({
  user,
  category = 'download_seb',
  subject,
  description,
  priority = 'MEDIUM',
  platform = 'seed-seb',
  appVersion = '1.0.4',
}) {
  const effectiveUid = user?.uid || auth?.currentUser?.uid || 'demo-student';
  if (!effectiveUid) {
    throw new Error('You must be logged in to submit a support ticket.');
  }
  if (!subject || !subject.trim()) {
    throw new Error('Please provide an issue subject.');
  }
  if (!description || !description.trim()) {
    throw new Error('Please describe the issue or problem.');
  }

  const categoryObj = TICKET_CATEGORIES.find((c) => c.value === category) || TICKET_CATEGORIES[0];
  const ticketNumber = generateTicketNumber();

  const payload = {
    ticketNumber,
    userId: effectiveUid,
    userName: user?.name || user?.displayName || (effectiveUid === 'demo-student' ? 'Ambika (Demo)' : 'Student'),
    userEmail: user?.email || (effectiveUid === 'demo-student' ? 'ambika@demo.seed.edu' : ''),
    userRole: user?.role || 'student',
    tenantId: (typeof user?.tenant === 'object' ? (user.tenant.id || user.tenant.name) : (user?.tenant || user?.tenantId)) || 'demo-institution',
    category,
    categoryLabel: categoryObj.label,
    subject: subject.trim(),
    description: description.trim(),
    priority,
    status: 'OPEN',
    platform,
    appVersion,
    adminNotes: '',
    resolutionNotes: '',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  const colRef = collection(db, 'supportTickets');
  const docRef = await addDoc(colRef, payload);

  return { id: docRef.id, ticketNumber, ...payload };
}

/**
 * Real-time subscription to tickets submitted by a specific student
 */
export function subscribeStudentTickets(userId, callback) {
  if (!userId) {
    callback([]);
    return () => {};
  }

  try {
    const colRef = collection(db, 'supportTickets');
    const q = query(colRef, where('userId', '==', userId));

    return onSnapshot(
      q,
      (snapshot) => {
        const tickets = snapshot.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            ...data,
            createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : (data.createdAt || new Date()),
            updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate() : (data.updatedAt || new Date()),
          };
        });

        // Sort descending by creation date
        tickets.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        callback(tickets);
      },
      (err) => {
        console.warn('[supportService] Error fetching tickets:', err);
        callback([]);
      }
    );
  } catch (err) {
    console.warn('[supportService] Failed to initialize ticket subscription:', err);
    callback([]);
    return () => {};
  }
}

/**
 * Real-time subscription to messages inside supportTickets/{ticketId}/messages
 */
export function subscribeTicketMessages(ticketId, callback) {
  if (!ticketId) {
    callback([]);
    return () => {};
  }

  try {
    const colRef = collection(db, 'supportTickets', ticketId, 'messages');
    const q = query(colRef, orderBy('createdAt', 'asc'));

    return onSnapshot(
      q,
      (snapshot) => {
        const msgs = snapshot.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            senderId: data.senderId || '',
            senderName: data.senderName || 'User',
            senderRole: data.senderRole || 'student',
            text: data.text || '',
            createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : (data.createdAt || new Date()),
          };
        });
        callback(msgs);
      },
      (err) => {
        console.warn('[supportService] Error fetching ticket messages:', err);
        callback([]);
      }
    );
  } catch (err) {
    console.warn('[supportService] Failed to initialize messages subscription:', err);
    callback([]);
    return () => {};
  }
}

/**
 * Send a chat message in supportTickets/{ticketId}/messages
 */
export async function sendTicketChatMessage(ticketId, { senderId, senderName, senderRole = 'student', text }) {
  if (!ticketId || !text || !text.trim()) return;

  const messagesCol = collection(db, 'supportTickets', ticketId, 'messages');
  const ticketRef = doc(db, 'supportTickets', ticketId);

  await addDoc(messagesCol, {
    senderId: senderId || 'student',
    senderName: senderName || 'Student',
    senderRole,
    text: text.trim(),
    createdAt: serverTimestamp(),
  });

  await updateDoc(ticketRef, {
    lastMessage: text.trim().slice(0, 100),
    lastMessageAt: serverTimestamp(),
    lastMessageSenderRole: senderRole,
    updatedAt: serverTimestamp(),
  });
}

export default {
  TICKET_CATEGORIES,
  TICKET_PRIORITIES,
  TICKET_STATUSES,
  createSupportTicket,
  subscribeStudentTickets,
  subscribeTicketMessages,
  sendTicketChatMessage,
};
