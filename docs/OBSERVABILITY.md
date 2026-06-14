# Observabilité & gestion d'erreurs

## Architecture (légère)

```
                ┌────────────────────────┐
  code serveur  │  reportServerError()   │  src/lib/observability.server.ts
   (try/catch)  └──┬──────────┬──────────┘
                   │          │
        console.error   insert error_logs (service_role)
                              │
                              └──► [optionnel] external sink (Sentry)
```

3 briques :

| Fichier | Rôle |
|---|---|
| `src/lib/errors.ts` | Taxonomie (`AppError`, `category`, `code`, `userMessage`). Client+serveur. |
| `src/lib/observability.server.ts` | Sink serveur : DB + console + hook externe. Best-effort, ne throw jamais. |
| `public.error_logs` (table) | Stockage centralisé, lisible par owners/admins de l'org. |

## Catégories

- **business** : règle métier violée (facture déjà payée, montant > solde).
- **technical** : panne dépendance (DB, Stripe, Resend, pdf-lib).
- **user**     : input invalide / non autorisé.

## Côté UI

`toUserMessage(err, fallback)` renvoie un message safe à afficher (jamais de stack/PII).
Toute erreur non-`AppError` reçoit un message générique.

## Points sensibles instrumentés

- `src/routes/api/public/payments/webhook.ts` — Stripe.
- `src/routes/api/public/share.$token.ts` — paiements & signature publics.
- `src/routes/api/public/sign-request.$token.ts` — signature publique.
- `src/lib/email-sender.ts` — envois email (Resend).
- `src/lib/signature-requests.functions.ts` — emails de demande de signature.

Pour ajouter un point d'instrumentation :

```ts
try {
  // …
} catch (e) {
  const { reportServerError } = await import("@/lib/observability.server");
  await reportServerError(e, {
    source: "my.feature",
    category: "technical",
    organizationId,
    context: { documentId },
  });
  throw e; // ou retour propre
}
```

## Brancher Sentry plus tard

Dans un point d'entrée serveur (ex: `src/start.ts`) :

```ts
import * as Sentry from "@sentry/node";
import { setExternalErrorSink } from "@/lib/observability.server";

Sentry.init({ dsn: process.env.SENTRY_DSN });
setExternalErrorSink(({ message, stack, context, severity }) => {
  Sentry.captureException(new Error(message), {
    level: severity === "critical" ? "fatal" : severity,
    extra: context,
  });
});
```

Aucune autre modification requise : tous les `reportServerError(...)` déjà en place
seront automatiquement relayés.

## Sécurité du logging

- `context` est passé dans un scrubber (`authorization`, `api_key`, `secret`,
  `token`, `password`, `cookie` → `[redacted]`).
- Strings > 2000 char tronquées.
- Stack tronquée à 4000 char.
- RLS : seuls les `owner`/`admin` de l'organisation peuvent lire ses `error_logs`.
- Inserts via `service_role` uniquement (jamais depuis le client).
