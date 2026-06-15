import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { FileCode2, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { generateInvoiceCii } from "@/lib/einvoice-xml.functions";
import type { EinvoiceProfile } from "@/lib/einvoice";

const PROFILE_LABELS: Record<EinvoiceProfile, string> = {
  minimum: "MINIMUM (résumé)",
  basic_wl: "BASIC WL (sans lignes)",
  basic: "BASIC (avec lignes)",
  en16931: "EN 16931 (recommandé)",
  extended: "EXTENDED (FR)",
};

/**
 * Télécharge la facture au format Factur-X (CII XML).
 * Profil par défaut : EN 16931 (profil européen complet).
 * Visible uniquement pour les documents de type `invoice`.
 */
export function ExportFacturXButton({ documentId, documentType }: {
  documentId: string;
  documentType: string;
}) {
  const [pendingProfile, setPendingProfile] = useState<EinvoiceProfile | null>(null);
  const generate = useServerFn(generateInvoiceCii);
  const qc = useQueryClient();

  const mutation = useMutation({
    mutationFn: (profile: EinvoiceProfile) =>
      generate({ data: { document_id: documentId, mark_ready: true, profile } }),
    onSuccess: (res) => {
      const blob = new Blob([res.xml], { type: "application/xml;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = res.filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      qc.invalidateQueries({ queryKey: ["document", documentId] });
      if (res.issues.length > 0) {
        toast.warning(
          `Factur-X ${res.profile.toUpperCase()} généré — ${res.issues.length} alerte(s)`,
          { description: res.issues.slice(0, 4).map((i) => `• ${i.message}`).join("\n") },
        );
      } else {
        toast.success(`Factur-X ${res.profile.toUpperCase()} généré et validé`);
      }
    },
    onError: (e: unknown) => {
      toast.error(e instanceof Error ? e.message : "Échec de la génération");
    },
    onSettled: () => setPendingProfile(null),
  });

  if (documentType !== "invoice") return null;

  const launch = (profile: EinvoiceProfile) => {
    setPendingProfile(profile);
    mutation.mutate(profile);
  };

  return (
    <div className="inline-flex">
      <Button
        variant="outline"
        size="sm"
        disabled={mutation.isPending}
        onClick={() => launch("en16931")}
        className="rounded-r-none"
        title="Télécharger Factur-X (CII XML, profil EN 16931)"
      >
        <FileCode2 className="mr-1 h-4 w-4" />
        {mutation.isPending ? `Export ${pendingProfile ?? ""}…` : "Télécharger Factur-X"}
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            disabled={mutation.isPending}
            className="rounded-l-none border-l-0 px-2"
            aria-label="Choisir le profil Factur-X"
          >
            <ChevronDown className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuLabel>Profil Factur-X</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {(Object.keys(PROFILE_LABELS) as EinvoiceProfile[]).map((p) => (
            <DropdownMenuItem key={p} onSelect={() => launch(p)}>
              {PROFILE_LABELS[p]}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
