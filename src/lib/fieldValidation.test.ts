import { describe, expect, it, vi } from 'vitest';
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
  FIELD_SAVE_MISS,
  clientFormFieldErrors,
  companyDetailsFieldErrors,
  fieldSaveMiss,
  auPhoneDigitLengthOk,
  isAbn,
  isAccountNumber,
  isAuPhone,
  isBsb,
  isEmail,
  isPort,
  parseNonNegativeNumber,
  parsePercent,
  paymentMethodFieldErrors,
  smtpFieldErrors,
  updateWroteRows,
} from './fieldValidation';

describe('fieldValidation predicates', () => {
  it('accepts AU phones that prefillSmsTo can send and rejects abc', () => {
    expect(isAuPhone('0412 345 678')).toBe(true);
    expect(isAuPhone('+61 412 345 678')).toBe(true);
    expect(isAuPhone('0832110000')).toBe(true);
    expect(isAuPhone('13 14 50')).toBe(true);
    expect(isAuPhone('1300 123 456')).toBe(true);
    expect(isAuPhone('1800 123 456')).toBe(true);
    expect(isAuPhone('abc')).toBe(false);
    expect(isAuPhone('12')).toBe(false);
    expect(isAuPhone('')).toBe(false);
    expect(isAuPhone('call me 0400000000')).toBe(false);
    expect(isAuPhone('+1 212 555 0100')).toBe(false);
    expect(isAuPhone('12345678')).toBe(false);
    expect(isAuPhone('0400000000123456')).toBe(false);
    expect(isAuPhone('+131450')).toBe(false);
    expect(isAuPhone('0412 345')).toBe(false);
    expect(isAuPhone('+61 412 345 678 9012')).toBe(false);
    expect(isAuPhone('(07 3123 4567')).toBe(false);
    expect(isAuPhone('07) 3123 4567')).toBe(false);
    expect(prefillSmsTo('0412 345 678')).toBe('+61412345678');
    expect(prefillSmsTo('abc')).toBe('');
  });

  it.each([
    '(07) 3123 4567',
    '07 3123 4567',
    '+61 7 3123 4567',
    '0412 345 678',
    '+61412345678',
    '1300 123 456',
    '13 12 34',
  ])('accepts typed AU phone %s', (phone) => {
    expect(isAuPhone(phone)).toBe(true);
  });

  it('accepts a real email and rejects not-an-email', () => {
    expect(isEmail('jane@acme.com.au')).toBe(true);
    expect(isEmail('not-an-email')).toBe(false);
    expect(isEmail('nope')).toBe(false);
    expect(isEmail('a@b')).toBe(false);
    expect(isEmail('a@b..c')).toBe(false);
    expect(isEmail('')).toBe(false);
    expect(prefillReminderTo({ id: 'c', email: 'jane@acme.com.au' })).toBe('jane@acme.com.au');
    expect(prefillReminderTo({ id: 'c', email: 'not-an-email' })).toBe('');
  });

  it('accepts BSB 064-000 and six digits, rejects abc12', () => {
    expect(isBsb('064-000')).toBe(true);
    expect(isBsb('064000')).toBe(true);
    expect(isBsb('abc12')).toBe(false);
    expect(isBsb('12345')).toBe(false);
    expect(isBsb('1234567')).toBe(false);
    expect(isBsb('abc123def456')).toBe(false);
  });

  it('accepts a 6-9 digit account and rejects 12ab', () => {
    expect(isAccountNumber('12345678')).toBe(true);
    expect(isAccountNumber('123456')).toBe(true);
    expect(isAccountNumber('123456789')).toBe(true);
    expect(isAccountNumber('12ab')).toBe(false);
    expect(isAccountNumber('12345')).toBe(false);
    expect(isAccountNumber('1234567890')).toBe(false);
    expect(isAccountNumber('acct#12345678')).toBe(false);
  });

  it('accepts an ATO-checksum ABN and rejects 123', () => {
    expect(isAbn('51 824 753 556')).toBe(true);
    expect(isAbn('51824753556')).toBe(true);
    expect(isAbn('123')).toBe(false);
    expect(isAbn('12 345 678 901')).toBe(false);
    expect(isAbn('ABN 51 824 753 556 xyz')).toBe(false);
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

  it('rejects a 7-digit phone and a 16-digit phone', () => {
    expect(isAuPhone('0412 345')).toBe(false);
    expect(isAuPhone('13 145 00')).toBe(false);
    expect(isAuPhone('+61 412 345 678 9012')).toBe(false);
    expect(isAuPhone('0400000000123456')).toBe(false);
  });

  it('rejects AU phone digit lengths of 7 and 16', () => {
    expect(auPhoneDigitLengthOk(7, false)).toBe(false);
    expect(auPhoneDigitLengthOk(7, true)).toBe(false);
    expect(auPhoneDigitLengthOk(16, false)).toBe(false);
    expect(auPhoneDigitLengthOk(16, true)).toBe(false);
    expect(auPhoneDigitLengthOk(8, false)).toBe(true);
    expect(auPhoneDigitLengthOk(15, false)).toBe(true);
    expect(auPhoneDigitLengthOk(6, false)).toBe(true);
    expect(auPhoneDigitLengthOk(6, true)).toBe(false);
    expect(isAuPhone('0412 345')).toBe(false);
    expect(isAuPhone('0400000000123456')).toBe(false);
  });

  it('rejects 1,5 and 1,000 on percent and amount', () => {
    expect(parsePercent('1,5')).toEqual({ ok: false });
    expect(parsePercent('1,000')).toEqual({ ok: false });
    expect(parseNonNegativeNumber('1,5')).toEqual({ ok: false });
    expect(parseNonNegativeNumber('1,000')).toEqual({ ok: false });
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
    expect(parsePercent('1.5abc')).toEqual({ ok: false });
    expect(parsePercent('0x10')).toEqual({ ok: false });
    expect(parsePercent('1e3')).toEqual({ ok: false });
  });

  it('parses labour 95 and rejects a comma that would become 15', () => {
    expect(parseNonNegativeNumber('95')).toEqual({ ok: true, value: 95 });
    expect(parseNonNegativeNumber('1,5')).toEqual({ ok: false });
    expect(parseNonNegativeNumber('-5')).toEqual({ ok: false });
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
    expect(paymentMethodFieldErrors({
      kind: 'bank_transfer',
      bsb: '',
      account_number: '',
    })).toEqual({});
  });

  it('does not block a stored invalid BSB when only another payment field changes', () => {
    const stored = { bsb: 'abc12', account_number: '12ab' };
    expect(paymentMethodFieldErrors({
      kind: 'bank_transfer',
      bsb: stored.bsb,
      account_number: stored.account_number,
    }, stored)).toEqual({});
    expect(paymentMethodFieldErrors({
      kind: 'bank_transfer',
      bsb: stored.bsb,
      account_number: '12345678',
    }, stored)).toEqual({});
    expect(paymentMethodFieldErrors({
      kind: 'bank_transfer',
      bsb: 'abc',
      account_number: stored.account_number,
    }, stored).bsb).toBe(FIELD_BSB);
  });

  it('blocks a bad SMTP from-email and port', () => {
    expect(smtpFieldErrors({ from_email: 'nope', smtp_port: '-5' })).toEqual({
      from_email: FIELD_EMAIL,
      smtp_port: FIELD_PORT,
    });
    expect(smtpFieldErrors({ from_email: 'ops@co.com.au', smtp_port: '587' })).toEqual({});
    expect(smtpFieldErrors({ from_email: '', smtp_port: '' })).toEqual({});
  });

  it('does not block a From Name save when the stored From email is invalid', () => {
    const stored = { from_email: 'not-an-email', smtp_port: '587' };
    expect(smtpFieldErrors({
      from_email: stored.from_email,
      smtp_port: stored.smtp_port,
    }, stored)).toEqual({});
    expect(smtpFieldErrors({
      from_email: 'still-bad',
      smtp_port: stored.smtp_port,
    }, stored).from_email).toBe(FIELD_EMAIL);
  });

  it('treats an empty update result as a miss', () => {
    expect(updateWroteRows([])).toBe(false);
    expect(updateWroteRows(null)).toBe(false);
    expect(updateWroteRows(undefined)).toBe(false);
    expect(updateWroteRows([{ id: 'co1' }])).toBe(true);
    expect(updateWroteRows({ id: 'co1' })).toBe(true);
  });

  it('does not block a stored ABN until it is edited', () => {
    const stored = '12 345 678 901';
    expect(companyDetailsFieldErrors({
      abn: stored,
      phone: '',
      email: '',
      taxRate: '10',
      materialMarkup: '0',
      labourRate: '',
    }, stored)).toEqual({});
    expect(companyDetailsFieldErrors({
      abn: '123',
      phone: '',
      email: '',
      taxRate: '10',
      materialMarkup: '0',
      labourRate: '',
    }, stored).abn).toBe(FIELD_ABN);
  });

  it('does not block an unchanged invalid stored phone, email, percent, or rate', () => {
    const stored = {
      abn: '12 345 678 901',
      phone: 'not-a-phone',
      email: 'not-an-email',
      taxRate: '0x10',
      materialMarkup: '1e3',
      labourRate: '1,5',
    };
    expect(companyDetailsFieldErrors({
      abn: stored.abn,
      phone: stored.phone,
      email: stored.email,
      taxRate: stored.taxRate,
      materialMarkup: stored.materialMarkup,
      labourRate: stored.labourRate,
    }, stored)).toEqual({});
    expect(companyDetailsFieldErrors({
      ...stored,
      phone: 'abc',
    }, stored).phone).toBe(FIELD_AU_PHONE);
    expect(clientFormFieldErrors({
      name: 'Acme',
      phone: 'old-junk',
      email: 'bad@',
    }, { phone: 'old-junk', email: 'bad@' })).toEqual({});
    expect(clientFormFieldErrors({
      name: 'Acme',
      phone: 'abc',
      email: 'bad@',
    }, { phone: 'old-junk', email: 'bad@' }).phone).toBe(FIELD_AU_PHONE);
  });

  it('returns the miss copy and logs the raw error', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const raw = { message: 'permission denied' };
    expect(fieldSaveMiss(raw)).toBe("Couldn't save. Check your connection and try again.");
    expect(FIELD_SAVE_MISS).toBe("Couldn't save. Check your connection and try again.");
    expect(spy).toHaveBeenCalledWith(raw);
    spy.mockRestore();
  });
});
