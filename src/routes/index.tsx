import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { LanguageSwitcher } from "@/components/language-switcher";
import { FileCheck2, ShieldCheck, Workflow } from "lucide-react";

export const Route = createFileRoute("/")({
  beforeLoad: async () => {
    if (typeof window === "undefined") return;

    const { data } = await supabase.auth.getSession();
    if (data.session) {
      throw redirect({ to: "/dashboard" });
    }
  },
  component: Landing,
});

function Landing() {
  const { t } = useTranslation();

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link to="/" className="text-lg font-semibold tracking-tight">
            {t("app.name")}
          </Link>
          <div className="flex items-center gap-2">
            <LanguageSwitcher />
            <Button asChild variant="ghost" size="sm">
              <Link to="/login">{t("nav.login")}</Link>
            </Button>
            <Button asChild size="sm">
              <Link to="/signup">{t("nav.signup")}</Link>
            </Button>
          </div>
        </div>
      </header>

      <main>
        <section className="mx-auto max-w-4xl px-6 py-24 text-center">
          <h1 className="text-balance text-5xl font-semibold tracking-tight text-foreground sm:text-6xl">
            {t("landing.hero_title")}
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground">
            {t("landing.hero_subtitle")}
          </p>
          <div className="mt-10 flex flex-wrap justify-center gap-3">
            <Button asChild size="lg">
              <Link to="/signup">{t("landing.cta_start")}</Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link to="/login">{t("landing.cta_login")}</Link>
            </Button>
          </div>
        </section>

        <section className="mx-auto grid max-w-6xl gap-6 px-6 pb-24 sm:grid-cols-3">
          {[
            { icon: Workflow, title: t("landing.feat1_title"), text: t("landing.feat1_text") },
            { icon: FileCheck2, title: t("landing.feat2_title"), text: t("landing.feat2_text") },
            { icon: ShieldCheck, title: t("landing.feat3_title"), text: t("landing.feat3_text") },
          ].map((f) => (
            <div key={f.title} className="rounded-lg border border-border bg-card p-6">
              <f.icon className="h-8 w-8 text-primary" />
              <h3 className="mt-4 font-semibold text-card-foreground">{f.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{f.text}</p>
            </div>
          ))}
        </section>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto max-w-6xl px-6 py-6 text-sm text-muted-foreground">
          © {new Date().getFullYear()} {t("app.name")}
        </div>
      </footer>
    </div>
  );
}
