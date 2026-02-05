const { getContent, putContent } = require("./_lib/github");
const { json, readBody, safeName, nowIso } = require("./_lib/utils");

module.exports = async function handler(req, res) {
  try {
    if (req.method === "GET") {
      const name = safeName(req.query?.name);
      if (!name) return json(res, 400, { error: "Fehlender Profilname." });

      const filePath = `data/profiles/${name}.json`;
      const c = await getContent(filePath);
      if (!c.exists) return json(res, 404, { error: "Profil nicht gefunden." });

      let data = {};
      try { data = JSON.parse(c.content); } catch { data = {}; }
      return json(res, 200, data);
    }

    if (req.method === "POST") {
      const body = await readBody(req);

      const name = safeName(body?.name);
      const displayName = String(body?.displayName || body?.name || "").trim();
      const pinHash = String(body?.pinHash || "").trim();

      if (!name) return json(res, 400, { error: "Ungültiger Profilname." });
      if (!displayName) return json(res, 400, { error: "DisplayName fehlt." });
      if (!pinHash) return json(res, 400, { error: "pinHash fehlt." });

      const profilePath = `data/profiles/${name}.json`;
      const notesPath = `data/notes/${name}_notes.json`;

      // Existenz prüfen
      const existing = await getContent(profilePath);
      if (existing.exists) {
        return json(res, 409, { error: "Profil existiert bereits." });
      }

      const profileDoc = {
        name,
        displayName,
        pinHash,
        createdAt: nowIso(),
        updatedAt: nowIso()
      };

      // Profil schreiben
      await putContent(
        profilePath,
        JSON.stringify(profileDoc, null, 2),
        `Create profile ${name}`
      );

      // Notes initialisieren (nur wenn nicht vorhanden)
      const notesExisting = await getContent(notesPath);
      if (!notesExisting.exists) {
        const notesDoc = {
          profile: name,
          updatedAt: nowIso(),
          notes: []
        };

        await putContent(
          notesPath,
          JSON.stringify(notesDoc, null, 2),
          `Init notes for ${name}`
        );
      }

      return json(res, 200, { ok: true, profile: profileDoc });
    }

    return json(res, 405, { error: "Nur GET/POST erlaubt." });
  } catch (e) {
    return json(res, 500, { error: "Fehler in /api/profile", details: String(e.message || e) });
  }
};
