const { getContent, putContent } = require("./_lib/github");
const { json, readBody, safeName, nowIso } = require("./_lib/utils");

module.exports = async function handler(req, res) {
  try {
    if (req.method === "GET") {
      const profile = safeName(req.query?.profile);
      if (!profile) return json(res, 400, { error: "Fehlender Profilname." });

      const notesPath = `data/notes/${profile}_notes.json`;
      const c = await getContent(notesPath);

      if (!c.exists) {
        const doc = { profile, updatedAt: nowIso(), notes: [] };
        await putContent(
          notesPath,
          JSON.stringify(doc, null, 2),
          `Init notes for ${profile}`
        );
        return json(res, 200, doc);
      }

      let data = {};
      try { data = JSON.parse(c.content); } catch { data = { profile, updatedAt: nowIso(), notes: [] }; }

      if (!data || typeof data !== "object") data = { profile, updatedAt: nowIso(), notes: [] };
      if (!Array.isArray(data.notes)) data.notes = [];
      data.profile = profile;

      return json(res, 200, data);
    }

    if (req.method === "PUT") {
      const body = await readBody(req);

      const profile = safeName(body?.profile || body?.doc?.profile);
      const docIn = body?.doc;

      if (!profile) return json(res, 400, { error: "Fehlender Profilname." });
      if (!docIn || typeof docIn !== "object") return json(res, 400, { error: "Ungültige Payload." });

      const notesPath = `data/notes/${profile}_notes.json`;

      const existing = await getContent(notesPath);
      let serverDoc = { profile, updatedAt: nowIso(), notes: [] };
      let sha = undefined;

      if (existing.exists) {
        sha = existing.sha;
        try { serverDoc = JSON.parse(existing.content); } catch { /* ignore */ }
      }

      if (!Array.isArray(serverDoc.notes)) serverDoc.notes = [];
      serverDoc.profile = profile;

      const inNotes = Array.isArray(docIn.notes) ? docIn.notes : [];
      const map = new Map();

      for (const n of serverDoc.notes) {
        if (n && n.id) map.set(n.id, n);
      }
      for (const n of inNotes) {
        if (!n || !n.id) continue;
        const prev = map.get(n.id);
        if (!prev) {
          map.set(n.id, n);
        } else {
          const prevU = prev.updatedAt || "";
          const nextU = n.updatedAt || "";
          map.set(n.id, (nextU && nextU > prevU) ? n : prev);
        }
      }

      const outDoc = {
        profile,
        updatedAt: nowIso(),
        notes: Array.from(map.values())
      };

      await putContent(
        notesPath,
        JSON.stringify(outDoc, null, 2),
        `Update notes for ${profile}`,
        sha
      );

      return json(res, 200, { ok: true, doc: outDoc });
    }

    return json(res, 405, { error: "Nur GET/PUT erlaubt." });
  } catch (e) {
    return json(res, 500, { error: "Fehler in /api/notes", details: String(e.message || e) });
  }
};
