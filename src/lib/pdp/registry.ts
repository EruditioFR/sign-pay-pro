/**
 * Registre des connecteurs PDP disponibles.
 *
 * Ajouter un connecteur réel :
 *   1. Créer `src/lib/pdp/connectors/<provider>.ts` qui exporte un objet
 *      conforme à `PdpConnector`.
 *   2. L'enregistrer ici via `registerPdpConnector(...)`.
 *   3. Sélectionner le provider sur l'organisation (champ
 *      `organizations.pdp_provider` à ajouter plus tard ou réglage UI).
 *
 * Tant qu'aucun vrai connecteur n'est branché, le connecteur `noop` permet
 * à toute la chaîne (file d'envoi, audit, UI) de fonctionner.
 */

import type { PdpConnector, PdpProviderId } from "./types";
import { noopConnector } from "./connectors/noop";

const REGISTRY = new Map<PdpProviderId, PdpConnector>();

export function registerPdpConnector(connector: PdpConnector): void {
  REGISTRY.set(connector.id, connector);
}

export function getPdpConnector(id: PdpProviderId | null | undefined): PdpConnector {
  const key = id ?? "noop";
  const found = REGISTRY.get(key);
  if (!found) {
    // Fallback explicite — évite qu'un provider mal configuré bloque le module.
    return noopConnector;
  }
  return found;
}

export function listPdpConnectors(): PdpConnector[] {
  return Array.from(REGISTRY.values());
}

// Bootstrap : enregistre le connecteur par défaut.
registerPdpConnector(noopConnector);
