/* storage.js
   - localStorage cache (schnell)
   - server persistence via Vercel API -> GitHub files
*/

const Store = (() => {
  const KEYS = {
    profilePrefix: "notesapp_profile_v2_", // + profileName
    notesPrefix: "notesapp_notes_v2_",     // + profileName
    unlockPrefix: "notesapp_unlock_v2_"    // + profileName
  };

  function nowIso() {
    return new Date().toISOString();
  }

  function safeName(name) {
    return String(name || "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9-_]/g, "");
  }

  // Simple hash for PIN gating (not crypto-grade)
  function fnv1a(str) {
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
    }
    return ("0000000" + h.toString(16)).slice(-8);
  }

  function loadJson(key, fallback = null) {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    try { return JSON.parse(raw); } catch { return fallback; }
  }

  function saveJson(key, value) {
    localStorage.setItem(key, JSON.stringify(value, null, 2));
  }

  function getProfileKey(profileName) {
    return KEYS.profilePrefix + profileName;
  }
  function getNotesKey(profileName) {
    return KEYS.notesPrefix + profileName;
  }
  function getUnlockKey(profileName) {
    return KEYS.unlockPrefix + profileName;
  }

  // -------- local cache helpers --------

  function cacheGetProfile(profileName) {
    return loadJson(getProfileKey(profileName), null);
  }
  function cacheSetProfile(profile) {
    saveJson(getProfileKey(profile.name), profile);
  }

  function cacheGetNotes(profileName) {
    return loadJson(getNotesKey(profileName), null);
  }
  function cacheSetNotes(profileName, notesDoc) {
    saveJson(getNotesKey(profileName), notesDoc);
  }

  // -------- unlock cache --------

  function setUnlocked(profileName, remember, days = 14) {
    const payload = {
      unlocked: true,
      remember: !!remember,
      ts: Date.now(),
      exp: remember
        ? (Date.now() + days * 24 * 60 * 60 * 1000)
        : (Date.now() + 2 * 60 * 60 * 1000)
    };
    saveJson(getUnlockKey(profileName), payload);
  }

  function isUnlocked(profileName) {
    const u = loadJson(getUnlockKey(profileName), null);
    if (!u || !u.unlocked) return false;
    if (typeof u.exp !== "number") return false;
    if (Date.now() > u.exp) return false;
    return true;
  }

  function clearUnlocked(profileName) {
    localStorage.removeItem(getUnlockKey(profileName));
  }

  // -------- API helpers --------

  async function apiGet(path) {
    const res = await fetch(path, { method: "GET" });
    const text = await res.text();
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch { json = null; }

    return { ok: res.ok, status: res.status, json, text };
  }

  async function apiSend(path, method, bodyObj) {
    const res = await fetch(path, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(bodyObj || {})
    });

    const text = await res.text();
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch { json = null; }

    return { ok: res.ok, status: res.status, json, text };
  }

  // -------- server-backed ops --------

  async function listProfiles() {
    const r = await apiGet("/api/profiles");
    if (!r.ok) throw new Error(r.json?.error || `Profiles load failed (${r.status})`);
    return Array.isArray(r.json?.profiles) ? r.json.profiles : [];
  }

  async function getProfile(profileName, preferCache = true) {
    const name = safeName(profileName);
    if (!name) return null;

    if (preferCache) {
      const cached = cacheGetProfile(name);
      if (cached) return cached;
    }

    const r = await apiGet(`/api/profile?name=${encodeURIComponent(name)}`);
    if (!r.ok) return null;

    if (r.json && r.json.name) cacheSetProfile(r.json);
    return r.json;
  }

  async function createProfile({ name, displayName, pinHash }) {
    const clean = safeName(name);
    if (!clean) throw new Error("Ungültiger Profilname.");

    const r = await apiSend("/api/profile", "POST", {
      name: clean,
      displayName: displayName || clean,
      pinHash: String(pinHash || "").trim()
    });

    if (!r.ok) throw new Error(r.json?.error || `Create profile failed (${r.status})`);

    const prof = r.json?.profile;
    if (prof && prof.name) cacheSetProfile(prof);
    return prof;
  }

  async function loadNotes(profileName, preferCache = true) {
    const name = safeName(profileName);
    if (!name) throw new Error("Ungültiger Profilname.");

    if (preferCache) {
      const cached = cacheGetNotes(name);
      if (cached && Array.isArray(cached.notes)) return cached;
    }

    const r = await apiGet(`/api/notes?profile=${encodeURIComponent(name)}`);
    if (!r.ok) throw new Error(r.json?.error || `Load notes failed (${r.status})`);

    if (r.json && Array.isArray(r.json.notes)) cacheSetNotes(name, r.json);
    return r.json;
  }

  async function saveNotes(profileName, notesDoc) {
    const name = safeName(profileName);
    if (!name) throw new Error("Ungültiger Profilname.");

    // sofort lokal cachen (snappy UX)
    const doc = { ...(notesDoc || {}) };
    doc.profile = name;
    doc.updatedAt = nowIso();
    if (!Array.isArray(doc.notes)) doc.notes = [];

    cacheSetNotes(name, doc);

    // server persist
    const r = await apiSend("/api/notes", "PUT", {
      profile: name,
      doc
    });

    if (!r.ok) throw new Error(r.json?.error || `Save notes failed (${r.status})`);

    const serverDoc = r.json?.doc;
    if (serverDoc && Array.isArray(serverDoc.notes)) {
      cacheSetNotes(name, serverDoc);
      return serverDoc;
    }
    return doc;
  }

  // -------- Download JSON (optional) --------

  function downloadJson(filename, obj) {
    const blob = new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function readFileAsJson(file) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => {
        try { resolve(JSON.parse(String(r.result))); }
        catch (e) { reject(e); }
      };
      r.onerror = reject;
      r.readAsText(file);
    });
  }

  return {
    KEYS,
    nowIso,
    safeName,
    fnv1a,

    // unlock
    setUnlocked,
    isUnlocked,
    clearUnlocked,

    // api-backed
    listProfiles,
    getProfile,
    createProfile,
    loadNotes,
    saveNotes,

    // optional utils
    downloadJson,
    readFileAsJson
  };
})();
