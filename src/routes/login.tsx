import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LanguageSwitcher } from "@/components/language-switcher";
import { toast } from "sonner";

export const Route = createFileRoute("/login")({
  component: LoginPage,
});

function LoginPage() {
  const { t } = useTranslation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setLoading(false);
      toast.error(t("auth.error_invalid"));
      return;
    }
    const deadline = Date.now() + 2500;
    while (Date.now() < deadline) {
      const { data } = await supabase.auth.getSession();
      if (data.session) break;
      await new Promise((resolve) => window.setTimeout(resolve, 100));
    }

    window.location.href = "/dashboard";
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
          className="w-full max-w-sm space-y-5 rounded-lg border border-border bg-card p-8"
        >
          <h1 className="text-2xl font-semibold">{t("auth.login_title")}</h1>

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
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? t("common.loading") : t("auth.login_submit")}
          </Button>

          <p className="text-center text-sm text-muted-foreground">
            {t("auth.no_account")}{" "}
            <Link to="/signup" className="font-medium text-primary hover:underline">
              {t("nav.signup")}
            </Link>
          </p>
        </form>
      </main>
    </div>
  );
}
