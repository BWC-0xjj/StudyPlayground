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
let dailyQuestion = null;
let dailyOperation = "multiply";
let dailySettings = { multiplyDigits: "2x2", divisorDigits: 1 };

const el = {
  topicTabs: document.querySelector("#topicTabs"),
  topicGrid: document.querySelector("#topicGrid"),
  gameArea: document.querySelector("#gameArea"),
  streak: document.querySelector("#streak"),
  stars: document.querySelector("#stars"),
  mastered: document.querySelector("#mastered"),
  quizMode: document.querySelector("#quizMode"),
  matchMode: document.querySelector("#matchMode"),
  visualMode: document.querySelector("#visualMode"),
  dailyMode: document.querySelector("#dailyMode"),
  reviewMode: document.querySelector("#reviewMode"),
  resetProgress: document.querySelector("#resetProgress"),
  bgmToggle: document.querySelector("#bgmToggle")
};

let audioContext = null;
let bgmTimer = null;
let bgmStep = 0;
let bgmEnabled = true;
let bgmAudio = null;
let bgmAudioEventsReady = false;
let lastTrackIndex = -1;
let bgmTracks = Array.isArray(window.BGM_TRACKS) ? [...window.BGM_TRACKS] : [];

function loadProgress() {
  const fallback = { stars: 0, streak: 0, mastered: {}, wrong: [], daily: {} };
  try {
    const stored = JSON.parse(localStorage.getItem(storageKey) || "{}");
    return { ...fallback, ...stored, daily: stored.daily || fallback.daily };
  } catch {
    return fallback;
  }
}

function saveProgress() {
  localStorage.setItem(storageKey, JSON.stringify(progress));
}

async function loadLocalBgmTracks() {
  try {
    const response = await fetch("./assets/audio/bgm/local-tracks.json", { cache: "no-store" });
    if (!response.ok) return;
    const tracks = await response.json();
    if (Array.isArray(tracks)) {
      bgmTracks = [...new Set([...bgmTracks, ...tracks.filter((track) => typeof track === "string")])];
    }
  } catch {
    // Local-only music manifests are optional.
  }
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

function pickBgmTrack() {
  if (!bgmTracks.length) return "";
  if (bgmTracks.length === 1) {
    lastTrackIndex = 0;
    return bgmTracks[0];
  }

  let nextIndex = Math.floor(Math.random() * bgmTracks.length);
  while (nextIndex === lastTrackIndex) {
    nextIndex = Math.floor(Math.random() * bgmTracks.length);
  }
  lastTrackIndex = nextIndex;
  return bgmTracks[nextIndex];
}

function playRandomBgmTrack() {
  if (!bgmEnabled || !bgmTracks.length) return;
  const src = pickBgmTrack();
  if (!src) return;

  bgmAudio = bgmAudio || new Audio();
  if (!bgmAudioEventsReady) {
    bgmAudio.addEventListener("ended", playRandomBgmTrack);
    bgmAudioEventsReady = true;
  }
  bgmAudio.src = src;
  bgmAudio.volume = 0.38;
  bgmAudio.loop = false;
  bgmAudio.play().catch(() => {});
}

function setBgmButtonState() {
  el.bgmToggle.setAttribute("aria-pressed", String(bgmEnabled));
  el.bgmToggle.setAttribute("aria-label", bgmEnabled ? "BGMを止める" : "BGMを流す");
  el.bgmToggle.title = bgmEnabled ? "BGMを止める" : "BGMを流す";
  el.bgmToggle.innerHTML = `
    <span class="bgm-icon" aria-hidden="true">♪</span>
    <span class="bgm-copy">BGM ${bgmEnabled ? "オン" : "オフ"}</span>
  `;
}

function startBgm() {
  bgmEnabled = true;

  if (bgmTracks.length) {
    playRandomBgmTrack();
    setBgmButtonState();
    return;
  }

  if (bgmEnabled) {
    const AudioEngine = window.AudioContext || window.webkitAudioContext;
    if (!AudioEngine) {
      bgmEnabled = false;
      el.bgmToggle.innerHTML = "<span class=\"bgm-icon\" aria-hidden=\"true\">♪</span><span class=\"bgm-copy\">BGM なし</span>";
      el.bgmToggle.disabled = true;
      return;
    }
    audioContext = audioContext || new AudioEngine();
    audioContext.resume();
    playBgmStep();
    if (!bgmTimer) bgmTimer = window.setInterval(playBgmStep, 360);
  }
  setBgmButtonState();
}

function stopBgm() {
  bgmEnabled = false;
  if (bgmAudio) {
    bgmAudio.pause();
    bgmAudio.currentTime = 0;
  }
  window.clearInterval(bgmTimer);
  bgmTimer = null;
  setBgmButtonState();
}

function toggleBgm() {
  if (bgmEnabled) stopBgm();
  else startBgm();
}

function resumeBgmAfterGesture() {
  if (bgmEnabled && bgmTracks.length && bgmAudio && bgmAudio.paused) {
    bgmAudio.play().catch(() => {});
    return;
  }
  if (!bgmEnabled || !audioContext || audioContext.state !== "suspended") return;
  audioContext.resume();
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderUnitText(value) {
  return escapeHtml(value).replace(/時間/g, "<ruby>時間<rt>じかん</rt></ruby>");
}

function todayKey() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function todayDailyProgress() {
  const key = todayKey();
  progress.daily = progress.daily || {};
  progress.daily[key] = progress.daily[key] || { multiply: false, divide: false };
  return progress.daily[key];
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
  const reviewCount = progress.wrong.length;
  el.reviewMode.innerHTML = `<ruby>復習<rt>ふくしゅう</rt></ruby>${reviewCount ? `<span class="review-count">${reviewCount}</span>` : ""}`;
  const dailyDone = todayDailyProgress();
  const dailyCount = Number(dailyDone.multiply) + Number(dailyDone.divide);
  el.dailyMode.innerHTML = `<ruby>毎日<rt>まいにち</rt></ruby>${dailyCount ? `<span class="daily-count">${dailyCount}/2</span>` : ""}`;
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
        <div class="question-text">${renderUnitText(currentQuestion.prompt)}</div>
        ${renderRoundProgress(currentQuestion.topic)}
      </div>
      <div class="feedback-panel choice-panel">
        <div class="big-result"><ruby>答<rt>こた</rt></ruby>えを<ruby>選<rt>えら</rt></ruby>んでね。</div>
        <div class="choices">
          ${currentQuestion.choices.map((choice) => `<button class="answer-button" data-answer="${escapeHtml(choice)}" type="button">${renderUnitText(choice)}</button>`).join("")}
        </div>
      </div>
    </div>
  `;
}

function visualScene(question) {
  const topicId = question.topic.id;
  const color = question.topic.color;
  const factText = question.fact.join(" ");
  let title = "絵で考えよう";
  let subtitle = "答えは絵の中にはかかないよ";
  let drawing = "";

  if (topicId === "length") {
    if (factText.includes("km")) {
      title = "遠い道の長さ";
      subtitle = "キロメートルは長い道で考える";
      drawing = `<path d="M0 240c74-44 134-52 202-24s121 23 192-26 121-64 186-46v176H0z" fill="${color}" opacity=".22"/><path d="M58 280c112-92 206-55 286-102 55-32 100-50 168-36" fill="none" stroke="#fff" stroke-width="30" stroke-linecap="round"/><path d="M58 280c112-92 206-55 286-102 55-32 100-50 168-36" fill="none" stroke="${color}" stroke-width="7" stroke-linecap="round" stroke-dasharray="16 16"/><path d="M92 118l42-48 42 48zM388 94l54-62 54 62z" fill="${color}" opacity=".55"/>`;
    } else if (factText.includes("mm")) {
      title = "とても短い長さ";
      subtitle = "ミリメートルは小さいめもりで見る";
      drawing = `<rect x="72" y="168" width="430" height="44" rx="10" fill="#fff" stroke="${color}" stroke-width="5"/><path d="M102 168v44M132 168v24M162 168v44M192 168v24M222 168v44M252 168v24M282 168v44M312 168v24M342 168v44M372 168v24M402 168v44M432 168v24M462 168v44" stroke="${color}" stroke-width="4"/><path d="M116 126h260l52 28-52 28H116z" fill="#fff8e8" stroke="#f2b84b" stroke-width="5"/>`;
    } else {
      title = "身近な長さ";
      subtitle = "メートルとセンチメートルをくらべる";
      drawing = `<rect x="110" y="94" width="118" height="174" rx="14" fill="#fff" stroke="${color}" stroke-width="6"/><circle cx="198" cy="176" r="5" fill="${color}"/><rect x="302" y="110" width="44" height="156" rx="8" fill="#fff" stroke="#f2b84b" stroke-width="5"/><path d="M302 132h44M302 154h30M302 176h44M302 198h30M302 220h44M302 242h30" stroke="#f2b84b" stroke-width="4"/>`;
    }
  } else if (topicId === "weight") {
    if (factText.includes("t")) {
      title = "とても重いもの";
      subtitle = "トンは車や大きな荷物で考える";
      drawing = `<rect x="96" y="148" width="248" height="82" rx="10" fill="#fff" stroke="${color}" stroke-width="6"/><rect x="344" y="176" width="94" height="54" rx="8" fill="#fff" stroke="${color}" stroke-width="6"/><circle cx="162" cy="244" r="25" fill="${color}"/><circle cx="386" cy="244" r="25" fill="${color}"/><path d="M128 126h164v42H128z" fill="#f7fbfc" stroke="#f2b84b" stroke-width="5"/>`;
    } else if (factText.includes("mg")) {
      title = "小さな重さ";
      subtitle = "ミリグラムは少しの粉や薬で考える";
      drawing = `<path d="M290 102v98" stroke="${color}" stroke-width="8" stroke-linecap="round"/><path d="M170 142h240" stroke="${color}" stroke-width="8" stroke-linecap="round"/><path d="M210 142l-54 80h108zM370 142l-54 80h108z" fill="#fff" stroke="${color}" stroke-width="5"/><circle cx="208" cy="186" r="10" fill="#f2b84b"/><circle cx="232" cy="198" r="7" fill="#f2b84b"/><circle cx="346" cy="194" r="5" fill="#f2b84b"/>`;
    } else {
      title = "はかりで重さを見る";
      subtitle = "キログラムとグラムをくらべる";
      drawing = `<rect x="160" y="180" width="260" height="80" rx="18" fill="#fff" stroke="${color}" stroke-width="6"/><circle cx="290" cy="178" r="70" fill="#fff" stroke="${color}" stroke-width="6"/><path d="M290 178l42-28" stroke="#31506b" stroke-width="8" stroke-linecap="round"/><path d="M206 116h82v50h-82zM318 126h58v40h-58z" fill="#fff8e8" stroke="#f2b84b" stroke-width="5"/>`;
    }
  } else if (topicId === "time") {
    if (factText.includes("日")) {
      title = "日の流れ";
      subtitle = "日と時間は朝から夜までで考える";
      drawing = `<circle cx="150" cy="150" r="54" fill="#f2b84b"/><path d="M402 108a58 58 0 1 0 52 96 72 72 0 1 1-52-96z" fill="${color}" opacity=".72"/><rect x="220" y="118" width="112" height="118" rx="12" fill="#fff" stroke="${color}" stroke-width="5"/><path d="M220 154h112M248 118v-24M304 118v-24" stroke="${color}" stroke-width="5" stroke-linecap="round"/>`;
    } else if (factText.includes("時間")) {
      title = "時計で考える";
      subtitle = "時間は時計の大きなまとまり";
      drawing = `<circle cx="290" cy="170" r="86" fill="#fff" stroke="${color}" stroke-width="8"/><path d="M290 112v62l48 34" fill="none" stroke="#31506b" stroke-width="9" stroke-linecap="round"/><path d="M290 74v28M290 238v28M194 170h28M358 170h28" stroke="#f2b84b" stroke-width="7" stroke-linecap="round"/>`;
    } else {
      title = "短い時間をはかる";
      subtitle = "分と秒はストップウォッチで考える";
      drawing = `<circle cx="290" cy="178" r="82" fill="#fff" stroke="${color}" stroke-width="8"/><rect x="258" y="68" width="64" height="32" rx="8" fill="#fff" stroke="${color}" stroke-width="6"/><path d="M290 178v-52M290 178l38 32" stroke="#31506b" stroke-width="9" stroke-linecap="round"/><path d="M178 178h28M374 178h28M290 66v34" stroke="#f2b84b" stroke-width="7" stroke-linecap="round"/>`;
    }
  } else if (topicId === "capacity") {
    if (factText.includes("kL")) {
      title = "大きな水の入れもの";
      subtitle = "キロリットルは大きなタンクで考える";
      drawing = `<ellipse cx="290" cy="110" rx="128" ry="38" fill="#fff" stroke="${color}" stroke-width="6"/><path d="M162 110v128c0 22 58 40 128 40s128-18 128-40V110" fill="#fff" stroke="${color}" stroke-width="6"/><path d="M176 188c54 30 174 30 228 0v52c-46 32-184 32-228 0z" fill="${color}" opacity=".22"/>`;
    } else if (factText.includes("mL")) {
      title = "細かくはかる";
      subtitle = "ミリリットルはめもりで考える";
      drawing = `<path d="M210 88h160l-22 184H232z" fill="#fff" stroke="${color}" stroke-width="6"/><path d="M236 224h108v46H242z" fill="${color}" opacity=".24"/><path d="M248 124h76M248 154h54M248 184h76M248 214h54" stroke="#f2b84b" stroke-width="5" stroke-linecap="round"/>`;
    } else {
      title = "飲みもののかさ";
      subtitle = "リットルとデシリットルをくらべる";
      drawing = `<path d="M152 102h98l-10 166h-78z" fill="#fff" stroke="${color}" stroke-width="6"/><path d="M330 136h86v118a43 43 0 0 1-86 0z" fill="#fff" stroke="${color}" stroke-width="6"/><path d="M416 168h38v56h-38" fill="none" stroke="${color}" stroke-width="6"/><path d="M162 206h78v62h-78zM336 214h74v58h-74z" fill="${color}" opacity=".22"/>`;
    }
  } else if (topicId === "area") {
    if (factText.includes("ha") || factText.includes("km²") || factText.includes("a")) {
      title = "広い土地の面積";
      subtitle = "畑や公園の広さで考える";
      drawing = `<path d="M62 246l170-118 292 86-176 76z" fill="${color}" opacity=".25" stroke="${color}" stroke-width="5"/><path d="M140 226l168-66M222 264l170-76M232 128l116 160M328 158l116 96" stroke="#fff" stroke-width="5"/><path d="M96 118h78v70H96zM404 92h88v78h-88z" fill="#fff8e8" stroke="#f2b84b" stroke-width="5"/>`;
    } else {
      title = "正方形で広さを見る";
      subtitle = "小さいますをしきつめて考える";
      drawing = `<rect x="150" y="96" width="280" height="180" rx="8" fill="#fff" stroke="${color}" stroke-width="6"/><path d="M206 96v180M262 96v180M318 96v180M374 96v180M150 141h280M150 186h280M150 231h280" stroke="${color}" stroke-width="4" opacity=".55"/>`;
    }
  } else if (topicId === "volume") {
    title = "箱の中の大きさ";
    subtitle = "小さい立方体をつめて考える";
    drawing = `<path d="M190 142l100-58 100 58-100 58z" fill="#fff" stroke="${color}" stroke-width="6"/><path d="M190 142v92l100 58 100-58v-92" fill="none" stroke="${color}" stroke-width="6"/><path d="M290 200v92M232 166l100-58M252 178l100-58M212 154l100-58M230 256l100-58M270 280l100-58" stroke="${color}" stroke-width="4" opacity=".52"/><path d="M190 190l100 58 100-58" stroke="#f2b84b" stroke-width="5" opacity=".75"/>`;
  } else {
    drawing = `<circle cx="290" cy="176" r="86" fill="#fff" stroke="${color}" stroke-width="7"/><path d="M224 176h132" stroke="#f2b84b" stroke-width="10" stroke-linecap="round"/><path d="M356 176l-24-18v36z" fill="#f2b84b"/>`;
  }

  const titleText = escapeHtml(title);
  const subtitleText = escapeHtml(subtitle);

  return `
    <div class="unit-picture" style="--picture-color:${color}">
      <svg viewBox="0 0 580 320" role="img" aria-label="${titleText}">
        <rect x="0" y="0" width="580" height="320" rx="18" fill="#f7fbfc"/>
        <circle cx="64" cy="56" r="48" fill="${color}" opacity=".14"/>
        <circle cx="522" cy="268" r="64" fill="#f2b84b" opacity=".14"/>
        <text x="34" y="48" font-size="23" font-weight="900" fill="#21303d">${titleText}</text>
        <text x="34" y="78" font-size="16" font-weight="800" fill="#627182">${subtitleText}</text>
        ${drawing}
      </svg>
    </div>
  `;
}

function renderVisualQuiz() {
  currentQuestion = makeQuestion(activeTopicId, false);
  acceptingAnswer = true;

  if (!currentQuestion) {
    el.gameArea.innerHTML = "<div class=\"empty-state\"><div>絵で見る問題がありません。</div></div>";
    return;
  }

  el.gameArea.innerHTML = `
    <div class="visual-layout">
      <div class="visual-panel">
        <div class="topic-label" style="background:${currentQuestion.topic.color}22;color:${currentQuestion.topic.color}">
          ${topicTitle(currentQuestion.topic)}
        </div>
        ${visualScene(currentQuestion)}
        ${renderRoundProgress(currentQuestion.topic)}
      </div>
      <div class="feedback-panel choice-panel">
        <div class="big-result">${renderUnitText(currentQuestion.prompt)}</div>
        <div class="choices">
          ${currentQuestion.choices.map((choice) => `<button class="answer-button" data-answer="${escapeHtml(choice)}" type="button">${renderUnitText(choice)}</button>`).join("")}
        </div>
      </div>
    </div>
  `;
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function numberByDigits(digits) {
  if (digits === 3) return randomInt(100, 999);
  return randomInt(10, 99);
}

function choiceNumbers(answer) {
  const options = new Set([answer]);
  const spread = Math.max(6, Math.round(Math.abs(answer) * 0.12));
  while (options.size < 4) {
    const offset = randomInt(-spread, spread);
    const candidate = answer + offset || answer + randomInt(2, 9);
    if (candidate > 0 && candidate !== answer) options.add(candidate);
  }
  return shuffle([...options]).map(String);
}

function makeDailyQuestion(operation = dailyOperation) {
  if (operation === "divide") {
    const divisorDigits = Number(dailySettings.divisorDigits) === 2 ? 2 : 1;
    let divisor = divisorDigits === 2 ? randomInt(10, 99) : randomInt(2, 9);
    let answer = randomInt(2, 99);
    let dividend = divisor * answer;
    while (dividend < 10 || dividend > 999) {
      divisor = divisorDigits === 2 ? randomInt(10, 99) : randomInt(2, 9);
      answer = randomInt(2, 99);
      dividend = divisor * answer;
    }
    return {
      operation,
      prompt: `${dividend} ÷ ${divisor} = ?`,
      answer: String(answer),
      choices: choiceNumbers(answer),
      formula: `${dividend} ÷ ${divisor} = ${answer}`,
      hint: `${divisor} × ${answer} = ${dividend} になるから、答えは ${answer} です。`
    };
  }

  const [leftDigits, rightDigits] = dailySettings.multiplyDigits === "3x2" ? [3, 2] : [2, 2];
  const left = numberByDigits(leftDigits);
  const right = numberByDigits(rightDigits);
  const answer = left * right;
  return {
    operation,
    prompt: `${left} × ${right} = ?`,
    answer: String(answer),
    choices: choiceNumbers(answer),
    formula: `${left} × ${right} = ${answer}`,
    hint: `${left} を ${right} こ分あわせると ${answer} です。くらいをそろえて計算しよう。`
  };
}

function operationLabel(operation) {
  return operation === "divide" ? "わり算" : "かけ算";
}

function renderDailyChallenge(operation = dailyOperation) {
  dailyOperation = operation;
  acceptingAnswer = true;
  const done = todayDailyProgress();
  const allDone = done.multiply && done.divide;

  if (allDone) {
    dailyQuestion = null;
    el.gameArea.innerHTML = `
      <div class="daily-complete-panel">
        <div class="finish-sparkles" aria-hidden="true"><span></span><span></span><span></span><span></span></div>
        <p class="eyebrow"><ruby>今日<rt>きょう</rt></ruby>のチャレンジ</p>
        <h2><ruby>全部<rt>ぜんぶ</rt></ruby>できたよ！</h2>
        <p>かけ算もわり算もクリア。すばらしい集中力です。</p>
      </div>
    `;
    return;
  }

  dailyQuestion = makeDailyQuestion(dailyOperation);
  const currentDone = done[dailyOperation];
  const operationButton = (op, label) => `
    <button class="daily-choice${dailyOperation === op ? " active" : ""}${done[op] ? " done" : ""}" data-daily-op="${op}" type="button">
      <span>${label}</span>
      ${done[op] ? "<small>OK</small>" : ""}
    </button>
  `;
  const settingButton = (name, value, label) => `
    <button class="daily-choice${String(dailySettings[name]) === String(value) ? " active" : ""}" data-daily-setting="${name}" data-daily-value="${value}" type="button">${label}</button>
  `;

  el.gameArea.innerHTML = `
    <div class="daily-layout">
      <section class="daily-panel">
        <div class="topic-label"><ruby>毎日<rt>まいにち</rt></ruby>チャレンジ</div>
        <h2>${operationLabel(dailyOperation)}</h2>
        <div class="daily-toolbar">
          <div class="daily-control">
            <span>今日の問題</span>
            <div class="daily-segment">
              ${operationButton("multiply", "かけ算")}
              ${operationButton("divide", "わり算")}
            </div>
          </div>
          <div class="daily-control">
            <span>${dailyOperation === "divide" ? "わる数" : "かける数"}</span>
            <div class="daily-segment">
              ${dailyOperation === "divide"
                ? `${settingButton("divisorDigits", 1, "1けた")}${settingButton("divisorDigits", 2, "2けた")}`
                : `${settingButton("multiplyDigits", "2x2", "2けた × 2けた")}${settingButton("multiplyDigits", "3x2", "3けた × 2けた")}`}
            </div>
          </div>
        </div>
        <p class="daily-note">${currentDone ? "これはもうクリア済み。もう一度練習してもOK。" : "正解したら今日のこの問題はクリアです。"}</p>
      </section>
      <section class="feedback-panel choice-panel">
        <div class="big-result">${escapeHtml(dailyQuestion.prompt)}</div>
        <div class="choices">
          ${dailyQuestion.choices.map((choice) => `<button class="answer-button" data-daily-answer="${escapeHtml(choice)}" type="button">${escapeHtml(choice)}</button>`).join("")}
        </div>
      </section>
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
  refreshVisibleRoundProgress();
  showAnswerDialog(isCorrect, value);
}

function refreshVisibleRoundProgress() {
  if (!currentQuestion) return;
  const progressStack = el.gameArea.querySelector(".progress-stack");
  if (progressStack) progressStack.outerHTML = renderRoundProgress(currentQuestion.topic);
}

function uniqueMatchFacts(topic) {
  const usedCardText = new Set();
  const facts = [];

  shuffle(topic.facts).forEach((fact) => {
    const left = normalizeAnswer(fact[0]);
    const right = normalizeAnswer(fact[1]);
    if (usedCardText.has(left) || usedCardText.has(right)) return;
    usedCardText.add(left);
    usedCardText.add(right);
    facts.push(fact);
  });

  return facts;
}

function renderAnswerProgress(isCorrect) {
  const pct = Math.round((round.answered / round.total) * 100);
  const status = isCorrect
    ? "スターが 1 こ ふえたよ"
    : "だいじょうぶ。考え方を見て次へ進もう";

  return `
    <div class="answer-progress ${isCorrect ? "is-correct" : "is-wrong"}" aria-label="今日の進み具合">
      <div class="progress-celebration">
        <span class="progress-star" aria-hidden="true">★</span>
        <div>
          <strong>${round.answered}/${round.total}</strong>
          <span>${status}</span>
        </div>
      </div>
      <div class="answer-progress-track">
        <span style="width:${pct}%"></span>
      </div>
      <div class="progress-mini-stats">
        <span>スター ${progress.stars}</span>
        <span>れんぞく ${progress.streak}</span>
      </div>
    </div>
  `;
}

function celebrationMascot() {
  return `
    <div class="celebration-mascot" aria-hidden="true">
      <span class="mascot-ear left"></span>
      <span class="mascot-ear right"></span>
      <span class="mascot-face">
        <span class="mascot-eye left"></span>
        <span class="mascot-eye right"></span>
        <span class="mascot-mouth"></span>
      </span>
      <span class="mascot-arm left"></span>
      <span class="mascot-arm right"></span>
    </div>
  `;
}

function showAnswerDialog(isCorrect, selectedAnswer) {
  const complete = round.answered >= round.total;
  const title = isCorrect
    ? "<ruby>正解<rt>せいかい</rt></ruby>！"
    : "ここで<ruby>確認<rt>かくにん</rt></ruby>しよう";
  const lead = isCorrect
    ? "よくできました。どうしてそうなるかも見ておこう。"
    : `えらんだ答えは ${renderUnitText(selectedAnswer)}。正しい答えは ${renderUnitText(currentQuestion.answer)} です。`;
  const completeText = complete
    ? `
      <div class="round-complete celebration-card">
        <div class="finish-sparkles" aria-hidden="true"><span></span><span></span><span></span><span></span></div>
        ${celebrationMascot()}
        <strong>10問チャレンジ達成！</strong>
        <span>最後までよくがんばりました。次はまた 1問目から始まるよ。</span>
      </div>
    `
    : "";

  const dialog = document.createElement("div");
  dialog.className = "answer-dialog-backdrop";
  dialog.innerHTML = `
    <section class="answer-dialog ${isCorrect ? "is-correct" : "is-wrong"}" role="dialog" aria-modal="true" aria-label="答えの説明">
      <div class="dialog-badge">${isCorrect ? "OK" : "CHECK"}</div>
      <h3>${title}</h3>
      <p class="dialog-lead">${lead}</p>
      ${renderAnswerProgress(isCorrect)}
      <div class="reason-box">
        <small>正しい考え方</small>
        <strong>${renderUnitText(currentQuestion.formula)}</strong>
        <span>${renderUnitText(currentQuestion.hint)}</span>
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
  if (mode === "daily") {
    const done = todayDailyProgress();
    if (done.multiply && !done.divide) dailyOperation = "divide";
    if (!done.multiply && done.divide) dailyOperation = "multiply";
    renderDailyChallenge(dailyOperation);
    return;
  }
  if (round.answered >= round.total) round.answered = 0;
  if (mode === "visual") renderVisualQuiz();
  else renderQuiz(mode === "review");
}

function answerDailyQuestion(value) {
  if (!dailyQuestion || !acceptingAnswer) return;
  acceptingAnswer = false;

  const isCorrect = String(value) === dailyQuestion.answer;
  const buttons = document.querySelectorAll("[data-daily-answer]");
  buttons.forEach((button) => {
    if (button.dataset.dailyAnswer === dailyQuestion.answer) button.classList.add("correct");
    if (button.dataset.dailyAnswer === value && !isCorrect) button.classList.add("wrong");
    button.disabled = true;
  });

  if (isCorrect) {
    progress.streak += 1;
    progress.stars += 2;
    todayDailyProgress()[dailyQuestion.operation] = true;
  } else {
    progress.streak = 0;
  }

  saveProgress();
  renderShell();
  showDailyDialog(isCorrect, value);
}

function showDailyDialog(isCorrect, selectedAnswer) {
  const done = todayDailyProgress();
  const allDone = done.multiply && done.divide;
  const title = isCorrect
    ? "<ruby>正解<rt>せいかい</rt></ruby>！"
    : "もう<ruby>一度<rt>いちど</rt></ruby>ためそう";
  const lead = isCorrect
    ? `${operationLabel(dailyQuestion.operation)}クリア。今日の力がついています。`
    : `えらんだ答えは ${escapeHtml(selectedAnswer)}。正しい答えは ${escapeHtml(dailyQuestion.answer)} です。`;
  const completeText = allDone
    ? `
      <div class="round-complete celebration-card">
        <div class="finish-sparkles" aria-hidden="true"><span></span><span></span><span></span><span></span></div>
        ${celebrationMascot()}
        <strong>今日の毎日チャレンジ達成！</strong>
        <span>かけ算もわり算もクリア。よくできました。</span>
      </div>
    `
    : "";

  const dialog = document.createElement("div");
  dialog.className = "answer-dialog-backdrop";
  dialog.innerHTML = `
    <section class="answer-dialog ${isCorrect ? "is-correct" : "is-wrong"}" role="dialog" aria-modal="true" aria-label="答えの説明">
      <div class="dialog-badge">${isCorrect ? "OK" : "CHECK"}</div>
      <h3>${title}</h3>
      <p class="dialog-lead">${lead}</p>
      <div class="reason-box">
        <small>正しい考え方</small>
        <strong>${escapeHtml(dailyQuestion.formula)}</strong>
        <span>${escapeHtml(dailyQuestion.hint)}</span>
      </div>
      ${completeText}
      <button class="primary-button next-question" data-daily-next="${isCorrect ? "done" : "retry"}" type="button">${isCorrect ? "つぎへ" : "もう一問"}</button>
    </section>
  `;
  document.body.appendChild(dialog);
  dialog.querySelector(".next-question").focus();
}

function renderMatch() {
  const topic = topicById(activeTopicId);
  matchPairs = uniqueMatchFacts(topic).slice(0, 4).map((fact, index) => ({
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
            ${renderUnitText(card.text)}
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
    renderMatchBoard(done ? "<ruby>全部<rt>ぜんぶ</rt></ruby>ペアになったよ！" : renderUnitText(pair.hint));
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
  el.visualMode.classList.toggle("active", mode === "visual");
  el.dailyMode.classList.toggle("active", mode === "daily");
  el.reviewMode.classList.toggle("active", mode === "review");

  if (mode === "match") renderMatch();
  else if (mode === "visual") renderVisualQuiz();
  else if (mode === "daily") renderDailyChallenge(dailyOperation);
  else renderQuiz(mode === "review");
}

el.topicTabs.addEventListener("click", (event) => {
  const button = event.target.closest("[data-topic]");
  if (!button) return;
  activeTopicId = button.dataset.topic;
  round.answered = 0;
  renderShell();
  setMode(mode === "daily" ? "quiz" : mode);
});

el.topicGrid.addEventListener("click", (event) => {
  const button = event.target.closest("[data-topic]");
  if (!button) return;
  activeTopicId = button.dataset.topic;
  round.answered = 0;
  renderShell();
  setMode(mode === "daily" ? "quiz" : mode);
  window.scrollTo({ top: 0, behavior: "smooth" });
});

el.gameArea.addEventListener("click", (event) => {
  const answer = event.target.closest("[data-answer]");
  if (answer) answerQuestion(answer.dataset.answer);

  const dailyAnswer = event.target.closest("[data-daily-answer]");
  if (dailyAnswer) answerDailyQuestion(dailyAnswer.dataset.dailyAnswer);

  const dailyOp = event.target.closest("[data-daily-op]");
  if (dailyOp) renderDailyChallenge(dailyOp.dataset.dailyOp);

  const dailySetting = event.target.closest("[data-daily-setting]");
  if (dailySetting) {
    const name = dailySetting.dataset.dailySetting;
    const value = dailySetting.dataset.dailyValue;
    dailySettings[name] = name === "divisorDigits" ? Number(value) : value;
    renderDailyChallenge(dailyOperation);
  }

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
el.visualMode.addEventListener("click", () => setMode("visual"));
el.dailyMode.addEventListener("click", () => setMode("daily"));
el.reviewMode.addEventListener("click", () => setMode("review"));
el.resetProgress.addEventListener("click", () => {
  progress = { stars: 0, streak: 0, mastered: {}, wrong: [], daily: {} };
  round.answered = 0;
  saveProgress();
  renderShell();
  setMode(mode);
});
el.bgmToggle.addEventListener("click", toggleBgm);
document.addEventListener("pointerdown", resumeBgmAfterGesture, { passive: true });

renderShell();
setMode("quiz");
loadLocalBgmTracks().finally(() => {
  setBgmButtonState();
  startBgm();
});
