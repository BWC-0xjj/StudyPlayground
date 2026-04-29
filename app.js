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
  resetProgress: document.querySelector("#resetProgress")
};

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
    const mastered = topic.facts.filter((fact) => (progress.mastered[factKey(topic.id, fact)] || 0) >= 3).length;
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
  const reversed = Math.random() > 0.74;
  const prompt = reversed ? `${fact[1]} = ?` : `${fact[0]} = ?`;
  const answer = reversed ? fact[0] : fact[1];
  const wrongPool = topic.facts
    .flatMap((item) => [item[0], item[1]])
    .filter((value) => value !== answer && value !== (reversed ? fact[1] : fact[0]));
  const choices = shuffle([answer, ...shuffle(wrongPool).slice(0, 3)]);

  return { topic, fact, prompt, answer, choices, hint: fact[2], key: factKey(topic.id, fact) };
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
    <div class="quiz-layout">
      <div class="question-panel">
        <div class="topic-label" style="background:${currentQuestion.topic.color}22;color:${currentQuestion.topic.color}">
          ${topicTitle(currentQuestion.topic)}
        </div>
        <div class="question-text">${escapeHtml(currentQuestion.prompt)}</div>
        <div class="answer-row">
          <input id="answerInput" autocomplete="off" inputmode="text" aria-label="答えを入力" />
          <button id="submitAnswer" class="primary-button" type="button"><ruby>決定<rt>けってい</rt></ruby></button>
        </div>
      </div>
      <div class="feedback-panel">
        <div class="big-result"><ruby>答<rt>こた</rt></ruby>えを<ruby>選<rt>えら</rt></ruby>ぶか、<ruby>自分<rt>じぶん</rt></ruby>で<ruby>入力<rt>にゅうりょく</rt></ruby>してね。</div>
        <div class="choices">
          ${currentQuestion.choices.map((choice) => `<button class="answer-button" data-answer="${escapeHtml(choice)}" type="button">${escapeHtml(choice)}</button>`).join("")}
        </div>
        <p class="hint">まちがえた<ruby>問題<rt>もんだい</rt></ruby>は<ruby>復習<rt>ふくしゅう</rt></ruby>に<ruby>入<rt>はい</rt></ruby>るよ。</p>
      </div>
    </div>
  `;

  document.querySelector("#answerInput").focus();
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

  const result = document.querySelector(".big-result");
  const hint = document.querySelector(".hint");

  if (isCorrect) {
    progress.streak += 1;
    progress.stars += 1;
    progress.mastered[currentQuestion.key] = (progress.mastered[currentQuestion.key] || 0) + 1;
    progress.wrong = progress.wrong.filter((key) => key !== currentQuestion.key || (progress.mastered[key] || 0) < 2);
    result.innerHTML = "<ruby>正解<rt>せいかい</rt></ruby>！";
    hint.innerHTML = `${escapeHtml(currentQuestion.prompt.replace("?", currentQuestion.answer))}。${escapeHtml(currentQuestion.hint)}`;
  } else {
    progress.streak = 0;
    progress.mastered[currentQuestion.key] = Math.max(0, (progress.mastered[currentQuestion.key] || 0) - 1);
    if (!progress.wrong.includes(currentQuestion.key)) progress.wrong.push(currentQuestion.key);
    result.innerHTML = "もう<ruby>一度<rt>いちど</rt></ruby>おぼえよう";
    hint.innerHTML = `<ruby>正<rt>ただ</rt></ruby>しい<ruby>答<rt>こた</rt></ruby>えは ${escapeHtml(currentQuestion.answer)}。${escapeHtml(currentQuestion.hint)}`;
  }

  saveProgress();
  renderShell();

  setTimeout(() => renderQuiz(mode === "review"), 1300);
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
  renderShell();
  setMode(mode);
});

el.topicGrid.addEventListener("click", (event) => {
  const button = event.target.closest("[data-topic]");
  if (!button) return;
  activeTopicId = button.dataset.topic;
  renderShell();
  setMode(mode);
  window.scrollTo({ top: 0, behavior: "smooth" });
});

el.gameArea.addEventListener("click", (event) => {
  const answer = event.target.closest("[data-answer]");
  if (answer) answerQuestion(answer.dataset.answer);

  const card = event.target.closest("[data-card]");
  if (card) handleMatch(card);

  if (event.target.id === "submitAnswer") {
    answerQuestion(document.querySelector("#answerInput").value);
  }
});

el.gameArea.addEventListener("keydown", (event) => {
  if (event.key !== "Enter") return;
  const input = event.target.closest("#answerInput");
  if (input) answerQuestion(input.value);
});

el.quizMode.addEventListener("click", () => setMode("quiz"));
el.matchMode.addEventListener("click", () => setMode("match"));
el.reviewMode.addEventListener("click", () => setMode("review"));
el.resetProgress.addEventListener("click", () => {
  progress = { stars: 0, streak: 0, mastered: {}, wrong: [] };
  saveProgress();
  renderShell();
  setMode(mode);
});

renderShell();
setMode("quiz");
