import { describe, it, expect } from 'vitest';
import { evaluate, canAppendDot } from '../calculator';

describe('evaluate 表达式求值', () => {
  it('单数字', () => {
    expect(evaluate('15')).toBe(15);
  });
  it('零', () => {
    expect(evaluate('0')).toBe(0);
  });
  it('小数', () => {
    expect(evaluate('15.5')).toBe(15.5);
  });
  it('加减混合链', () => {
    expect(evaluate('15+8-3')).toBe(20);
  });
  it('纯加', () => {
    expect(evaluate('1+2+3')).toBe(6);
  });
  it('纯减', () => {
    expect(evaluate('10-2-3')).toBe(5);
  });
  it('结果为负', () => {
    expect(evaluate('5-8')).toBe(-3);
  });
  it('两位内精确小数', () => {
    expect(evaluate('0.5+0.25')).toBe(0.75);
  });
  it('整十结果', () => {
    expect(evaluate('100.5+0.5')).toBe(101);
  });

  // 边界
  it('空串返回 null', () => {
    expect(evaluate('')).toBeNull();
  });
  it('末尾运算符被截断', () => {
    expect(evaluate('15+')).toBe(15);
  });
  it('仅加号返回 null', () => {
    expect(evaluate('+')).toBeNull();
  });
  it('仅减号返回 null', () => {
    expect(evaluate('-')).toBeNull();
  });
  it('连续运算符停止求值', () => {
    expect(evaluate('15++8')).toBe(15);
  });
  it('不支持的符号被忽略', () => {
    expect(evaluate('5*3')).toBe(5);
  });
  it('表达式含空格', () => {
    expect(evaluate(' 15 ')).toBe(15);
  });
  it('前导运算符返回 NaN', () => {
    expect(Number.isNaN(evaluate('+5'))).toBe(true);
  });

  // 浮点精度：收口两位小数，避免 0.1+0.2 存成 0.30000000000000004
  it('浮点加法收口', () => {
    expect(evaluate('0.1+0.2')).toBe(0.3);
  });
  it('浮点减法收口', () => {
    expect(evaluate('0.3-0.1')).toBe(0.2);
  });
  it('浮点加法收口二', () => {
    expect(evaluate('1.1+2.2')).toBe(3.3);
  });
});

describe('canAppendDot 小数点输入校验', () => {
  it('空串可加小数点', () => {
    expect(canAppendDot('')).toBe(true);
  });
  it('整数可加小数点', () => {
    expect(canAppendDot('15')).toBe(true);
  });
  it('末尾已带小数点不可加', () => {
    expect(canAppendDot('15.')).toBe(false);
  });
  it('小数后不可加', () => {
    expect(canAppendDot('15.5')).toBe(false);
  });
  it('加减后新数字段可加', () => {
    expect(canAppendDot('15+8')).toBe(true);
  });
  it('加减后带小数不可加', () => {
    expect(canAppendDot('15+8.5')).toBe(false);
  });
  it('末尾运算符视为新数字段', () => {
    expect(canAppendDot('15-')).toBe(true);
  });
  it('运算符后小数段可加', () => {
    expect(canAppendDot('15.5+')).toBe(true);
  });
  it('运算符后带小数不可加', () => {
    expect(canAppendDot('15+8.')).toBe(false);
  });
  it('连续小数点不可加', () => {
    expect(canAppendDot('..')).toBe(false);
  });
});
