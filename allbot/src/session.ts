import { Session } from './types';

export async function loadSession(db: D1Database, uid: number): Promise<Session> {
  const row = await db.prepare('SELECT user_state, quiz_state FROM bot_sessions WHERE user_id=?').bind(uid).first() as any;
  if (!row) return { userState: null, quizState: null };
  return {
    userState: row.user_state ? JSON.parse(row.user_state) : null,
    quizState: row.quiz_state ? JSON.parse(row.quiz_state) : null
  };
}

export async function saveSession(db: D1Database, uid: number, session: Session): Promise<void> {
  if (session.userState == null && session.quizState == null) {
    await db.prepare('DELETE FROM bot_sessions WHERE user_id=?').bind(uid).run();
    return;
  }
  await db.prepare(
    `INSERT INTO bot_sessions (user_id, user_state, quiz_state, updated_at)
     VALUES (?, ?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT(user_id) DO UPDATE
     SET user_state=excluded.user_state, quiz_state=excluded.quiz_state, updated_at=CURRENT_TIMESTAMP`
  ).bind(
    uid,
    session.userState != null ? JSON.stringify(session.userState) : null,
    session.quizState != null ? JSON.stringify(session.quizState) : null
  ).run();
}
