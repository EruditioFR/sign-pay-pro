import { useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ImagePlus, Trash2, Loader2 } from "lucide-react";
import { uploadOrgLogo, removeOrgLogo } from "@/lib/organization.functions";
import { ConfirmAction } from "@/components/confirm-action";

interface Props {
  logoUrl: string | null;
  onChange: () => void;
}

export function OrgLogoUploader({ logoUrl, onChange }: Props) {
  const upload = useServerFn(uploadOrgLogo);
  const remove = useServerFn(removeOrgLogo);
  const inputRef = useRef<HTMLInputElement>(null);
  const [hover, setHover] = useState(false);

  const upMut = useMutation({
    mutationFn: async (file: File) => {
      const fd = new FormData();
      fd.append("file", file);
      return upload({ data: fd });
    },
    onSuccess: () => {
      toast.success("Logo mis à jour");
      onChange();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rmMut = useMutation({
    mutationFn: () => remove(),
    onSuccess: () => {
      toast.success("Logo supprimé");
      onChange();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-3">
      <div
        className="relative w-40 h-40 border-2 border-dashed rounded-lg flex items-center justify-center bg-muted/40 overflow-hidden"
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
      >
        {upMut.isPending ? (
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        ) : logoUrl ? (
          <img
            src={logoUrl}
            alt="Logo de l'organisation"
            className="max-w-full max-h-full object-contain"
          />
        ) : (
          <div className="text-xs text-muted-foreground text-center px-3">
            Aucun logo
          </div>
        )}
        {hover && logoUrl && !upMut.isPending && (
          <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
            <span className="text-xs text-white">Survoler pour changer</span>
          </div>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/svg+xml"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) upMut.mutate(f);
          e.target.value = "";
        }}
      />

      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={() => inputRef.current?.click()}
          disabled={upMut.isPending}
        >
          <ImagePlus className="h-4 w-4 mr-1.5" />
          {logoUrl ? "Remplacer" : "Importer un logo"}
        </Button>
        {logoUrl && (
          <ConfirmAction
            title="Supprimer le logo ?"
            description="Le logo ne sera plus inséré dans les documents générés."
            onConfirm={() => rmMut.mutate()}
          >
            <Button size="sm" variant="ghost" className="text-destructive">
              <Trash2 className="h-4 w-4 mr-1.5" />
              Supprimer
            </Button>
          </ConfirmAction>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        PNG, JPG ou SVG. 2&nbsp;Mo maximum. Le logo sera inséré automatiquement
        dans l'en-tête des documents et PDF générés.
      </p>
    </div>
  );
}
