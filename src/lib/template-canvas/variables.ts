/**
 * Catalogue de variables dynamiques insérables dans un modèle.
 * Les valeurs sont résolues à l'instanciation depuis :
 *   - l'organisation (issuer.*)
 *   - le tiers / client (client.*)
 *   - le document (document.*)
 *   - le contexte de génération (now, today)
 */

export interface VariableDef {
  key: string;
  label: string;
  group: "Client" | "Émetteur" | "Document" | "Système";
  example?: string;
}

export const VARIABLE_CATALOG: readonly VariableDef[] = [
  // Client
  { key: "client.first_name", label: "Prénom client", group: "Client", example: "Jean" },
  { key: "client.last_name", label: "Nom client", group: "Client", example: "Dupont" },
  { key: "client.full_name", label: "Nom complet client", group: "Client", example: "Jean Dupont" },
  { key: "client.company", label: "Société client", group: "Client", example: "Acme SAS" },
  { key: "client.email", label: "Email client", group: "Client", example: "jean@acme.fr" },
  { key: "client.address", label: "Adresse client", group: "Client" },
  { key: "client.vat_number", label: "N° TVA client", group: "Client" },
  { key: "client.siret", label: "SIRET client", group: "Client" },

  // Émetteur
  { key: "issuer.company", label: "Raison sociale", group: "Émetteur" },
  { key: "issuer.address", label: "Adresse émetteur", group: "Émetteur" },
  { key: "issuer.siret", label: "SIRET émetteur", group: "Émetteur" },
  { key: "issuer.vat_number", label: "N° TVA intracom.", group: "Émetteur" },
  { key: "issuer.iban", label: "IBAN", group: "Émetteur" },
  { key: "issuer.bic", label: "BIC", group: "Émetteur" },
  { key: "issuer.email", label: "Email émetteur", group: "Émetteur" },
  { key: "issuer.phone", label: "Téléphone émetteur", group: "Émetteur" },
  { key: "issuer.logo_url", label: "URL du logo", group: "Émetteur" },

  // Document
  { key: "document.number", label: "N° de document", group: "Document", example: "FAC-2026-0001" },
  { key: "document.title", label: "Titre", group: "Document" },
  { key: "document.issue_date", label: "Date d'émission", group: "Document" },
  { key: "document.due_date", label: "Date d'échéance", group: "Document" },
  { key: "document.amount_ht", label: "Montant HT", group: "Document" },
  { key: "document.amount_ttc", label: "Montant TTC", group: "Document" },
  { key: "document.currency", label: "Devise", group: "Document", example: "EUR" },

  // Système
  { key: "system.today", label: "Date du jour", group: "Système" },
  { key: "system.now", label: "Date & heure", group: "Système" },
] as const;

export function findVariable(key: string): VariableDef | undefined {
  return VARIABLE_CATALOG.find((v) => v.key === key);
}

/**
 * Substitue les variables dans une chaîne libre (ex: contenu d'un bloc texte).
 * Format: {{ scope.key }}
 */
export function interpolate(
  source: string,
  values: Record<string, string | number | null | undefined>,
): string {
  return source.replace(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g, (_, k) => {
    const v = values[k];
    return v === undefined || v === null ? "" : String(v);
  });
}
