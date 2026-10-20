// Where the website's proxy is (see proxy/worker.js): the dev server while it runs on this computer, the
// Cloudflare Worker once the website is on GitHub Pages.
window.dubuduConfig = {
  proxy: location.hostname === "localhost" ? "proxy" : "https://dubudu-proxy.andrewgoh725.workers.dev",
};
