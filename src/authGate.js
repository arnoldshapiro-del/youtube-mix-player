// Auth gate orchestrator for YouTube Mix Player.
// Loaded BEFORE main.js so the gate covers the page until the user is signed in
// AND on the allowlist. Saves Firebase auth state into a global window.__mp_user
// that main.js consumes for state sync.

import { signIn, signOutUser, onUserChange, isUserAllowed } from './firebase.js';

const gate = document.getElementById('auth-gate');
const gateButton = document.getElementById('auth-gate-signin');
const gateStatus = document.getElementById('auth-gate-status');
const pill = document.getElementById('auth-pill');
const pillStatus = document.getElementById('auth-pill-status');
const pillSignout = document.getElementById('auth-pill-signout');

// While we're checking auth state, hide the page chrome to avoid an FOUC where
// the app renders unauthed for a frame. Restored by main.js after auth resolves.
document.documentElement.dataset.authGate = 'pending';
gate.hidden = false;
gateButton.disabled = true;
gateStatus.textContent = 'Checking sign-in…';

let resolved = false;

// Tell main.js when the user state changes — it'll re-sync state from Firestore.
window.__mp_user = null;
window.__mp_user_listeners = new Set();
function broadcastUser(user) {
  window.__mp_user = user;
  for (const fn of window.__mp_user_listeners) {
    try { fn(user); } catch (err) { console.error('[auth-gate] listener err:', err); }
  }
}

onUserChange(async (user) => {
  if (!user) {
    if (resolved) {
      // User signed out post-load — re-show the gate, hide the app.
      document.documentElement.dataset.authGate = 'denied';
      gate.hidden = false;
      pill.hidden = true;
      gateStatus.textContent = 'You signed out. Sign back in to continue.';
    } else {
      document.documentElement.dataset.authGate = 'denied';
      gate.hidden = false;
      gateStatus.textContent = '';
    }
    gateButton.disabled = false;
    broadcastUser(null);
    return;
  }
  // We have a user — check the allowlist before letting them in.
  gateStatus.textContent = `Verifying access for ${user.email}…`;
  const ok = await isUserAllowed(user.email);
  if (!ok) {
    gateStatus.innerHTML = `<strong style="color:#ff8a8a">Access denied.</strong> The email <code>${user.email}</code> isn't on the YouTube Mix Player allowlist. Ask Arnie to add it via the Access Manager.`;
    gateButton.disabled = false;
    document.documentElement.dataset.authGate = 'denied';
    pill.hidden = true;
    broadcastUser(null);
    await signOutUser();
    return;
  }
  // Allowed — open the gate.
  resolved = true;
  document.documentElement.dataset.authGate = 'open';
  gate.hidden = true;
  pill.hidden = false;
  pillStatus.textContent = `☁ ${user.email.split('@')[0]} · synced`;
  broadcastUser(user);
});

gateButton.addEventListener('click', async () => {
  gateButton.disabled = true;
  gateStatus.textContent = 'Opening sign-in window…';
  const result = await signIn();
  if (!result.ok) {
    gateButton.disabled = false;
    gateStatus.textContent = `Sign-in failed: ${result.error}. Try again.`;
  }
  // onUserChange handler takes over from here once Firebase confirms the user.
});

pillSignout.addEventListener('click', async () => {
  if (!confirm('Sign out? Your saved mixes stay safe in the cloud and come back next time you sign in.')) return;
  await signOutUser();
});
