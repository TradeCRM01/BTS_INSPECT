import { describe, expect, it } from 'vitest';
import {
  ALLOWED_ENQUIRY_PHONE,
  ENQUIRIES_HREF,
  ENQUIRY_HIDDEN_LOOK,
  ENQUIRY_SURFACE_LIVE,
  countEnquiriesToday,
  countEnquiriesToReview,
  ALREADY_APPROVED_TOAST,
  enquiryCallback,
  enquiryCallerLabel,
  enquiryExcerpt,
  formatAuMobileDisplay,
  enquiryJobPath,
  enquiryLookKind,
  enquiryState,
  enquirySurfaceOpen,
  enquiryTitle,
  enquiryWhisper,
  isEnquiriesView,
  matchEnquiryClient,
  reminderRelatedHref,
  shouldQueryLiveEnquiries,
} from './missedCallEnquiry';

const brisbaneMorning = '2026-10-09T14:30:00.000Z';
const laterSameMorning = '2026-10-10T00:00:00.000Z';

describe('enquiry list shape', () => {
  it('opens on the existing jobs view query', () => {
    expect(isEnquiriesView('enquiries')).toBe(true);
    expect(isEnquiriesView('jobs')).toBe(false);
    expect(isEnquiriesView(null)).toBe(false);
  });

  it('names draft, approved, dismissed, and no reply', () => {
    expect(enquiryState({ enquiryStatus: 'draft', hasReply: false })).toBe('no_reply');
    expect(enquiryState({ enquiryStatus: 'draft', hasReply: true })).toBe('draft');
    expect(enquiryState({ enquiryStatus: 'approved', hasReply: true })).toBe('approved');
    expect(enquiryState({ enquiryStatus: 'dismissed', hasReply: true })).toBe('dismissed');
  });

  it('shows the matched client name, else the AU mobile, else withheld', () => {
    expect(enquiryCallerLabel({ clientName: 'Northside Mechanical', callerPhone: ALLOWED_ENQUIRY_PHONE }))
      .toBe('Northside Mechanical');
    expect(enquiryCallerLabel({ callerPhone: ALLOWED_ENQUIRY_PHONE })).toBe('0418 893 602');
    expect(enquiryCallerLabel({ callerPhone: '0418893602' })).toBe('0418 893 602');
    expect(enquiryCallerLabel({ callerPhone: null })).toBe('Number withheld');
    expect(enquiryCallerLabel({ callerPhone: '' })).toBe('Number withheld');
    expect(enquiryCallerLabel({ callerPhone: 'Number withheld' })).toBe('Number withheld');
    expect(enquiryCallerLabel({ callerPhone: 'not-a-phone' })).toBe('Number withheld');
  });

  it('prefers the first reply as the excerpt and title', () => {
    expect(enquiryExcerpt({ replyBody: 'Hot water is out, Paddington', jobService: 'Hot water' }))
      .toBe('Hot water is out, Paddington');
    expect(enquiryExcerpt({ replyBody: null, jobService: 'Hot water' })).toBe('Hot water');
    expect(enquiryTitle({ excerpt: 'Hot water is out, Paddington', suburb: 'Paddington' }))
      .toBe('Hot water is out, Paddington');
    expect(enquiryTitle({ excerpt: '', suburb: '' })).toBe('Missed-call enquiry');
  });

  it('counts today in the tenant time zone, Brisbane when none is set', () => {
    const rows = [
      { missedCallAt: brisbaneMorning },
      { missedCallAt: '2026-10-08T22:00:00.000Z' },
    ];
    const now = new Date(laterSameMorning);
    expect(countEnquiriesToday(rows, now, 'Australia/Brisbane')).toBe(1);
    expect(countEnquiriesToday(rows, now, 'Australia/Perth')).toBe(0);
    expect(countEnquiriesToday(rows, now, null)).toBe(1);
    expect(countEnquiriesToReview([
      { enquiryStatus: 'draft' },
      { enquiryStatus: 'draft' },
      { enquiryStatus: 'approved' },
    ])).toBe(2);
    expect(enquiryWhisper({ busy: false, reviewCount: 2, todayCount: 1 }))
      .toBe('2 to review · 1 today');
  });

  it('keeps the Enquiries surface off until the enquiry schema is live', () => {
    expect(ENQUIRY_SURFACE_LIVE).toBe(false);
    expect(enquiryLookKind('enquiries')).toBe('list');
    expect(enquiryLookKind(ENQUIRY_HIDDEN_LOOK)).toBeNull();
    expect(enquirySurfaceOpen('enquiries')).toBe(true);
    expect(enquirySurfaceOpen(null)).toBe(false);
    expect(shouldQueryLiveEnquiries({ look: null, view: null })).toBe(false);
    expect(shouldQueryLiveEnquiries({ look: null, view: 'enquiries' })).toBe(false);
    expect(shouldQueryLiveEnquiries({ look: 'enquiries', view: 'enquiries' })).toBe(false);
    expect(enquiryJobPath('')).toBeNull();
    expect(enquiryJobPath('/jobs/')).toBeNull();
    expect(enquiryJobPath('job-9')).toBe('/jobs/job-9');
  });

  it('formats an allowlisted mobile for Call back and skips withheld', () => {
    expect(formatAuMobileDisplay(ALLOWED_ENQUIRY_PHONE)).toBe('0418 893 602');
    expect(formatAuMobileDisplay('0418893602')).toBe('0418 893 602');
    expect(formatAuMobileDisplay('')).toBeNull();
    expect(formatAuMobileDisplay(null)).toBeNull();
    expect(formatAuMobileDisplay('Number withheld')).toBeNull();
    expect(formatAuMobileDisplay('not-a-phone')).toBeNull();
    expect(enquiryCallback(ALLOWED_ENQUIRY_PHONE)).toEqual({
      href: 'tel:+61418893602',
      label: '0418 893 602',
    });
    expect(enquiryCallback('')).toBeNull();
    expect(enquiryCallback(null)).toBeNull();
    expect(enquiryCallback('Number withheld')).toBeNull();
    expect(ALREADY_APPROVED_TOAST).toBe('Already approved — opening the job');
  });

  it('matches a client only when exactly one phone hits', () => {
    expect(matchEnquiryClient(ALLOWED_ENQUIRY_PHONE, [
      { id: 'c1', name: 'Northside Mechanical', phone: ALLOWED_ENQUIRY_PHONE },
    ])).toEqual({ id: 'c1', name: 'Northside Mechanical' });
    expect(matchEnquiryClient(ALLOWED_ENQUIRY_PHONE, [
      { id: 'c1', name: 'A', phone: ALLOWED_ENQUIRY_PHONE },
      { id: 'c2', name: 'B', phone: ALLOWED_ENQUIRY_PHONE },
    ])).toBeNull();
    expect(matchEnquiryClient(ALLOWED_ENQUIRY_PHONE, [
      { id: 'c1', name: 'A', phone: null },
    ])).toBeNull();
  });

  it('deep-links missed-call reminders to Jobs enquiries', () => {
    expect(reminderRelatedHref('missed_call_sms_thread', 'thread-1')).toBe(ENQUIRIES_HREF);
    expect(reminderRelatedHref('job', 'job-9')).toBe('/jobs/job-9');
    expect(reminderRelatedHref('invoice', 'inv-1')).toBeNull();
  });
});
