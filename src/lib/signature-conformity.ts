/**
 * Signature électronique — couche de conformité.
 *
 * Aujourd'hui : SES (Signature Électronique Simple, eIDAS art. 25 §1).
 * Demain     : AES (Signature Électronique Avancée, eIDAS art. 26) — voir
 *              `SignatureLevelGap` et docs/signature-conformity.md.
 *
 * Ce module est PURE TS : pas d'I/O, pas de dépendance Supabase.
 * Il sert de source de vérité partagée entre la route /api/public/sign-request
 * et l'UI publique /s/$token.
 */

export type SignatureLevel = "ses" | "aes" | "qes";

/** Méthodes d'authentification du signataire prises en charge. */
export type AuthMethod =
  | "email_link" // lien unique envoyé par email (défaut SES)
  | "email_otp" // futur : code OTP par email (AES-ready)
  | "sms_otp" // futur : code OTP par SMS (AES-ready)
  | "id_verification"; // futur : KYC avec pièce d'identité (AES/QES)

export interface SignatureLevelDefinition {
  level: SignatureLevel;
  label: string;
  /** Référence légale eIDAS / Code civil français. */
  legalRef: string;
  /** Méthodes d'authentification compatibles avec ce niveau. */
  allowedAuthMethods: AuthMethod[];
  /** Description courte affichable côté UI/admin. */
  description: string;
}

export const SIGNATURE_LEVELS: Record<SignatureLevel, SignatureLevelDefinition> = {
  ses: {
    level: "ses",
    label: "Signature Électronique Simple (SES)",
    legalRef: "eIDAS art. 25 §1 — Code civil art. 1366",
    allowedAuthMethods: ["email_link"],
    description:
      "Recevabilité juridique garantie. Identification du signataire par lien email unique, consentement explicite, horodatage serveur, empreinte SHA-256 du document.",
  },
  aes: {
    level: "aes",
    label: "Signature Électronique Avancée (AES)",
    legalRef: "eIDAS art. 26",
    allowedAuthMethods: ["email_otp", "sms_otp", "id_verification"],
    description:
      "Liée de manière univoque au signataire, créée avec un moyen de signature qu'il contrôle, détectant toute modification ultérieure. Nécessite un second facteur (OTP) et un certificat.",
  },
  qes: {
    level: "qes",
    label: "Signature Électronique Qualifiée (QES)",
    legalRef: "eIDAS art. 27",
    allowedAuthMethods: ["id_verification"],
    description:
      "Équivalente à une signature manuscrite. Repose sur un certificat qualifié émis par un prestataire de confiance qualifié (PSCo).",
  },
};

/** Niveau couvert par l'implémentation actuelle. */
export const CURRENT_SUPPORTED_LEVEL: SignatureLevel = "ses";

/** Texte de consentement par défaut (FR). Versionné pour audit. */
export const CONSENT_TEXT_VERSION = "v1.0";
export const DEFAULT_CONSENT_TEXT_FR =
  "Je reconnais avoir lu et compris le document, j'accepte de le signer électroniquement et reconnais à cette signature électronique la même valeur juridique qu'une signature manuscrite (eIDAS art. 25 §1, Code civil art. 1366 et 1367).";

export interface ConsentRecord {
  text: string;
  version: string;
  accepted_at: string; // ISO-8601
}

export function buildConsentRecord(text = DEFAULT_CONSENT_TEXT_FR): ConsentRecord {
  return {
    text,
    version: CONSENT_TEXT_VERSION,
    accepted_at: new Date().toISOString(),
  };
}

/**
 * Bloc de preuves stocké dans `document_signatures.evidence` (jsonb).
 * Permet une reconstitution post-signature sans dépendre d'un parsing PDF.
 */
export interface SignatureEvidence {
  /** Niveau réellement appliqué au moment de la signature. */
  signature_level: SignatureLevel;
  /** Méthode d'authentification utilisée (email_link aujourd'hui). */
  auth_method: AuthMethod;
  /** Token d'invitation à usage unique (hashé/tronqué côté serveur si sensible). */
  request_token_hint: string;
  /** ID de l'invitation de signature. */
  request_id: string;
  /** Identité déclarée. */
  signer: { name: string; email: string };
  /** Consentement explicite recueilli avant l'apposition du tracé. */
  consent: ConsentRecord;
  /** Horodatage serveur (autoritaire, pas l'horloge client). */
  signed_at: string;
  /** Empreinte du PDF AVANT apposition (intégrité du contrat soumis). */
  original_pdf_hash_sha256: string | null;
  /** Empreinte du PDF APRÈS apposition (intégrité de l'original signé). */
  signed_pdf_hash_sha256: string;
  /** Contexte réseau du navigateur signataire. */
  network: {
    ip: string | null;
    user_agent: string | null;
    country?: string | null;
    timezone?: string | null;
  };
  /** Placement choisi par le signataire, le cas échéant. */
  placement?: {
    page_index: number;
    x: number;
    y: number;
    width: number;
  } | null;
  /** Version du module de conformité ayant produit cette preuve. */
  conformity_module_version: string;
}

export const CONFORMITY_MODULE_VERSION = "2026.06.01";

/**
 * Vérifie qu'une méthode d'auth est compatible avec un niveau de signature.
 * Lève une erreur explicite plutôt qu'un comportement silencieux.
 */
export function assertAuthMethodAllowed(level: SignatureLevel, method: AuthMethod): void {
  const def = SIGNATURE_LEVELS[level];
  if (!def.allowedAuthMethods.includes(method)) {
    throw new Error(
      `[signature-conformity] auth method "${method}" not allowed for level "${level}". ` +
        `Allowed: ${def.allowedAuthMethods.join(", ")}.`,
    );
  }
}

/**
 * Calcule l'empreinte SHA-256 hex d'un PDF (binaire). Utilise WebCrypto :
 * fonctionne aussi bien côté Worker (route) que côté navigateur (preview UI).
 */
export async function sha256Hex(bytes: Uint8Array | ArrayBuffer): Promise<string> {
  const buf = bytes instanceof Uint8Array ? (bytes.buffer as ArrayBuffer) : bytes;
  const hash = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Tronque/masque un token avant stockage dans l'evidence (on garde un préfixe). */
export function tokenHint(token: string): string {
  if (token.length <= 12) return token;
  return `${token.slice(0, 8)}…${token.slice(-4)}`;
}

/**
 * Écarts entre SES (actuel) et AES (cible). Sert de feuille de route et
 * peut être exposé dans une page admin pour la documentation interne.
 */
export interface SignatureLevelGap {
  area: string;
  ses_today: string;
  aes_target: string;
}

export const SES_TO_AES_GAPS: SignatureLevelGap[] = [
  {
    area: "Authentification du signataire",
    ses_today: "Lien email unique à usage unique (token UUID, expiration).",
    aes_target: "Second facteur (OTP email/SMS) + vérification d'identité optionnelle (KYC).",
  },
  {
    area: "Lien univoque signataire ↔ signature",
    ses_today: "Email + nom déclarés à l'invitation, conservés dans l'evidence.",
    aes_target: "Certificat numérique X.509 émis pour la session, attaché au PDF (PAdES).",
  },
  {
    area: "Contrôle exclusif du moyen de signature",
    ses_today: "Tracé manuscrit dans le navigateur du signataire.",
    aes_target: "Clé privée non-exportable côté HSM/PSCo, déclenchée par le signataire après auth forte.",
  },
  {
    area: "Détection des altérations post-signature",
    ses_today: "Empreinte SHA-256 du PDF signé stockée en base et journalisée.",
    aes_target: "Signature cryptographique PAdES embarquée dans le PDF + horodatage RFC 3161 qualifié.",
  },
  {
    area: "Horodatage",
    ses_today: "Horodatage serveur (Postgres now() + ISO côté Worker).",
    aes_target: "Horodatage qualifié RFC 3161 délivré par un TSA reconnu.",
  },
  {
    area: "Journal d'événements",
    ses_today: "audit_logs (création invitation, signature, refus) + colonne `evidence` jsonb.",
    aes_target: "Idem + scellement périodique du journal (hash chain) et export PAdES-LTV.",
  },
];
