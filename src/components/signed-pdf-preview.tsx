import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Download, Eye, Loader2 } from "lucide-react";
import { getSignedPdfUrl } from "@/lib/sharing.functions";
import { toast } from "sonner";

export function SignedPdfPreview({
  path,
  fileName,
}: {
  path: string;
  fileName?: string;
}) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const fetchUrl = useServerFn(getSignedPdfUrl);

  useEffect(() => {
    if (!open || url) return;
    let cancelled = false;
    setLoading(true);
    fetchUrl({ data: { path } })
      .then((r) => {
        if (!cancelled) setUrl(r.url);
      })
      .catch((e: Error) => toast.error(e.message))
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, url, path, fetchUrl]);

  const download = async () => {
    try {
      const r = url ? { url } : await fetchUrl({ data: { path } });
      const a = document.createElement("a");
      a.href = r.url;
      a.download = fileName ?? path.split("/").pop() ?? "document-signed.pdf";
      a.rel = "noopener";
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <div className="flex items-center gap-1">
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button size="sm" variant="ghost" title="Aperçu">
            <Eye className="mr-1 h-4 w-4" />
            Aperçu
          </Button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-4xl h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>PDF signé</DialogTitle>
          </DialogHeader>
          <div className="flex-1 min-h-0 rounded-md border border-border bg-muted">
            {loading || !url ? (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Chargement…
              </div>
            ) : (
              <iframe
                title="PDF signé"
                src={`${url}#toolbar=1`}
                className="h-full w-full rounded-md"
              />
            )}
          </div>
          <div className="flex justify-end">
            <Button size="sm" variant="outline" onClick={download} disabled={!url}>
              <Download className="mr-1 h-4 w-4" />
              Télécharger
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      <Button size="sm" variant="ghost" onClick={download} title="Télécharger">
        <Download className="h-4 w-4" />
      </Button>
    </div>
  );
}
