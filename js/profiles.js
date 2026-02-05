/* profiles.js - index.html logic (API-backed profiles) */

(function () {
  const elGrid = document.getElementById("profileGrid");
  const elEmpty = document.getElementById("emptyHint");

  const pinDialog = document.getElementById("pinDialog");
  const pinForName = document.getElementById("pinForName");
  const pinInput = document.getElementById("pinInput");
  const rememberPin = document.getElementById("rememberPin");
  const pinError = document.getElementById("pinError");

  const createDialog = document.getElementById("createProfileDialog");
  const newProfileName = document.getElementById("newProfileName");
  const newProfilePin = document.getElementById("newProfilePin");
  const createError = document.getElementById("createError");

  const btnAdd = document.getElementById("fabAddProfile");
  const btnPinOk = document.getElementById("pinOk");
  const btnPinCancel = document.getElementById("pinCancel");
  const btnCreateOk = document.getElementById("createOk");
  const btnCreateCancel = document.getElementById("createCancel");

  const btnImportProfile = document.getElementById("btnImportProfile");
  const btnExportAll = document.getElementById("btnExportAll");

  let selectedProfile = null;
  let profilesList = [];

  init().catch((e) => {
    showEmptyHint(`Fehler: ${String(e.message || e)}`);
  });

  async function init() {
    await ensureDemoExists();
    await refreshProfiles();
    bindUI();
  }

  function bindUI() {
    btnAdd.addEventListener("click", () => {
      createError.classList.add("hidden");
      newProfileName.value = "";
      newProfilePin.value = "";
      createDialog.showModal();
      setTimeout(() => newProfileName.focus(), 50);
    });

    btnCreateCancel.addEventListener("click", () => createDialog.close());

    btnCreateOk.addEventListener("click", async () => {
      const rawName = newProfileName.value;
      const rawPin = newProfilePin.value;

      const name = Store.safeName(rawName);
      if (!name) return showCreateError("Profilname ist leer oder ungültig.");
      if (!rawPin || rawPin.trim().length < 3) return showCreateError("PIN muss mindestens 3 Zeichen haben.");

      try {
        const prof = await Store.createProfile({
          name,
          displayName: rawName.trim(),
          pinHash: Store.fnv1a(rawPin.trim())
        });

        // Notes werden serverseitig initialisiert; zusätzlich einmal laden, damit Cache gefüllt ist
        await Store.loadNotes(prof.name, false);

        createDialog.close();
        await refreshProfiles();
      } catch (e) {
        showCreateError(String(e.message || e));
      }
    });

    btnPinCancel.addEventListener("click", () => pinDialog.close());

    btnPinOk.addEventListener("click", async () => {
      if (!selectedProfile) return;

      const prof = await Store.getProfile(selectedProfile, true);
      if (!prof) return;

      const entered = String(pinInput.value || "").trim();
      const hash = Store.fnv1a(entered);

      if (hash !== prof.pinHash) {
        pinError.classList.remove("hidden");
        return;
      }

      pinError.classList.add("hidden");
      Store.setUnlocked(selectedProfile, rememberPin.checked, 21);
      pinDialog.close();
      goApp(selectedProfile);
    });

    // Optional Import/Export bleibt (lokal)
    btnImportProfile.addEventListener("click", async () => {
      const input = makeFileInput();
      input.click();
      input.onchange = async () => {
        const f = input.files?.[0];
        if (!f) return;
        try {
          const obj = await Store.readFileAsJson(f);
          if (!obj || !obj.name || !obj.pinHash) return alert("Ungültige Profil-JSON.");
          const name = Store.safeName(obj.name);
          await Store.createProfile({
            name,
            displayName: obj.displayName || obj.name,
            pinHash: obj.pinHash
          });
          await refreshProfiles();
        } catch {
          alert("Import fehlgeschlagen.");
        }
      };
    });

    btnExportAll.addEventListener("click", async () => {
      try {
        const profiles = profilesList.slice();
        const notesDocs = [];
        for (const p of profiles) {
          const doc = await Store.loadNotes(p.name, true);
          notesDocs.push(doc);
        }
        const bundle = {
          exportedAt: Store.nowIso(),
          profiles,
          notes: notesDocs
        };
        Store.downloadJson("all_profiles_and_notes.json", bundle);
      } catch (e) {
        alert(String(e.message || e));
      }
    });
  }

  function showCreateError(msg) {
    createError.textContent = msg;
    createError.classList.remove("hidden");
  }

  async function refreshProfiles() {
    elGrid.innerHTML = "";
    profilesList = await Store.listProfiles();

    if (!profilesList.length) {
      showEmptyHint("Noch kein Profil vorhanden. Unten rechts kannst du eins erstellen.");
      return;
    }

    elEmpty.classList.add("hidden");

    for (const p of profilesList) {
      const card = document.createElement("div");
      card.className = "profile-card glass";

      const h = document.createElement("h3");
      h.className = "pname";
      h.textContent = p.displayName || p.name;

      const meta = document.createElement("p");
      meta.className = "pmeta";
      meta.textContent = "Tippen zum Öffnen";

      card.appendChild(h);
      card.appendChild(meta);

      if (Store.isUnlocked(p.name)) {
        const badge = document.createElement("div");
        badge.className = "badge";
        badge.textContent = "cached";
        card.appendChild(badge);
      }

      card.addEventListener("click", () => onSelectProfile(p.name));
      elGrid.appendChild(card);
    }
  }

  function showEmptyHint(text) {
    elEmpty.textContent = text;
    elEmpty.classList.remove("hidden");
  }

  async function onSelectProfile(name) {
    selectedProfile = name;

    if (Store.isUnlocked(name)) {
      goApp(name);
      return;
    }

    const prof = await Store.getProfile(name, true);
    pinForName.textContent = prof?.displayName || name;
    pinInput.value = "";
    rememberPin.checked = true;
    pinError.classList.add("hidden");
    pinDialog.showModal();
    setTimeout(() => pinInput.focus(), 50);
  }

  function goApp(profileName) {
    const url = new URL("app.html", window.location.href);
    url.searchParams.set("profile", profileName);
    window.location.href = url.toString();
  }

  function makeFileInput() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "application/json";
    input.style.display = "none";
    document.body.appendChild(input);
    input.addEventListener("change", () => setTimeout(() => input.remove(), 0));
    return input;
  }

  async function ensureDemoExists() {
    // Erstellt Demo nur, wenn es serverseitig nicht existiert
    const existing = await Store.getProfile("demo", false);
    if (existing) return;

    await Store.createProfile({
      name: "demo",
      displayName: "Demo",
      pinHash: Store.fnv1a("1234")
    });

    // Demo-Notiz setzen
    const doc = await Store.loadNotes("demo", false);
    if (doc.notes && doc.notes.length) return;

    doc.notes = [
      {
        id: cryptoId(),
        label: "A",
        title: "Willkommen",
        color: "#2a74ff",
        content: "Das ist eine Demo-Notiz.\n\nTippe drauf und schreib weiter.\n",
        createdAt: Store.nowIso(),
        updatedAt: Store.nowIso()
      }
    ];

    await Store.saveNotes("demo", doc);
  }

  function cryptoId() {
    if (window.crypto?.randomUUID) return crypto.randomUUID();
    return "id_" + Math.random().toString(16).slice(2) + Date.now().toString(16);
  }
})();
