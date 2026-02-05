/* note.js - note.html logic (API-backed autosave) */

(function () {
  const params = new URLSearchParams(location.search);
  const profileName = params.get("profile");
  const noteId = params.get("id");

  const btnBack = document.getElementById("btnBack");
  const btnDelete = document.getElementById("btnDelete");

  const labelTitle = document.getElementById("noteLabelTitle");
  const meta = document.getElementById("noteMeta");

  const titleInput = document.getElementById("noteTitle");
  const colorInput = document.getElementById("noteColor");
  const textArea = document.getElementById("noteText");
  const editorShell = document.getElementById("editorShell");
  const saveState = document.getElementById("saveState");

  let notesDoc = null;
  let note = null;

  init().catch((e) => {
    alert(String(e.message || e));
    bounceApp();
  });

  async function init() {
    if (!profileName || !noteId) return bounceApp();
    if (!Store.isUnlocked(profileName)) return bounceApp();

    notesDoc = await Store.loadNotes(profileName, true);
    note = notesDoc.notes.find(n => n.id === noteId);
    if (!note) return bounceApp();

    renderNote();
    bindUI();
  }

  function bindUI() {
    btnBack.addEventListener("click", () => bounceApp());

    btnDelete.addEventListener("click", async () => {
      const ok = confirm("Notiz wirklich löschen?");
      if (!ok) return;

      notesDoc = await Store.loadNotes(profileName, true);
      notesDoc.notes = notesDoc.notes.filter(n => n.id !== noteId);

      try {
        saveState.textContent = "Speichert...";
        await Store.saveNotes(profileName, notesDoc);
        bounceApp();
      } catch (e) {
        saveState.textContent = "Speichern fehlgeschlagen";
        alert(String(e.message || e));
      }
    });

    let saveTimer = null;
    const scheduleSave = () => {
      saveState.textContent = "Speichert...";
      clearTimeout(saveTimer);
      saveTimer = setTimeout(() => doSave().catch(() => {}), 260);
    };

    titleInput.addEventListener("input", scheduleSave);
    colorInput.addEventListener("input", scheduleSave);
    textArea.addEventListener("input", scheduleSave);
  }

  async function doSave() {
    notesDoc = await Store.loadNotes(profileName, true);
    const idx = notesDoc.notes.findIndex(n => n.id === noteId);
    if (idx === -1) return;

    const updated = {
      ...notesDoc.notes[idx],
      title: titleInput.value.trim() || "Ohne Titel",
      color: colorInput.value,
      content: textArea.value,
      updatedAt: Store.nowIso()
    };

    notesDoc.notes[idx] = updated;

    try {
      const serverDoc = await Store.saveNotes(profileName, notesDoc);
      notesDoc = serverDoc;
      note = serverDoc.notes.find(n => n.id === noteId) || updated;

      saveState.textContent = "Gespeichert";
      meta.textContent = "Letztes Update: " + new Date(note.updatedAt || note.createdAt).toLocaleString();
      applyTint(note.color);
    } catch (e) {
      saveState.textContent = "Speichern fehlgeschlagen";
      throw e;
    }
  }

  function renderNote() {
    labelTitle.textContent = `${note.label} – ${note.title || "Notiz"}`;
    titleInput.value = note.title || "";
    colorInput.value = note.color || "#2a74ff";
    textArea.value = note.content || "";

    meta.textContent = "Letztes Update: " + new Date(note.updatedAt || note.createdAt).toLocaleString();
    applyTint(note.color);

    ensureTrailingEmptyLine();
    setTimeout(() => {
      textArea.focus();
      const end = textArea.value.length;
      textArea.setSelectionRange(end, end);
      saveState.textContent = "Bereit";
    }, 60);
  }

  function ensureTrailingEmptyLine() {
    let v = textArea.value || "";
    if (!v.endsWith("\n")) v += "\n";
    if (!v.endsWith("\n\n")) v += "\n";
    textArea.value = v;
  }

  function applyTint(hex) {
    const rgba = hexToRgba(hex, 0.22);
    editorShell.style.background =
      `linear-gradient(180deg, rgba(255,255,255,.10), rgba(255,255,255,.06)), radial-gradient(800px 420px at 20% 0%, ${rgba}, transparent 60%)`;
  }

  function bounceApp() {
    const url = new URL("app.html", window.location.href);
    if (profileName) url.searchParams.set("profile", profileName);
    window.location.href = url.toString();
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
