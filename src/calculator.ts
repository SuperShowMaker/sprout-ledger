// 青禾记账 - 金额计算器纯逻辑（表达式求值与输入校验，无 React/DOM 依赖）

// 求值："15+8-3" → 20。仅支持 + -，从左到右。
// 结果收口两位小数（与显示端 toFixed(2) 一致），避免 0.1+0.2 存成 0.30000000000000004。
export function evaluate(expr: string): number | null {
  if (!expr) return null;
  // 去掉末尾的运算符
  const cleaned = expr.replace(/[+\-]+$/, '');
  if (!cleaned) return null;
  // tokenize：数字段 | 运算符
  const tokens = cleaned.match(/(\d+\.?\d*)|[+\-]/g);
  if (!tokens) return null;
  let result = parseFloat(tokens[0]);
  for (let i = 1; i < tokens.length; i += 2) {
    const op = tokens[i];
    const num = parseFloat(tokens[i + 1]);
    if (isNaN(num)) break;
    if (op === '+') result += num;
    else if (op === '-') result -= num;
  }
  return Number(result.toFixed(2));
}

export function canAppendDot(expr: string): boolean {
  // 最后一个数字段是否已经包含小数点
  const lastNum = expr.split(/[+\-]/).pop() || '';
  return !lastNum.includes('.');
}

export function isOperator(char: string): boolean {
  return char === '+' || char === '-';
}
