import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Bot,
  User as UserIcon,
  Home as HomeIcon,
  FileSignature,
  ScrollText,
  Crown,
  Send,
  Copy,
  MessageCircle,
  Mail,
  ExternalLink,
  RefreshCw,
  CheckCircle2,
} from "lucide-react";
import { createRealtorDocument, type DocKind } from "@/lib/realtor-chatbot.functions";
import { Link } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/app/chatbot")({
  component: ChatbotPage,
});

type Step =
  | "choose-kind"
  | "client-name"
  | "client-email"
  | "client-phone"
  | "property-address"
  | "property-description"
  | "amount"
  | "agent-notes"
  | "review"
  | "done";

interface BotMsg { role: "bot"; text: string }
interface UserMsg { role: "user"; text: string }
type Msg = BotMsg | UserMsg;

interface FormState {
  kind: DocKind | null;
  client_name: string;
  client_email: string;
  client_phone: string;
  property_address: string;
  property_description: string;
  amount: string;
  agent_notes: string;
}

const KINDS: { id: DocKind; label: string; desc: string; icon: typeof HomeIcon }[] = [
  { id: "visit_slip",        label: "Bon de visite",        desc: "Reconnaissance de visite (Loi Hoguet)", icon: HomeIcon },
  { id: "purchase_offer",    label: "Offre d'achat",        desc: "Proposition écrite d'acquisition",      icon: FileSignature },
  { id: "mandate_simple",    label: "Mandat simple",        desc: "Mandat de vente non exclusif",          icon: ScrollText },
  { id: "mandate_exclusive", label: "Mandat exclusif",      desc: "Mandat de vente exclusif",              icon: Crown },
];

const initialForm: FormState = {
  kind: null, client_name: "", client_email: "", client_phone: "",
  property_address: "", property_description: "", amount: "", agent_notes: "",
};

function ChatbotPage() {
  const submit = useServerFn(createRealtorDocument);
  const [step, setStep] = useState<Step>("choose-kind");
  const [form, setForm] = useState<FormState>(initialForm);
  const [messages, setMessages] = useState<Msg[]>([
    { role: "bot", text: "Bonjour ! Je vais vous aider à générer un document à signer pour votre client. Quel document souhaitez-vous créer ?" },
  ]);
  const [input, setInput] = useState("");
  const [result, setResult] = useState<Awaited<ReturnType<typeof createRealtorDocument>> | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, step]);

  const mut = useMutation({
    mutationFn: () => submit({ data: {
      kind: form.kind!,
      client_name: form.client_name.trim(),
      client_email: form.client_email.trim(),
      client_phone: form.client_phone.trim(),
      property_address: form.property_address.trim(),
      property_description: form.property_description.trim(),
      amount: form.amount ? Number(form.amount.replace(/[^\d.]/g, "")) : null,
      agent_notes: form.agent_notes.trim(),
    } }),
    onSuccess: (r) => {
      setResult(r);
      setStep("done");
      setMessages((m) => [...m, { role: "bot", text: `Document prêt ! Référence ${r.reference}. Vous pouvez maintenant l'envoyer à ${r.client_name} pour signature.` }]);
      toast.success("Document généré");
    },
    onError: (e: Error) => {
      toast.error(e.message);
      setMessages((m) => [...m, { role: "bot", text: `Erreur : ${e.message}` }]);
    },
  });

  function pickKind(k: DocKind) {
    const meta = KINDS.find((x) => x.id === k)!;
    setForm({ ...form, kind: k });
    setMessages((m) => [
      ...m,
      { role: "user", text: meta.label },
      { role: "bot", text: "Parfait. Quel est le nom complet du client ?" },
    ]);
    setStep("client-name");
  }

  function pushAndAdvance(userText: string, nextBot: string, next: Step) {
    setMessages((m) => [...m, { role: "user", text: userText }, { role: "bot", text: nextBot }]);
    setStep(next);
    setInput("");
  }

  function handleSubmitInput() {
    const v = input.trim();
    if (!v && step !== "client-phone" && step !== "property-description" && step !== "amount" && step !== "agent-notes") return;
    switch (step) {
      case "client-name":
        setForm({ ...form, client_name: v });
        pushAndAdvance(v, "Son adresse email (pour l'envoi du document) ?", "client-email");
        break;
      case "client-email":
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) { toast.error("Email invalide"); return; }
        setForm({ ...form, client_email: v });
        pushAndAdvance(v, "Son numéro de téléphone (mobile, format international si possible — utilisé pour WhatsApp) ? Laissez vide pour passer.", "client-phone");
        break;
      case "client-phone":
        setForm({ ...form, client_phone: v });
        pushAndAdvance(v || "(aucun)", "Adresse complète du bien immobilier ?", "property-address");
        break;
      case "property-address":
        setForm({ ...form, property_address: v });
        pushAndAdvance(v, "Description courte du bien (type, surface, étage…) ? Optionnel.", "property-description");
        break;
      case "property-description":
        setForm({ ...form, property_description: v });
        if (form.kind === "visit_slip" || form.kind === "purchase_offer" || form.kind === "mandate_simple" || form.kind === "mandate_exclusive") {
          const ask = form.kind === "purchase_offer" ? "Montant de l'offre (en €) ?"
            : form.kind === "visit_slip" ? "Prix de présentation (en €) ? Optionnel."
            : "Prix net vendeur (en €) ?";
          pushAndAdvance(v || "(aucune)", ask, "amount");
        }
        break;
      case "amount":
        setForm({ ...form, amount: v });
        pushAndAdvance(v ? `${v} €` : "(non précisé)", "Conditions particulières ou notes pour le client ? Optionnel.", "agent-notes");
        break;
      case "agent-notes":
        setForm({ ...form, agent_notes: v });
        setMessages((m) => [...m, { role: "user", text: v || "(aucune)" }, { role: "bot", text: "Tout est prêt. Vérifiez le récapitulatif ci-dessous puis cliquez sur Générer." }]);
        setStep("review");
        setInput("");
        break;
    }
  }

  function reset() {
    setForm(initialForm);
    setResult(null);
    setInput("");
    setStep("choose-kind");
    setMessages([{ role: "bot", text: "Nouvelle conversation. Quel document souhaitez-vous créer ?" }]);
  }

  return (
    <div className="mx-auto flex h-[calc(100vh-8rem)] max-w-3xl flex-col gap-4">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Assistant agent immobilier</h1>
          <p className="text-sm text-muted-foreground">Générez bons de visite, offres d'achat et mandats en quelques étapes.</p>
        </div>
        {step !== "choose-kind" && (
          <Button variant="ghost" size="sm" onClick={reset}><RefreshCw className="mr-1 h-4 w-4" />Nouveau</Button>
        )}
      </header>

      <Card className="flex flex-1 flex-col overflow-hidden">
        <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto p-4">
          {messages.map((m, i) => (
            <Bubble key={i} msg={m} />
          ))}

          {step === "choose-kind" && (
            <div className="grid gap-2 sm:grid-cols-2">
              {KINDS.map((k) => (
                <button
                  key={k.id}
                  onClick={() => pickKind(k.id)}
                  className="group flex items-start gap-3 rounded-lg border bg-card p-3 text-left transition-colors hover:border-primary hover:bg-accent"
                >
                  <k.icon className="mt-0.5 h-5 w-5 text-primary" />
                  <div>
                    <div className="font-medium">{k.label}</div>
                    <div className="text-xs text-muted-foreground">{k.desc}</div>
                  </div>
                </button>
              ))}
            </div>
          )}

          {step === "review" && form.kind && (
            <ReviewCard form={form} kindLabel={KINDS.find(k => k.id === form.kind)!.label} onSubmit={() => mut.mutate()} pending={mut.isPending} />
          )}

          {step === "done" && result && (
            <ResultCard result={result} clientPhone={form.client_phone} />
          )}
        </div>

        {step !== "choose-kind" && step !== "review" && step !== "done" && (
          <div className="border-t bg-muted/30 p-3">
            <div className="flex gap-2">
              {(step === "property-description" || step === "agent-notes") ? (
                <Textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Votre réponse…"
                  rows={2}
                  className="resize-none"
                  onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleSubmitInput(); }}
                  autoFocus
                />
              ) : (
                <Input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Votre réponse…"
                  onKeyDown={(e) => { if (e.key === "Enter") handleSubmitInput(); }}
                  autoFocus
                  type={step === "client-email" ? "email" : step === "amount" ? "text" : "text"}
                  inputMode={step === "amount" ? "numeric" : undefined}
                />
              )}
              <Button onClick={handleSubmitInput}><Send className="h-4 w-4" /></Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}

function Bubble({ msg }: { msg: Msg }) {
  const isBot = msg.role === "bot";
  return (
    <div className={`flex gap-3 ${isBot ? "" : "flex-row-reverse"}`}>
      <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${isBot ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
        {isBot ? <Bot className="h-4 w-4" /> : <UserIcon className="h-4 w-4" />}
      </div>
      <div className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${isBot ? "bg-muted" : "bg-primary text-primary-foreground"}`}>
        {msg.text}
      </div>
    </div>
  );
}

function ReviewCard({ form, kindLabel, onSubmit, pending }: { form: FormState; kindLabel: string; onSubmit: () => void; pending: boolean }) {
  const Row = ({ label, value }: { label: string; value: string }) => (
    <div className="grid grid-cols-3 gap-2 text-sm">
      <Label className="text-muted-foreground">{label}</Label>
      <div className="col-span-2 font-medium">{value || <span className="text-muted-foreground">—</span>}</div>
    </div>
  );
  return (
    <Card className="space-y-3 border-primary/30 bg-card p-4">
      <div className="flex items-center justify-between">
        <Badge variant="secondary">{kindLabel}</Badge>
      </div>
      <div className="space-y-2">
        <Row label="Client" value={form.client_name} />
        <Row label="Email" value={form.client_email} />
        <Row label="Téléphone" value={form.client_phone} />
        <Row label="Bien" value={form.property_address} />
        <Row label="Description" value={form.property_description} />
        <Row label="Montant" value={form.amount ? `${form.amount} €` : ""} />
        <Row label="Notes" value={form.agent_notes} />
      </div>
      <Button onClick={onSubmit} disabled={pending} className="w-full">
        {pending ? "Génération…" : "Générer et préparer la signature"}
      </Button>
    </Card>
  );
}

function ResultCard({ result, clientPhone }: { result: NonNullable<Awaited<ReturnType<typeof createRealtorDocument>>>; clientPhone: string }) {
  const url = result.signature_url || (typeof window !== "undefined" ? `${window.location.origin}/s/${result.signature_token}` : "");
  const subject = encodeURIComponent(`${result.kind_label} à signer — ${result.reference}`);
  const body = encodeURIComponent(`Bonjour ${result.client_name},\n\nVeuillez signer électroniquement le document suivant : ${result.kind_label} (réf. ${result.reference}).\n\nLien sécurisé : ${url}\n\nMerci,`);
  const mailto = `mailto:${result.client_email}?subject=${subject}&body=${body}`;
  const cleanPhone = clientPhone.replace(/[^\d]/g, "");
  const waText = encodeURIComponent(`Bonjour ${result.client_name}, voici votre ${result.kind_label.toLowerCase()} (réf. ${result.reference}) à signer : ${url}`);
  const waUrl = cleanPhone ? `https://wa.me/${cleanPhone}?text=${waText}` : `https://wa.me/?text=${waText}`;

  const copy = () => { navigator.clipboard.writeText(url); toast.success("Lien copié"); };

  return (
    <Card className="space-y-4 border-primary/40 bg-card p-4">
      <div className="flex items-start gap-3">
        <CheckCircle2 className="h-5 w-5 shrink-0 text-primary" />
        <div className="flex-1">
          <div className="font-semibold">{result.title}</div>
          <div className="text-xs text-muted-foreground">Référence {result.reference}</div>
        </div>
      </div>

      <div className="space-y-1">
        <Label className="text-xs uppercase text-muted-foreground">Lien de signature</Label>
        <div className="flex gap-2">
          <Input value={url} readOnly className="font-mono text-xs" />
          <Button variant="outline" size="icon" onClick={copy}><Copy className="h-4 w-4" /></Button>
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <Button asChild variant="default">
          <a href={mailto}><Mail className="mr-2 h-4 w-4" />Envoyer par email</a>
        </Button>
        <Button asChild variant="default" className="bg-[#25D366] hover:bg-[#1ebe5d] text-white">
          <a href={waUrl} target="_blank" rel="noreferrer"><MessageCircle className="mr-2 h-4 w-4" />Envoyer via WhatsApp</a>
        </Button>
        <Button asChild variant="outline">
          <Link to="/app/documents/$id" params={{ id: result.document_id }}>
            <ExternalLink className="mr-2 h-4 w-4" />Voir le document
          </Link>
        </Button>
        <Button asChild variant="outline">
          <a href={url} target="_blank" rel="noreferrer"><FileSignature className="mr-2 h-4 w-4" />Prévisualiser signature</a>
        </Button>
      </div>

      {!clientPhone && (
        <p className="text-xs text-muted-foreground">
          Astuce : ajoutez le téléphone du client à l'étape suivante pour pré-remplir le numéro WhatsApp.
        </p>
      )}
    </Card>
  );
}
