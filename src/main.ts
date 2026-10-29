import './style.css';
import {getLanguage, initializeLanguage, secondsText, setLanguage, t, variablesText} from './i18n.ts';
import {guideMarkup} from './guide.ts';
import { mountTutorial, type TutorialControls } from './tutorial.ts';
import { escapeHtml as escape, renderMath } from './math-markup.ts';
import { AutoAdvance } from './auto-advance.ts';
import { AdditionTransition, type ArrivalTarget } from './addition-transition.ts';
import { playFeedback, soundEnabled, toggleSound, unlockSound } from './sound.ts';
import { format, formatComposition, symbol } from './math.ts';
import { createSession, isGameOver, STARTING_LIVES, timeTone, difficulties, generateQuestion, submitAnswer, type Answer, type Difficulty, type Question, type Session } from './game.ts';

initializeLanguage();
const root = document.querySelector<HTMLDivElement>('#app')!;
let difficulty: Difficulty = 'easy';
let selectedSeconds = difficulties[difficulty].seconds, selectedVariables = 1;
let session: Session | null = null;
let question: Question | null = null;
let answer: Answer | null = null;
let screen: 'home' | 'tutorial' | 'playing' | 'feedback' | 'results' = 'home';
let remaining = difficulties[difficulty].seconds, deadline = 0, frame = 0, readyFrame = 0, paused = false;
let dialog: HTMLDialogElement | null = null;
let archiveDialog: HTMLDialogElement | null = null;
let newBest = false;
let visibilityPaused = false;
let introducing = false;
let newRecordIds: number[] = [], newInputIndexes: number[] = [];
const introduction = new AdditionTransition();
const storageFlight = new AdditionTransition();
let storing = false;
let tutorialControls: TutorialControls | null = null;
const advance = new AutoAdvance(() => {
  if (screen !== 'feedback') return;
  if (document.hidden || dialog?.open) {
    advance.start(0); advance.pause();
    if (document.hidden) freezeForVisibility();
    return;
  }
  nextRound();
});
const expression = (s: string) => escape(s).replace(/-/g, '−').replace(/\^([0-9]+)/g, '<sup>$1</sup>');
function scoreKey(): string { return `equivalence-best-v8-config-${selectedVariables}-${selectedSeconds}`; }
function best(): number {
  try {
    // Old preset scores belong to their original time/count, not the newly edited presets.
    const legacy = [{id:'easy', seconds:18, count:1}, {id:'medium', seconds:15, count:2}, {id:'hard', seconds:12, count:3}].find(p => p.seconds === selectedSeconds && p.count === selectedVariables);
    const keys = [scoreKey(), `equivalence-best-v7-custom-${selectedVariables}-${selectedSeconds}`, ...(legacy ? [`equivalence-best-v6-endless-${legacy.id}`] : [])];
    return Math.max(0, ...keys.map(key => Number(localStorage.getItem(key))).filter(n => Number.isFinite(n) && n > 0));
  } catch { return 0; }
}
function saveBest() {
  newBest = session!.score > best();
  if (newBest) try { localStorage.setItem(scoreKey(), String(session!.score)); } catch { /* Private mode: game still works. */ }
}
const mark = '<svg viewBox="0 0 64 64" fill="none" focusable="false"><path class="mark-question" d="M24 16c0-9 16-9 16 0 0 6-8 5-8 11"/><circle class="mark-dot" cx="32" cy="32" r="2"/><path class="mark-equals" d="M16 41h32M16 52h32"/></svg>';
const icon = `<span class="brand-symbol" aria-hidden="true">${mark}</span>`;
function header() {
  return `<header class="site-header"><a class="brand" href="./" aria-label="${t('Exists or New 처음으로', 'Exists or New home')}">${icon}<span>Exists <i>or</i> New</span></a><div class="header-controls">${screen === 'home' || screen === 'results' ? `<button class="language-button" id="language" aria-label="${t('영어로 전환', 'Switch to Korean')}">${getLanguage() === 'en' ? 'EN' : 'KR'}</button>` : ''}<button class="sound-button ${soundEnabled() ? '' : 'muted'}" id="sound" aria-label="${soundEnabled() ? t('효과음 끄기', 'Mute sound') : t('효과음 켜기', 'Enable sound')}" aria-pressed="${soundEnabled()}">♫</button><button class="help-button" id="help" aria-label="${t('게임 도움말', 'How to play')}">?</button></div></header>`;
}
function renderHome() {
  tutorialControls?.cancel(); tutorialControls = null;
  screen = 'home';
  const isPreset = (key: string) => difficulties[key as Difficulty].seconds === selectedSeconds && difficulties[key as Difficulty].variables.length === selectedVariables;
  root.innerHTML = `${header()}<main class="home"><div class="home-symbol" aria-hidden="true"><span class="hero-bracket">(</span><span class="hero-mark">${mark}</span><span class="hero-bracket">)</span></div><h1 lang="en">Exists <i>or</i> New</h1>
    <fieldset class="difficulty"><legend>${t('프리셋', 'Presets')}</legend><div class="difficulty-options">${Object.entries(difficulties).map(([key, d]) => `<label class="difficulty-option ${isPreset(key) ? 'selected' : ''}"><input type="radio" name="difficulty" value="${key}" ${isPreset(key) ? 'checked' : ''}><span>${t(d.name, ({easy:'Easy', medium:'Medium', hard:'Hard'} as const)[key as Difficulty])}</span><small>${secondsText(d.seconds)} · ${t(`변수 ${d.variables.length}개`, `${d.variables.length} var${d.variables.length === 1 ? '' : 's'}`)}</small></label>`).join('')}</div></fieldset>
    <form id="play-settings"><div class="custom-settings"><label for="seconds"><span class="setting-label">${t('제한 시간', 'Time limit')} <output id="seconds-value" for="seconds">${secondsText(selectedSeconds)}</output></span><input id="seconds" type="range" min="5" max="120" step="1" value="${selectedSeconds}" aria-valuetext="${secondsText(selectedSeconds)}"><span class="slider-bounds" aria-hidden="true"><span>${secondsText(5)}</span><span>${secondsText(120)}</span></span></label><label for="variables"><span class="setting-label">${t('변수 개수', 'Variables')} <output id="variables-value" for="variables">${variablesText(selectedVariables)}</output></span><input id="variables" type="range" min="1" max="3" step="1" value="${selectedVariables}" aria-valuetext="${['x', 'x, y', 'x, y, z'][selectedVariables - 1]}"><span class="slider-bounds" aria-hidden="true"><span>1</span><span>2</span><span>3</span></span></label></div><p class="setting-hint">${t('프리셋 선택 후에도 슬라이더로 조정할 수 있어요.', 'Adjust either slider after choosing a preset.')}</p>
    <button class="primary start-button" id="start" type="submit">${t('플레이', 'Play')} <span aria-hidden="true">→</span></button></form>
    <button class="secondary tutorial-launch" id="tutorial">${t('튜토리얼', 'Tutorial')} <span aria-hidden="true">↗</span></button><p class="best-line"><span>${t('이 설정의 최고 점수', 'Best score for these settings')} <span id="best-score">${best().toLocaleString()}</span></span></p></main>`;
  bindCommon();
  root.querySelectorAll<HTMLInputElement>('input[name=difficulty]').forEach(input => input.addEventListener('change', () => {
    difficulty = input.value as Difficulty;
    selectedSeconds = difficulties[difficulty].seconds; selectedVariables = difficulties[difficulty].variables.length;
    renderHome(); root.querySelector<HTMLInputElement>(`input[value=${difficulty}]`)?.focus();
  }));
  const seconds = root.querySelector<HTMLInputElement>('#seconds')!, variables = root.querySelector<HTMLInputElement>('#variables')!;
  const update = () => {
    if (seconds.checkValidity()) selectedSeconds = Number(seconds.value);
    selectedVariables = Number(variables.value);
    root.querySelector('#seconds-value')!.textContent = secondsText(selectedSeconds);
    root.querySelector('#variables-value')!.textContent = variablesText(selectedVariables);
    seconds.setAttribute('aria-valuetext', secondsText(selectedSeconds));
    variables.setAttribute('aria-valuetext', `${variablesText(selectedVariables)}, ${['x', 'x, y', 'x, y, z'][selectedVariables - 1]}`);
    root.querySelectorAll<HTMLInputElement>('input[name=difficulty]').forEach(input => {
      input.checked = seconds.checkValidity() && isPreset(input.value);
      input.closest('label')!.classList.toggle('selected', input.checked);
      if (input.checked) difficulty = input.value as Difficulty;
    });
    root.querySelector('#best-score')!.textContent = seconds.checkValidity() ? best().toLocaleString() : '—';
  };
  seconds.addEventListener('input', update); variables.addEventListener('input', update);
  root.querySelector('#play-settings')!.addEventListener('submit', event => { event.preventDefault(); update(); start(); });
  root.querySelector('#tutorial')!.addEventListener('click', startTutorial);
}
function startTutorial() {
  screen = 'tutorial'; stopClock(); advance.cancel(); introduction.cancel(); storageFlight.cancel();
  root.innerHTML = `${header()}<div id="tutorial-host"></div>`; bindCommon();
  tutorialControls = mountTutorial(root.querySelector<HTMLElement>('#tutorial-host')!, renderHome, start);
}
function roundSeconds() { return session?.settings.seconds ?? selectedSeconds; }
function start() {
  tutorialControls?.cancel(); tutorialControls = null;
  visibilityPaused = false; advance.cancel(); introduction.cancel(); storageFlight.cancel(); storing = false; unlockSound(); stopClock(); session = createSession(difficulty, Math.random, {seconds:selectedSeconds, variableCount:selectedVariables}); newBest = false; nextRound();
}
function nextRound() {
  closeArchive(false);
  advance.cancel(); introduction.cancel(); storageFlight.cancel(); storing = false;
  if (isGameOver(session!)) { finish(); return; }
  stopClock();
  const outgoing = root.querySelector<HTMLElement>('.puzzle')?.cloneNode(true) as HTMLElement | undefined;
  if (outgoing) {
    outgoing.removeAttribute('id'); outgoing.querySelectorAll('[id]').forEach(el => el.removeAttribute('id'));
    outgoing.classList.add('outgoing-puzzle'); outgoing.inert = true; outgoing.setAttribute('aria-hidden', 'true');
  }
  const previousInputs = session!.mappings.length;
  const previousRecords = new Set(session!.records.map(r => r.id));
  question = generateQuestion(session!);
  newInputIndexes = question.mappings.map((_, i) => i).filter(i => i >= previousInputs);
  newRecordIds = session!.records.filter(r => !previousRecords.has(r.id)).map(r => r.id);
  introducing = newInputIndexes.length > 0 || newRecordIds.length > 0;
  answer = null; remaining = roundSeconds(); deadline = 0; paused = false; screen = 'playing'; renderGame();
  if (introducing) {
    const host = root.querySelector<HTMLElement>('.puzzle-host')!;
    const puzzle = host.querySelector<HTMLElement>('.puzzle')!;
    if (outgoing) host.append(outgoing);
    const targets: ArrivalTarget[] = [];
    for (const id of newRecordIds) {
      const card = root.querySelector<HTMLElement>(`#record-${id}`)!;
      targets.push({parts: [card.querySelector<HTMLElement>('.record-expression')!], reveal: [card], frame: card});
    }
    for (const index of newInputIndexes) {
      const cells = [...root.querySelectorAll<HTMLElement>(`[data-input="${index}"]`)];
      targets.push({parts: cells, reveal: cells});
    }
    for (const index of newInputIndexes) root.querySelector(`[data-input="${index}"]`)?.scrollIntoView({block:'nearest', inline:'nearest'});
    host.focus();
    void introduction.run(host, outgoing ?? null, puzzle, targets, () => {
      introducing = false;
      puzzle.inert = false; puzzle.removeAttribute('aria-hidden');
      root.querySelector('.game')?.classList.remove('is-introducing');
      prepareQuestion();
    });
    if (document.hidden) freezeForVisibility();
  } else prepareQuestion();
}
function prepareQuestion() {
  const archiveButton = root.querySelector<HTMLButtonElement>('#show-records');
  if (archiveButton) archiveButton.disabled = introducing || storing;
  // Start only after the candidate has reached the screen, including after an addition animation.
  readyFrame = requestAnimationFrame(() => { readyFrame = requestAnimationFrame(() => {
    readyFrame = 0;
    if (screen !== 'playing') return;
    root.querySelector<HTMLElement>('#question-title')?.focus();
    if (document.hidden) freezeForVisibility(); else if (!paused && !introducing) runClock();
  }); });
}
function recordMarkup(prefix = 'record-') {
  return session!.records.map(r => {
    const equivalent = screen === 'feedback' && r.id === question!.matchId;
    const rejected = equivalent && answer!.choice === false;
    const added = screen === 'feedback' && question!.matchId === null && r.expr === question!.expr;
    const entered = introducing && newRecordIds.includes(r.id);
    const tag = equivalent ? '≡' : added || entered ? '+' : '';
    return `<div class="record ${entered || (added && storing) ? 'arrival-target' : added ? 'record-enter intro-enter' : ''} ${rejected ? 'duplicate' : equivalent ? 'matched' : added ? 'representative' : ''}" id="${prefix}${r.id}" aria-label="${t('기록', 'Expression')} ${r.id}${equivalent ? t(', 동치 대표', ', matching representative') : added ? t(', 새 대표', ', new representative') : ''}"><span class="math record-expression">${renderMath(r.expr)}</span>${tag ? `<span class="record-tag" aria-hidden="true">${tag}</span>` : ''}</div>`;
  }).join('');
}
function mappingMarkup(): string {
  const vars = session!.settings.variables;
  const entered = (i: number) => introducing && newInputIndexes.includes(i) ? 'arrival-target' : '';
  return `<section class="input-table-wrap math"><table class="input-table" aria-label="${t('입력 매핑, 각 열이 하나의 튜플', 'Input mappings; each column is one tuple')}"><caption class="sr-only">X</caption><tbody>${vars.map(variable => `<tr><th scope="row">${renderMath({kind: 'variable', name: variable})}</th>${question!.mappings.map((input, i) => `<td data-input="${i}" class="${entered(i)}" aria-label="${t('입력', 'Input')} ${i + 1}, ${variable} = ${escape(input[variable].toString())}">${expression(input[variable].toString())}</td>`).join('')}</tr>`).join('')}</tbody></table></section>`;
}
function livesMarkup(): string {
  const lives = session!.lives;
  const hit = screen === 'feedback' && !answer!.correct;
  return `<span class="lives ${hit ? 'life-hit' : ''}" role="img" aria-label="${t(`남은 목숨 ${lives}개`, `${lives} lives remaining`)}" style="--hp-from:${Math.min(STARTING_LIVES, lives + (hit ? 1 : 0)) / STARTING_LIVES};--hp-to:${lives / STARTING_LIVES}"><span class="life-hearts" aria-hidden="true">${Array.from({length: STARTING_LIVES}, (_, i) => `<span class="life-slot ${i >= lives ? 'life-empty' : ''} ${hit && i === lives ? 'life-lost' : ''}">${i < lives ? '♥' : '♡'}${hit && i === lives ? '<span class="life-fragment">♥</span>' : ''}</span>`).join('')}</span><span class="hp-track" aria-hidden="true"><span class="hp-drain"></span><span class="hp-fill"></span></span>${hit ? '<span class="life-damage-number" aria-hidden="true">−1</span>' : ''}</span>`;
}
function answerButtons(archive = false) {
  const revealed = screen === 'feedback';
  return `<div class="answer-buttons ${!archive && revealed ? 'answered' : ''}">${[true, false].map(choice => {
    const kind = choice ? 'exists' : 'novel';
    const state = !archive && revealed && answer!.choice === choice ? answer!.correct ? 'selected-correct' : 'selected-wrong' : '';
    const target = archive ? `data-archive-choice="${choice}"` : `id="${kind}"`;
    const label = choice ? t('존재함, 기존 대표', 'Exists; an archived representative matches') : t('새로운 식 추가', 'New; add a representative');
    return `<button class="answer-button ${archive ? '' : kind} ${state}" ${target} ${revealed ? 'disabled' : ''} aria-pressed="${revealed && answer!.choice === choice}" aria-label="${label}"><span class="choice-math" aria-hidden="true">${choice ? '∃' : '+'}</span></button>`;
  }).join('')}</div>`;
}
function renderGame() {
  const scrollTop = root.querySelector<HTMLElement>('.records')?.scrollTop ?? 0;
  const s = session!, q = question!, revealed = screen === 'feedback';
  const round = s.answers.length + (revealed ? 0 : 1);
  const reductions = s.answers.filter(a => a.question.matchId !== null).length;
  root.innerHTML = `${header()}<main class="game ${introducing ? 'is-introducing' : ''} ${storing ? 'is-storing' : ''} ${revealed && !answer!.correct ? 'took-damage' : ''} ${revealed && q.matchId !== null && answer!.choice === false ? 'is-duplicate' : ''}"><section class="status" aria-label="${t('게임 현황', 'Game status')}"><span class="round-label" aria-label="${t(`${round}라운드`, `Round ${round}`)}"><b>${round}</b></span>${livesMarkup()}<span class="score-item"><small>${t('점수', 'Score')}</small> <strong>${expression(s.score.toLocaleString())}</strong></span><span class="score-item"><small>${t('연속', 'Streak')}</small> <strong>${s.streak}</strong></span><span class="time-value time-${timeTone(remaining, roundSeconds())}" aria-label="${t('남은 시간', 'Time left')}"><span id="time">${expression(remaining.toFixed(1))}</span><small>${t('초', 's')}</small></span>${!revealed ? `<button id="pause" class="pause-button" aria-label="${t('게임 일시정지', 'Pause game')}">Ⅱ</button>` : `<span class="clock-stopped" aria-label="${t('타이머 정지', 'Timer stopped')}">✓</span>`}</section><div class="time-track" aria-hidden="true"><div id="time-bar" class="time-${timeTone(remaining, roundSeconds())}" style="transform:scaleX(${remaining / roundSeconds()})"></div></div><section class="archive" aria-label="${t('보관한 대표 식', 'Archived representatives')}"><div class="archive-heading"><h2>${t('기록', 'Archive')} <span>${s.records.length}</span></h2><span class="reduction-trace" aria-label="${t('축약한 식', 'Reduced expressions')} ${reductions}" title="${t('기존 대표로 축약한 식', 'Expressions reduced to existing representatives')}">∃ ${reductions}</span><div class="archive-tools"><button id="show-records" aria-haspopup="dialog" ${introducing || storing ? 'disabled' : ''}>${t('전체 보기', 'View all')}</button>${revealed && q.matchId !== null ? `<button data-locate="${q.matchId}" aria-label="${t('기록에서 동치 대표 찾기', 'Find the matching representative')}">≡</button>` : ''}</div></div><div class="records" tabindex="0" aria-label="${t('식 기록 세로 스크롤', 'Scroll archived expressions vertically')}">${recordMarkup()}</div></section>${mappingMarkup()}<div class="puzzle-host" tabindex="-1" aria-label="${t('문제 영역', 'Puzzle area')}"><section ${introducing ? 'inert aria-hidden="true"' : ''} class="puzzle ${introducing ? 'preparing' : ''}" aria-label="${t('현재 문제', 'Current candidate')}"><div id="question-title" tabindex="-1" class="candidate" aria-label="${escape(formatComposition(q.expr))}"><div class="operand"><div class="math operand-expression ${format(q.left.expr).length > 25 ? 'long' : ''}">${renderMath(q.left.expr, true)}</div></div><span class="operator math" aria-hidden="true">${symbol(q.op)}</span><div class="operand"><div class="math operand-expression ${format(q.right.expr).length > 25 ? 'long' : ''}">${renderMath(q.right.expr, true)}</div></div></div><div class="answer-area">${answerButtons()}${revealed ? feedbackMarkup() : ''}</div></section></div></main>`;
  root.querySelector<HTMLElement>('.records')!.scrollTop = scrollTop;
  bindCommon();
  root.querySelector('#show-records')!.addEventListener('click', openArchive);
  root.querySelectorAll<HTMLButtonElement>('[data-locate]').forEach(button => button.addEventListener('click', () => {
    root.querySelector(`#record-${button.dataset.locate}`)?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
  }));
  if (revealed) {
    root.querySelector<HTMLElement>('.feedback')?.focus();
    const match = q.matchId ?? s.records[s.records.length - 1].id;
    root.querySelector(`#record-${match}`)?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: answer!.correct ? 'auto' : 'smooth' });
  } else {
    root.querySelector('#exists')!.addEventListener('click', () => choose(true));
    root.querySelector('#novel')!.addEventListener('click', () => choose(false));
    root.querySelector('#pause')!.addEventListener('click', () => pauseGame(t('일시정지', 'Paused')));
    if (introducing && newRecordIds.length) root.querySelector(`#record-${newRecordIds[0]}`)?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }
}
function feedbackMarkup() {
  const a = answer!;
  const result = a.choice === null ? t('시간 초과', 'Time up') : a.correct ? t('정답', 'Correct') : t('오답', 'Incorrect');
  return `<section class="feedback ${a.correct ? 'correct' : 'incorrect'}" aria-live="polite" tabindex="-1"><div class="feedback-title">${!a.correct ? '<span class="damage-emoji" aria-hidden="true">😵‍💫</span>' : ''}<span>${a.correct ? '✓' : '×'} ${result}${!a.correct ? `<span class="sr-only">${t(', 목숨 1개 감소', ', one life lost')}</span>` : ''}</span><strong>+${a.earned}</strong></div></section>`;
}
function runClock() {
  if (paused || introducing || screen !== 'playing') return;
  deadline = performance.now() + remaining * 1000;
  frame = requestAnimationFrame(tick);
}
function tick(now: number) {
  if (screen !== 'playing' || paused) return;
  remaining = Math.max(0, (deadline - now) / 1000);
  const archiveTime = archiveDialog?.querySelector('#archive-time');
  if (archiveTime) archiveTime.textContent = remaining.toFixed(1);
  const time = root.querySelector('#time'), bar = root.querySelector<HTMLElement>('#time-bar');
  if (time) time.innerHTML = expression(remaining.toFixed(1));
  if (bar) bar.style.transform = `scaleX(${remaining / roundSeconds()})`;
  const tone = timeTone(remaining, roundSeconds());
  for (const element of [root.querySelector('.time-value'), bar, archiveDialog?.querySelector('.archive-clock')]) {
    for (const phase of ['normal', 'warning', 'critical']) element?.classList.toggle(`time-${phase}`, tone === phase);
  }
  if (remaining <= 0) { choose(null); return; }
  frame = requestAnimationFrame(tick);
}
function stopClock() { cancelAnimationFrame(frame); cancelAnimationFrame(readyFrame); frame = 0; readyFrame = 0; }
function choose(choice: boolean | null) {
  if (screen !== 'playing' || paused || introducing || readyFrame !== 0) return;
  if (deadline) remaining = Math.max(0, (deadline - performance.now()) / 1000);
  closeArchive(false);
  stopClock(); screen = 'feedback';
  answer = submitAnswer(session!, question!, remaining <= 0 ? null : choice, remaining);
  storing = answer.correct && question!.matchId === null;
  renderGame();
  if (storing) {
    const source = root.querySelector<HTMLElement>('.candidate')!;
    const card = root.querySelector<HTMLElement>(`#record-${session!.records.at(-1)!.id}`)!;
    void storageFlight.store(source, {parts:[card.querySelector<HTMLElement>('.record-expression')!], reveal:[card], frame:card}, () => {
      storing = false; root.querySelector<HTMLButtonElement>('#show-records')?.removeAttribute('disabled'); card.classList.add('record-enter'); root.querySelector('.game')?.classList.remove('is-storing');
    });
  }
  if (answer.correct && question!.matchId !== null) {
    const source = root.querySelector<HTMLElement>('.candidate')!;
    const representative = root.querySelector<HTMLElement>(`#record-${question!.matchId}`)!;
    void storageFlight.absorb(source, representative, () => {});
  }
  playFeedback(answer.correct, answer.choice === null);
  advance.start(2000);
  if (document.hidden) freezeForVisibility();
}
function closeArchive(restoreFocus = true) {
  if (!archiveDialog) return;
  archiveDialog.close(); archiveDialog.remove(); archiveDialog = null;
  if (restoreFocus) root.querySelector<HTMLButtonElement>('#show-records')?.focus();
}
function openArchive() {
  if (archiveDialog?.open || dialog?.open || introducing || storing || (screen !== 'playing' && screen !== 'feedback')) return;
  const el = document.createElement('dialog'); archiveDialog = el; el.className = 'modal archive-modal';
  el.setAttribute('aria-labelledby', 'archive-title');
  el.innerHTML = `<div class="archive-modal-heading"><h2 id="archive-title">${t('전체 기록', 'All expressions')} <span>${session!.records.length}</span></h2><div><span class="archive-clock time-${timeTone(remaining, roundSeconds())}" aria-label="${t('남은 시간', 'Time left')}"><span id="archive-time">${remaining.toFixed(1)}</span>${t('초', 's')}</span><button id="archive-close" class="text-button" aria-label="${t('전체 기록 닫기', 'Close full archive')}">${t('닫기', 'Close')} ×</button></div></div>
    <div class="records full-records" id="all-records" tabindex="0" aria-label="${t('전체 식 기록 세로 스크롤', 'Scroll all archived expressions vertically')}">${recordMarkup('archive-record-')}</div>
    <div class="archive-modal-footer">${mappingMarkup()}<div class="math archive-candidate">${renderMath(question!.expr)}</div>${answerButtons(true)}</div>`;
  document.body.append(el); el.showModal();
  el.querySelector('#archive-close')!.addEventListener('click', () => closeArchive());
  el.addEventListener('cancel', event => { event.preventDefault(); closeArchive(); });
  el.querySelectorAll<HTMLButtonElement>('[data-archive-choice]').forEach(button => button.addEventListener('click', () => choose(button.dataset.archiveChoice === 'true')));
}
function pauseGame(title: string, help = false) {
  visibilityPaused = false;
  if (dialog?.open) return;
  if (screen === 'tutorial') tutorialControls?.pause();
  if (screen === 'feedback') { advance.pause(); storageFlight.pause(); paused = true; }
  if (screen === 'playing' && !paused) {
    if (introducing) {
      introduction.pause();
    }
    if (frame) remaining = Math.max(0, (deadline - performance.now()) / 1000);
    stopClock(); paused = true;
  }
  openDialog(title, help);
}
function openDialog(title: string, help: boolean) {
  const el = document.createElement('dialog'); dialog = el; el.className = help ? 'modal guide-modal' : 'modal';
  el.setAttribute('aria-labelledby', 'modal-title');
  el.innerHTML = `<h2 id="modal-title">${title}</h2>${help ? guideMarkup(screen === 'home' || screen === 'tutorial' ? selectedSeconds : roundSeconds()) : ''}<button id="close-modal" class="primary">${paused ? t('계속', 'Resume') : t('닫기', 'Close')} <span aria-hidden="true">→</span></button>`;
  document.body.append(el); el.showModal();
  const close = () => {
    // A background tab must never resume a round.
    if (document.hidden && (paused || screen === 'tutorial')) return;
    el.close(); el.remove(); dialog = null;
    if (screen === 'tutorial') tutorialControls?.resume();
    if (paused) {
      paused = false;
      if (screen === 'playing') {
        if (introducing) {
          introduction.resume();
        } else { runClock(); root.querySelector<HTMLButtonElement>('#exists')?.focus(); }
      }
      else if (screen === 'feedback') { storageFlight.resume(); advance.resume(); }
    }
  };
  el.querySelector('#close-modal')!.addEventListener('click', close);
  el.addEventListener('cancel', event => { event.preventDefault(); close(); });
}
function finish() {
  advance.cancel(); introduction.cancel(); storageFlight.cancel(); storing = false; introducing = false; stopClock(); screen = 'results'; saveBest();
  renderResults();
}
function renderResults() {
  const s = session!, correct = s.answers.filter(a => a.correct).length;
  root.innerHTML = `${header()}<main class="results"><h1>${s.lives === 0 ? 'Game over.' : t('완료.', 'Complete.')}</h1><div class="final-score">${s.score.toLocaleString()}<small>${t('점', 'pts')}</small>${newBest ? `<span>${t('최고 기록', 'New best')}</span>` : ''}</div><div class="result-stats"><span>${t('정답', 'Correct')} ${correct}/${s.answers.length} · ${Math.round(correct / Math.max(1, s.answers.length) * 100)}%</span><span>${t('최고', 'Best')} ${Math.max(best(), s.score).toLocaleString()}</span></div><div class="result-actions"><button class="primary" id="replay">${t('다시 하기', 'Play again')} <span aria-hidden="true">↻</span></button><button class="secondary" id="home">${t('설정', 'Settings')}</button></div></main>`;
  bindCommon(); root.querySelector('#replay')!.addEventListener('click', start);
  root.querySelector('#home')!.addEventListener('click', () => { screen = 'home'; renderHome(); });
  root.querySelector<HTMLButtonElement>('#replay')?.focus(); window.scrollTo(0, 0);
}
function bindCommon() {
  root.querySelector('#language')?.addEventListener('click', () => {
    setLanguage(getLanguage() === 'ko' ? 'en' : 'ko');
    if (screen === 'home') renderHome(); else if (screen === 'results') renderResults();
    root.querySelector<HTMLButtonElement>('#language')?.focus();
  });
  root.querySelector('#help')!.addEventListener('click', () => pauseGame(t('플레이 가이드', 'How to play'), true));
  root.querySelector<HTMLButtonElement>('#sound')!.addEventListener('click', event => {
    toggleSound();
    const button = event.currentTarget as HTMLButtonElement;
    button.classList.toggle('muted', !soundEnabled());
    button.setAttribute('aria-label', soundEnabled() ? t('효과음 끄기', 'Mute sound') : t('효과음 켜기', 'Enable sound'));
    button.setAttribute('aria-pressed', String(soundEnabled()));
  });
}
function freezeForVisibility() {
  if (screen === 'tutorial') { tutorialControls?.pause(); return; }
  if (paused || (screen !== 'playing' && screen !== 'feedback')) return;
  visibilityPaused = true;
  if (screen === 'playing') {
    if (frame) remaining = Math.max(0, (deadline - performance.now()) / 1000);
    stopClock(); introduction.pause();
  } else { advance.pause(); storageFlight.pause(); }
  paused = true;
}
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { freezeForVisibility(); return; }
  if (screen === 'tutorial' && !dialog?.open) tutorialControls?.resume();
  if (!visibilityPaused) return;
  visibilityPaused = false;
  if (dialog?.open) return;
  paused = false;
  if (screen === 'playing') {
    if (introducing) introduction.resume(); else prepareQuestion();
  } else if (screen === 'feedback') { storageFlight.resume(); advance.resume(); }
});
renderHome();
