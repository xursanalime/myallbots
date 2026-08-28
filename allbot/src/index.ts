import { Env } from './types';
import { processUpdate } from './router';
import { initSchema } from './vocab/db';
import { runScheduledChecks } from './vocab/notifier';
import { runHabitScheduledChecks } from './habits/reminders';

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    
    if (request.method === 'GET' && (url.pathname === '/health' || url.pathname === '/')) {
      return new Response(JSON.stringify({ status: 'online', bot: 'AllBot' }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    if (url.pathname === '/set-webhook') {
      if (!env.BOT_TOKEN) {
        return new Response(JSON.stringify({
          error: "BOT_TOKEN is missing or empty in environment variables",
          hint: "Cloudflare dagi Settings -> Variables bo'limini tekshiring"
        }, null, 2), { headers: { 'Content-Type': 'application/json' } });
      }
      const webhookUrl = url.searchParams.get('url') || `${url.origin}/webhook`;
      const secret = url.searchParams.get('secret') || '';
      const telegramUrl = `https://api.telegram.org/bot${env.BOT_TOKEN}/setWebhook?url=${encodeURIComponent(webhookUrl)}&secret_token=${encodeURIComponent(secret)}&max_connections=40&drop_pending_updates=true`;
      
      const res = await fetch(telegramUrl);
      const data = await res.json() as any;
      
      // Qo'shimcha debug uchun
      if (!data.ok) {
        data._debug_url_prefix = `https://api.telegram.org/bot...${env.BOT_TOKEN.slice(-4)}/setWebhook`;
      }
      
      return new Response(JSON.stringify(data, null, 2), {
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    if (url.pathname === '/test-cron') {
      await initSchema(env.DB);
      const results: any = {};
      try {
        await runScheduledChecks(env);
        results.vocab = "ok";
      } catch (e: any) {
        results.vocab_error = String(e?.message || e);
      }
      try {
        await runHabitScheduledChecks(env);
        results.habits = "ok";
      } catch (e: any) {
        results.habits_error = String(e?.message || e);
      }
      return new Response(JSON.stringify(results, null, 2), {
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    if (request.method !== 'POST' || url.pathname !== '/webhook') {
      return new Response('Not found', { status: 404 });
    }
    
    const secret = request.headers.get('X-Telegram-Bot-Api-Secret-Token');
    if (!secret || secret !== env.WEBHOOK_SECRET) {
      return new Response('Forbidden', { status: 403 });
    }
    
    let update;
    try {
      update = await request.json();
    } catch {
      return new Response('Invalid JSON', { status: 400 });
    }
    
    try {
      await processUpdate(env, update as any);
    } catch (err) {
      console.error('Update processing error:', err);
      return new Response('Internal error', { status: 500 });
    }
    
    return new Response('ok');
  },
  
  async scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    await initSchema(env.DB);
    
    await Promise.allSettled([
      runScheduledChecks(env),
      runHabitScheduledChecks(env)
    ]);
  }
};
