/* ==========================================================================
   JMM Bell Commander — utils.js
   Small shared helper functions used across the app.
   ========================================================================== */

const Utils = (() => {

  function uuid() {
    if (crypto.randomUUID) return crypto.randomUUID();
    // fallback
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  function pad2(n) {
    return n.toString().padStart(2, '0');
  }

  function dateToYMD(d) {
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  }

  function timeToHHMM(d) {
    return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  }

  function nowLabel(d) {
    let h = d.getHours();
    const ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12;
    if (h === 0) h = 12;
    return `${pad2(h)}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())} ${ampm}`;
  }

  function formatTimeLabel(hhmm) {
    // hhmm = "HH:MM" (24h) -> "h:MM AM/PM"
    const [hh, mm] = hhmm.split(':').map(Number);
    const ampm = hh >= 12 ? 'PM' : 'AM';
    let h = hh % 12;
    if (h === 0) h = 12;
    return `${h}:${pad2(mm)} ${ampm}`;
  }

  const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const WEEKDAY_LABELS_FULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  function minutesUntil(fromDate, hhmm) {
    const [hh, mm] = hhmm.split(':').map(Number);
    const target = new Date(fromDate);
    target.setHours(hh, mm, 0, 0);
    let diff = (target - fromDate) / 60000;
    if (diff < 0) diff += 24 * 60;
    return Math.round(diff);
  }

  function minutesUntilOccurrence(fromDate, occurrenceDate, hhmm) {
    const [year, month, day] = occurrenceDate.split('-').map(Number);
    const [hour, minute] = hhmm.split(':').map(Number);
    const target = new Date(year, month - 1, day, hour, minute, 0, 0);
    return Math.max(0, Math.round((target - fromDate) / 60000));
  }

  function humanizeMinutes(mins) {
    if (mins <= 0) return 'now';
    if (mins < 60) return `${mins} min`;
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return m ? `${h}h ${m}m` : `${h}h`;
  }

  // Pure-JS SHA-256 fallback (FIPS 180-4), used only when Web Crypto isn't
  // available — some sandboxed/embedded preview frames and file:// pages
  // don't count as a "secure context", so window.crypto.subtle is missing.
  function sha256PureJS(str) {
    const utf8 = new TextEncoder().encode(str);
    const K = [
      0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
      0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
      0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
      0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
      0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,
      0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
      0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,
      0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2,
    ];
    let H = [0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19];
    const l = utf8.length;
    const withOne = new Uint8Array((((l + 9 + 63) >> 6) << 6));
    withOne.set(utf8);
    withOne[l] = 0x80;
    const view = new DataView(withOne.buffer);
    const bitLen = l * 8;
    view.setUint32(withOne.length - 8, Math.floor(bitLen / 0x100000000), false);
    view.setUint32(withOne.length - 4, bitLen >>> 0, false);
    const rrot = (x, n) => (x >>> n) | (x << (32 - n));
    for (let chunkStart = 0; chunkStart < withOne.length; chunkStart += 64) {
      const w = new Uint32Array(64);
      for (let i = 0; i < 16; i++) w[i] = view.getUint32(chunkStart + i * 4, false);
      for (let i = 16; i < 64; i++) {
        const s0 = rrot(w[i-15],7) ^ rrot(w[i-15],18) ^ (w[i-15] >>> 3);
        const s1 = rrot(w[i-2],17) ^ rrot(w[i-2],19) ^ (w[i-2] >>> 10);
        w[i] = (w[i-16] + s0 + w[i-7] + s1) | 0;
      }
      let [a,b,c,d,e,f,g,h] = H;
      for (let i = 0; i < 64; i++) {
        const S1 = rrot(e,6) ^ rrot(e,11) ^ rrot(e,25);
        const ch = (e & f) ^ (~e & g);
        const temp1 = (h + S1 + ch + K[i] + w[i]) | 0;
        const S0 = rrot(a,2) ^ rrot(a,13) ^ rrot(a,22);
        const maj = (a & b) ^ (a & c) ^ (b & c);
        const temp2 = (S0 + maj) | 0;
        h=g; g=f; f=e; e=(d+temp1)|0;
        d=c; c=b; b=a; a=(temp1+temp2)|0;
      }
      H[0]=(H[0]+a)|0; H[1]=(H[1]+b)|0; H[2]=(H[2]+c)|0; H[3]=(H[3]+d)|0;
      H[4]=(H[4]+e)|0; H[5]=(H[5]+f)|0; H[6]=(H[6]+g)|0; H[7]=(H[7]+h)|0;
    }
    return H.map((x) => (x >>> 0).toString(16).padStart(8, '0')).join('');
  }

  async function sha256Hex(text) {
    if (crypto?.subtle?.digest) {
      try {
        const enc = new TextEncoder().encode(text);
        const buf = await crypto.subtle.digest('SHA-256', enc);
        return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
      } catch (e) {
        // fall through to the pure-JS implementation below
      }
    }
    return sha256PureJS(text);
  }

  function blobToDataURL(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error || new Error('Could not read audio data'));
      reader.readAsDataURL(blob);
    });
  }

  async function dataURLToBlob(dataUrl) {
    const res = await fetch(dataUrl);
    return await res.blob();
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str ?? '';
    return div.innerHTML;
  }

  function downloadJSON(obj, filename) {
    const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  function readFileAsText(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error || new Error('Could not read the selected file'));
      reader.readAsText(file);
    });
  }

  function toast(message, kind = 'info', duration = 3200) {
    const host = document.getElementById('toast-host');
    if (!host) return;
    const el = document.createElement('div');
    el.className = `toast toast--${kind}`;
    el.textContent = message;
    host.appendChild(el);
    requestAnimationFrame(() => el.classList.add('toast--show'));
    setTimeout(() => {
      el.classList.remove('toast--show');
      setTimeout(() => el.remove(), 300);
    }, duration);
  }

  return {
    uuid, pad2, dateToYMD, timeToHHMM, nowLabel, formatTimeLabel,
    WEEKDAY_LABELS, WEEKDAY_LABELS_FULL,
    minutesUntil, minutesUntilOccurrence, humanizeMinutes, sha256Hex,
    blobToDataURL, dataURLToBlob, escapeHtml,
    downloadJSON, readFileAsText, toast,
  };
})();
