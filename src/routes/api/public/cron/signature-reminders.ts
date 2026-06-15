import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { sendSignatureReminders } from "@/lib/signature-notifications.server";

/**
 * Cron-triggered signature reminders.
 * Auth: requires `apikey` header to match the project's anon key (canonical
 * pg_cron pattern). No new secret needed.
 *
 * Schedule via pg_cron, e.g. every 6 hours:
 *   SELECT cron.schedule('signature-reminders', '0 *\/6 * * *',
 *     $$ SELECT net.http_post(
 *          url:='https://<project>.lovable.app/api/public/cron/signature-reminders',
 *          headers:='{"Content-Type":"application/json","apikey":"<ANON_KEY>"}'::jsonb,
 *          body:='{}'::jsonb) $$);
 */
export const Route = createFileRoute("/api/public/cron/signature-reminders")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const provided = request.headers.get("apikey") ?? request.headers.get("x-api-key");
        const expected = process.env.SUPABASE_PUBLISHABLE_KEY;
        if (!expected || provided !== expected) {
          return new Response(JSON.stringify({ error: "unauthorized" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          });
        }

        const url = new URL(request.url);
        const origin = `${url.protocol}//${url.host}`;
        const withinHours = Number(url.searchParams.get("within_hours") ?? 48);

        const result = await sendSignatureReminders(
          supabaseAdmin,
          origin,
          Number.isFinite(withinHours) && withinHours > 0 ? withinHours : 48,
        );
        return new Response(JSON.stringify({ ok: true, ...result }), {
          headers: { "Content-Type": "application/json" },
        });
      },
      GET: async () =>
        new Response(JSON.stringify({ ok: true, hint: "POST with apikey header" }), {
          headers: { "Content-Type": "application/json" },
        }),
    },
  },
});
