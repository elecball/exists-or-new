import { format, type Expr } from './math.ts';
export const escapeHtml = (s: string) => s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const precedence = (expr: Expr) => expr.kind !== 'binary' ? 3 : expr.op === '*' ? 2 : 1;
const parentheses = (markup: string) => `<mrow><mo>(</mo>${markup}<mo>)</mo></mrow>`;
function node(expr: Expr): string {
  if (expr.kind === 'variable') return `<mi mathvariant="italic">${expr.name}</mi>`;
  if (expr.kind === 'constant') {
    const magnitude = expr.value < 0n ? -expr.value : expr.value;
    const value = `<mn>${magnitude}</mn>`;
    return expr.value < 0n ? `<mrow><mo>−</mo>${value}</mrow>` : value;
  }
  const child = (part: Expr, right: boolean) => {
    const grouped = precedence(part) < precedence(expr) || (right && expr.op === '-' && precedence(part) === precedence(expr)) || (part.kind === 'constant' && part.value < 0n);
    return grouped ? parentheses(node(part)) : node(part);
  };
  const operator = expr.op === '*' ? '×' : expr.op === '-' ? '−' : '+';
  return `<mrow>${child(expr.left, false)}<mo>${operator}</mo>${child(expr.right, true)}</mrow>`;
}
/** Native MathML gives variables, operators and parentheses their proper mathematical forms. */
export function renderMath(expr: Expr, asOperand = false): string {
  const grouped = asOperand && (expr.kind === 'binary' || (expr.kind === 'constant' && expr.value < 0n));
  return `<math class="formula" aria-label="${escapeHtml(format(expr))}">${grouped ? parentheses(node(expr)) : node(expr)}</math>`;
}
