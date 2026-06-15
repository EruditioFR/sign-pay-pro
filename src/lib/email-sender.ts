const GATEWAY_URL = "https://connector-gateway.lovable.dev/resend";

export interface SendEmailParams {
  to: string | string[];
  subject: string;
  html: string;
  from?: string;
  reply_to?: string;
}

export async function sendResendEmail(params: SendEmailParams) {
  const LOVABLE_API_KEY = process.env.LOVABLE_API_KEY;
  if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");
  const RESEND_API_KEY = process.env.RESEND_API_KEY;
  if (!RESEND_API_KEY) throw new Error("RESEND_API_KEY is not configured");

  const res = await fetch(`${GATEWAY_URL}/emails`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "X-Connection-Api-Key": RESEND_API_KEY,
    },
    body: JSON.stringify({
      from: params.from ?? "Notifications <onboarding@resend.dev>",
      to: Array.isArray(params.to) ? params.to : [params.to],
      subject: params.subject,
      html: params.html,
      ...(params.reply_to ? { reply_to: params.reply_to } : {}),
    }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(`Resend send failed [${res.status}]: ${JSON.stringify(data)}`);
    try {
      const { reportServerError } = await import("@/lib/observability.server");
      void reportServerError(err, {
        source: "email.resend",
        category: "technical",
        severity: res.status >= 500 ? "critical" : "error",
        code: `RESEND_${res.status}`,
        context: { to: params.to, subject: params.subject, status: res.status },
      });
    } catch { /* ignore */ }
    throw err;
  }
  return data as { id?: string };
}

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

export function renderShareEmail(opts: {
  recipientName?: string | null;
  documentTitle: string;
  url: string;
  expiresAt?: string | null;
  senderOrg?: string | null;
}) {
  const greet = opts.recipientName ? `Bonjour ${escapeHtml(opts.recipientName)},` : "Bonjour,";
  const expires = opts.expiresAt ? `<p style="color:#666;font-size:12px">Ce lien expire le ${new Date(opts.expiresAt).toLocaleDateString("fr-FR")}.</p>` : "";
  const org = opts.senderOrg ? escapeHtml(opts.senderOrg) : "Votre interlocuteur";
  return `<!doctype html><html><body style="font-family:Arial,sans-serif;background:#fff;padding:24px;color:#111">
  <div style="max-width:560px;margin:auto">
    <h2 style="margin:0 0 16px">Un document vous a été partagé</h2>
    <p>${greet}</p>
    <p>${org} vous partage le document <strong>${escapeHtml(opts.documentTitle)}</strong>.</p>
    <p style="margin:24px 0">
      <a href="${opts.url}" style="background:#111;color:#fff;padding:12px 20px;border-radius:6px;text-decoration:none;display:inline-block">Ouvrir le document</a>
    </p>
    <p style="font-size:12px;color:#666">Ou copiez ce lien : <br/><a href="${opts.url}">${opts.url}</a></p>
    ${expires}
  </div></body></html>`;
}

export function renderSignatureRequestEmail(opts: {
  signerName: string;
  documentTitle: string;
  url: string;
  expiresAt?: string | null;
  senderOrg?: string | null;
  paymentUrl?: string | null;
  paymentAmountLabel?: string | null;
}) {
  const org = opts.senderOrg ? escapeHtml(opts.senderOrg) : "Votre interlocuteur";
  const expires = opts.expiresAt ? `<p style="color:#666;font-size:12px">À signer avant le ${new Date(opts.expiresAt).toLocaleDateString("fr-FR")}.</p>` : "";
  const payment = opts.paymentUrl
    ? `<hr style="border:none;border-top:1px solid #eee;margin:24px 0"/>
       <h3 style="margin:0 0 8px;font-size:15px">Paiement${opts.paymentAmountLabel ? ` — ${escapeHtml(opts.paymentAmountLabel)}` : ""}</h3>
       <p style="margin:0 0 12px;font-size:13px;color:#444">Un règlement est attendu pour ce document.</p>
       <p style="margin:0 0 8px">
         <a href="${opts.paymentUrl}" style="background:#0a66ff;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none;display:inline-block">Payer en ligne</a>
       </p>
       <p style="font-size:12px;color:#666">Ou copiez ce lien : <br/><a href="${opts.paymentUrl}">${opts.paymentUrl}</a></p>`
    : "";
  return `<!doctype html><html><body style="font-family:Arial,sans-serif;background:#fff;padding:24px;color:#111">
  <div style="max-width:560px;margin:auto">
    <h2 style="margin:0 0 16px">Demande de signature</h2>
    <p>Bonjour ${escapeHtml(opts.signerName)},</p>
    <p>${org} vous demande de signer le document <strong>${escapeHtml(opts.documentTitle)}</strong>.</p>
    <p style="margin:24px 0">
      <a href="${opts.url}" style="background:#111;color:#fff;padding:12px 20px;border-radius:6px;text-decoration:none;display:inline-block">Signer le document</a>
    </p>
    <p style="font-size:12px;color:#666">Ou copiez ce lien : <br/><a href="${opts.url}">${opts.url}</a></p>
    ${expires}
    ${payment}
  </div></body></html>`;
}

export function renderSignatureReminderEmail(opts: {
  signerName: string;
  documentTitle: string;
  url: string;
  expiresAt?: string | null;
  senderOrg?: string | null;
}) {
  const org = opts.senderOrg ? escapeHtml(opts.senderOrg) : "Votre interlocuteur";
  const expires = opts.expiresAt
    ? `<p style="color:#b45309;font-size:13px"><strong>Attention :</strong> ce lien expire le ${new Date(opts.expiresAt).toLocaleDateString("fr-FR")}.</p>`
    : "";
  return `<!doctype html><html><body style="font-family:Arial,sans-serif;background:#fff;padding:24px;color:#111">
  <div style="max-width:560px;margin:auto">
    <h2 style="margin:0 0 16px">Rappel : signature en attente</h2>
    <p>Bonjour ${escapeHtml(opts.signerName)},</p>
    <p>${org} vous rappelle que le document <strong>${escapeHtml(opts.documentTitle)}</strong> est en attente de votre signature.</p>
    <p style="margin:24px 0">
      <a href="${opts.url}" style="background:#111;color:#fff;padding:12px 20px;border-radius:6px;text-decoration:none;display:inline-block">Signer maintenant</a>
    </p>
    <p style="font-size:12px;color:#666">Ou copiez ce lien : <br/><a href="${opts.url}">${opts.url}</a></p>
    ${expires}
  </div></body></html>`;
}

export function renderSignatureCompletedEmail(opts: {
  recipientName?: string | null;
  recipientRole: "signer" | "creator";
  documentTitle: string;
  documentReference?: string | null;
  signers: Array<{ name: string; email: string; signed_at?: string | null }>;
  senderOrg?: string | null;
  url?: string | null;
}) {
  const greet = opts.recipientName ? `Bonjour ${escapeHtml(opts.recipientName)},` : "Bonjour,";
  const intro =
    opts.recipientRole === "creator"
      ? `Tous les signataires ont signé le document <strong>${escapeHtml(opts.documentTitle)}</strong>.`
      : `Le document <strong>${escapeHtml(opts.documentTitle)}</strong> a été signé par toutes les parties.`;
  const ref = opts.documentReference
    ? `<p style="color:#666;font-size:12px;margin:0 0 12px">Référence : ${escapeHtml(opts.documentReference)}</p>`
    : "";
  const list = opts.signers
    .map(
      (s) =>
        `<li style="margin:4px 0;font-size:13px">${escapeHtml(s.name)} &lt;${escapeHtml(s.email)}&gt;${
          s.signed_at ? ` — ${new Date(s.signed_at).toLocaleString("fr-FR")}` : ""
        }</li>`,
    )
    .join("");
  const cta = opts.url
    ? `<p style="margin:24px 0"><a href="${opts.url}" style="background:#111;color:#fff;padding:12px 20px;border-radius:6px;text-decoration:none;display:inline-block">Consulter le document</a></p>`
    : "";
  return `<!doctype html><html><body style="font-family:Arial,sans-serif;background:#fff;padding:24px;color:#111">
  <div style="max-width:560px;margin:auto">
    <h2 style="margin:0 0 16px">Document signé ✔</h2>
    <p>${greet}</p>
    <p>${intro}</p>
    ${ref}
    <p style="margin:16px 0 6px;font-size:13px;color:#444">Signataires :</p>
    <ul style="padding-left:18px;margin:0">${list}</ul>
    ${cta}
  </div></body></html>`;
}

export function renderSignatureDeclinedEmail(opts: {
  recipientName?: string | null;
  documentTitle: string;
  signerName: string;
  signerEmail: string;
  reason?: string | null;
  senderOrg?: string | null;
}) {
  const greet = opts.recipientName ? `Bonjour ${escapeHtml(opts.recipientName)},` : "Bonjour,";
  const reason = opts.reason
    ? `<p style="margin:12px 0;font-size:13px;background:#fef2f2;border-left:3px solid #dc2626;padding:10px">Motif : ${escapeHtml(opts.reason)}</p>`
    : "";
  return `<!doctype html><html><body style="font-family:Arial,sans-serif;background:#fff;padding:24px;color:#111">
  <div style="max-width:560px;margin:auto">
    <h2 style="margin:0 0 16px;color:#b91c1c">Signature refusée</h2>
    <p>${greet}</p>
    <p><strong>${escapeHtml(opts.signerName)}</strong> (${escapeHtml(opts.signerEmail)}) a refusé de signer le document <strong>${escapeHtml(opts.documentTitle)}</strong>.</p>
    ${reason}
    <p style="font-size:12px;color:#666">Vous pouvez relancer ou modifier la demande depuis votre espace.</p>
  </div></body></html>`;
}

export function renderUserInviteEmail(opts: {
  fullName: string;
  email: string;
  temporaryPassword?: string | null;
  loginUrl: string;
  inviterOrg?: string | null;
  inviterName?: string | null;
  role: string;
}) {
  const org = opts.inviterOrg ? escapeHtml(opts.inviterOrg) : "votre organisation";
  const by = opts.inviterName ? ` par ${escapeHtml(opts.inviterName)}` : "";
  const pwd = opts.temporaryPassword
    ? `<p style="margin:8px 0;font-size:13px">Mot de passe temporaire : <code style="background:#f3f4f6;padding:3px 8px;border-radius:4px;font-size:13px">${escapeHtml(opts.temporaryPassword)}</code></p><p style="font-size:12px;color:#666">Modifiez-le dès votre première connexion.</p>`
    : "";
  return `<!doctype html><html><body style="font-family:Arial,sans-serif;background:#fff;padding:24px;color:#111">
  <div style="max-width:560px;margin:auto">
    <h2 style="margin:0 0 16px">Bienvenue chez ${org}</h2>
    <p>Bonjour ${escapeHtml(opts.fullName)},</p>
    <p>Vous avez été ajouté(e)${by} à <strong>${org}</strong> avec le rôle <strong>${escapeHtml(opts.role)}</strong>.</p>
    <p style="margin:6px 0;font-size:13px">Identifiant : <strong>${escapeHtml(opts.email)}</strong></p>
    ${pwd}
    <p style="margin:24px 0">
      <a href="${opts.loginUrl}" style="background:#111;color:#fff;padding:12px 20px;border-radius:6px;text-decoration:none;display:inline-block">Accéder à mon espace</a>
    </p>
  </div></body></html>`;
}

export function getOriginFromRequest(req: Request): string {
  const origin = req.headers.get("origin");
  if (origin) return origin;
  const proto = req.headers.get("x-forwarded-proto") ?? "https";
  const host = req.headers.get("host") ?? req.headers.get("x-forwarded-host");
  return host ? `${proto}://${host}` : "";
}
