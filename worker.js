// Serves the static site and injects the contact email from the CONTACT_EMAIL secret,
// so the address never lives in this public repo. No secret set -> contact line removed.
export default {
  async fetch(request, env) {
    const res = await env.ASSETS.fetch(request);
    if (!(res.headers.get("content-type") || "").includes("text/html")) return res;
    const email = (env.CONTACT_EMAIL || "").trim();
    return new HTMLRewriter()
      .on("#contact", {
        element(el) { if (!email) el.remove(); },
      })
      .on("#contact a", {
        element(el) {
          if (!email) return;
          el.setAttribute("href", "mailto:" + email);
          el.setInnerContent(email);
        },
      })
      .transform(res);
  },
};
