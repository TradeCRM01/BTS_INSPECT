import { describe, expect, it } from 'vitest';
import { prefillReminderTo, prefillSmsTo } from './jobReminder';
import {
  FIELD_ABN,
  FIELD_ACCOUNT,
  FIELD_AU_PHONE,
  FIELD_BSB,
  FIELD_EMAIL,
  FIELD_NAME_REQUIRED,
  FIELD_PERCENT,
  FIELD_PORT,
  FIELD_RATE,
  clientFormFieldErrors,
  companyDetailsFieldErrors,
  isAbn,
  isAccountNumber,
  isAuPhone,
  isBsb,
  isEmail,
  isJobNumber,
  isPort,
  parseNonNegativeNumber,
  parsePercent,
  paymentMethodFieldErrors,
  smtpFieldErrors,
} from './fieldValidation';

describe('fieldValidation predicates', () => {
  it('accepts AU phones that prefillSmsTo can send and rejects abc', () => {
    expect(isAuPhone('0412 345 678')).toBe(true);
    expect(isAuPhone('+61 412 345 678')).toBe(true);
    expect(isAuPhone('0832110000')).toBe(true);
    expect(isAuPhone('abc')).toBe(false);
    expect(isAuPhone('12')).toBe(false);
    expect(isAuPhone('')).toBe(false);
    expect(prefillSmsTo('0412 345 678')).toBe('+61412345678');
    expect(prefillSmsTo('abc')).toBe('');
  });

  it('accepts a real email and rejects not-an-email', () => {
    expect(isEmail('jane@acme.com.au')).toBe(true);
    expect(isEmail('not-an-email')).toBe(false);
    expect(isEmail('nope')).toBe(false);
    expect(isEmail('')).toBe(false);
    expect(prefillReminderTo({ id: 'c', email: 'jane@acme.com.au' })).toBe('jane@acme.com.au');
    expect(prefillReminderTo({ id: 'c', email: 'not-an-email' })).toBe('');
  });

  it('accepts BSB 064-000 and six digits, rejects abc12', () => {
    expect(isBsb('064-000')).toBe(true);
    expect(isBsb('064000')).toBe(true);
    expect(isBsb('abc12')).toBe(false);
    expect(isBsb('12345')).toBe(false);
  });

  it('accepts a 6-9 digit account and rejects 12ab', () => {
    expect(isAccountNumber('12345678')).toBe(true);
    expect(isAccountNumber('123456')).toBe(true);
    expect(isAccountNumber('123456789')).toBe(true);
    expect(isAccountNumber('12ab')).toBe(false);
    expect(isAccountNumber('12345')).toBe(false);
    expect(isAccountNumber('1234567890')).toBe(false);
  });

  it('accepts an ATO-checksum ABN and rejects 123', () => {
    expect(isAbn('51 824 753 556')).toBe(true);
    expect(isAbn('51824753556')).toBe(true);
    expect(isAbn('123')).toBe(false);
    expect(isAbn('12 345 678 901')).toBe(false);
  });

  it('accepts ports 1-65535 and rejects -5', () => {
    expect(isPort('587')).toBe(true);
    expect(isPort('1')).toBe(true);
    expect(isPort('65535')).toBe(true);
    expect(isPort('-5')).toBe(false);
    expect(isPort('0')).toBe(false);
    expect(isPort('65536')).toBe(false);
    expect(isPort('abc')).toBe(false);
  });

  it('rejects 1,5 and -5 on percent, keeps 10 and 1.5', () => {
    expect(parsePercent('10')).toEqual({ ok: true, value: 10 });
    expect(parsePercent('1.5')).toEqual({ ok: true, value: 1.5 });
    expect(parsePercent('0')).toEqual({ ok: true, value: 0 });
    expect(parsePercent('100')).toEqual({ ok: true, value: 100 });
    expect(parsePercent('1,5')).toEqual({ ok: false });
    expect(parsePercent('-5')).toEqual({ ok: false });
    expect(parsePercent('101')).toEqual({ ok: false });
    expect(parsePercent('abc')).toEqual({ ok: false });
  });

  it('parses labour 95 and rejects a comma that would become 15', () => {
    expect(parseNonNegativeNumber('95')).toEqual({ ok: true, value: 95 });
    expect(parseNonNegativeNumber('1,5')).toEqual({ ok: false });
    expect(parseNonNegativeNumber('-5')).toEqual({ ok: false });
  });

  it('treats a job number as digits', () => {
    expect(isJobNumber('137')).toBe(true);
    expect(isJobNumber('abc')).toBe(false);
  });
});

describe('field error maps', () => {
  it('blocks a blank name and junk phone/email', () => {
    expect(clientFormFieldErrors({ name: '', phone: '', email: '' })).toEqual({
      name: FIELD_NAME_REQUIRED,
    });
    expect(clientFormFieldErrors({
      name: 'B4a Throwaway',
      phone: 'abc',
      email: 'not-an-email',
    })).toEqual({
      phone: FIELD_AU_PHONE,
      email: FIELD_EMAIL,
    });
    expect(clientFormFieldErrors({
      name: 'Acme',
      phone: '0412 345 678',
      email: 'jane@acme.com.au',
    })).toEqual({});
  });

  it('keeps the ABN banner case: 123 is not a valid ABN', () => {
    const errors = companyDetailsFieldErrors({
      abn: '123',
      phone: 'abc',
      email: 'ok@co.com.au',
      taxRate: '-5',
      materialMarkup: '1,5',
      labourRate: '-1',
    });
    expect(errors.abn).toBe(FIELD_ABN);
    expect(errors.phone).toBe(FIELD_AU_PHONE);
    expect(errors.taxRate).toBe(FIELD_PERCENT);
    expect(errors.materialMarkup).toBe(FIELD_PERCENT);
    expect(errors.labourRate).toBe(FIELD_RATE);
    expect(isAbn('123')).toBe(false);
  });

  it('blocks garbage BSB/account on a bank row', () => {
    expect(paymentMethodFieldErrors({
      kind: 'bank_transfer',
      bsb: 'abc12',
      account_number: '12ab',
    })).toEqual({
      bsb: FIELD_BSB,
      account: FIELD_ACCOUNT,
    });
    expect(paymentMethodFieldErrors({
      kind: 'bank_transfer',
      bsb: '064-000',
      account_number: '12345678',
    })).toEqual({});
  });

  it('blocks a bad SMTP from-email and port', () => {
    expect(smtpFieldErrors({ from_email: 'nope', smtp_port: '-5' })).toEqual({
      from_email: FIELD_EMAIL,
      smtp_port: FIELD_PORT,
    });
    expect(smtpFieldErrors({ from_email: 'ops@co.com.au', smtp_port: '587' })).toEqual({});
  });
});
