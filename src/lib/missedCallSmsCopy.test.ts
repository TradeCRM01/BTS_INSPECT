import { describe, expect, it } from 'vitest';
import {
  gsm7Length,
  gsm7Segments,
  isGsm7,
  renderEnquiryThanks,
  renderMissedCallAck,
  renderMissedCallHelp,
  SMS_REPLY_FORBIDDEN,
} from './missedCallSmsCopy';

const TWENTY = 'Twenty Character Nam';

describe('missed-call SMS copy', () => {
  it('keeps ack, thanks, and HELP at one GSM-7 segment with a 20-char business name', () => {
    const ack = renderMissedCallAck(TWENTY);
    const thanks = renderEnquiryThanks(TWENTY);
    const help = renderMissedCallHelp(TWENTY);

    expect(TWENTY).toHaveLength(20);
    expect(isGsm7(TWENTY)).toBe(true);
    expect(isGsm7('Name—Dash')).toBe(false);
    expect(isGsm7('Name😀')).toBe(false);
    for (const body of [ack, thanks, help]) {
      expect(isGsm7(body)).toBe(true);
      expect(gsm7Length(body)).toBeLessThanOrEqual(160);
      expect(gsm7Segments(body)).toBe(1);
      expect(body).toContain(TWENTY);
      expect(body).toMatch(/STOP/);
      expect(body).not.toMatch(SMS_REPLY_FORBIDDEN);
    }

    expect(ack).toBe(
      'Hi, this is Twenty Character Nam. Sorry we missed your call. Reply with what you need done and your suburb and we will get back to you. Reply STOP to opt out.',
    );
    expect(thanks).toBe(
      'Thanks, got it. We have passed this to the office and someone from Twenty Character Nam will be in touch. Reply STOP to opt out.',
    );
    expect(help).toBe(
      'Twenty Character Nam: reply with the job and your suburb and the office will get back to you. Reply STOP to opt out, START to opt back in.',
    );
    expect(gsm7Length(renderMissedCallAck('Smith Plumbing & Gas'))).toBe(158);
    expect(gsm7Length('€')).toBe(2);
    expect(gsm7Segments(`${'x'.repeat(159)}€`)).toBe(2);
  });
});
