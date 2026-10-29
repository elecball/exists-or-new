/** Fit the complete MathML expression, including parentheses, before timing starts. */
export function fitCandidate(candidate: HTMLElement | null): void {
  if (!candidate || candidate.clientWidth === 0) return;
  candidate.style.setProperty('--formula-scale', '1');
  const parts = [...candidate.querySelectorAll<HTMLElement>('.operand .formula, .operator')];
  const width = parts.reduce((total, part) => total + part.getBoundingClientRect().width, 0);
  const gap = parseFloat(getComputedStyle(candidate).columnGap) || 0;
  const available = candidate.clientWidth - gap * 2 - 4;
  if (width > available && available > 0) candidate.style.setProperty('--formula-scale', String(available / width));
}
