import {t} from './i18n.ts';
import { createSession, inputMapping, makeQuestion, outputsFor, submitAnswer } from './game.ts';
import { binary, formatComposition, normalize, symbol, variable, type Expr } from './math.ts';
import { renderMath } from './math-markup.ts';
import { AdditionTransition } from './addition-transition.ts';
import { playFeedback, unlockSound } from './sound.ts';

/** Fixed, reproducible lessons scored by the same engine as ordinary play. */
export function tutorialLesson(index: number) {
  if (!Number.isInteger(index) || index < 0 || index > 3) throw new Error(t("잘못된 튜토리얼 단계입니다.", "Invalid tutorial step."));
  const x = variable('x'), twice = binary('+', x, x), square = binary('*', x, x);
  const s = createSession('easy', () => .75);
  const expressions: Expr[] = index === 0 ? [x] : index === 3 ? [x, twice, square] : [x, twice];
  s.records = expressions.map((expr, i) => ({id:i + 1, expr, polynomial:normalize(expr)}));
  s.mappings = index < 2 ? [inputMapping(1, 0, 0)] : [inputMapping(1, 0, 0), inputMapping(2, 0, 0)];
  const q = index === 0 ? makeQuestion(s, s.records[0], s.records[0], '+')
    : index === 3 ? makeQuestion(s, s.records[1], s.records[0], '-')
    : makeQuestion(s, s.records[0], s.records[0], '*');
  const copy = [
    {title:t("하나에서 시작하기", "Start with one"), prompt:t("표의 값 x = 1을 넣어 계산해 보세요. 이 결과를 내는 식이 기록에 있나요?", "Substitute x = 1 from the table. Does an archived expression produce this result?"), explanation:t("x + x는 2, 기록의 x는 1입니다. +를 누르면 새로운 대표 x + x가 기록에 들어갑니다.", "x + x produces 2; the archived x produces 1. Choose + to add x + x as a new representative.")},
    {title:t("모양은 달라도", "Different forms"), prompt:t("기록에 x + x가 추가됐습니다. 이번 식의 결과는 어떤 기록과 같은가요?", "x + x is now archived. Which archived expression matches this candidate?"), explanation:t("x × x는 1입니다. 기록의 x도 1이므로 ∃. 모양이 달라도 모든 입력 열에서 결과가 같으면 첫 대표만 남깁니다.", "x × x produces 1, just like x: choose ∃. Different forms share the first representative when their outputs match in every input column.")},
    {title:t("관찰이 늘어나면", "One more observation"), prompt:t("x = 2인 열이 추가됐습니다. 두 열을 모두 확인하고, 방금 본 식을 다시 판단해 보세요.", "A new column, x = 2, arrives. Check both columns and judge the same expression again."), explanation:t("x × x의 결과는 [1, 4]. x는 [1, 2], x + x는 [2, 4]입니다. 모든 열에서 같은 대표가 없으므로 이번에는 +입니다. 버린 식은 자동 복원되지 않고, 다시 등장했을 때 새로 판단합니다.", "x × x produces [1, 4]. x gives [1, 2], and x + x gives [2, 4]. No representative matches every column, so choose + this time. Discarded expressions are not restored automatically; they are judged again when generated.")},
    {title:t("대표 하나만 남기기", "Keep one representative"), prompt:t("기록 속 x + x와 x를 뽑았습니다. 괄호 안부터 계산해서 모든 입력 열을 비교해 보세요.", "The operands are the archived x + x and x. Evaluate parentheses first, then compare every input column."), explanation:t("(x + x) − x의 결과는 [1, 2]로 x와 같습니다. ∃를 누르면 기존 대표 x를 유지합니다. 이제 직접 플레이해 보세요!", "(x + x) − x produces [1, 2], just like x. Choose ∃ to keep the existing representative. You are ready to play!")},
  ][index];
  return {s, q, ...copy};
}

export interface TutorialControls { pause(): void; resume(): void; cancel(): void }
export function mountTutorial(host: HTMLElement, onExit: () => void, onPlay: () => void): TutorialControls {
  const transition = new AdditionTransition();
  let step = 0, lesson = tutorialLesson(0), correct = false, selected: boolean | null = null;
  let animating = false, disposed = false;
  const finishAnimation = () => {
    if (disposed) return;
    animating = false;
    const next = host.querySelector<HTMLButtonElement>('#tutorial-next');
    if (next) { next.disabled = false; if (!document.hidden) next.focus(); }
    const puzzle = host.querySelector<HTMLElement>('.tutorial-puzzle');
    if (puzzle) { puzzle.inert = false; puzzle.removeAttribute('aria-hidden'); }
  };
  const render = () => {
    if (disposed) return;
    const {s, q} = lesson;
    const arrival = correct && animating && q.matchId === null ? s.records.at(-1)!.id : null;
    const inputArrival = !correct && animating && step === 2;
    host.innerHTML = `<main class="tutorial game"><div class="tutorial-top"><span>${t('튜토리얼', 'Tutorial')} · ${step + 1} / 4</span><div class="tutorial-nav"><button class="text-button" id="tutorial-exit">${t('설정', 'Settings')}</button><button class="text-button" id="tutorial-skip">${t('바로 플레이', 'Skip to play')} ↗</button></div></div>
      <ol class="tutorial-progress" aria-label="${t("학습 진행", "Tutorial progress")}">${[t("발견", "Discover"), t("대표", "Represent"), t("관찰", "Observe"), t("축약", "Reduce")].map((label, i) => `<li ${i === step ? 'aria-current="step"' : ''} class="${i <= step ? 'reached' : ''}"><span>${label}</span></li>`).join('')}</ol>
      <h1 tabindex="-1" id="lesson-title">${lesson.title}</h1><p class="tutorial-prompt">${lesson.prompt}</p>
      <section class="archive" aria-label="${t("보관한 대표 식", "Archived representatives")}"><div class="archive-heading"><h2>${t('기록', 'Archive')} <span>${s.records.length}</span></h2></div><div class="records">${s.records.map(r => `<div id="tutorial-record-${r.id}" class="record ${arrival === r.id ? 'arrival-target' : ''} ${correct && r.id === q.matchId ? 'matched' : ''}"><span class="math record-expression">${renderMath(r.expr)}</span></div>`).join('')}</div></section>
      <section class="input-table-wrap math"><table class="input-table" aria-label="${t("각 열이 하나의 입력", "Each column is one input")}"><tbody><tr><th scope="row">${renderMath(variable('x'))}</th>${q.mappings.map((m, i) => `<td ${i === 1 && inputArrival ? 'id="tutorial-new-input" class="arrival-target"' : ''}>${m.x.toString()}</td>`).join('')}</tr></tbody></table></section>
      <div class="tutorial-puzzle-host"><section class="tutorial-puzzle ${inputArrival ? 'preparing' : ''}" ${inputArrival ? 'inert aria-hidden="true"' : ''}><div class="tutorial-expression math" role="math" aria-label="${formatComposition(q.expr)}">${renderMath(q.left.expr, true)}<span aria-hidden="true">${symbol(q.op)}</span>${renderMath(q.right.expr, true)}</div><div class="answer-buttons">
        ${[true, false].map(choice => `<button class="answer-button ${selected === choice ? correct ? 'selected-correct' : 'selected-wrong' : ''}" data-choice="${choice}" ${correct ? 'disabled' : ''} aria-label="${choice ? t("이미 있는 식", "Exists") : t("새로운 식", "New")}"><span class="choice-math" aria-hidden="true">${choice ? '∃' : '+'}</span><small>${choice ? t("이미 있는 식", "Exists") : t("새로운 식", "New")}</small></button>`).join('')}
      </div></section></div><div class="tutorial-response" aria-live="polite">${correct ? `<p>✓ ${lesson.explanation}</p>${step === 2 ? `<table class="lesson-comparison"><caption>${t('같은 열끼리 비교해 보세요', 'Compare within each column')}</caption><thead><tr><th scope="col">${t('식', 'Expression')}</th>${q.mappings.map(m => `<th scope="col">x = ${m.x.toString()}</th>`).join('')}</tr></thead><tbody>${s.records.map(r => `<tr><th scope="row" class="math">${renderMath(r.expr)}</th>${outputsFor(r.expr, q.mappings).map(output => `<td>${output.toString()}</td>`).join('')}</tr>`).join('')}</tbody></table>` : ''}<button class="primary" id="tutorial-next" ${animating ? 'disabled' : ''}>${step === 3 ? t("플레이", "Play") : t("다음", "Next")} <span aria-hidden="true">→</span></button>${step === 3 ? `<button class="text-button" id="tutorial-settings">${t('설정으로 돌아가기', 'Back to settings')}</button>` : ''}` : `<p>${selected === null ? t("시간과 목숨 제한 없이 연습합니다.", "Practice without time or life limits.") : t("한 번 더! 각 열의 결과를 기록 속 식과 비교해 보세요.", "Try again. Compare the result in each column with the archived expressions.")}</p>`}</div></main>`;
    host.querySelector('#tutorial-exit')!.addEventListener('click', onExit);
    host.querySelector('#tutorial-skip')!.addEventListener('click', onPlay);
    host.querySelectorAll<HTMLButtonElement>('[data-choice]').forEach(button => button.addEventListener('click', () => {
      if (correct || animating || disposed) return;
      unlockSound(); selected = button.dataset.choice === 'true'; correct = selected === (q.matchId !== null);
      if (correct) { submitAnswer(s, q, selected, 0); animating = true; }
      playFeedback(correct, false); render();
      if (correct) {
        const source = host.querySelector<HTMLElement>('.tutorial-expression')!;
        const card = host.querySelector<HTMLElement>(`#tutorial-record-${q.matchId ?? s.records.at(-1)!.id}`)!;
        card.scrollIntoView({block:'nearest', inline:'nearest'});
        if (q.matchId !== null) void transition.absorb(source, card, finishAnimation);
        else void transition.store(source, {parts:[card.querySelector<HTMLElement>('.record-expression')!], reveal:[card], frame:card}, finishAnimation);
      } else host.querySelector<HTMLElement>(`[data-choice="${selected}"]`)?.focus();
    }));
    host.querySelector('#tutorial-next')?.addEventListener('click', () => {
      if (animating || disposed) return;
      if (step === 3) { onPlay(); return; }
      transition.cancel(); lesson = tutorialLesson(++step); correct = false; selected = null;
      animating = step === 2; render();
      host.querySelector<HTMLElement>('#lesson-title')?.focus();
      if (animating) {
        const stage = host.querySelector<HTMLElement>('.tutorial-puzzle-host')!;
        const puzzle = stage.querySelector<HTMLElement>('.tutorial-puzzle')!;
        const cell = host.querySelector<HTMLElement>('#tutorial-new-input')!;
        void transition.run(stage, null, puzzle, [{parts:[cell], reveal:[cell]}], finishAnimation);
      }
    });
    host.querySelector('#tutorial-settings')?.addEventListener('click', onExit);
  };
  render(); host.querySelector<HTMLElement>('#lesson-title')?.focus();
  return {pause:() => transition.pause(), resume:() => transition.resume(), cancel:() => {disposed = true; transition.cancel();}};
}
