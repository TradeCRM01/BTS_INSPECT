import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2.57.4';
import {
  handleMissedCallBookingWorker,
  type BookingWorkerResult,
} from '../_shared/missedCallBookingWorker.ts';

const db = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  { auth: { persistSession: false, autoRefreshToken: false } },
);

const workerId = Deno.env.get('MISSED_CALL_BOOKING_WORKER_ID')?.trim()
  || 'missed-call-booking-worker';

async function processNext(id: string): Promise<BookingWorkerResult> {
  const { data, error } = await db.rpc('process_next_missed_call_booking', {
    p_worker_id: id,
  });
  if (error) throw error;
  return data as BookingWorkerResult;
}

Deno.serve(async (request: Request) => {
  try {
    return await handleMissedCallBookingWorker(request, {
      workerSecret: Deno.env.get('MISSED_CALL_BOOKING_WORKER_SECRET')?.trim() ?? '',
      workerId,
      processNext,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown worker failure';
    console.error('missed-call-booking-worker', { message });
    return new Response(JSON.stringify({ ok: false, error: 'Worker failed' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
