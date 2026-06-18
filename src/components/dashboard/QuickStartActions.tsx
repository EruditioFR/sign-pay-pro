import { Link } from "@tanstack/react-router";
import { Card, CardContent } from "@/components/ui/card";
import { NewPdfTemplateDialog } from "@/components/pdf-templates/NewPdfTemplateDialog";
import { LayoutTemplate, FileUp, Sparkles, ArrowRight } from "lucide-react";
import type { ReactNode } from "react";

export function QuickStartActions() {
  return (
    <section>
      <div className="mb-3 flex items-baseline justify-between">
        <div>
          <h2 className="text-lg font-semibold">Nouveau document</h2>
          <p className="text-xs text-muted-foreground">
            Choisissez comment démarrer : modèle existant, import PDF ou éditeur.
          </p>
        </div>
        <Link to="/app/documents/new" className="text-xs font-medium text-primary hover:underline">
          Toutes les options →
        </Link>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {/* Modèles temporairement désactivés
        <Link to="/app/templates" className="block">
          <ActionCard
            accent
            icon={<LayoutTemplate className="h-5 w-5" />}
            title="Partir d'un modèle"
            description="Sélectionnez un modèle : un duplicata est créé comme nouveau document."
            cta="Voir les modèles"
          />
        </Link>
        */}
        <NewPdfTemplateDialog
          trigger={
            <button type="button" className="block w-full text-left">
              <ActionCard
                icon={<FileUp className="h-5 w-5" />}
                title="Importer un document"
                description="Uploadez votre document, puis placez les zones à saisir & signer."
                cta="Importer un fichier"
              />
            </button>
          }
        />
        <Link to="/app/documents/wysiwyg" className="block">
          <ActionCard
            icon={<Sparkles className="h-5 w-5" />}
            title="Créer depuis l'éditeur"
            description="Démarrez d'une page blanche avec l'éditeur WYSIWYG."
            cta="Ouvrir l'éditeur"
          />
        </Link>
      </div>
    </section>
  );
}

function ActionCard({
  icon, title, description, cta, accent,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  cta: string;
  accent?: boolean;
}) {
  return (
    <Card className={`h-full transition hover:border-primary hover:shadow-sm ${accent ? "border-foreground bg-foreground text-background" : ""}`}>
      <CardContent className="flex h-full flex-col gap-3 p-5">
        <div className={`flex h-10 w-10 items-center justify-center rounded-md ${accent ? "bg-background/10 text-background" : "bg-foreground text-background"}`}>
          {icon}
        </div>
        <div className="space-y-1">
          <div className="text-base font-semibold">{title}</div>
          <p className={`text-xs ${accent ? "text-background/70" : "text-muted-foreground"}`}>
            {description}
          </p>
        </div>
        <div className={`mt-auto inline-flex items-center gap-1 text-xs font-medium ${accent ? "text-background" : "text-primary"}`}>
          {cta} <ArrowRight className="h-3.5 w-3.5" />
        </div>
      </CardContent>
    </Card>
  );
}
