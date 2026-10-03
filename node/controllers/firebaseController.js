import { applicationDefault, cert, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

function initializeFirestore() {
  if (getApps().length === 0) {
    if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      initializeApp({ credential: applicationDefault() });
    } else {
      const projectId = process.env.FIREBASE_PROJECT_ID;
      const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
      const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');
      if (!projectId || !clientEmail || !privateKey) {
        throw new Error('Configure GOOGLE_APPLICATION_CREDENTIALS or FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL and FIREBASE_PRIVATE_KEY');
      }
      initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
    }
  }
  return getFirestore();
}

export function getFirestoreDb() {
  return initializeFirestore();
}

export function getUsersCollection() {
  return getFirestoreDb().collection('users');
}

export function getMessagesCollection() {
  return getFirestoreDb().collection('messages');
}

export function getLoginDetailsCollection() {
  return getFirestoreDb().collection('login_details');
}

export function getTokensCollection() {
  return getFirestoreDb().collection('tokens');
}

export function getReportsCollection() {
  return getFirestoreDb().collection('reports');
}

export function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}