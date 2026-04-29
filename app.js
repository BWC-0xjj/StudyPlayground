"use strict";

const topics = window.LEARNING_TOPICS || [];
const storageKey = "unit-camp-progress-v2";

let progress = loadProgress();
let activeTopicId = topics[0] ? topics[0].id : "";
let mode = "quiz";
let currentQuestion = null;
let acceptingAnswer = true;
let selectedMatch = null;
let matchPairs = [];
let matchCards = [];
let round = { answered: 0, total: 10 };

const el = {
  topicTabs: document.querySelector("#topicTabs"),
  topicGrid: document.querySelector("#topicGrid"),
  gameArea: document.querySelector("#gameArea"),
  streak: document.querySelector("#streak"),
  stars: document.querySelector("#stars"),
  mastered: document.querySelector("#mastered"),
  quizMode: document.querySelector("#quizMode"),
  matchMode: document.querySelector("#matchMode"),
  reviewMode: document.querySelector("#reviewMode"),
  resetProgress: document.querySelector("#resetProgress"),
  bgmToggle: document.querySelector("#bgmToggle")
};

let audioContext = null;
let bgmTimer = null;
let bgmStep = 0;
let bgmEnabled = false;

function loadProgress() {
  const fallback = { stars: 0, streak: 0, mastered: {}, wrong: [] };
  try {
    return { ...fallback, ...JSON.parse(localStorage.getItem(storageKey) || "{}") };
  } catch {
    return fallback;
  }
}

function saveProgress() {
  localStorage.setItem(storageKey, JSON.stringify(progress));
}

function playTone(frequency, startTime, duration, gainValue) {
  const oscillator = audioContext.createOscillator();
  const gain = audioContext.createGain();
  oscillator.type = "sine";
  oscillator.frequency.setValueAtTime(frequency, startTime);
  gain.gain.setValueAtTime(0.0001, startTime);
  gain.gain.exponentialRampToValueAtTime(gainValue, startTime + 0.025);
  gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);
  oscillator.connect(gain).connect(audioContext.destination);
  oscillator.start(startTime);
  oscillator.stop(startTime + duration + 0.03);
}

function playBgmStep() {
  if (!audioContext || !bgmEnabled) return;
  const melody = [523.25, 659.25, 783.99, 659.25, 587.33, 698.46, 880, 698.46];
  const bass = [261.63, 329.63, 392, 329.63];
  const now = audioContext.currentTime;
  playTone(melody[bgmStep % melody.length], now, 0.24, 0.045);
  if (bgmStep % 2 === 0) playTone(bass[Math.floor(bgmStep / 2) % bass.length], now, 0.34, 0.028);
  bgmStep += 1;
}

function toggleBgm() {
  bgmEnabled = !bgmEnabled;
  if (bgmEnabled) {
    const AudioEngine = window.AudioContext || window.webkitAudioContext;
    if (!AudioEngine) {
      bgmEnabled = false;
      el.bgmToggle.textContent = "BGM なし";
      el.bgmToggle.disabled = true;
      return;
    }
    audioContext = audioContext || new AudioEngine();
    audioContext.resume();
    playBgmStep();
    bgmTimer = window.setInterval(playBgmStep, 360);
  } else {
    window.clearInterval(bgmTimer);
    bgmTimer = null;
  }
  el.bgmToggle.textContent = bgmEnabled ? "BGM オフ" : "BGM オン";
  el.bgmToggle.setAttribute("aria-pressed", String(bgmEnabled));
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function topicTitle(topic) {
  return topic.nameHtml || escapeHtml(topic.name);
}

function topicById(id) {
  return topics.find((topic) => topic.id === id) || topics[0];
}

function factKey(topicId, fact) {
  return `${topicId}:${fact[0]}=${fact[1]}`;
}

function shuffle(items) {
  return [...items].sort(() => Math.random() - 0.5);
}

function topicMasteredCount(topic) {
  return topic.facts.filter((fact) => (progress.mastered[factKey(topic.id, fact)] || 0) >= 3).length;
}

function renderShell() {
  if (!topics.length) {
    el.gameArea.innerHTML = "<div class=\"empty-state\"><div>題材データがありません。</div></div>";
    return;
  }

  el.topicTabs.innerHTML = topics.map((topic) => {
    const active = topic.id === activeTopicId ? " active" : "";
    return `<button class="tab${active}" data-topic="${escapeHtml(topic.id)}" type="button">${topicTitle(topic)}</button>`;
  }).join("");

  el.topicGrid.innerHTML = topics.map((topic) => {
    const mastered = topicMasteredCount(topic);
    const pct = Math.round((mastered / topic.facts.length) * 100);
    return `
      <button class="topic-card" data-topic="${escapeHtml(topic.id)}" type="button">
        <strong>${topicTitle(topic)}</strong>
        <div class="meter"><span style="width:${pct}%; background:${topic.color}"></span></div>
        <small>${mastered}/${topic.facts.length} こ <ruby>習得<rt>しゅうとく</rt></ruby></small>
      </button>
    `;
  }).join("");

  el.streak.textContent = progress.streak;
  el.stars.textContent = progress.stars;
  el.mastered.textContent = Object.values(progress.mastered).filter((value) => value >= 3).length;
}

function makeQuestion(topicId = activeTopicId, reviewOnly = false) {
  const topic = topicById(topicId);
  let facts = topic.facts;
  if (reviewOnly) {
    const wrongKeys = new Set(progress.wrong);
    facts = facts.filter((fact) => wrongKeys.has(factKey(topic.id, fact)));
  }

  if (!facts.length) return null;

  const fact = facts[Math.floor(Math.random() * facts.length)];
  const reversed = Math.random() > 0.78;
  const prompt = reversed ? `${fact[1]} = ?` : `${fact[0]} = ?`;
  const answer = reversed ? fact[0] : fact[1];
  const formula = `${fact[0]} = ${fact[1]}`;
  const wrongPool = topic.facts
    .flatMap((item) => [item[0], item[1]])
    .filter((value) => value !== answer && value !== (reversed ? fact[1] : fact[0]));
  const choices = shuffle([answer, ...shuffle(wrongPool).slice(0, 3)]);

  return { topic, fact, prompt, answer, choices, formula, hint: fact[2], key: factKey(topic.id, fact) };
}

function renderRoundProgress(topic) {
  const roundPct = Math.round((round.answered / round.total) * 100);
  const mastered = topicMasteredCount(topic);
  const topicPct = Math.round((mastered / topic.facts.length) * 100);

  return `
    <div class="progress-stack" aria-label="練習の進みぐあい">
      <div class="progress-line">
        <span><ruby>今日<rt>きょう</rt></ruby>のチャレンジ</span>
        <strong>${round.answered}/${round.total}</strong>
      </div>
      <div class="meter big-meter"><span style="width:${roundPct}%"></span></div>
      <div class="progress-line quiet">
        <span>このテーマ</span>
        <strong>${mastered}/${topic.facts.length} こ <ruby>習得<rt>しゅうとく</rt></ruby></strong>
      </div>
      <div class="meter small-meter"><span style="width:${topicPct}%; background:${topic.color}"></span></div>
    </div>
  `;
}

function renderQuiz(reviewOnly = false) {
  currentQuestion = makeQuestion(activeTopicId, reviewOnly);
  acceptingAnswer = true;

  if (!currentQuestion) {
    el.gameArea.innerHTML = `
      <div class="empty-state">
        <div><ruby>復習<rt>ふくしゅう</rt></ruby>する<ruby>問題<rt>もんだい</rt></ruby>はありません。はやおしで<ruby>新<rt>あたら</rt></ruby>しい<ruby>問題<rt>もんだい</rt></ruby>にチャレンジしよう。</div>
      </div>
    `;
    return;
  }

  el.gameArea.innerHTML = `
    <div class="quiz-layout choice-only">
      <div class="question-panel">
        <div class="topic-label" style="background:${currentQuestion.topic.color}22;color:${currentQuestion.topic.color}">
          ${topicTitle(currentQuestion.topic)}
        </div>
        <div class="question-text">${escapeHtml(currentQuestion.prompt)}</div>
        ${renderRoundProgress(currentQuestion.topic)}
      </div>
      <div class="feedback-panel choice-panel">
        <div class="big-result"><ruby>答<rt>こた</rt></ruby>えを<ruby>選<rt>えら</rt></ruby>んでね。</div>
        <div class="choices">
          ${currentQuestion.choices.map((choice) => `<button class="answer-button" data-answer="${escapeHtml(choice)}" type="button">${escapeHtml(choice)}</button>`).join("")}
        </div>
      </div>
    </div>
  `;
}

function normalizeAnswer(value) {
  return String(value)
    .replace(/\s+/g, "")
    .replace(/平方/g, "²")
    .replace(/へいほう/g, "²")
    .replace(/立方/g, "³")
    .replace(/りっぽう/g, "³")
    .toLowerCase();
}

function answerQuestion(value) {
  if (!currentQuestion || !acceptingAnswer) return;
  acceptingAnswer = false;

  const isCorrect = normalizeAnswer(value) === normalizeAnswer(currentQuestion.answer);
  const buttons = document.querySelectorAll(".answer-button");
  buttons.forEach((button) => {
    if (button.dataset.answer === currentQuestion.answer) button.classList.add("correct");
    if (button.dataset.answer === value && !isCorrect) button.classList.add("wrong");
    button.disabled = true;
  });

  round.answered = Math.min(round.total, round.answered + 1);

  if (isCorrect) {
    progress.streak += 1;
    progress.stars += 1;
    progress.mastered[currentQuestion.key] = (progress.mastered[currentQuestion.key] || 0) + 1;
    progress.wrong = progress.wrong.filter((key) => key !== currentQuestion.key || (progress.mastered[key] || 0) < 2);
  } else {
    progress.streak = 0;
    progress.mastered[currentQuestion.key] = Math.max(0, (progress.mastered[currentQuestion.key] || 0) - 1);
    if (!progress.wrong.includes(currentQuestion.key)) progress.wrong.push(currentQuestion.key);
  }

  saveProgress();
  renderShell();
  showAnswerDialog(isCorrect, value);
}

function showAnswerDialog(isCorrect, selectedAnswer) {
  const complete = round.answered >= round.total;
  const title = isCorrect
    ? "<ruby>正解<rt>せいかい</rt></ruby>！"
    : "ここで<ruby>確認<rt>かくにん</rt></ruby>しよう";
  const lead = isCorrect
    ? "よくできました。どうしてそうなるかも見ておこう。"
    : `えらんだ答えは ${escapeHtml(selectedAnswer)}。正しい答えは ${escapeHtml(currentQuestion.answer)} です。`;
  const completeText = complete
    ? "<div class=\"round-complete\">10問チャレンジ達成！ 次はまた 1問目から始まるよ。</div>"
    : "";

  const dialog = document.createElement("div");
  dialog.className = "answer-dialog-backdrop";
  dialog.innerHTML = `
    <section class="answer-dialog ${isCorrect ? "is-correct" : "is-wrong"}" role="dialog" aria-modal="true" aria-label="答えの説明">
      <div class="dialog-badge">${isCorrect ? "OK" : "CHECK"}</div>
      <h3>${title}</h3>
      <p class="dialog-lead">${lead}</p>
      <div class="reason-box">
        <strong>${escapeHtml(currentQuestion.formula)}</strong>
        <span>${escapeHtml(currentQuestion.hint)}</span>
      </div>
      ${completeText}
      <button class="primary-button next-question" type="button"><ruby>次<rt>つぎ</rt></ruby>へ</button>
    </section>
  `;
  document.body.appendChild(dialog);
  dialog.querySelector(".next-question").focus();
}

function closeAnswerDialog() {
  const dialog = document.querySelector(".answer-dialog-backdrop");
  if (dialog) dialog.remove();
  if (round.answered >= round.total) round.answered = 0;
  renderQuiz(mode === "review");
}

function renderMatch() {
  const topic = topicById(activeTopicId);
  matchPairs = shuffle(topic.facts).slice(0, 4).map((fact, index) => ({
    id: `${topic.id}-${index}`,
    left: fact[0],
    right: fact[1],
    hint: fact[2],
    key: factKey(topic.id, fact),
    matched: false
  }));
  matchCards = shuffle(matchPairs.flatMap((pair) => [
    { id: `${pair.id}-left`, pairId: pair.id, text: pair.left },
    { id: `${pair.id}-right`, pairId: pair.id, text: pair.right }
  ]));
  selectedMatch = null;
  renderMatchBoard();
}

function renderMatchBoard(message = "<ruby>同<rt>おな</rt></ruby>じ<ruby>意味<rt>いみ</rt></ruby>のカードをペアにしよう。") {
  el.gameArea.innerHTML = `
    <div class="match-layout">
      <div class="feedback-panel">
        <div class="big-result">${message}</div>
      </div>
      <div class="match-grid">
        ${matchCards.map((card) => {
          const pair = matchPairs.find((item) => item.id === card.pairId);
          const matched = pair && pair.matched;
          return `
          <button class="match-card${matched ? " matched" : ""}" data-card="${escapeHtml(card.id)}" data-pair="${escapeHtml(card.pairId)}" type="button" ${matched ? "disabled" : ""}>
            ${escapeHtml(card.text)}
          </button>
        `;
        }).join("")}
      </div>
    </div>
  `;
}

function handleMatch(card) {
  if (!card || card.classList.contains("matched")) return;
  if (!selectedMatch) {
    selectedMatch = card;
    card.classList.add("selected");
    return;
  }

  if (selectedMatch.dataset.card === card.dataset.card) return;

  const isPair = selectedMatch.dataset.pair === card.dataset.pair;
  const pair = matchPairs.find((item) => item.id === card.dataset.pair);

  if (isPair) {
    pair.matched = true;
    progress.stars += 1;
    progress.streak += 1;
    progress.mastered[pair.key] = (progress.mastered[pair.key] || 0) + 1;
    progress.wrong = progress.wrong.filter((key) => key !== pair.key);
    saveProgress();
    renderShell();
    selectedMatch = null;
    const done = matchPairs.every((item) => item.matched);
    renderMatchBoard(done ? "<ruby>全部<rt>ぜんぶ</rt></ruby>ペアになったよ！" : escapeHtml(pair.hint));
    if (done) setTimeout(renderMatch, 1300);
  } else {
    progress.streak = 0;
    if (pair && !progress.wrong.includes(pair.key)) progress.wrong.push(pair.key);
    saveProgress();
    renderShell();
    selectedMatch.classList.remove("selected");
    selectedMatch = null;
    card.classList.add("selected");
    setTimeout(() => renderMatchBoard("この2まいはペアではないよ。もう<ruby>一度<rt>いちど</rt></ruby>ためそう。"), 450);
  }
}

function setMode(nextMode) {
  mode = nextMode;
  el.quizMode.classList.toggle("active", mode === "quiz");
  el.matchMode.classList.toggle("active", mode === "match");
  el.reviewMode.classList.toggle("active", mode === "review");

  if (mode === "match") renderMatch();
  else renderQuiz(mode === "review");
}

el.topicTabs.addEventListener("click", (event) => {
  const button = event.target.closest("[data-topic]");
  if (!button) return;
  activeTopicId = button.dataset.topic;
  round.answered = 0;
  renderShell();
  setMode(mode);
});

el.topicGrid.addEventListener("click", (event) => {
  const button = event.target.closest("[data-topic]");
  if (!button) return;
  activeTopicId = button.dataset.topic;
  round.answered = 0;
  renderShell();
  setMode(mode);
  window.scrollTo({ top: 0, behavior: "smooth" });
});

el.gameArea.addEventListener("click", (event) => {
  const answer = event.target.closest("[data-answer]");
  if (answer) answerQuestion(answer.dataset.answer);

  const card = event.target.closest("[data-card]");
  if (card) handleMatch(card);
});

document.body.addEventListener("click", (event) => {
  if (event.target.closest(".next-question")) closeAnswerDialog();
});

document.body.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && document.querySelector(".answer-dialog-backdrop")) {
    closeAnswerDialog();
  }
});

el.quizMode.addEventListener("click", () => setMode("quiz"));
el.matchMode.addEventListener("click", () => setMode("match"));
el.reviewMode.addEventListener("click", () => setMode("review"));
el.resetProgress.addEventListener("click", () => {
  progress = { stars: 0, streak: 0, mastered: {}, wrong: [] };
  round.answered = 0;
  saveProgress();
  renderShell();
  setMode(mode);
});
el.bgmToggle.addEventListener("click", toggleBgm);

renderShell();
setMode("quiz");
