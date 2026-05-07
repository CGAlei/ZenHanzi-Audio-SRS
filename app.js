/**
 * ZenHanzi - Audio SRS Trainer
 * Refactored Modular Version
 * Engine: Vosk + WebSpeech Fallback
 */

// ============================
// 1. GLOBAL UTILITIES
// ============================
const Utils = {
  $(id) { return document.getElementById(id); },
  safe(fn) { try { fn(); } catch (e) { console.error(e); } },
  normalizeText(text) {
    if (!text) return '';
    return text.toLowerCase().trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\w\s]/g, "");
  },
  shuffleArray(arr) {
    if (!arr || arr.length === 0) return arr;
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  },
  matchMeaning(spoken, validList) {
    return validList.some(valid => {
      if (spoken === valid) return true;
      if (spoken.startsWith(valid + " ")) return true;
      if (spoken.endsWith(" " + valid)) return true;
      return false;
    });
  }
};

window.addEventListener("error", e => {
  console.error("Global error:", e.error);
});
window.addEventListener("unhandledrejection", e => {
  console.error("Unhandled promise rejection:", e.reason);
});

// ============================
// 2. DOM ELEMENTS
// ============================
const dom = {};
document.addEventListener('DOMContentLoaded', () => {
  Object.assign(dom, {
    welcome: Utils.$('welcomeScreen'),
    session: Utils.$('sessionScreen'),
    summary: Utils.$('summaryScreen'),
    continueBtn: Utils.$('continueSrsBtn'),
    newBtn: Utils.$('newWordsBtn'),
    favBtn: Utils.$('favoritesBtn'),
    exportBtn: Utils.$('exportBtn'),
    importBtn: Utils.$('importBtn'),
    importFile: Utils.$('importFile'),
    exitBtn: Utils.$('exitSessionBtn'),
    replayBtn: Utils.$('replayBtn'),
    helpBtn: Utils.$('helpBtn'),
    voiceStatus: Utils.$('voiceStatus'),
    engineBadge: Utils.$('engineBadge'),
    responseContainer: Utils.$('responseButtons'),
    feedback: Utils.$('feedback'),
    hanzi: Utils.$('hanziDisplay'),
    pinyin: Utils.$('pinyinHint'),
    wordCounter: Utils.$('wordCounter'),
    progressFill: Utils.$('progressFill'),
    newSessionBtn: Utils.$('newSessionBtn'),
    dashboardBtn: Utils.$('dashboardBtn'),
    statDue: Utils.$('statDue'),
    statNew: Utils.$('statNew'),
    statFav: Utils.$('statFav'),
    summaryReviewed: Utils.$('summaryReviewed'),
    summaryNew: Utils.$('summaryNew'),
    summaryAccuracy: Utils.$('summaryAccuracy'),
    toast: Utils.$('toast')
  });

  UI.bindEvents();
});

// ============================
// 3. USER INTERFACE (UI)
// ============================
const UI = {
  showToast(message, type = 'info', duration = 3000) {
    if (!dom.toast) return;
    dom.toast.textContent = message;
    dom.toast.className = 'toast show ' + type;
    setTimeout(() => { dom.toast.classList.remove('show'); }, duration);
  },

  updateWelcomeStats(vocabulary, userData) {
    const now = Date.now();
    let due = 0, newWords = 0, fav = 0;
    for (const w of vocabulary) {
      const ud = userData[w.id];
      if (!ud || ud.hidden) continue;
      if (ud.due <= now) due++;
      if (ud.reps === 0) newWords++;
      if (ud.favorited) fav++;
    }
    if (dom.statDue) dom.statDue.textContent = due;
    if (dom.statNew) dom.statNew.textContent = newWords;
    if (dom.statFav) dom.statFav.textContent = fav;
  },

  updateEngineBadge(state, text) {
    if (!dom.engineBadge) return;
    dom.engineBadge.classList.remove('hidden', 'online', 'offline', 'error');
    if (state === 'hidden') {
      dom.engineBadge.classList.add('hidden');
      return;
    }
    dom.engineBadge.classList.add(state);
    dom.engineBadge.textContent = text;
  },

  renderWord(wordObj, sessionIndex, totalWords, onAnswer) {
    if (!dom.hanzi) return;
    dom.hanzi.textContent = wordObj.hanzi;
    dom.pinyin.textContent = wordObj.pinyin;
    dom.wordCounter.textContent = `${sessionIndex + 1} / ${totalWords}`;
    const percent = ((sessionIndex + 1) / totalWords) * 100;
    dom.progressFill.style.width = `${percent}%`;

    const meanings = (wordObj.meaning || '').split(',');
    const correctAnswer = meanings[0] ? meanings[0].trim() : '';
    const distractors = wordObj.distractors && wordObj.distractors.length > 0 
      ? [...wordObj.distractors] 
      : ['correcto', 'incorrecto', 'tal vez'];
    const options = [correctAnswer, ...distractors.slice(0, 3)];
    Utils.shuffleArray(options);

    const fragment = document.createDocumentFragment();
    options.forEach((opt, idx) => {
      const btn = document.createElement('button');
      btn.textContent = opt;
      btn.dataset.index = idx;
      btn.onclick = () => onAnswer(opt, correctAnswer);
      fragment.appendChild(btn);
    });
    dom.responseContainer.replaceChildren(fragment);

    if (dom.helpBtn) {
      if (wordObj.sentenceAudio) {
        dom.helpBtn.classList.remove('hidden', 'disabled');
        dom.helpBtn.disabled = false;
      } else {
        dom.helpBtn.classList.add('hidden');
      }
    }
    
    dom.feedback.classList.add('hidden');
  },

  showFeedback(isCorrect, correctAnswer) {
    if (isCorrect) {
      dom.feedback.textContent = '✅ ¡Correcto!';
      dom.feedback.classList.remove('wrong');
      dom.feedback.classList.add('correct');
    } else {
      dom.feedback.textContent = `❌ Incorrecto. Era: ${correctAnswer}`;
      dom.feedback.classList.remove('correct');
      dom.feedback.classList.add('wrong');
    }
    dom.feedback.classList.remove('hidden');
  },

  bindEvents() {
    if (dom.continueBtn) dom.continueBtn.onclick = () => SessionManager.startSession('srs');
    if (dom.newBtn) dom.newBtn.onclick = () => SessionManager.startSession('new');
    if (dom.favBtn) dom.favBtn.onclick = () => SessionManager.startSession('favorites');
    if (dom.exportBtn) dom.exportBtn.onclick = () => StorageManager.exportProgress();
    if (dom.importBtn) dom.importBtn.onclick = () => dom.importFile.click();
    if (dom.importFile) dom.importFile.onchange = (e) => {
      if (e.target.files[0]) StorageManager.importProgress(e.target.files[0]);
      dom.importFile.value = '';
    };
    if (dom.exitBtn) dom.exitBtn.onclick = () => SessionManager.exitSession();
    if (dom.replayBtn) dom.replayBtn.onclick = () => SessionManager.replayAudio();
    if (dom.helpBtn) dom.helpBtn.onclick = () => SessionManager.playSentenceHelp(false);
    
    const goHome = () => {
      dom.summary.classList.remove('active');
      dom.welcome.classList.add('active');
      UI.updateWelcomeStats(StorageManager.vocabulary, StorageManager.userData);
    };
    if (dom.newSessionBtn) dom.newSessionBtn.onclick = goHome;
    if (dom.dashboardBtn) dom.dashboardBtn.onclick = goHome;

    document.addEventListener('keydown', (e) => {
      if (!dom.session || !dom.session.classList.contains('active')) return;
      if (!SessionManager.awaitingAnswer || SessionManager.isHelpMode) return;
      
      const buttons = dom.responseContainer.querySelectorAll('button');
      if (e.key >= '1' && e.key <= '4') {
        const idx = parseInt(e.key) - 1;
        if (buttons[idx]) {
          buttons[idx].click();
          buttons[idx].classList.add('pressed');
          setTimeout(() => buttons[idx].classList.remove('pressed'), 200);
        }
      } else if (e.key === 'h' || e.key === 'H') {
        if (dom.helpBtn && !dom.helpBtn.classList.contains('hidden')) dom.helpBtn.click();
      } else if (e.key === 'r' || e.key === 'R') {
        if (dom.replayBtn) dom.replayBtn.click();
      } else if (e.key === 'Escape') {
        if (dom.exitBtn) dom.exitBtn.click();
      }
    });

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && AudioEngine.audioContext?.state === 'suspended') {
        Utils.safe(() => AudioEngine.audioContext.resume());
      }
    });

    document.addEventListener('touchend', (e) => {
      if (e.target.tagName === 'BUTTON') {
        e.preventDefault();
        e.target.click();
      }
    }, { passive: false });
  }
};

// ============================
// 4. STORAGE MANAGER
// ============================
const StorageManager = {
  vocabulary: [],
  vocabMap: new Map(),
  userData: {},

  async loadInitialData() {
    try {
      const cached = localStorage.getItem('zenhanzi_vocab_cache');
      const cacheTime = localStorage.getItem('zenhanzi_vocab_cache_time');
      const now = Date.now();

      if (cached && cacheTime && (now - parseInt(cacheTime)) < 86400000) {
        try {
          this.vocabulary = JSON.parse(cached);
          this.buildVocabMap();
          this.loadUserData();
          return true;
        } catch (e) {
          console.warn('Cache parse failed, fetching fresh');
        }
      }

      const res = await fetch('data/vocabulary.json');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      this.vocabulary = await res.json();

      if (!Array.isArray(this.vocabulary) || this.vocabulary.length === 0) {
        throw new Error('Vocabulario vacío o inválido');
      }

      Utils.safe(() => {
        localStorage.setItem('zenhanzi_vocab_cache', JSON.stringify(this.vocabulary));
        localStorage.setItem('zenhanzi_vocab_cache_time', String(now));
      });

      this.buildVocabMap();
      this.loadUserData();
      return true;
    } catch (err) {
      console.error('Error cargando vocabulario:', err);
      UI.showToast('Error cargando vocabulario. Revisa data/vocabulary.json', 'error');
      
      const cached = localStorage.getItem('zenhanzi_vocab_cache');
      if (cached) {
        try {
          this.vocabulary = JSON.parse(cached);
          this.buildVocabMap();
          this.loadUserData();
          UI.showToast('Usando vocabulario en caché', 'info');
          return true;
        } catch (e) { }
      }
      return false;
    }
  },

  buildVocabMap() {
    this.vocabMap.clear();
    for (const word of this.vocabulary) {
      if (word && word.id) this.vocabMap.set(word.id, word);
    }
  },

  loadUserData() {
    try {
      const stored = localStorage.getItem('zenhanzi_userdata');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed && typeof parsed === 'object') this.userData = parsed;
      }
    } catch (e) {
      console.error('Error loading userData, starting fresh', e);
      this.userData = {};
    }

    for (const word of this.vocabulary) {
      if (!this.userData[word.id]) {
        this.userData[word.id] = {
          favorited: word.favorited || false,
          interval: word.interval || 1,
          ease: word.ease || 2.5,
          due: word.due || 0,
          reps: word.reps || 0,
          lapses: word.lapses || 0,
          hidden: word.hidden || false
        };
      }
    }
    this.saveUserData();
  },

  saveUserData() {
    try {
      localStorage.setItem('zenhanzi_userdata', JSON.stringify(this.userData));
    } catch (e) {
      console.error('Storage full or error', e);
      UI.showToast('Error guardando progreso - almacenamiento lleno', 'error');
    }
  },

  exportProgress() {
    try {
      const dataStr = JSON.stringify(this.userData, null, 2);
      const blob = new Blob([dataStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `zenhanzi_backup_${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      UI.showToast('Progreso exportado', 'success');
    } catch (e) {
      console.error('Export error', e);
      UI.showToast('Error al exportar', 'error');
    }
  },

  importProgress(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const imported = JSON.parse(e.target.result);
        if (!imported || typeof imported !== 'object') throw new Error('Formato inválido');
        const keys = Object.keys(imported);
        if (keys.length === 0) throw new Error('Archivo vacío');
        
        const sample = imported[keys[0]];
        if (!sample || typeof sample !== 'object' || !('interval' in sample || 'reps' in sample)) {
          throw new Error('Datos no reconocidos');
        }

        this.userData = { ...this.userData, ...imported };
        this.saveUserData();
        UI.showToast('Progreso importado. Recargando...', 'success');
        setTimeout(() => location.reload(), 1500);
      } catch (err) {
        console.error('Import error', err);
        UI.showToast('Archivo inválido: ' + err.message, 'error');
      }
    };
    reader.onerror = () => UI.showToast('Error leyendo archivo', 'error');
    reader.readAsText(file);
  }
};

// ============================
// 5. AUDIO ENGINE
// ============================
const AudioEngine = {
  currentAudio: null,
  audioFeedbackContext: null,
  audioContext: null,

  cleanup() {
    if (this.currentAudio) {
      this.currentAudio.pause();
      this.currentAudio.onended = null;
      this.currentAudio.onerror = null;
      this.currentAudio = null;
    }
  },

  play(src, onEnded, onError) {
    this.cleanup();
    if (!src) return;
    
    if (dom.responseContainer) dom.responseContainer.classList.add("disabled");
    
    this.currentAudio = new Audio(src);
    this.currentAudio.onended = () => {
      if (dom.responseContainer) dom.responseContainer.classList.remove("disabled");
      if (onEnded) onEnded();
    };
    this.currentAudio.onerror = (e) => {
      if (dom.responseContainer) dom.responseContainer.classList.remove("disabled");
      console.warn("Audio playback failed", e);
      if (onError) onError();
      else if (onEnded) onEnded();
    };
    
    this.currentAudio.play().catch(e => {
      if (dom.responseContainer) dom.responseContainer.classList.remove("disabled");
      console.warn('Audio play rejected', e);
      if (onError) onError();
      else if (onEnded) onEnded();
    });
  },

  playBeep(type) {
    try {
      if (!this.audioFeedbackContext) this.audioFeedbackContext = new (window.AudioContext || window.webkitAudioContext)();
      if (this.audioFeedbackContext.state === 'suspended') this.audioFeedbackContext.resume();

      const osc = this.audioFeedbackContext.createOscillator();
      const gain = this.audioFeedbackContext.createGain();
      osc.connect(gain);
      gain.connect(this.audioFeedbackContext.destination);
      const now = this.audioFeedbackContext.currentTime;

      if (type === 'listen') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(880, now);
        gain.gain.setValueAtTime(0.1, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
        osc.start(now);
        osc.stop(now + 0.1);
      } else if (type === 'correct') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(523.25, now);
        osc.frequency.setValueAtTime(659.25, now + 0.1);
        gain.gain.setValueAtTime(0.1, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
        osc.start(now);
        osc.stop(now + 0.3);
      } else if (type === 'wrong') {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(300, now);
        osc.frequency.setValueAtTime(250, now + 0.15);
        gain.gain.setValueAtTime(0.1, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
        osc.start(now);
        osc.stop(now + 0.3);
      } else if (type === 'help') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(700, now);
        osc.frequency.setValueAtTime(900, now + 0.1);
        osc.frequency.setValueAtTime(700, now + 0.2);
        gain.gain.setValueAtTime(0.08, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
        osc.start(now);
        osc.stop(now + 0.25);
      }
    } catch (e) {
      console.warn("AudioContext no soportado o bloqueado", e);
    }
  }
};

// ============================
// 6. SPEECH ENGINE
// ============================
const SpeechEngine = {
  type: null, // 'webspeech', 'vosk', null
  webSpeechRec: null,
  voskModel: null,
  voskRecognizer: null,
  micStream: null,
  micSourceNode: null,
  recognizerNode: null,
  isVoskLoaded: false,
  VOICE_TRIGGERS: ['pista', 'no se', 'no sé', 'no lo se', 'no lo sé', 'ayuda', 'help', 'repite', 'otra vez'],

  async init() {
    if (dom.voiceStatus) dom.voiceStatus.classList.remove('hidden');

    if (this.type === 'webspeech' && !this.webSpeechRec) this.type = null;

    if (!this.type && typeof Vosk !== 'undefined') {
      if (dom.voiceStatus) dom.voiceStatus.textContent = '⏳ Cargando modelo Vosk...';
      try {
        await this.initVosk();
        this.type = 'vosk';
        UI.updateEngineBadge('offline', 'Vosk · Offline');
        if (dom.voiceStatus) dom.voiceStatus.textContent = '🎙️ Voz offline activa';
        return;
      } catch (err) {
        console.error('Vosk init failed:', err);
        if (dom.voiceStatus) dom.voiceStatus.textContent = '⚠️ Modelo Vosk no disponible';
      }
    }

    if (!this.type && (window.SpeechRecognition || window.webkitSpeechRecognition)) {
      if (dom.voiceStatus) dom.voiceStatus.textContent = '⏳ Iniciando voz online...';
      try {
        this.initWebSpeech();
        this.type = 'webspeech';
        UI.updateEngineBadge('online', 'Google · Online');
        if (dom.voiceStatus) dom.voiceStatus.textContent = '🎙️ Voz online activa';
      } catch (err) {
        console.error('WebSpeech init failed:', err);
        UI.updateEngineBadge('error', 'Sin reconocimiento');
        if (dom.voiceStatus) dom.voiceStatus.textContent = '❌ Reconocimiento de voz no disponible';
        this.type = null;
      }
    } else if (!this.type) {
      UI.updateEngineBadge('error', 'Sin reconocimiento');
      if (dom.voiceStatus) dom.voiceStatus.textContent = '❌ Reconocimiento de voz no disponible';
    }
  },

  initWebSpeech() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    this.webSpeechRec = new SpeechRecognition();
    this.webSpeechRec.lang = 'es-ES';
    this.webSpeechRec.continuous = false;
    this.webSpeechRec.interimResults = false;
    this.webSpeechRec.maxAlternatives = 1;

    this.webSpeechRec.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      this.handleTranscript(transcript);
    };

    this.webSpeechRec.onerror = (event) => {
      if (event.error === 'network' || event.error === 'service-not-allowed') {
        if (dom.voiceStatus) dom.voiceStatus.textContent = '❌ Voz online bloqueada por navegador';
        UI.updateEngineBadge('error', 'Google bloqueado');
        this.type = null;
        this.webSpeechRec = null;
      } else if (event.error === 'not-allowed') {
        if (dom.voiceStatus) dom.voiceStatus.textContent = '❌ Micrófono bloqueado';
        UI.updateEngineBadge('error', 'Micrófono bloqueado');
        this.type = null;
      }
    };

    this.webSpeechRec.onend = () => {
      if (SessionManager.isListeningForAnswer && this.type === 'webspeech') {
        try { this.webSpeechRec.start(); } catch (e) { } // auto restart
      } else if (SessionManager.awaitingAnswer && !SessionManager.isHelpMode) {
        if (dom.voiceStatus) dom.voiceStatus.textContent = '🎙️ Voz online activa';
      }
    };
  },

  async initVosk() {
    if (this.micStream) {
      this.micStream.getTracks().forEach(t => t.stop());
    }
    this.micStream = await navigator.mediaDevices.getUserMedia({
      video: false,
      audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1, sampleRate: 16000 }
    });

    if (!this.isVoskLoaded) {
      this.voskModel = await Vosk.createModel('./models/es-model.tar.gz');
      this.voskRecognizer = new this.voskModel.KaldiRecognizer(16000);
      this.voskRecognizer.on("result", (message) => {
        if (message.result.text) this.handleTranscript(message.result.text);
      });
      this.isVoskLoaded = true;
    }

    if (!AudioEngine.audioContext) {
      AudioEngine.audioContext = new AudioContext({ sampleRate: 16000 });
    } else if (AudioEngine.audioContext.state === 'suspended') {
      await AudioEngine.audioContext.resume();
    }
    
    if (this.micSourceNode) this.micSourceNode.disconnect();
    if (this.recognizerNode) this.recognizerNode.disconnect();

    this.micSourceNode = AudioEngine.audioContext.createMediaStreamSource(this.micStream);
    this.recognizerNode = AudioEngine.audioContext.createScriptProcessor(4096, 1, 1);

    this.recognizerNode.onaudioprocess = (event) => {
      if (SessionManager.isListeningForAnswer && this.voskRecognizer) {
        try { this.voskRecognizer.acceptWaveform(event.inputBuffer); } catch (e) { }
      }
    };

    this.micSourceNode.connect(this.recognizerNode);
    const dummyGain = AudioEngine.audioContext.createGain();
    dummyGain.gain.value = 0;
    this.recognizerNode.connect(dummyGain);
    dummyGain.connect(AudioEngine.audioContext.destination);
  },

  startListening() {
    if (this.type === 'webspeech' && this.webSpeechRec) {
      try {
        this.webSpeechRec.start();
        if (dom.voiceStatus) dom.voiceStatus.textContent = '🎙️ Escuchando... (di "pista")';
      } catch (e) {} 
    } else if (this.type === 'vosk') {
      if (AudioEngine.audioContext?.state === 'suspended') {
        Utils.safe(() => AudioEngine.audioContext.resume());
      }
      if (dom.voiceStatus) dom.voiceStatus.textContent = '🎙️ Escuchando... (di "pista")';
    }
  },

  stopListening() {
    if (this.type === 'webspeech' && this.webSpeechRec) {
      try { this.webSpeechRec.stop(); } catch (e) { }
    }
  },

  shutdown() {
    this.stopListening();
    if (this.micStream) {
      this.micStream.getTracks().forEach(t => t.stop());
      this.micStream = null;
    }
    if (AudioEngine.audioContext) {
      Utils.safe(() => AudioEngine.audioContext.close());
      AudioEngine.audioContext = null;
    }
    this.micSourceNode = null;
    this.recognizerNode = null;
  },

  handleTranscript(transcript) {
    if (!SessionManager.awaitingAnswer || SessionManager.isHelpMode) return;
    
    const normalized = Utils.normalizeText(transcript);
    const isTrigger = this.VOICE_TRIGGERS.some(t => normalized === t || normalized.includes(t));

    if (isTrigger) {
      console.log('[ZenHanzi] Voice trigger detected:', transcript);
      UI.showToast('💡 Pista activada por voz', 'info', 1500);
      SessionManager.playSentenceHelp(true);
      return;
    }

    SessionManager.processAnswer(transcript);
  }
};

// ============================
// 7. SESSION MANAGER
// ============================
const SessionManager = {
  queue: [],
  index: 0,
  stats: { total: 0, correct: 0, newCount: 0 },
  currentWordObj: null,
  currentMode: 'srs',
  
  awaitingAnswer: false,
  isListeningForAnswer: false,
  isHelpMode: false,
  sessionToken: 0,
  autoAdvanceTimer: null,

  buildQueue(mode) {
    const now = Date.now();
    const vocab = StorageManager.vocabulary;
    const userData = StorageManager.userData;
    
    if (mode === 'srs') {
      let candidates = vocab.filter(w => userData[w.id] && !userData[w.id].hidden && userData[w.id].due <= now);
      Utils.shuffleArray(candidates);
      if (candidates.length === 0) {
        UI.showToast('No hay palabras vencidas. Prueba Nuevas o Favoritas.', 'info');
        return [];
      }
      return candidates.map(w => w.id);
    }

    let priority = [], normal = [];
    if (mode === 'new') {
      priority = vocab.filter(w => userData[w.id] && !userData[w.id].hidden && userData[w.id].reps === 0);
      normal = vocab.filter(w => userData[w.id] && !userData[w.id].hidden && userData[w.id].due <= now && userData[w.id].reps !== 0);
    } else if (mode === 'favorites') {
      priority = vocab.filter(w => userData[w.id] && !userData[w.id].hidden && userData[w.id].favorited);
      normal = vocab.filter(w => userData[w.id] && !userData[w.id].hidden && userData[w.id].due <= now && !userData[w.id].favorited);
    }

    Utils.shuffleArray(priority);
    Utils.shuffleArray(normal);
    const combined = [...priority, ...normal];
    if (combined.length === 0) {
      UI.showToast('No hay palabras para este criterio.', 'info');
      return [];
    }
    return combined.map(w => w.id);
  },

  async startSession(mode) {
    this.currentMode = mode;
    const queueIds = this.buildQueue(mode);
    if (queueIds.length === 0) return;

    this.queue = queueIds;
    this.index = 0;
    this.stats = {
      total: this.queue.length,
      correct: 0,
      newCount: this.queue.filter(id => StorageManager.userData[id]?.reps === 0).length
    };

    if (dom.welcome) dom.welcome.classList.remove('active');
    if (dom.session) dom.session.classList.add('active');

    await SpeechEngine.init();
    this.loadCurrentWord();
  },

  loadCurrentWord() {
    this.sessionToken++;
    const token = this.sessionToken;

    if (this.autoAdvanceTimer) clearTimeout(this.autoAdvanceTimer);
    
    this.awaitingAnswer = true;
    this.isListeningForAnswer = false;
    this.isHelpMode = false;
    
    SpeechEngine.stopListening();
    AudioEngine.cleanup();

    const id = this.queue[this.index];
    this.currentWordObj = StorageManager.vocabMap.get(id);
    
    if (!this.currentWordObj) {
      console.error('Word not found for id:', id);
      return this.nextWord();
    }

    UI.renderWord(this.currentWordObj, this.index, this.queue.length, (selected, correct) => {
      if (token !== this.sessionToken) return;
      this.handleButtonAnswer(selected, correct);
    });

    if (dom.voiceStatus) dom.voiceStatus.textContent = "🔊 Reproduciendo...";
    
    const audioPath = this.currentWordObj.chineseAudio;
    if (!audioPath) {
      console.warn('Ruta de audio no definida');
      this.activateListening(token);
      return;
    }

    AudioEngine.play(audioPath, 
      () => this.activateListening(token),
      () => this.activateListening(token)
    );
  },

  activateListening(token) {
    if (token !== this.sessionToken || !this.awaitingAnswer || this.isHelpMode) return;
    this.isListeningForAnswer = true;
    AudioEngine.playBeep('listen');
    SpeechEngine.startListening();
  },

  playSentenceHelp(voiceActivated = false) {
    if (!this.awaitingAnswer || !this.currentWordObj || this.isHelpMode) return;
    if (!this.currentWordObj.sentenceAudio) {
      if (!voiceActivated) UI.showToast('No hay oración de ayuda', 'info');
      return;
    }

    this.sessionToken++;
    const token = this.sessionToken;

    this.isHelpMode = true;
    this.isListeningForAnswer = false;
    SpeechEngine.stopListening();
    AudioEngine.cleanup();

    if (dom.helpBtn) dom.helpBtn.classList.add('disabled');
    if (dom.voiceStatus) dom.voiceStatus.textContent = voiceActivated ? '💡 Pista por voz...' : '💡 Escuchando oración...';
    
    AudioEngine.playBeep('help');
    AudioEngine.play(this.currentWordObj.sentenceAudio, () => {
      if (token !== this.sessionToken) return;
      if (dom.voiceStatus) dom.voiceStatus.textContent = '🔊 Repitiendo palabra...';
      
      setTimeout(() => {
        if (token !== this.sessionToken || !this.awaitingAnswer) return;
        this.isHelpMode = false;
        if (dom.helpBtn) dom.helpBtn.classList.remove('disabled');
        AudioEngine.play(this.currentWordObj.chineseAudio, () => this.activateListening(token), () => this.activateListening(token));
      }, 600);
    });
  },

  processAnswer(spokenText) {
    this.isListeningForAnswer = false;
    SpeechEngine.stopListening();

    const normalizedSpoken = Utils.normalizeText(spokenText);
    const validMeanings = (this.currentWordObj.meaning || '').split(',').map(m => Utils.normalizeText(m.trim()));
    
    const isCorrect = Utils.matchMeaning(normalizedSpoken, validMeanings);
    this.submitResult(isCorrect);
  },

  handleButtonAnswer(selected, correctAnswer) {
    if (!this.awaitingAnswer || this.isHelpMode) return;
    this.isListeningForAnswer = false;
    SpeechEngine.stopListening();
    this.submitResult(selected === correctAnswer);
  },

  submitResult(isCorrect) {
    if (!this.awaitingAnswer || !this.currentWordObj || this.isHelpMode) return;
    this.awaitingAnswer = false;
    this.isListeningForAnswer = false;
    SpeechEngine.stopListening();

    const ud = StorageManager.userData[this.currentWordObj.id];
    if (!ud) return this.nextWord();

    let newInterval, newEase, newReps, newDue;

    if (isCorrect) {
      AudioEngine.playBeep('correct');
      this.stats.correct++;
      if (ud.reps === 0) {
        newInterval = 1;
        newReps = 1;
        newEase = ud.ease;
      } else {
        newReps = ud.reps + 1;
        newEase = Math.min(2.8, ud.ease + 0.1);
        newInterval = Math.round(ud.interval * newEase);
        if (newInterval > 365) newInterval = 365;
      }
      newDue = Date.now() + (newInterval * 86400000);
    } else {
      AudioEngine.playBeep('wrong');
      ud.lapses = (ud.lapses || 0) + 1;
      newReps = 0;
      newInterval = 1;
      newEase = Math.max(1.3, ud.ease - 0.2);
      newDue = Date.now() + 86400000;
    }

    ud.reps = newReps;
    ud.interval = newInterval;
    ud.ease = newEase;
    ud.due = newDue;
    StorageManager.userData[this.currentWordObj.id] = ud;
    StorageManager.saveUserData();

    const firstMeaning = (this.currentWordObj.meaning || '').split(',')[0];
    UI.showFeedback(isCorrect, firstMeaning);

    const delay = isCorrect ? 1500 : 2000;
    this.autoAdvanceTimer = setTimeout(() => this.nextWord(), delay);
  },

  nextWord() {
    this.index++;
    if (this.index < this.queue.length) {
      this.loadCurrentWord();
    } else {
      this.endSession();
    }
  },

  replayAudio() {
    if (!this.awaitingAnswer || this.isHelpMode || !this.currentWordObj?.chineseAudio) return;
    this.sessionToken++;
    const token = this.sessionToken;
    this.isListeningForAnswer = false;
    SpeechEngine.stopListening();
    AudioEngine.play(this.currentWordObj.chineseAudio, () => this.activateListening(token), () => this.activateListening(token));
  },

  endSession() {
    this.sessionToken++;
    SpeechEngine.stopListening();
    UI.updateEngineBadge('hidden');
    AudioEngine.cleanup();

    if (dom.session) dom.session.classList.remove('active');
    if (dom.summary) dom.summary.classList.add('active');
    
    if (dom.summaryReviewed) dom.summaryReviewed.textContent = this.stats.total;
    if (dom.summaryNew) dom.summaryNew.textContent = this.stats.newCount;
    const accuracy = this.stats.total ? Math.round((this.stats.correct / this.stats.total) * 100) : 0;
    if (dom.summaryAccuracy) dom.summaryAccuracy.textContent = accuracy;
  },

  exitSession() {
    this.sessionToken++;
    this.isHelpMode = false;
    if (this.autoAdvanceTimer) clearTimeout(this.autoAdvanceTimer);
    
    AudioEngine.cleanup();
    SpeechEngine.shutdown();
    UI.updateEngineBadge('hidden');
    
    if (dom.session) dom.session.classList.remove('active');
    if (dom.welcome) dom.welcome.classList.add('active');
    
    UI.updateWelcomeStats(StorageManager.vocabulary, StorageManager.userData);
  }
};

// ============================
// 8. BOOTSTRAP
// ============================
document.addEventListener('DOMContentLoaded', () => {
  StorageManager.loadInitialData().then(success => {
    if (success) UI.updateWelcomeStats(StorageManager.vocabulary, StorageManager.userData);
  });
});
