import {t} from './i18n.ts';
import {CONSTANT_INTERVAL, MAPPING_INTERVAL} from './game.ts';
export function guideMarkup(seconds:number) {
  return t(`<div class="help-copy">
    <p class="guide-intro">계산해 보고, 기록에서 찾아보세요.<br>같은 결과를 내는 식은 대표 하나만 남습니다.</p>
    <section><h3>01 · 두 버튼의 의미</h3>
      <div class="guide-choices"><div><span class="guide-symbol" aria-hidden="true">∃</span><strong>이미 있는 식</strong><p>기록에 같은 결과를 내는 식이 있으면 선택하세요.</p></div><div><span class="guide-symbol" aria-hidden="true">+</span><strong>새로운 식</strong><p>기록에 같은 결과를 내는 식이 없으면 선택하세요.</p></div></div>
      <p>화면 중앙의 식은 기록 속 두 식을 +, −, ×로 조합한 것입니다. 괄호 안부터 계산하세요.</p>
    </section>
    <section><h3>02 · 입력 표 읽기</h3>
      <p>위쪽 표의 <strong>한 열이 한 번의 입력</strong>입니다. 각 열의 x, y, z 값을 넣어 계산하고, <strong>모든 열에서</strong> 결과가 같은 기존 식이 있는지 찾아보세요.</p>
      <div class="guide-example"><span class="math">x = 1</span>만 있으면 <span class="math">x</span>와 <span class="math">x × x</span>는 모두 1.<br><span class="math">x = 2</span>인 열이 더해지면 결과가 2와 4로 달라집니다.</div>
      <p>지금 공개된 입력을 기준으로 판단하세요. 모든 실수에서 성립하는 항등식을 찾는 규칙은 아닙니다.</p>
    </section>
    <section><h3>03 · 기록은 계속 자랍니다</h3>
      <p>처음에는 변수만 있습니다. <strong>${CONSTANT_INTERVAL}라운드마다 무작위 상수</strong>가, <strong>${MAPPING_INTERVAL}라운드마다 새로운 입력 열</strong>이 추가됩니다. 추가 애니메이션이 끝나면 다음 문제의 시간이 시작됩니다.</p>
      <p>새로운 식은 기록으로 들어가고, 동치인 식이 더 짧으면 대표를 교체합니다. 길이가 같으면 기존 대표를 유지합니다. 오답이어도 실제 판정에 따라 기록을 처리합니다. 버린 식은 입력이 늘어나도 되살아나지 않습니다.</p>
    </section>
    <section><h3>04 · 세 번의 기회</h3>
      <p>한 문제에 <strong>${seconds}초</strong>. 오답이나 시간 초과로 목숨을 하나 잃고, 세 번 잃으면 게임이 끝납니다. 라운드 수에는 제한이 없습니다.</p>
      <p>정답은 100점에 시간 보너스 최대 100점. 정답·오답 모두 <strong>2초</strong> 뒤 자동으로 넘어갑니다. ♫로 소리를 켜고 끌 수 있고, 일시정지나 가이드를 열면 시간도 멈춥니다.</p>
    </section></div>`, `<div class="help-copy">
    <p class="guide-intro">Calculate, then look through the archive.<br>Keep one representative for each set of matching outputs.</p>
    <section><h3>01 · Two choices</h3>
      <div class="guide-choices"><div><span class="guide-symbol" aria-hidden="true">∃</span><strong>Exists</strong><p>Choose this if an archived expression has the same outputs.</p></div><div><span class="guide-symbol" aria-hidden="true">+</span><strong>New</strong><p>Choose this if no archived expression has the same outputs.</p></div></div>
      <p>Each candidate combines two archived expressions using +, − or ×. Evaluate parentheses first.</p>
    </section>
    <section><h3>02 · Read the inputs</h3>
      <p><strong>Each column is one input tuple.</strong> Substitute its x, y and z values. An existing representative must match the candidate in <strong>every column</strong>.</p>
      <div class="guide-example">With only <span class="math">x = 1</span>, both <span class="math">x</span> and <span class="math">x × x</span> produce 1.<br>Add <span class="math">x = 2</span>, and their outputs differ: 2 and 4.</div>
      <p>Use the currently revealed inputs. Matching here does not mean equality for every real input.</p>
    </section>
    <section><h3>03 · A growing archive</h3>
      <p>You start with variables only. A <strong>random constant arrives every ${CONSTANT_INTERVAL} completed rounds</strong>, and a <strong>new input column every ${MAPPING_INTERVAL}</strong>. The next timer starts after the arrival animation.</p>
      <p>New expressions enter the archive. A shorter matching expression replaces its representative; ties keep the existing one. The archive follows the actual answer even if you are wrong. Discarded expressions are not restored when inputs grow.</p>
    </section>
    <section><h3>04 · Three chances</h3>
      <p>You have <strong>${seconds} seconds</strong> per round. A wrong answer or timeout costs one life. Lose all three and the game ends. There is no round limit.</p>
      <p>A correct answer earns 100 points plus up to 100 for time left. The game advances after <strong>2 seconds</strong>. Use ♫ to toggle sound. Pause or open this guide to stop the timer.</p>
    </section></div>`);
}
