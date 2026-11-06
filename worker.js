// Serves the static site. The contact email (Worker secret CONTACT_EMAIL) is never in the HTML:
// the page's "Show email" button POSTs to /api/contact and gets it only on a real click,
// so scrapers reading page source never see it. No secret set -> contact line removed.
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const email = (env.CONTACT_EMAIL || "").trim();

    if (url.pathname === "/api/contact") {
      if (request.method !== "POST" || !email) return new Response("Not found", { status: 404 });
      return Response.json({ email }, {
        headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" },
      });
    }

    const res = await env.ASSETS.fetch(request);
    if (email || !(res.headers.get("content-type") || "").includes("text/html")) return res;
    return new HTMLRewriter().on("#contact", { element(el) { el.remove(); } }).transform(res);
  },
};
