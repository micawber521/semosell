// Serves the static site. A contact form endpoint will live here; the contact
// email is never exposed to visitors in any form.
export default {
  async fetch(request, env) {
    return env.ASSETS.fetch(request);
  },
};
