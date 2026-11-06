// semosell.com Worker: serves public/ and handles the contact form.
// The destination email is never exposed to visitors. Submissions are relayed through
// Proton SMTP submission (smtp.protonmail.ch:587, STARTTLS, per-address SMTP token).
//
// Secrets (Cloudflare dashboard -> Worker -> Settings -> Variables and Secrets):
//   CONTACT_EMAIL        where submissions are delivered
//   SMTP_USER            Proton custom-domain address the token belongs to (the sender)
//   SMTP_TOKEN           Proton SMTP token for SMTP_USER
//   TURNSTILE_SITE_KEY   optional: enables Cloudflare Turnstile anti-spam
//   TURNSTILE_SECRET     optional: required if TURNSTILE_SITE_KEY is set
import { connect } from "cloudflare:sockets";

const ALLOWED_ORIGINS = ["https://semosell.com", "https://www.semosell.com"];
const LIMITS = { name: 100, email: 200, message: 5000 };

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/api/contact") return handleContact(request, env);

    const res = await env.ASSETS.fetch(request);
    if (!(res.headers.get("content-type") || "").includes("text/html")) return res;

    const formReady = env.CONTACT_EMAIL && env.SMTP_USER && env.SMTP_TOKEN;
    const siteKey = (env.TURNSTILE_SITE_KEY || "").trim();
    return new HTMLRewriter()
      .on("#contact", { element(el) { if (!formReady) el.remove(); } })
      .on("#turnstile", {
        element(el) {
          if (!siteKey) { el.remove(); return; }
          el.setAttribute("data-sitekey", siteKey);
        },
      })
      .on("head", {
        element(el) {
          if (siteKey) el.append('<script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>', { html: true });
        },
      })
      .transform(res);
  },
};

function reply(status, ok, msg) {
  return Response.json({ ok, msg }, { status, headers: { "Cache-Control": "no-store" } });
}

async function handleContact(request, env) {
  if (request.method !== "POST") return reply(405, false, "Method not allowed");
  if (!ALLOWED_ORIGINS.includes(request.headers.get("Origin") || "")) return reply(403, false, "Forbidden");
  if (!(env.CONTACT_EMAIL && env.SMTP_USER && env.SMTP_TOKEN)) return reply(503, false, "Contact form is not available yet.");

  let form;
  try { form = await request.formData(); } catch { return reply(400, false, "Bad request"); }
  const get = (k) => String(form.get(k) || "").trim();

  // Honeypot: real people never see or fill this field.
  if (get("website")) return reply(200, true, "Thanks, your message was sent.");

  const name = get("name"), email = get("email"), message = get("message");
  if (!name || !email || !message) return reply(400, false, "Please fill in every field.");
  if (name.length > LIMITS.name || email.length > LIMITS.email || message.length > LIMITS.message)
    return reply(400, false, "That message is too long.");
  if (!/^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/.test(email)) return reply(400, false, "Please enter a valid email address.");

  if (env.TURNSTILE_SITE_KEY) {
    const ok = await verifyTurnstile(get("cf-turnstile-response"), env.TURNSTILE_SECRET, request.headers.get("CF-Connecting-IP"));
    if (!ok) return reply(400, false, "Please complete the verification and try again.");
  }

  try {
    await sendMail(env, { name, email, message, ip: request.headers.get("CF-Connecting-IP") || "unknown" });
  } catch (e) {
    console.error("smtp failure:", e && e.message);
    return reply(502, false, "Sorry, the message could not be sent. Please try again later.");
  }
  return reply(200, true, "Thanks, your message was sent.");
}

async function verifyTurnstile(token, secret, ip) {
  if (!token || !secret) return false;
  const body = new FormData();
  body.append("secret", secret);
  body.append("response", token);
  if (ip) body.append("remoteip", ip);
  const r = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body });
  const j = await r.json().catch(() => ({}));
  return j.success === true;
}

// ---------- minimal SMTP submission client ----------

const enc = new TextEncoder();
const oneLine = (s) => s.replace(/[\r\n]+/g, " ");
const b64 = (s) => { let bin = ""; for (const b of enc.encode(s)) bin += String.fromCharCode(b); return btoa(bin); };
const encodeHeader = (s) => (/^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${b64(s)}?=`);

function buildMessage(env, { name, email, message, ip }) {
  const from = env.SMTP_USER.trim(), to = env.CONTACT_EMAIL.trim();
  const body = `From: ${name} <${email}>\nIP: ${ip}\n\n${message}\n`.replace(/\r?\n/g, "\r\n");
  const body64 = b64(body).replace(/.{1,76}/g, "$&\r\n");
  const domain = from.split("@")[1] || "semosell.com";
  return [
    `From: ${encodeHeader("semosell.com contact form")} <${from}>`,
    `To: <${to}>`,
    `Reply-To: ${encodeHeader(oneLine(name).replace(/[<>"]/g, ""))} <${oneLine(email)}>`,
    `Subject: ${encodeHeader("semosell.com contact: " + oneLine(name))}`,
    `Date: ${new Date().toUTCString()}`,
    `Message-ID: <${crypto.randomUUID()}@${domain}>`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=utf-8",
    "Content-Transfer-Encoding: base64",
    "",
    body64,
  ].join("\r\n");
}

class Smtp {
  constructor(socket) { this.attach(socket); }
  attach(socket) {
    this.socket = socket;
    this.reader = socket.readable.getReader();
    this.writer = socket.writable.getWriter();
    this.buf = "";
    this.dec = new TextDecoder();
  }
  async read(expect) {
    // Read one full (possibly multi-line) reply, e.g. "250-..." lines ending with "250 ...".
    for (;;) {
      const lines = this.buf.split("\r\n");
      for (let i = 0; i < lines.length - 1; i++) {
        if (/^\d{3} /.test(lines[i])) {
          const code = Number(lines[i].slice(0, 3));
          this.buf = lines.slice(i + 1).join("\r\n");
          if (code !== expect) throw new Error(`SMTP expected ${expect}, got ${lines[i].slice(0, 120)}`);
          return;
        }
      }
      const { value, done } = await this.reader.read();
      if (done) throw new Error("SMTP connection closed");
      this.buf += this.dec.decode(value, { stream: true });
    }
  }
  async cmd(line, expect) {
    await this.writer.write(enc.encode(line + "\r\n"));
    await this.read(expect);
  }
}

async function sendMail(env, fields) {
  const user = env.SMTP_USER.trim();
  const socket = connect({ hostname: "smtp.protonmail.ch", port: 587 }, { secureTransport: "starttls" });
  const s = new Smtp(socket);
  try {
    await s.read(220);
    await s.cmd("EHLO semosell.com", 250);
    await s.cmd("STARTTLS", 220);
    s.reader.releaseLock();
    s.writer.releaseLock();
    s.attach(socket.startTls());
    await s.cmd("EHLO semosell.com", 250);
    await s.cmd("AUTH PLAIN " + b64(`\u0000${user}\u0000${env.SMTP_TOKEN.trim()}`), 235);
    await s.cmd(`MAIL FROM:<${user}>`, 250);
    await s.cmd(`RCPT TO:<${env.CONTACT_EMAIL.trim()}>`, 250);
    await s.cmd("DATA", 354);
    // Body is base64, so no line can start with "." and no dot-stuffing is needed.
    await s.cmd(buildMessage(env, fields) + "\r\n.", 250);
    await s.cmd("QUIT", 221).catch(() => {});
  } finally {
    try { await s.socket.close(); } catch {}
  }
}
