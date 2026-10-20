// The app's databases in the browser (dict.db, strokes.db), opened with sql.js (SQLite as WebAssembly). Each is
// downloaded once and kept in the browser's cache; <name>.json names the current file, so a new one replaces the old.
window.dubuduDb = {
  dbs: {},
  sql: null,

  async open(name) {
    if (this.dbs[name]) return "";
    this.sql = this.sql || await initSqlJs({ locateFile: f => "vendor/" + f });
    const manifest = await (await fetch(name + ".json", { cache: "no-cache" })).json();
    const cache = await caches.open("dubudu-" + name);
    let r = await cache.match(manifest.file);
    if (!r) {
      r = await fetch(manifest.file);
      if (!r.ok) throw new Error("Couldn't download " + name + ".db (" + r.status + ")");
      await cache.put(manifest.file, r.clone());
      for (const old of await cache.keys()) if (!old.url.endsWith("/" + manifest.file)) await cache.delete(old);
    }
    // Unzipped here, unless the server already had the browser do it (then it no longer starts with gzip's 1f 8b).
    let bytes = new Uint8Array(await r.arrayBuffer());
    if (bytes[0] === 0x1f && bytes[1] === 0x8b) {
      bytes = new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"))).arrayBuffer());
    }
    this.dbs[name] = new this.sql.Database(bytes);
    return "";
  },

  // Rows of a query as JSON: an array of arrays, columns in order. Parameters are a JSON array.
  query(name, sql, params) {
    const stmt = this.dbs[name].prepare(sql);
    try {
      stmt.bind(JSON.parse(params));
      const rows = [];
      while (stmt.step()) rows.push(stmt.get());
      return JSON.stringify(rows);
    } finally {
      stmt.free();
    }
  },
};
