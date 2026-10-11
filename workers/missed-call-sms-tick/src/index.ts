import { postEdgeTick, type EdgeTickEnv } from '../../_shared/edgeTick';

export type MissedCallSmsTickEnv = EdgeTickEnv & {
  MISSED_CALL_SMS_WORKER_SECRET?: string;
};

export async function runMissedCallSmsTick(env: MissedCallSmsTickEnv): Promise<void> {
  await postEdgeTick(env, {
    tickName: 'missed-call-sms-tick',
    functionName: 'missed-call-sms-worker',
    secretName: 'MISSED_CALL_SMS_WORKER_SECRET',
  });
}

export default {
  async scheduled(_controller: unknown, env: MissedCallSmsTickEnv): Promise<void> {
    await runMissedCallSmsTick(env);
  },
};
