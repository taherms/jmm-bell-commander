/* ==========================================================================
   JMM Bell Commander — auth.js
   A SIMPLE SHARED GATE, not real per-user security.
   This app is hosted as a static site (GitHub Pages), so there is no
   server to keep secrets on — anyone who opens dev tools can read the
   source. This gate only keeps casual/curious users out of the console;
   it is not meant to protect sensitive data.

   HOW THE PASSWORD WORKS
   - DEFAULT_HASH below is the SHA-256 hash of the shared password that
     ships with the app. Default password is:  madrasa786
   - To change the password for EVERYONE (all devices), an admin must:
       1) Log in, go to Settings → "Generate new password hash"
       2) Type the new password, copy the hash it shows
       3) Paste that hash into DEFAULT_HASH below, in this file
       4) Commit + push to GitHub so GitHub Pages redeploys
   - A device can also be given a LOCAL override (Settings → same tool,
     "save on this device only") which only changes the password on that
     one browser, without touching this file. Useful for testing.
   ========================================================================== */

const Auth = (() => {
  const DEFAULT_HASH = '2f4b67b96458eb7b20ab6bdbdf265187ed55153eed9c215f56b4fd311dfc0f50'; // "madrasa786"
  const LOCAL_HASH_KEY = 'jmm_local_password_hash';
  const SESSION_KEY = 'jmm_authenticated';

  function activeHash() {
    return localStorage.getItem(LOCAL_HASH_KEY) || DEFAULT_HASH;
  }

  async function tryLogin(password) {
    const hash = await Utils.sha256Hex(password.trim());
    if (hash === activeHash()) {
      localStorage.setItem(SESSION_KEY, '1');
      return true;
    }
    return false;
  }

  function isAuthenticated() {
    return localStorage.getItem(SESSION_KEY) === '1';
  }

  function logout() {
    localStorage.removeItem(SESSION_KEY);
  }

  async function setLocalOverridePassword(newPassword) {
    const hash = await Utils.sha256Hex(newPassword.trim());
    localStorage.setItem(LOCAL_HASH_KEY, hash);
    return hash;
  }

  function clearLocalOverride() {
    localStorage.removeItem(LOCAL_HASH_KEY);
  }

  function hasLocalOverride() {
    return !!localStorage.getItem(LOCAL_HASH_KEY);
  }

  return {
    tryLogin, isAuthenticated, logout,
    setLocalOverridePassword, clearLocalOverride, hasLocalOverride,
  };
})();
