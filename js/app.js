/* app.js - app.html logic (API-backed notes) */

(function () {
  const params = new URLSearchParams(location.search);
  const profileName = params.get("profile");

  const elTitle = document.getElementById("profileTitle");
  const elSub = document.getElementById("profileSub");
  const grid = document.getElementById("notesGrid");
  const empty = document.getElementById("emptyNotes");

  const btnLogout = document.getElementById("btnLogout");
  const btnExportNotes = document.getElementById("btnExportNotes");
  const btnImportNotes = document.getElementById("btnImportNotes");

  const fab = document.getElementById("fabAddNote");
  const dlg = document.getElementById("createNoteDialog");
  const newTitle = document.getElementById("newNoteTitle");
  const newColor = document.getElementById("newNoteColor");
  const btnOk = document.getElementById("noteOk");
  const btnCancel = document.getElementById("noteCancel");
  const err = document.getElementById("noteCreateError");

  const filePicker = document.getElementById("filePicker");

  let notesDoc = null;

  init().catch((e) => {
    alert(String(e.message || e));
    bounceHome();
  });

  async function init() {
    if (!profileName) return bounceHome();
    if (!Store.isUnlocked(profileName)) return bounceHome();

    const profile = await Store.getProfile(profileName, true);
    if (!profile) return bounceHome();

    elTitle.textContent = profile.displayName || profile.name;
    elSub.textContent = "Notizen";

    notesDoc = await Store.loadNotes(profileName, true);
    render();

    bindUI();
  }

  function bindUI() {
    btnLogout.addEventListener("click", () => {
      Store.clearUnlocked(profileName);
      bounceHome();
    });

    btnExportNotes.addEventListener("click", async () => {
      const doc = await Store.loadNotes(profileName, true);
      Store.downloadJson(`${profileName}_notes.json`, doc);
    });

    btnImportNotes.addEventListener("click", () => {
      filePicker.value = "";
      filePicker.click();
    });

    filePicker.addEventListener("change", async () => {
      const f = filePicker.files?.[0];
      if (!f) return;

      try {
        const obj = await Store.readFileAsJson(f);
        if (!obj || !obj.profile || !Array.isArray(obj.notes)) {
          alert("Ungültige Notes-JSON.");
          return;
        }
        if (Store.safeName(obj.profile) !== Store.safeName(profileName)) {
          alert("Diese Datei gehört nicht zu diesem Profil.");
          return;
        }

        obj.profile = Store.safeName(profileName);
        obj.updatedAt = Store.nowIso();

        const saved = await Store.saveNotes(profileName, obj);
        notesDoc = saved;
        render();
      } catch (e) {
        alert(String(e.message || e));
      }
    });

    fab.addEventListener("click", () => {
      err.classList.add("hidden");
      newTitle.value = "";
      newColor.value = "#2a74ff";
      dlg.showModal();
      setTimeout(() => newTitle.focus(), 50);
    });

    btnCancel.addEventListener("click", () => dlg.close());

    btnOk.addEventListener("click", async () => {
      const title = String(newTitle.value || "").trim();
      if (!title) return showErr("Name fehlt.");

      const color = String(newColor.value || "#2a74ff");

      notesDoc = await Store.loadNotes(profileName, true);
      const nextLabel = computeNextLabel(notesDoc.notes.map(n => n.label));

      const note = {
        id: cryptoId(),
        label: nextLabel,
        title,
        color,
        content: "",
        createdAt: Store.nowIso(),
        updatedAt: Store.nowIso()
      };

      notesDoc.notes.push(note);

      try {
        const saved = await Store.saveNotes(profileName, notesDoc);
        notesDoc = saved;
        dlg.close();
        render();
        openNote(note.id);
      } catch (e) {
        showErr(String(e.message || e));
      }
    });
  }

  function showErr(msg) {
    err.textContent = msg;
    err.classList.remove("hidden");
  }

  function render() {
    const notes = notesDoc?.notes || [];
    grid.innerHTML = "";
    empty.classList.toggle("hidden", notes.length !== 0);

    notes
      .slice()
      .sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""))
      .forEach((n) => grid.appendChild(tile(n)));
  }

  function tile(note) {
    const t = document.createElement("div");
    t.className = "note-tile";
    t.style.background =
      `linear-gradient(180deg, rgba(255,255,255,.08), rgba(255,255,255,.05)), radial-gradient(700px 420px at 15% 10%, ${hexToRgba(note.color, 0.45)}, transparent 60%)`;

    const letter = document.createElement("div");
    letter.className = "note-letter";
    letter.textContent = note.label || "?";
    letter.style.background = `linear-gradient(180deg, ${hexToRgba(note.color, 0.35)}, rgba(0,0,0,.18))`;

    const title = document.createElement("div");
    title.className = "note-title";
    title.textContent = note.title || "Ohne Titel";

    const sub = document.createElement("div");
    sub.className = "note-sub";
    sub.textContent = "Tippen zum Öffnen";

    const tint = document.createElement("div");
    tint.className = "tint";

    t.appendChild(letter);
    t.appendChild(title);
    t.appendChild(sub);
    t.appendChild(tint);

    t.addEventListener("click", () => openNote(note.id));
    return t;
  }

  function openNote(noteId) {
    const url = new URL("note.html", window.location.href);
    url.searchParams.set("profile", profileName);
    url.searchParams.set("id", noteId);
    window.location.href = url.toString();
  }

  function bounceHome() {
    window.location.href = new URL("index.html", window.location.href).toString();
  }

  function cryptoId() {
    if (window.crypto?.randomUUID) return crypto.randomUUID();
    return "id_" + Math.random().toString(16).slice(2) + Date.now().toString(16);
  }

  function computeNextLabel(existingLabels) {
    const set = new Set((existingLabels || []).filter(Boolean));
    const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

    for (let len = 1; len <= 3; len++) {
      const max = Math.pow(letters.length, len);
      for (let i = 0; i < max; i++) {
        const label = toBase26(i, len, letters);
        if (!set.has(label)) return label;
      }
    }
    return "ZZZ";
  }

  function toBase26(n, len, alphabet) {
    let s = "";
    for (let i = 0; i < len; i++) {
      s = alphabet[n % 26] + s;
      n = Math.floor(n / 26);
    }
    return s;
  }

  function hexToRgba(hex, a) {
    const h = String(hex || "").replace("#", "");
    if (h.length !== 6) return `rgba(42,116,255,${a})`;
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    return `rgba(${r},${g},${b},${a})`;
  }
})();
