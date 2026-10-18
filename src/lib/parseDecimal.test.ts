import { describe, expect, it } from 'vitest';
import {
  MONEY_COMMA_HINT,
  committedMoney,
  committedNumber,
  moneyDraftAllowed,
  parseDecimalInput,
  parseMoneyCommitted,
  parseMoneyInput,
  parseNumberInput,
} from './parseDecimal';
import { parseRecordPaymentAmount, recordPaymentStatusAfterLabel } from './invoicePayments';
import {
  expenseIncGstBlurStep,
  expenseIncGstInputStep,
  expenseAmountTypingFromEx,
  typeExpenseIncGstKeystrokes,
  buildExpenseSaveAmounts,
} from '../pages/ExpensesPage';

describe('parseMoneyInput', () => {
  it('parses thousands commas and dollar/space noise', () => {
    expect(parseMoneyInput('1,250')).toEqual({ status: 'valid', value: 1250 });
    expect(parseMoneyInput('1,250.50')).toEqual({ status: 'valid', value: 1250.5 });
    expect(parseMoneyInput('$1,250')).toEqual({ status: 'valid', value: 1250 });
    expect(parseMoneyInput(' $1,250.50 ')).toEqual({ status: 'valid', value: 1250.5 });
    expect(parseMoneyInput('AUD 1,250')).toEqual({ status: 'valid', value: 1250 });
  });

  it('keeps key-by-key thousands typing incomplete instead of 0 or 15', () => {
    const keys = ['1', '1,', '1,2', '1,25', '1,250'];
    const seen = keys.map(raw => parseMoneyInput(raw));
    expect(seen[0]).toEqual({ status: 'valid', value: 1 });
    expect(seen[1].status).toBe('incomplete');
    expect(seen[2].status).toBe('incomplete');
    expect(seen[3].status).toBe('incomplete');
    expect(seen[4]).toEqual({ status: 'valid', value: 1250 });
    expect(seen.filter(s => s.status === 'incomplete').every(s => s.status === 'incomplete' && s.partial === 1)).toBe(true);
    expect(parseRecordPaymentAmount('1,')).toBeNull();
    expect(parseRecordPaymentAmount('1,2')).toBeNull();
    expect(parseRecordPaymentAmount('1,25')).toBeNull();
    expect(parseRecordPaymentAmount('1,250')).toBe(1250);
  });

  it('blocks overpay and does not label the sheet Paid', () => {
    expect(recordPaymentStatusAfterLabel('900', 836, 0)).toBe('Not recorded');
    expect(recordPaymentStatusAfterLabel('836', 836, 0)).toBe('Paid');
    expect(recordPaymentStatusAfterLabel('1,', 836, 0)).toBe('—');
  });

  it('rejects garbage and negatives instead of silent 0', () => {
    expect(parseMoneyInput('abc').status).toBe('invalid');
    expect(parseMoneyInput('--').status).toBe('invalid');
    expect(parseMoneyInput('-12').status).toBe('invalid');
    expect(parseMoneyInput('12.34.56').status).toBe('invalid');
    expect(committedMoney('nope')).toBeNull();
    expect(parseMoneyCommitted('1,5')).toEqual({ ok: false, message: MONEY_COMMA_HINT });
    expect(moneyDraftAllowed('1,25')).toBe(true);
    expect(moneyDraftAllowed('nope')).toBe(false);
  });
});

describe('parseNumberInput disambiguates 1,250 from 1,5', () => {
  it('treats a 3-digit group as thousands and 1–2 digits as a decimal comma', () => {
    expect(parseNumberInput('1,250')).toEqual({ status: 'valid', value: 1250 });
    expect(parseNumberInput('1,5')).toEqual({ status: 'valid', value: 1.5 });
    expect(parseNumberInput('1,50')).toEqual({ status: 'valid', value: 1.5 });
    expect(parseDecimalInput('1,5', 'money').status).toBe('incomplete');
    expect(committedNumber('1,5')).toBe(1.5);
    expect(committedMoney('1,5')).toBeNull();
  });

  it('never silently drops the comma into 15', () => {
    expect(parseNumberInput('1,5')).not.toEqual({ status: 'valid', value: 15 });
    expect(parseMoneyInput('1,5')).not.toEqual({ status: 'valid', value: 15 });
    expect(parseMoneyInput('1,5').status).toBe('incomplete');
  });
});

describe('expense GST split still accepts 1,250', () => {
  it('does not regress 1,250 inc GST at 10%', () => {
    const empty = expenseAmountTypingFromEx('', '10');
    const typed = typeExpenseIncGstKeystrokes(empty, '1,250');
    const blurred = expenseIncGstBlurStep(typed);
    const saved = buildExpenseSaveAmounts({
      amountSource: blurred.amountSource,
      incDraft: blurred.incDraft,
      exAmount: blurred.exAmount,
      taxRate: blurred.taxRate,
    });
    expect(saved.total).toBe(1250);
    expect(saved.amount).toBe(1136.36);
    expect(saved.tax_amount).toBe(113.64);
  });

  it('does not turn 1,5 into 15 on the expense inc field', () => {
    const empty = expenseAmountTypingFromEx('', '10');
    const mid = expenseIncGstInputStep(empty, '1,5');
    expect(mid.incDraft === '15' || mid.exAmount === '15').toBe(false);
    expect(Number(mid.incDraft)).not.toBe(15);
  });
});
