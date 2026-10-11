import { postEdgeTick, type EdgeTickEnv } from '../../_shared/edgeTick';

export type MissedCallBookingTickEnv = EdgeTickEnv & {
  MISSED_CALL_BOOKING_WORKER_SECRET?: string;
};

export async function runMissedCallBookingTick(env: MissedCallBookingTickEnv): Promise<void> {
  await postEdgeTick(env, {
    tickName: 'missed-call-booking-tick',
    functionName: 'missed-call-booking-worker',
    secretName: 'MISSED_CALL_BOOKING_WORKER_SECRET',
  });
}

export default {
  async scheduled(_controller: unknown, env: MissedCallBookingTickEnv): Promise<void> {
    await runMissedCallBookingTick(env);
  },
};
