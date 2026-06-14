# Architecture PDP-ready

Ce document décrit comment brancher un futur connecteur de Plateforme de
Dématérialisation Partenaire (PDP) sans refactor de l'app.

## Vue d'ensemble

```text
 facture (documents)
      │
      ▼
 enqueueInvoiceTransmission ──► einvoice_transmissions(queued)
                                        │
                                        ▼  (manuel ou pg_cron)
                              processInvoiceTransmission
                                        │
                                        ▼
                               PdpConnector.submit()
                                        │
                  ┌─────────────────────┼────────────────────┐
                  ▼                     ▼                    ▼
              transmitted             error              cancelled
                  │
                  ▼
             refreshInvoiceTransmission ──► documents.einvoice_status
```

Tous les états transitent par la table `einvoice_transmissions`
(`queued` → `sending` → `transmitted` | `error` | `cancelled`). La facture
porte une référence directe (`documents.pdp_transmission_id`) vers la
dernière tentative.

## Fichiers clés

| Fichier | Rôle |
|---|---|
| `src/lib/pdp/types.ts` | Interfaces `PdpConnector`, `PdpInvoicePayload`, statuts |
| `src/lib/pdp/registry.ts` | Registre des connecteurs disponibles |
| `src/lib/pdp/connectors/noop.ts` | Connecteur par défaut (simulation) |
| `src/lib/pdp/transmission-service.functions.ts` | Server functions de file |
| `src/lib/einvoice.ts` | Constantes & statuts e-invoicing métier |
| `src/lib/einvoice-xml.functions.ts` | Génération Factur-X (CII BASIC) |

## Brancher un vrai connecteur

1. Créer `src/lib/pdp/connectors/<provider>.ts` qui exporte un objet
   conforme à `PdpConnector` (méthodes `healthCheck`, `submit`,
   `fetchStatus`, optionnellement `cancel`).
2. Stocker les secrets via le gestionnaire de secrets (jamais en clair)
   et les lire **dans `.handler()`** uniquement, pas au top-level.
3. Enregistrer le connecteur dans `src/lib/pdp/registry.ts` via
   `registerPdpConnector(...)`.
4. Sélectionner le provider :
   - soit à l'envoi (`enqueueInvoiceTransmission({ provider })`),
   - soit par défaut sur `documents.pdp_provider` (ou plus tard sur
     l'organisation).

Aucune autre couche n'a besoin de changer : la file, l'audit, la fiche
facture et le statut e-invoicing utilisent déjà les abstractions.

## Planifier l'envoi

Pour automatiser la dépile :

```sql
-- pg_cron + endpoint public (cf. knowledge "schedule-jobs-options")
SELECT cron.schedule(
  'pdp-process-queue', '*/5 * * * *',
  $$ SELECT net.http_post(
       url := 'https://<project>--<id>.lovable.app/api/public/hooks/process-pdp-queue',
       headers := jsonb_build_object('apikey', '<anon>'),
       body := '{}'::jsonb
     ); $$);
```

L'endpoint (à créer le moment venu sous `src/routes/api/public/hooks/`)
listera les `einvoice_transmissions` `queued` / `error` et appellera
`processInvoiceTransmission` pour chacune.

## Idempotence

- `enqueueInvoiceTransmission` réutilise une transmission existante si
  elle est encore `queued` ou `sending` pour le même document.
- `PdpInvoicePayload.idempotencyKey` = `transmission.id` ; un connecteur
  réel doit utiliser cette clé côté PDP pour éviter les doublons.
- `processInvoiceTransmission` est sûr à rejouer : il incrémente
  `attempts` et stocke `last_error` en cas d'échec.

## Limites de la V1

- Pas de scheduler embarqué (à brancher via pg_cron).
- Pas de webhook entrant PDP (à ajouter sous
  `src/routes/api/public/webhooks/pdp.ts` quand le provider sera choisi).
- Pas de gestion fine des certificats / signature électronique : c'est
  le rôle de l'implémentation concrète du connecteur.
