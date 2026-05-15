import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Send, Copy, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { createShareLink, listShareLinks, revokeShareLink } from "@/lib/sharing.functions";

export function ShareLinkDialog({ documentId }: { documentId: string }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [days, setDays] = useState(30);
  const [allowSign, setAllowSign] = useState(true);
  const [allowPay, setAllowPay] = useState(true);
  const qc = useQueryClient();

  const createFn = useServerFn(createShareLink);
  const listFn = useServerFn(listShareLinks);
  const revokeFn = useServerFn(revokeShareLink);

  const { data: links } = useQuery({
    queryKey: ["share_links", documentId],
    queryFn: () => listFn({ data: { document_id: documentId } }),
    enabled: open,
  });

  const create = useMutation({
    mutationFn: () => createFn({
      data: {
        document_id: documentId,
        recipient_email: email || null,
        recipient_name: name || null,
        expires_in_days: days,
        allow_sign: allowSign,
        allow_pay: allowPay,
      },
    }),
    onSuccess: (res) => {
      const url = `${window.location.origin}/p/${res.link.token}`;
      navigator.clipboard.writeText(url).catch(() => {});
      toast.success(t("sharing.link_created_copied"));
      qc.invalidateQueries({ queryKey: ["share_links", documentId] });
      qc.invalidateQueries({ queryKey: ["document", documentId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const revoke = useMutation({
    mutationFn: (id: string) => revokeFn({ data: { id } }),
    onSuccess: () => {
      toast.success(t("sharing.link_revoked"));
      qc.invalidateQueries({ queryKey: ["share_links", documentId] });
    },
  });

  const copyUrl = (token: string) => {
    const url = `${window.location.origin}/p/${token}`;
    navigator.clipboard.writeText(url);
    toast.success(t("sharing.copied"));
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="default" size="sm"><Send className="mr-1 h-4 w-4" />{t("sharing.send")}</Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>{t("sharing.title")}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>{t("sharing.recipient_name")}</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>{t("sharing.recipient_email")}</Label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>{t("sharing.expires_in_days")}</Label>
              <Input type="number" min={1} max={365} value={days} onChange={(e) => setDays(parseInt(e.target.value) || 30)} />
            </div>
          </div>
          <div className="flex items-center justify-between rounded border p-2">
            <Label>{t("sharing.allow_sign")}</Label>
            <Switch checked={allowSign} onCheckedChange={setAllowSign} />
          </div>
          <div className="flex items-center justify-between rounded border p-2">
            <Label>{t("sharing.allow_pay")}</Label>
            <Switch checked={allowPay} onCheckedChange={setAllowPay} />
          </div>
          <Button onClick={() => create.mutate()} disabled={create.isPending} className="w-full">
            {create.isPending ? t("common.loading") : t("sharing.create_link")}
          </Button>

          {links && links.links.length > 0 && (
            <div className="mt-4 space-y-1">
              <Label className="text-xs uppercase text-muted-foreground">{t("sharing.existing_links")}</Label>
              <ul className="space-y-1">
                {links.links.map((l) => {
                  const active = !l.revoked_at && (!l.expires_at || new Date(l.expires_at) > new Date());
                  return (
                    <li key={l.id} className="flex items-center justify-between rounded border p-2 text-xs">
                      <div>
                        <div className="font-mono">{l.token.slice(0, 8)}…</div>
                        <div className="text-muted-foreground">
                          {l.recipient_email ?? "—"} · {l.view_count} {t("sharing.views")} · {active ? t("sharing.active") : t("sharing.inactive")}
                        </div>
                      </div>
                      <div className="flex gap-1">
                        <Button size="icon" variant="ghost" onClick={() => copyUrl(l.token)}><Copy className="h-4 w-4" /></Button>
                        {active && (
                          <Button size="icon" variant="ghost" onClick={() => revoke.mutate(l.id)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>{t("common.cancel")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
