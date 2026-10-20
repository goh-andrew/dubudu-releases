// The Read tab's work in the browser: fetching through the proxy (config.js), and reading web pages and feeds with
// the browser's own parser where the app uses jsoup (data/ArticleImporter.kt, data/NewsFeeds.kt), step for step.
window.dubuduReader = {
  proxied(url) {
    return window.dubuduConfig.proxy + "?url=" + encodeURIComponent(url);
  },

  // A page as JSON: {url (after redirects), text}. Fails with the reason, as the app's request would.
  async fetchText(url) {
    const r = await fetch(this.proxied(url));
    if (!r.ok) throw new Error("HTTP " + r.status + (r.status >= 500 ? ": " + (await r.text()).slice(0, 160) : ""));
    return JSON.stringify({ url: r.headers.get("X-Final-Url") || url, text: await r.text() });
  },

  // A photo's bytes, or null.
  async fetchBytes(url) {
    try {
      const r = await fetch(this.proxied(url));
      if (!r.ok) return null;
      const b = await r.arrayBuffer();
      return b.byteLength > 0 && b.byteLength <= 8 * 1024 * 1024 ? new Int8Array(b) : null;
    } catch (e) {
      return null;
    }
  },

  // jsoup's Element.text(): the text with its whitespace collapsed, a <br> counting as a space.
  text(el) {
    const copy = el.cloneNode(true);
    if (copy.querySelectorAll) copy.querySelectorAll("br").forEach(b => b.replaceWith(" "));
    return copy.textContent.replace(/\s+/g, " ").trim();
  },

  abs(value, base) {
    try { return value ? new URL(value, base).href : ""; } catch (e) { return ""; }
  },

  // ArticleImporter.fetch's page reading: the title, the candidate paragraphs (the site's body selector, else
  // <article>'s paragraphs, else every paragraph) and the lead photo. The filtering stays in Kotlin, as the app's.
  article(html, url, selector) {
    const doc = new DOMParser().parseFromString(html, "text/html");
    const og = doc.querySelector('meta[property="og:title"]');
    const ogTitle = og && og.getAttribute("content");
    const title = ogTitle && ogTitle.trim() ? ogTitle : doc.title.replace(/\s+/g, " ").trim();
    let found = selector ? [...doc.querySelectorAll(selector)] : [];
    if (!found.length) found = [...doc.querySelectorAll("article p")];
    if (!found.length) found = [...doc.querySelectorAll("p")];
    // A block of bare text (Solidot) is split at its line breaks; paragraphs are taken whole.
    const texts = found.flatMap(el => el.tagName.toLowerCase() === "p" ? [this.text(el)] : el.textContent.split(/\r?\n/));
    const meta = sel => { const m = doc.querySelector(sel); return m ? this.abs(m.getAttribute("content"), url) : ""; };
    const img = doc.querySelector("article img[src]");
    const image = meta('meta[property="og:image"]') || meta('meta[name="twitter:image"]') || (img ? this.abs(img.getAttribute("src"), url) : "");
    return JSON.stringify({ title, texts, image });
  },

  // NewsFeeds.parse: a feed's title and its RSS items or Atom entries, or {error}.
  feed(xml, url) {
    const doc = new DOMParser().parseFromString(xml, "application/xml");
    const all = (el, tag) => [...el.getElementsByTagName(tag)];
    const first = (el, ...tags) => { for (const t of tags) { const f = el.getElementsByTagName(t)[0]; if (f) return f; } return null; };
    const rss = all(doc, "item"), atom = all(doc, "entry");
    if (doc.getElementsByTagName("parsererror").length || (!rss.length && !atom.length && !first(doc, "rss", "feed", "channel"))) {
      return JSON.stringify({ error: "Not an RSS or Atom feed" });
    }
    const htmlText = h => this.text(new DOMParser().parseFromString(h || "", "text/html").body).slice(0, 160);
    const htmlImage = h => { const i = new DOMParser().parseFromString(h || "", "text/html").querySelector("img[src]"); return i ? i.getAttribute("src") : null; };
    const date = s => { const t = Date.parse((s || "").trim()); return isNaN(t) ? null : t; };
    const channel = first(doc, "channel"), feedEl = first(doc, "feed");
    const titleEl = (channel && [...channel.children].find(c => c.tagName === "title")) || (feedEl && [...feedEl.children].find(c => c.tagName === "title"));
    const items = [];
    for (const item of rss) {
      const title = (first(item, "title")?.textContent || "").trim();
      const link = (first(item, "link")?.textContent || "").trim() || (first(item, "guid")?.textContent || "").trim();
      if (!link || !title) continue;
      const description = first(item, "description")?.textContent || "";
      const media = [...all(item, "media:thumbnail"), ...all(item, "media:content"), ...all(item, "enclosure").filter(e => (e.getAttribute("type") || "").startsWith("image"))];
      const image = media.map(m => m.getAttribute("url")).find(u => u && u.trim()) || htmlImage(description);
      items.push({ title, link, summary: htmlText(description), published: date(first(item, "pubDate", "dc:date")?.textContent), image });
    }
    for (const entry of atom) {
      const title = (first(entry, "title")?.textContent || "").trim();
      const links = all(entry, "link");
      const linkEl = links.find(l => l.getAttribute("rel") === "alternate") || links[0];
      const link = (linkEl?.getAttribute("href") || "").trim();
      if (!link || !title) continue;
      const html = first(entry, "summary", "content")?.textContent || "";
      items.push({ title, link, summary: htmlText(html), published: date(first(entry, "published", "updated")?.textContent), image: htmlImage(html) });
    }
    return JSON.stringify({ title: (titleEl?.textContent || "").trim(), items });
  },

  // Page Up/Down and the arrow keys turn the reader's pages, as the volume keys do on the phone (PageKeys).
  onPageKeys(handler) {
    window.addEventListener("keydown", e => {
      if (e.target && /input|textarea/i.test(e.target.tagName)) return;
      const d = { PageDown: 1, ArrowRight: 1, PageUp: -1, ArrowLeft: -1 }[e.key];
      if (d) handler(d);
    });
  },
};
