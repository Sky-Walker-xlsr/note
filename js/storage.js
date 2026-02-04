/* storage.js
   - localStorage persistence
   - JSON import/export helpers
   - lightweight hashing for PIN
*/

const Store = (() => {
  const KEYS = {
    profilesIndex: "notesapp_profiles_index_v1", // list of profile names
    profilePrefix: "notesapp_profile_v1_",       // + profileName
    notesPrefix: "notesapp_notes_v1_",           // + profileName
    unlockPrefix: "notesapp_unlock_v1_",         // + profileName
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

  // Not crypto-grade, but prevents plain-text storage.
  // If you want proper crypto, you can swap to SubtleCrypto SHA-256.
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

  function getProfilesIndex() {
    return loadJson(KEYS.profilesIndex, []);
  }

  function setProfilesIndex(list) {
    saveJson(KEYS.profilesIndex, Array.from(new Set(list)));
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

  function getProfile(profileName) {
    return loadJson(getProfileKey(profileName), null);
  }

  function saveProfile(profile) {
    saveJson(getProfileKey(profile.name), profile);
    const idx = getProfilesIndex();
    if (!idx.includes(profile.name)) {
      idx.push(profile.name);
      setProfilesIndex(idx);
    }
  }

  function deleteProfile(profileName) {
    localStorage.removeItem(getProfileKey(profileName));
    localStorage.removeItem(getNotesKey(profileName));
    localStorage.removeItem(getUnlockKey(profileName));
    setProfilesIndex(getProfilesIndex().filter(n => n !== profileName));
  }

  function getNotes(profileName) {
    return loadJson(getNotesKey(profileName), {
      profile: profileName,
      updatedAt: nowIso(),
      notes: []
    });
  }

  function saveNotes(profileName, notesDoc) {
    notesDoc.updatedAt = nowIso();
    saveJson(getNotesKey(profileName), notesDoc);
  }

  // unlock cache
  function setUnlocked(profileName, remember, days = 14) {
    const payload = {
      unlocked: true,
      remember: !!remember,
      ts: Date.now(),
      exp: remember ? (Date.now() + days * 24 * 60 * 60 * 1000) : (Date.now() + 2 * 60 * 60 * 1000)
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

  // Download JSON
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

  // Read JSON from file input
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
    getProfilesIndex,
    setProfilesIndex,
    getProfile,
    saveProfile,
    deleteProfile,
    getNotes,
    saveNotes,
    setUnlocked,
    isUnlocked,
    clearUnlocked,
    downloadJson,
    readFileAsJson
  };
})();
