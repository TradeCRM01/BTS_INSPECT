import { describe, expect, it, vi } from 'vitest';
import { handleMissedCallBookingWorker } from '../../supabase/functions/_shared/missedCallBookingWorker';

describe('missed-call booking worker', () => {
  it('rejects an invalid worker secret before processing', async () => {
    const processNext = vi.fn();
    const response = await handleMissedCallBookingWorker(
      new Request('https://example.test/worker', {
        method: 'POST',
        headers: { authorization: 'Bearer wrong' },
      }),
      { workerSecret: 'secret', workerId: 'worker-a', processNext },
    );

    expect(response.status).toBe(401);
    expect(processNext).not.toHaveBeenCalled();
  });

  it('returns the atomic booking result', async () => {
    const processNext = vi.fn().mockResolvedValue({
      processed: true,
      booked: true,
      command_id: 'command-1',
      job_id: 'job-1',
    });
    const response = await handleMissedCallBookingWorker(
      new Request('https://example.test/worker', {
        method: 'POST',
        headers: { authorization: 'Bearer secret' },
      }),
      { workerSecret: 'secret', workerId: 'worker-a', processNext },
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      processed: true,
      booked: true,
      command_id: 'command-1',
      job_id: 'job-1',
    });
    expect(processNext).toHaveBeenCalledWith('worker-a');
  });

  it('returns no content when the command queue is empty', async () => {
    const response = await handleMissedCallBookingWorker(
      new Request('https://example.test/worker', {
        method: 'POST',
        headers: { authorization: 'Bearer secret' },
      }),
      {
        workerSecret: 'secret',
        workerId: 'worker-a',
        processNext: async () => ({ processed: false, reason: 'empty' }),
      },
    );

    expect(response.status).toBe(204);
    expect(await response.text()).toBe('');
  });
});
