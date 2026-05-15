import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LanguageSwitcher } from "@/components/language-switcher";
import { toast } from "sonner";

export const Route = createFileRoute("/signup")({
  component: SignupPage,
});

function SignupPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [orgName, setOrgName] = useState("");
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: window.location.origin,
        data: {
          full_name: fullName,
          organization_name: orgName,
          lang: i18n.language?.startsWith("en") ? "en" : "fr",
        },
      },
    });
    setLoading(false);

    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(t("auth.signup_success"));
    navigate({ to: "/login" });
  };

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="flex items-center justify-between border-b border-border px-6 py-4">
        <Link to="/" className="text-lg font-semibold">
          {t("app.name")}
        </Link>
        <LanguageSwitcher />
      </header>
      <main className="flex flex-1 items-center justify-center px-6 py-12">
        <form
          onSubmit={onSubmit}
          className="w-full max-w-sm space-y-4 rounded-lg border border-border bg-card p-8"
        >
          <h1 className="text-2xl font-semibold">{t("auth.signup_title")}</h1>

          <div className="space-y-2">
            <Label htmlFor="full_name">{t("auth.full_name")}</Label>
            <Input
              id="full_name"
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="org_name">{t("auth.organization_name")}</Label>
            <Input
              id="org_name"
              required
              value={orgName}
              onChange={(e) => setOrgName(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">{t("auth.email")}</Label>
            <Input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">{t("auth.password")}</Label>
            <Input
              id="password"
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? t("common.loading") : t("auth.signup_submit")}
          </Button>

          <p className="text-center text-sm text-muted-foreground">
            {t("auth.have_account")}{" "}
            <Link to="/login" className="font-medium text-primary hover:underline">
              {t("nav.login")}
            </Link>
          </p>
        </form>
      </main>
    </div>
  );
}
