export type Language = 'ko' | 'en';
let language: Language = 'ko';
export const getLanguage = () => language;
export const t = (ko:string, en:string) => language === 'ko' ? ko : en;
export const secondsText = (seconds:number) => t(`${seconds}초`, `${seconds}s`);
export const variablesText = (count:number) => t(`${count}개`, `${count}`);
export function setLanguage(next:Language, updateUrl = true) {
  language = next;
  document.documentElement.lang = next;
  document.querySelector('meta[name="description"]')?.setAttribute('content', t(
    '공개된 입력에서 같은 출력을 찾고 대표 하나만 남기는 CS424 퍼즐 게임.',
    'A CS424 puzzle about matching outputs on revealed inputs and keeping one representative.'
  ));
  try { localStorage.setItem('exists-or-new-language', next); } catch { /* Preferences are optional. */ }
  if (updateUrl) {
    const url = new URL(window.location.href); url.searchParams.set('lang', next);
    window.history.replaceState(null, '', url);
  }
}
export function initializeLanguage() {
  const query = new URLSearchParams(window.location.search).get('lang');
  let stored:string | null = null;
  try { stored = localStorage.getItem('exists-or-new-language'); } catch { /* Use Korean by default. */ }
  setLanguage(query === 'en' || query === 'ko' ? query : stored === 'en' ? 'en' : 'ko', false);
}
