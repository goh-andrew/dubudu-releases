// The few browser services the Kotlin code calls (see Browser.kt): Google sign-in, Drive requests and local storage.
window.dubudu = {
  storageGet(key) {
    try { return localStorage.getItem(key); } catch (e) { return null; }
  },

  storageSet(key, value) {
    try { localStorage.setItem(key, value); return true; } catch (e) { return false; }
  },

  // Reads Chinese aloud with the browser's voice; false if it has none.
  speak(text, rate) {
    if (!window.speechSynthesis) return false;
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "zh-CN";
    u.rate = rate;
    const voice = speechSynthesis.getVoices().find(v => v.lang && v.lang.replace("_", "-").startsWith("zh-CN"));
    if (voice) u.voice = voice;
    speechSynthesis.speak(u);
    return true;
  },

  // Kept only while the tab is open (the Google token).
  sessionGet(key) {
    try { return sessionStorage.getItem(key); } catch (e) { return null; }
  },

  sessionSet(key, value) {
    try { sessionStorage.setItem(key, value); return true; } catch (e) { return false; }
  },

  // An access token for the app's hidden Drive folder. Google shows its own window; prompt "" skips the account
  // choice when this browser has signed in before.
  signIn(clientId, prompt) {
    return new Promise((resolve, reject) => {
      if (!window.google || !google.accounts || !google.accounts.oauth2) {
        reject(new Error("Google's sign-in script hasn't loaded (offline, or blocked by an extension)"));
        return;
      }
      const client = google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: "https://www.googleapis.com/auth/drive.appdata",
        // The token and when it runs out (ms), as JSON.
        callback: r => r.error ? reject(new Error(r.error))
          : resolve(JSON.stringify({ token: r.access_token, expires: Date.now() + (Number(r.expires_in) || 3600) * 1000 })),
        error_callback: e => reject(new Error(e.type || "sign-in failed")),
      });
      client.requestAccessToken({ prompt });
    });
  },

  // A Drive API GET, as text. A refused token fails with "auth".
  async drive(token, url) {
    const r = await fetch(url, { headers: { Authorization: "Bearer " + token } });
    if (r.status === 401 || r.status === 403) throw new Error("auth");
    if (!r.ok) throw new Error("Drive said " + r.status + ": " + (await r.text()).slice(0, 200));
    return await r.text();
  },

  // Creates this browser's sync file in the app's hidden folder, as the app's DriveApi.create; resolves to its id.
  async driveCreate(token, name, body, model) {
    const boundary = "dubudu" + Date.now();
    const meta = JSON.stringify({ name, parents: ["appDataFolder"], appProperties: { model } });
    const multipart = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n` +
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${body}\r\n--${boundary}--`;
    const r = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id", {
      method: "POST",
      headers: { Authorization: "Bearer " + token, "Content-Type": "multipart/related; boundary=" + boundary },
      body: multipart,
    });
    return (await window.dubudu.checked(r)).id;
  },

  // Replaces the file's contents, as the app's DriveApi.update.
  async driveUpdate(token, id, body) {
    const r = await fetch(`https://www.googleapis.com/upload/drive/v3/files/${id}?uploadType=media&fields=id`, {
      method: "PATCH",
      headers: { Authorization: "Bearer " + token, "Content-Type": "application/json; charset=UTF-8" },
      body,
    });
    await window.dubudu.checked(r);
    return "";
  },

  async checked(r) {
    if (r.status === 401 || r.status === 403) throw new Error("auth");
    if (!r.ok) throw new Error("Drive said " + r.status + ": " + (await r.text()).slice(0, 200));
    return await r.json();
  },
};
