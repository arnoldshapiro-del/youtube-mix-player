// Firebase initialization for YouTube Mix Player.
// Uses Arnie's existing 'shapiro-apps' Firebase project — same as arnies-music-vault.
// Gates the app behind Google sign-in + Firestore allowlist (app_access/youtube-mix-player).
// Saves state to users/{uid} so localStorage clears can't lose your saved mixes.
//
// Loaded as ES modules from gstatic CDN (Mix Player has no build step,
// matching its vanilla-JS architecture).

import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.0.0/firebase-app.js';
import {
  getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged,
} from 'https://www.gstatic.com/firebasejs/12.0.0/firebase-auth.js';
import {
  getFirestore, doc, getDoc, setDoc, serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/12.0.0/firebase-firestore.js';

const firebaseConfig = {
  apiKey: 'AIzaSyBWKpWwPRFqjSxCmxSBpqZjLenlL7B7REU',
  authDomain: 'shapiro-apps.firebaseapp.com',
  projectId: 'shapiro-apps',
  storageBucket: 'shapiro-apps.firebasestorage.app',
  messagingSenderId: '1006712341632',
  appId: '1:1006712341632:web:dbafc1dafa6c07b4afe0f8',
};

const APP_ID = 'youtube-mix-player';

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
const provider = new GoogleAuthProvider();

// Returns the current user, or null. Subscribes once for cached resolution.
let currentUser = null;
const userListeners = new Set();
onAuthStateChanged(auth, (user) => {
  currentUser = user;
  for (const fn of userListeners) {
    try { fn(user); } catch (e) { console.error('[fb] listener error:', e); }
  }
});
export function getCurrentUser() { return currentUser; }
export function onUserChange(fn) {
  userListeners.add(fn);
  // Fire immediately if we already have a value
  if (currentUser !== null) fn(currentUser);
  return () => userListeners.delete(fn);
}

// Tries Google sign-in. Returns { ok, user, error }.
export async function signIn() {
  try {
    const result = await signInWithPopup(auth, provider);
    return { ok: true, user: result.user };
  } catch (err) {
    return { ok: false, error: err.code || err.message };
  }
}

export async function signOutUser() {
  try { await signOut(auth); return { ok: true }; }
  catch (err) { return { ok: false, error: err.message }; }
}

// Check that this user's email is in the app_access/youtube-mix-player allowlist.
export async function isUserAllowed(email) {
  if (!email) return false;
  try {
    const snap = await getDoc(doc(db, 'app_access', APP_ID));
    if (!snap.exists()) {
      // No allowlist doc yet — bootstrap to Arnie only so a new install isn't wide open.
      return email.toLowerCase() === 'arnold.shapiro@gmail.com';
    }
    const allowed = (snap.data().allowed || []).map((e) => String(e).toLowerCase());
    return allowed.includes(email.toLowerCase());
  } catch (err) {
    console.error('[fb] allowlist check failed:', err);
    // Fail-closed except for Arnie himself (so emergency access still works if Firestore is unreachable)
    return email.toLowerCase() === 'arnold.shapiro@gmail.com';
  }
}

// Fetch this user's saved Mix Player state (mixes, favorites, etc) from Firestore.
export async function fetchUserState(uid) {
  if (!uid) return null;
  try {
    const snap = await getDoc(doc(db, 'users', uid));
    if (!snap.exists()) return null;
    return snap.data().mix_player_state || null;
  } catch (err) {
    console.error('[fb] fetchUserState failed:', err);
    return null;
  }
}

// Save this user's state to Firestore. Debounced upstream so we don't write
// every change. Always merges so it doesn't clobber other apps in the same
// user doc.
export async function saveUserState(uid, state) {
  if (!uid || !state) return false;
  try {
    await setDoc(
      doc(db, 'users', uid),
      { mix_player_state: state, mix_player_updatedAt: serverTimestamp() },
      { merge: true }
    );
    return true;
  } catch (err) {
    console.error('[fb] saveUserState failed:', err);
    return false;
  }
}
