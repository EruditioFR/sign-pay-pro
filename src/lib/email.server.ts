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
    throw new Error(`Resend send failed [${res.status}]: ${JSON.stringify(data)}`);
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
}) {
  const org = opts.senderOrg ? escapeHtml(opts.senderOrg) : "Votre interlocuteur";
  const expires = opts.expiresAt ? `<p style="color:#666;font-size:12px">À signer avant le ${new Date(opts.expiresAt).toLocaleDateString("fr-FR")}.</p>` : "";
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
  </div></body></html>`;
}

export function getOriginFromRequest(req: Request): string {
  const origin = req.headers.get("origin");
  if (origin) return origin;
  const proto = req.headers.get("x-forwarded-proto") ?? "https";
  const host = req.headers.get("host") ?? req.headers.get("x-forwarded-host");
  return host ? `${proto}://${host}` : "";
}
