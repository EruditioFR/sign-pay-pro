/**
 * Error taxonomy — partagé client/serveur.
 *
 * 3 catégories :
 *  - business  : règle métier violée (ex: facture déjà payée, montant > solde)
 *  - technical : panne infra/dépendance (DB, Stripe, Resend, PDF lib)
 *  - user      : input invalide / non autorisé côté utilisateur
 *
 * Les `AppError` portent :
 *  - `code`        : identifiant stable (ex: 'PAYMENT_EXCEEDS_DUE')
 *  - `userMessage` : message safe à afficher à l'utilisateur final
 *  - `context`     : metadata non-sensible (ids, montants — JAMAIS de secrets)
 */

export type ErrorCategory = "business" | "technical" | "user";
export type ErrorSeverity = "info" | "warning" | "error" | "critical";

export interface AppErrorOptions {
  category: ErrorCategory;
  code: string;
  message: string;            // dev-facing
  userMessage?: string;       // safe pour l'UI
  severity?: ErrorSeverity;
  context?: Record<string, unknown>;
  cause?: unknown;
}

export class AppError extends Error {
  readonly category: ErrorCategory;
  readonly code: string;
  readonly userMessage: string;
  readonly severity: ErrorSeverity;
  readonly context: Record<string, unknown>;
  readonly cause?: unknown;

  constructor(opts: AppErrorOptions) {
    super(opts.message);
    this.name = "AppError";
    this.category = opts.category;
    this.code = opts.code;
    this.userMessage = opts.userMessage ?? defaultUserMessage(opts.category);
    this.severity =
      opts.severity ?? (opts.category === "technical" ? "error" : "warning");
    this.context = opts.context ?? {};
    this.cause = opts.cause;
  }
}

function defaultUserMessage(cat: ErrorCategory): string {
  switch (cat) {
    case "user":
      return "Requête invalide.";
    case "business":
      return "Action impossible dans l’état actuel du document.";
    case "technical":
    default:
      return "Une erreur technique est survenue. Merci de réessayer.";
  }
}

/** Convertit n'importe quel throwable en message UI safe (jamais de stack/PII). */
export function toUserMessage(err: unknown, fallback?: string): string {
  if (err instanceof AppError) return err.userMessage;
  return fallback ?? "Une erreur est survenue. Merci de réessayer.";
}

/** Normalise un throwable inconnu pour le logging. */
export function normalizeError(err: unknown): {
  message: string;
  stack?: string;
  name: string;
} {
  if (err instanceof Error) {
    return { message: err.message, stack: err.stack, name: err.name };
  }
  if (typeof err === "string") return { message: err, name: "StringError" };
  try {
    return { message: JSON.stringify(err), name: "UnknownError" };
  } catch {
    return { message: String(err), name: "UnknownError" };
  }
}

/** Empreinte stable pour grouper des erreurs similaires. */
export function fingerprint(source: string, code: string | undefined, message: string): string {
  const head = (code ?? message).slice(0, 80);
  return `${source}::${head}`.replace(/\s+/g, "_");
}
