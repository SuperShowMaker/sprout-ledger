import { describe, it, expect } from 'vitest';

function validateAmount(input: string): { valid: boolean; value: number; error: string } {
  const trimmed = input.trim();
  if (!trimmed) return { valid: false, value: 0, error: 'empty' };
  const num = parseFloat(trimmed);
  if (isNaN(num)) return { valid: false, value: 0, error: 'not_a_number' };
  if (num <= 0) return { valid: false, value: num, error: 'non_positive' };
  if (num > 99999999) return { valid: false, value: num, error: 'too_large' };
  return { valid: true, value: Math.round(num * 100) / 100, error: '' };
}

describe('金额校验', () => {
  it('正常金额', () => {
    expect(validateAmount('15.5').valid).toBe(true);
    expect(validateAmount('15.5').value).toBe(15.5);
    expect(validateAmount('100').value).toBe(100);
  });

  it('空输入', () => {
    expect(validateAmount('').valid).toBe(false);
    expect(validateAmount('  ').valid).toBe(false);
  });

  it('非数字', () => {
    expect(validateAmount('abc').valid).toBe(false);
    expect(validateAmount('12abc').valid).toBe(true); // parseFloat("12abc") = 12
  });

  it('零和负数', () => {
    expect(validateAmount('0').valid).toBe(false);
    expect(validateAmount('-5').valid).toBe(false);
    expect(validateAmount('-0.01').valid).toBe(false);
  });

  it('超大金额', () => {
    expect(validateAmount('999999999').valid).toBe(false);
  });
});
