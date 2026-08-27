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
      const webhookUrl = url.searchParams.get('url') || `${url.origin}/webhook`;
      const secret = url.searchParams.get('secret') || '';
      const res = await fetch(
        `https://api.telegram.org/bot${env.BOT_TOKEN}/setWebhook?url=${encodeURIComponent(webhookUrl)}&secret_token=${encodeURIComponent(secret)}&max_connections=40&drop_pending_updates=true`
      );
      return new Response(JSON.stringify(await res.json(), null, 2), {
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
