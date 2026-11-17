/**
 * sessionHandler.ts
 *
 * Edge & Local Dispatcher for AssessmentSessionDO.
 * If running on Cloudflare Workers with `env.ASSESSMENT_SESSION`, forwards to Cloudflare Durable Objects.
 * If running locally (Vite dev server / Node preview), seamlessly uses the in-memory DO emulator.
 */

import { AssessmentSessionDO, DurableObjectState, DurableObjectStorage } from "./assessmentSessionDO";

class InMemoryDOStorage implements DurableObjectStorage {
  private data = new Map<string, unknown>();
  private alarmTime: number | null = null;
  private alarmTimer: ReturnType<typeof setTimeout> | null = null;
  private onAlarm?: () => Promise<void>;

  setAlarmHandler(handler: () => Promise<void>) {
    this.onAlarm = handler;
  }

  async get<T = unknown>(key: string): Promise<T | undefined> {
    return this.data.get(key) as T | undefined;
  }
  async put<T = unknown>(key: string, value: T): Promise<void> {
    this.data.set(key, value);
  }
  async delete(key: string): Promise<boolean> {
    return this.data.delete(key);
  }
  async setAlarm(scheduledTime: number | Date): Promise<void> {
    const timeMs = scheduledTime instanceof Date ? scheduledTime.getTime() : scheduledTime;
    this.alarmTime = timeMs;
    if (this.alarmTimer) clearTimeout(this.alarmTimer);
    const delay = Math.max(0, timeMs - Date.now());
    this.alarmTimer = setTimeout(async () => {
      if (this.onAlarm) {
        try {
          await this.onAlarm();
        } catch (err) {
          console.error('[InMemoryDO] Local alarm execution error:', err);
        }
      }
    }, delay);
  }
  async deleteAlarm(): Promise<void> {
    this.alarmTime = null;
    if (this.alarmTimer) clearTimeout(this.alarmTimer);
  }
  async getAlarm(): Promise<number | null> {
    return this.alarmTime;
  }
}

const localInstances = new Map<string, AssessmentSessionDO>();

function getOrCreateLocalInstance(key: string, env: Record<string, unknown>): AssessmentSessionDO {
  let instance = localInstances.get(key);
  if (!instance) {
    const storage = new InMemoryDOStorage();
    const state: DurableObjectState = {
      storage,
      id: { toString: () => key },
    };
    instance = new AssessmentSessionDO(state, env);
    storage.setAlarmHandler(() => instance!.alarm());
    localInstances.set(key, instance);
  }
  return instance;
}

export async function handleAssessmentSessionRequest(request: Request, env: Record<string, unknown>): Promise<Response> {
  const url = new URL(request.url);

  // Extract session key (uid:assessmentId)
  let uid = url.searchParams.get('uid') || request.headers.get('x-user-id');
  let assessmentId = url.searchParams.get('assessmentId') || request.headers.get('x-assessment-id');

  let bodyClone: Record<string, unknown> | null = null;
  if (!uid || !assessmentId) {
    if (request.method === 'POST') {
      try {
        bodyClone = (await request.clone().json()) as Record<string, unknown>;
        uid = uid || (typeof bodyClone?.uid === 'string' ? bodyClone.uid : null);
        assessmentId = assessmentId || (typeof bodyClone?.assessmentId === 'string' ? bodyClone.assessmentId : null);
      } catch (_) {
        // ignore JSON parse error on non-json bodies
      }
    }
  }

  const sessionKey = `${uid || 'anon'}:${assessmentId || 'default'}`;

  // 1. Cloudflare Workers Durable Object binding check
  const cfEnv = env as { ASSESSMENT_SESSION?: { idFromName: (name: string) => unknown; get: (id: unknown) => { fetch: (req: Request) => Promise<Response> } } };
  if (cfEnv?.ASSESSMENT_SESSION && typeof cfEnv.ASSESSMENT_SESSION.idFromName === 'function') {
    const id = cfEnv.ASSESSMENT_SESSION.idFromName(sessionKey);
    const stub = cfEnv.ASSESSMENT_SESSION.get(id);
    return stub.fetch(request);
  }

  // 2. Local / Development Fallback Emulator
  const localDO = getOrCreateLocalInstance(sessionKey, env);
  return localDO.fetch(request);
}
