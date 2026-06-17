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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Send, Copy, Trash2, Mail, MessageCircle } from "lucide-react";
import { toast } from "sonner";
import { createShareLink, listShareLinks, revokeShareLink } from "@/lib/sharing.functions";

type Channel = "email" | "whatsapp";

export function ShareLinkDialog({
  documentId,
  triggerLabel,
  open: controlledOpen,
  onOpenChange,
  hideTrigger,
}: {
  documentId: string;
  triggerLabel?: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  hideTrigger?: boolean;
}) {
  const { t } = useTranslation();
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const setOpen = (v: boolean) => {
    if (onOpenChange) onOpenChange(v);
    else setInternalOpen(v);
  };
  const [channel, setChannel] = useState<Channel>("email");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
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
    mutationFn: () => {
      if (channel === "whatsapp" && !phone.trim()) {
        throw new Error(t("sharing.phone_required"));
      }
      if (channel === "email" && !email.trim()) {
        throw new Error(t("sharing.email_required"));
      }
      return createFn({
        data: {
          document_id: documentId,
          recipient_email: email || null,
          recipient_name: name || null,
          expires_in_days: days,
          allow_sign: allowSign,
          allow_pay: allowPay,
        },
      });
    },
    onSuccess: (res) => {
      const url = `${window.location.origin}/p/${res.link.token}`;
      navigator.clipboard.writeText(url).catch(() => {});
      const message = t("sharing.share_message", { name: name || "", url });
      if (channel === "whatsapp") {
        const cleanPhone = phone.replace(/[^\d]/g, "");
        const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
        const waUrl = isMobile
          ? `whatsapp://send?phone=${cleanPhone}&text=${encodeURIComponent(message)}`
          : `https://web.whatsapp.com/send?phone=${cleanPhone}&text=${encodeURIComponent(message)}&type=phone_number&app_absent=0`;
        window.open(waUrl, "_blank", "noopener");
        toast.success(t("sharing.whatsapp_opened"));
      } else {
        // Email : Resend a déjà envoyé le mail avec le PDF en pièce jointe côté serveur.
        // On évite d'ouvrir mailto: pour ne pas envoyer un second email depuis la boîte de l'utilisateur.
        if (res.email_sent) {
          toast.success(t("sharing.email_sent", { defaultValue: "Email envoyé au destinataire." }));
        } else if (res.email_error) {
          toast.error(`Email non envoyé : ${res.email_error}`);
        } else {
          toast.success(t("sharing.link_created_copied"));
        }
      }
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
        <Button variant="default" size="sm"><Send className="mr-1 h-4 w-4" />{triggerLabel ?? t("sharing.send")}</Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>{t("sharing.title")}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-2">
            <Label>{t("sharing.channel")}</Label>
            <RadioGroup
              value={channel}
              onValueChange={(v) => setChannel(v as Channel)}
              className="grid grid-cols-2 gap-2"
            >
              <Label
                htmlFor="ch-email"
                className={`flex items-center gap-2 rounded border p-2 cursor-pointer ${channel === "email" ? "border-primary" : ""}`}
              >
                <RadioGroupItem value="email" id="ch-email" />
                <Mail className="h-4 w-4" /> {t("sharing.via_email")}
              </Label>
              <Label
                htmlFor="ch-whatsapp"
                className={`flex items-center gap-2 rounded border p-2 cursor-pointer ${channel === "whatsapp" ? "border-primary" : ""}`}
              >
                <RadioGroupItem value="whatsapp" id="ch-whatsapp" />
                <MessageCircle className="h-4 w-4" /> {t("sharing.via_whatsapp")}
              </Label>
            </RadioGroup>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>{t("sharing.recipient_name")}</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            {channel === "email" ? (
              <div className="space-y-1">
                <Label>{t("sharing.recipient_email")}</Label>
                <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
            ) : (
              <div className="space-y-1">
                <Label>{t("sharing.recipient_phone")}</Label>
                <Input
                  type="tel"
                  placeholder="+33612345678"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
              </div>
            )}
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
