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

/** Shrink each queued formula to its own cell, including narrow mobile layouts. */
export function fitQueueExpressions(root:ParentNode):void {
  for(const card of root.querySelectorAll<HTMLElement>('.danger-slot.occupied')){
    const text=card.querySelector<HTMLElement>('.record-expression'),formula=text?.querySelector<HTMLElement>('.formula');
    if(!text||!formula||!card.clientWidth)continue;
    text.style.removeProperty('font-size');
    const style=getComputedStyle(card),base=parseFloat(getComputedStyle(text).fontSize);
    const width=card.clientWidth-(parseFloat(style.paddingLeft)||0)-(parseFloat(style.paddingRight)||0)-4;
    const height=card.clientHeight-(parseFloat(style.paddingTop)||0)-(parseFloat(style.paddingBottom)||0)-2;
    const bounds=formula.getBoundingClientRect(),scale=Math.min(1,width/bounds.width,height/bounds.height);
    if(scale>0&&scale<1)text.style.fontSize=`${base*scale*.98}px`;
  }
}
