// packages/common-api/src/speech/recognition.ts
var DEFAULT_CONFIG = {
  lang: "ja-JP",
  continuous: false,
  interimResults: true,
  maxAlternatives: 5
};
function getSpeechRecognition() {
  if (typeof window === "undefined") return void 0;
  return window.SpeechRecognition || window.webkitSpeechRecognition;
}
function isSpeechSupported() {
  return getSpeechRecognition() !== void 0;
}
function createRecognizer(config = {}, callback) {
  const SR = getSpeechRecognition();
  if (!SR) {
    callback({
      kind: "error",
      data: { type: "unsupported", message: "SpeechRecognition API no est\xE1 disponible en este navegador" }
    });
    return { start() {
    }, stop() {
    }, abort() {
    } };
  }
  const recognition = new SR();
  const cfg = { ...DEFAULT_CONFIG, ...config };
  recognition.lang = cfg.lang;
  recognition.continuous = cfg.continuous;
  recognition.interimResults = cfg.interimResults;
  recognition.maxAlternatives = cfg.maxAlternatives;
  recognition.onresult = (event) => {
    const result = event.results[event.resultIndex];
    const alternatives = Array.from(result).map((alt) => ({
      transcript: alt.transcript,
      confidence: alt.confidence
    }));
    callback({
      kind: "result",
      data: { alternatives, isFinal: result.isFinal }
    });
  };
  recognition.onerror = (event) => {
    let type;
    switch (event.error) {
      case "no-speech":
        type = "no-speech";
        break;
      case "not-allowed":
        type = "not-allowed";
        break;
      case "network":
        type = "network";
        break;
      default:
        type = "network";
    }
    callback({ kind: "error", data: { type, message: event.message || event.error } });
  };
  recognition.onend = () => {
    callback({ kind: "end" });
  };
  return {
    start() {
      recognition.start();
    },
    stop() {
      recognition.stop();
    },
    abort() {
      recognition.abort();
    }
  };
}

// packages/common-api/src/speech/normalize.ts
function normalizeAlternatives(alternatives) {
  return alternatives.map((alt) => ({
    raw: alt.transcript,
    normalized: alt.transcript.trim().toLowerCase(),
    confidence: alt.confidence
  }));
}
function matchesAny(alternatives, accepted) {
  const normalizedAccepted = accepted.map((a) => a.trim().toLowerCase());
  for (const alt of alternatives) {
    const match = normalizedAccepted.some((a) => alt.normalized.includes(a));
    if (match) {
      return { matched: true, best: alt };
    }
  }
  const best = alternatives.reduce(
    (best2, curr) => !best2 || curr.confidence > best2.confidence ? curr : best2,
    null
  );
  return { matched: false, best };
}

// packages/common-api/src/speech/index.ts
var Koe = class {
  static async checkCompatibility() {
    let micPermission = "unknown";
    if (typeof navigator !== "undefined" && "permissions" in navigator) {
      try {
        const status = await navigator.permissions.query({ name: "microphone" });
        micPermission = status.state;
      } catch {
        micPermission = "unknown";
      }
    }
    return {
      supported: isSpeechSupported(),
      secureContext: typeof location === "undefined" || location.protocol === "https:" || location.hostname === "localhost",
      online: typeof navigator === "undefined" || navigator.onLine,
      micPermission
    };
  }
  constructor(callbacks = {}) {
    this.callbacks = callbacks;
    this._listening = false;
    this._gotResult = false;
    this._recognition = null;
    this._watchdog = null;
    this._sessionId = 0;
  }
  static isSupported() {
    return isSpeechSupported();
  }
  get listening() {
    return this._listening;
  }
  requestMicrophone() {
    try {
      return navigator.mediaDevices.getUserMedia({ audio: true }).then(function() { return true });
    } catch {
      return Promise.resolve(false);
    }
  }
  listen(onResult, onListeningChange, onEnd) {
    if (this._listening) return;
    this._listening = true;
    this._gotResult = false;
    this._recognition = null;
    var self = this;
    var sessionId = ++this._sessionId;
    if (onListeningChange) onListeningChange(true);
    var r = createRecognizer(
      { lang: "ja-JP", continuous: false, interimResults: false, maxAlternatives: 5 },
      function(event) {
        if (event.kind !== "error" && self._recognition !== r) return;
        switch (event.kind) {
          case "result": {
            if (!event.data.isFinal) return;
            clearTimeout(self._watchdog);
            self._gotResult = true;
            self._listening = false;
            self._recognition = null;
            if (onListeningChange) onListeningChange(false);
            var candidates = event.data.alternatives.map(function(alt, i) {
              return { transcript: alt.transcript.trim(), confidence: alt.confidence, position: i };
            });
            onResult(candidates);
            break;
          }
          case "error": {
            clearTimeout(self._watchdog);
            self._listening = false;
            self._recognition = null;
            if (onListeningChange) onListeningChange(false);
            break;
          }
          case "end": {
            if (self._sessionId !== sessionId) return;
            clearTimeout(self._watchdog);
            self._listening = false;
            self._recognition = null;
            if (onListeningChange) onListeningChange(false);
            if (!self._gotResult && onEnd) onEnd();
            break;
          }
        }
      }
    );
    this._recognition = r;
    clearTimeout(this._watchdog);
    this._watchdog = setTimeout(function() {
      if (self._gotResult || !self._listening || self._sessionId !== sessionId) return;
      if (self._recognition) { try { self._recognition.abort(); } catch (e) {} }
      self._recognition = null;
      if (self._listening) {
        self._listening = false;
        if (onListeningChange) onListeningChange(false);
        if (onEnd) onEnd();
      }
    }, 20000);
    r.start();
  }
  cancel() {
    clearTimeout(this._watchdog);
    this._listening = false;
    this._gotResult = false;
    if (this._recognition) { try { this._recognition.abort(); } catch (e) {} }
    this._recognition = null;
  }
};

// packages/game/src/random.ts
function shuffleFisherYates(array) {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
function weightedPick(items) {
  const totalWeight = items.reduce((sum, { weight }) => sum + weight, 0);
  let r = Math.random() * totalWeight;
  for (const { item, weight } of items) {
    r -= weight;
    if (r <= 0) return item;
  }
  return items[items.length - 1].item;
}

// packages/game/src/score.ts
function calculateExercisePoints(difficulty, accuracy) {
  const base = difficulty * 10;
  const multiplier = accuracy >= 0.9 ? 1.5 : 1;
  return Math.round(base * multiplier);
}

// packages/game/src/achievements.ts
function calculateStars(averageAccuracy, thresholds = [0, 70, 90]) {
  let stars = 0;
  for (const t of thresholds) {
    if (averageAccuracy * 100 >= t) stars++;
    else break;
  }
  return Math.min(stars, thresholds.length);
}
function evaluateAchievements(playerState, achievements, unlockedIds) {
  return achievements.filter(
    (a) => !unlockedIds.includes(a.id) && a.condition(playerState)
  );
}

// packages/game/src/evaluate.ts
var FEEDBACK = {
  choiceCorrect: "\xA1Respuesta correcta!",
  choiceWrong: "Respuesta incorrecta.",
  textExact: "\xA1Coincide exactamente!",
  textPartial: "Casi\u2026 revisa la ortograf\xEDa.",
  textWrong: "No coincide. Revisa el material.",
  speechCorrect: "\xA1Pronunciaci\xF3n correcta!",
  speechPartial: "Pronunciaci\xF3n aceptable, pero puedes mejorar.",
  speechWrong: "No se reconoci\xF3 la palabra. Intenta de nuevo."
};
function normalize(text) {
  return text.trim().toLowerCase();
}
function evaluateChoice(correct, playerAnswer) {
  const match = normalize(playerAnswer) === normalize(correct);
  return {
    correct: match,
    accuracy: match ? 1 : 0,
    type: "choice",
    feedback: match ? FEEDBACK.choiceCorrect : FEEDBACK.choiceWrong
  };
}
function evaluateText(accepted, playerAnswer) {
  const playerNorm = normalize(playerAnswer);
  const normalizedAccepted = accepted.map(normalize);
  const exactMatch = normalizedAccepted.some((a) => a === playerNorm);
  if (exactMatch) {
    return { correct: true, accuracy: 1, type: "text", feedback: FEEDBACK.textExact };
  }
  const partialMatch = normalizedAccepted.some(
    (a) => a.includes(playerNorm) || playerNorm.includes(a)
  );
  if (partialMatch) {
    return { correct: false, accuracy: 0.5, type: "text", feedback: FEEDBACK.textPartial };
  }
  return { correct: false, accuracy: 0, type: "text", feedback: FEEDBACK.textWrong };
}
function evaluateSpeech(accepted, transcripts) {
  const normalizedAccepted = accepted.map(normalize);
  const normalizedTranscripts = transcripts.map((t) => normalize(t));
  const match = normalizedTranscripts.some(
    (t) => normalizedAccepted.some((a) => t.includes(a))
  );
  if (match) {
    return { correct: true, accuracy: 0.9, type: "speech", feedback: FEEDBACK.speechCorrect };
  }
  const partialMatch = normalizedTranscripts.some(
    (t) => normalizedAccepted.some((a) => a.includes(t) || t.includes(a))
  );
  if (partialMatch) {
    return { correct: false, accuracy: 0.5, type: "speech", feedback: FEEDBACK.speechPartial };
  }
  return { correct: false, accuracy: 0, type: "speech", feedback: FEEDBACK.speechWrong };
}
function evaluateMove(correct, playerAnswer, type) {
  switch (type) {
    case "choice":
      return evaluateChoice(correct, playerAnswer);
    case "text":
      return evaluateText(
        Array.isArray(correct) ? correct : [correct],
        playerAnswer
      );
    case "speech":
      return evaluateSpeech(
        Array.isArray(correct) ? correct : [correct],
        Array.isArray(playerAnswer) ? playerAnswer : [playerAnswer]
      );
  }
}
function processMove(config, state, move) {
  const correct = config.moveType === "choice" ? config.correctAnswer ?? "" : config.accepted ?? [];
  const evaluation = evaluateMove(correct, move.playerAnswer, config.moveType);
  const pointsEarned = calculateExercisePoints(config.difficulty, evaluation.accuracy);
  const totalAccuracy = state.lastAccuracy * state.completedLessons + evaluation.accuracy;
  const newLessonCount = state.completedLessons + (evaluation.correct ? 1 : 0);
  const averageAccuracy = newLessonCount > 0 ? totalAccuracy / newLessonCount : 0;
  const starRating = calculateStars(averageAccuracy, config.starThresholds);
  const updatedState = {
    completedLessons: newLessonCount,
    completedSequences: state.completedSequences,
    level: state.level,
    streak: state.streak,
    perfectLessons: state.perfectLessons + (evaluation.accuracy >= 0.9 ? 1 : 0),
    threeStarLessons: state.threeStarLessons + (starRating >= 3 ? 1 : 0),
    lastAccuracy: averageAccuracy
  };
  const newAchievements = evaluateAchievements(updatedState, [], []);
  return {
    evaluation,
    pointsEarned,
    newAchievements,
    starRating,
    averageAccuracy,
    updatedState
  };
}

// ../.build/bundle-entry.ts
window.KoeGame = {
  Koe,
  isSpeechSupported,
  processMove,
  shuffleFisherYates,
  weightedPick
};
