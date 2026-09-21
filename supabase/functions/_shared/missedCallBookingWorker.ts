export type BookingWorkerResult = {
  processed: boolean;
  booked?: boolean;
  command_id?: string;
  job_id?: string;
  review_reason?: 'noneligible' | 'ambiguous' | 'stop' | 'conflict';
  reason?: 'empty';
};

export type BookingWorkerDependencies = {
  workerSecret: string;
  workerId: string;
  processNext: (workerId: string) => Promise<BookingWorkerResult>;
};

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function constantTimeEqual(left: string, right: string): boolean {
  const max = Math.max(left.length, right.length);
  let mismatch = left.length ^ right.length;
  for (let index = 0; index < max; index += 1) {
    mismatch |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
  }
  return mismatch === 0;
}

export async function handleMissedCallBookingWorker(
  request: Request,
  dependencies: BookingWorkerDependencies,
): Promise<Response> {
  if (request.method !== 'POST') return json({ ok: false, error: 'POST only' }, 405);
  if (!dependencies.workerSecret || !dependencies.workerId) {
    return json({ ok: false, error: 'Worker is not configured' }, 503);
  }

  const suppliedSecret = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? '';
  if (!suppliedSecret || !constantTimeEqual(suppliedSecret, dependencies.workerSecret)) {
    return json({ ok: false, error: 'Unauthorized' }, 401);
  }

  const result = await dependencies.processNext(dependencies.workerId);
  if (!result.processed) return new Response(null, { status: 204 });
  return json({ ok: true, ...result }, 200);
}
