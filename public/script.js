// ══════════════════════════════════════════════════════════
//  DSA.ai  —  script.js
//  Features: chat, file upload (image/PDF/code), voice input
//             (Web Speech API), TTS voice output, model switch,
//             export, clear, toast, file preview modal
// ══════════════════════════════════════════════════════════

// ── STATE ──────────────────────────────────────────────────
const state = {
  history:     [],
  loading:     false,
  model:       'llama-3.3-70b-versatile',
  msgCount:    0,
  attachments: [],      // { file, dataUrl, type:'image'|'text', text? }
  recognizing: false,
  speaking:    false,
  autoSpeak:   false,
  voiceSpeed:  1.0,
  selectedVoice: null,
};

const MODEL_NAMES = {
  'llama-3.3-70b-versatile':       'Llama 70B',
  'llama-3.1-8b-instant':          'Llama 8B',
  'deepseek-r1-distill-llama-70b': 'DeepSeek R1',
};

// ── ELEMENTS ───────────────────────────────────────────────
const chatArea      = document.getElementById('chatArea');
const inputEl       = document.getElementById('input');
const sendBtn       = document.getElementById('sendBtn');
const emptyState    = document.getElementById('emptyState');
const msgCountEl    = document.getElementById('msgCount');
const charCountEl   = document.getElementById('charCount');
const topbarModelEl = document.getElementById('topbarModel');
const activeModelEl = document.getElementById('activeModel');
const sidebar       = document.getElementById('sidebar');
const overlay       = document.getElementById('overlay');
const attachStrip   = document.getElementById('attachStrip');
const attachList    = document.getElementById('attachList');
const fileInput     = document.getElementById('fileInput');
const micBtn        = document.getElementById('micBtn');
const attachBtn     = document.getElementById('attachBtn');
const voiceOverlay  = document.getElementById('voiceOverlay');
const voiceStop     = document.getElementById('voiceStop');
const voiceLabel    = document.getElementById('voiceLabel');
const voiceTranscript = document.getElementById('voiceTranscript');
const speakIndicator  = document.getElementById('speakIndicator');
const stopSpeakBtn    = document.getElementById('stopSpeakBtn');
const previewModal    = document.getElementById('previewModal');
const previewClose    = document.getElementById('previewClose');
const previewContent  = document.getElementById('previewContent');
const autoSpeakToggle = document.getElementById('autoSpeakToggle');
const voiceSpeedEl    = document.getElementById('voiceSpeed');
const voiceSelectEl   = document.getElementById('voiceSelect');

// ══════════════════════════════════════════════════════════
//  SIDEBAR
// ══════════════════════════════════════════════════════════
document.getElementById('menuBtn').addEventListener('click', () => {
  if (window.innerWidth <= 680) {
    // Mobile: slide in from left with overlay
    const isOpen = sidebar.classList.toggle('open');
    overlay.classList.toggle('visible', isOpen);
  } else {
    // Desktop: collapse/expand sidebar width
    sidebar.classList.toggle('collapsed');
  }
});
document.getElementById('sidebarClose').addEventListener('click', () => {
  if (window.innerWidth <= 680) {
    closeSidebar(); // mobile: remove 'open', hide overlay
  } else {
    sidebar.classList.add('collapsed'); // desktop: collapse width
  }
});
overlay.addEventListener('click', closeSidebar);
function closeSidebar() {
  sidebar.classList.remove('open');
  overlay.classList.remove('visible');
}

// On resize: clean up stale states
window.addEventListener('resize', () => {
  if (window.innerWidth > 680) {
    sidebar.classList.remove('open');
    overlay.classList.remove('visible');
  } else {
    sidebar.classList.remove('collapsed');
  }
});

// ══════════════════════════════════════════════════════════
//  MODEL SELECTOR
// ══════════════════════════════════════════════════════════
document.querySelectorAll('.model-row').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.model-row').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    state.model = btn.dataset.model;
    const name = MODEL_NAMES[state.model] ?? state.model;
    topbarModelEl.textContent = name;
    activeModelEl.textContent = name;
    if (window.innerWidth < 680) closeSidebar();
    showToast(`Switched to ${name}`);
  });
});

// ══════════════════════════════════════════════════════════
//  CHAT ACTIONS
// ══════════════════════════════════════════════════════════
document.getElementById('newChatBtn').addEventListener('click', () => { resetChat(); closeSidebar(); });
document.getElementById('clearBtn').addEventListener('click', () => {
  if (state.loading) return;
  if (state.msgCount > 0 && !confirm('Clear this session?')) return;
  resetChat();
});
document.getElementById('exportBtn').addEventListener('click', exportChat);

function exportChat() {
  if (!state.history.length) { showToast('Nothing to export yet!', 'error'); return; }
  const text = state.history.map(m => `[${m.role.toUpperCase()}]\n${m.content}`).join('\n\n---\n\n');
  const a = Object.assign(document.createElement('a'), {
    href: URL.createObjectURL(new Blob([text], { type:'text/plain' })),
    download: `dsa-${new Date().toISOString().slice(0,10)}.txt`,
  });
  a.click();
  showToast('Chat exported! 📄', 'success');
}

function resetChat() {
  if (state.loading) return;
  stopSpeaking();
  state.history  = [];
  state.msgCount = 0;
  state.attachments = [];
  updateStats();
  updateAttachStrip();
  chatArea.querySelectorAll('.msg-wrap').forEach(el => el.remove());
  emptyState.style.display = 'flex';
}

function updateStats() {
  msgCountEl.textContent = state.msgCount === 1 ? '1 message' : `${state.msgCount} messages`;
}

// ══════════════════════════════════════════════════════════
//  TOAST
// ══════════════════════════════════════════════════════════
function showToast(msg, type = '') {
  const tc = document.getElementById('toastContainer');
  const t  = document.createElement('div');
  t.className = `toast${type ? ' '+type : ''}`;
  t.textContent = msg;
  tc.appendChild(t);
  setTimeout(() => { t.style.opacity = '0'; t.style.transform = 'translateY(8px)'; t.style.transition = '0.3s'; setTimeout(() => t.remove(), 320); }, 2400);
}

// ══════════════════════════════════════════════════════════
//  INPUT
// ══════════════════════════════════════════════════════════
inputEl.addEventListener('input', function () {
  this.style.height = 'auto';
  this.style.height = Math.min(this.scrollHeight, 180) + 'px';
  const len = this.value.trim().length;
  sendBtn.disabled = (len === 0 && state.attachments.length === 0) || state.loading;
  charCountEl.textContent = this.value.length > 0 ? this.value.length : '';
  charCountEl.style.color = this.value.length > 900 ? 'var(--rose)' : '';
});

inputEl.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (!sendBtn.disabled) send(); }
});

window.injectPrompt = (text) => {
  inputEl.value = text;
  inputEl.dispatchEvent(new Event('input'));
  inputEl.focus();
  if (window.innerWidth < 680) closeSidebar();
};

// ══════════════════════════════════════════════════════════
//  FILE UPLOAD
// ══════════════════════════════════════════════════════════
attachBtn.addEventListener('click', () => fileInput.click());
document.getElementById('attachClear').addEventListener('click', () => {
  state.attachments = [];
  updateAttachStrip();
  sendBtn.disabled = inputEl.value.trim().length === 0 || state.loading;
});

fileInput.addEventListener('change', async (e) => {
  const files = Array.from(e.target.files);
  if (!files.length) return;

  for (const file of files) {
    if (file.size > 10 * 1024 * 1024) { showToast(`${file.name} is too large (max 10MB)`, 'error'); continue; }

    const isImage = file.type.startsWith('image/');
    const isText  = !isImage; // treat everything else as text

    if (isImage) {
      const dataUrl = await readAsDataUrl(file);
      state.attachments.push({ file, dataUrl, type: 'image' });
    } else {
      const text = await readAsText(file).catch(() => null);
      if (text === null) { showToast(`Could not read ${file.name}`, 'error'); continue; }
      state.attachments.push({ file, type: 'text', text });
    }
  }

  fileInput.value = '';
  updateAttachStrip();
  sendBtn.disabled = state.loading;
  showToast(`${files.length} file${files.length > 1 ? 's' : ''} attached 📎`, 'success');
});

function readAsDataUrl(file) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload  = () => res(r.result);
    r.onerror = rej;
    r.readAsDataURL(file);
  });
}
function readAsText(file) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload  = () => res(r.result);
    r.onerror = rej;
    r.readAsText(file);
  });
}

function updateAttachStrip() {
  if (!state.attachments.length) {
    attachStrip.style.display = 'none';
    attachList.innerHTML = '';
    return;
  }
  attachStrip.style.display = 'flex';
  attachList.innerHTML = '';

  state.attachments.forEach((att, idx) => {
    const pill = document.createElement('div');
    pill.className = 'attach-pill';

    if (att.type === 'image') {
      const img = document.createElement('img');
      img.src = att.dataUrl;
      img.className = 'attach-pill-img';
      img.alt = att.file.name;
      pill.appendChild(img);
    } else {
      const icon = document.createElement('span');
      icon.textContent = getFileIcon(att.file.name);
      icon.style.fontSize = '1.1rem';
      pill.appendChild(icon);
    }

    const name = document.createElement('span');
    name.className = 'attach-pill-name';
    name.textContent = att.file.name;
    pill.appendChild(name);

    const rm = document.createElement('button');
    rm.className = 'attach-pill-remove';
    rm.textContent = '✕';
    rm.onclick = () => {
      state.attachments.splice(idx, 1);
      updateAttachStrip();
      if (state.attachments.length === 0 && inputEl.value.trim().length === 0) sendBtn.disabled = true;
    };
    pill.appendChild(rm);
    attachList.appendChild(pill);
  });
}

function getFileIcon(name) {
  const ext = name.split('.').pop().toLowerCase();
  const map = { pdf:'📄', py:'🐍', js:'📜', ts:'📘', java:'☕', cpp:'⚙️', c:'⚙️', txt:'📝', md:'📝', json:'🔧', html:'🌐', css:'🎨' };
  return map[ext] ?? '📁';
}

// Drag-and-drop onto composer
const composer = document.getElementById('composer');
composer.addEventListener('dragover', e => { e.preventDefault(); composer.style.borderColor = 'rgba(124,106,247,0.6)'; });
composer.addEventListener('dragleave', () => { composer.style.borderColor = ''; });
composer.addEventListener('drop', async (e) => {
  e.preventDefault();
  composer.style.borderColor = '';
  const files = Array.from(e.dataTransfer.files);
  if (files.length) {
    const dt = new DataTransfer();
    files.forEach(f => dt.items.add(f));
    fileInput.files = dt.files;
    fileInput.dispatchEvent(new Event('change'));
  }
});

// ══════════════════════════════════════════════════════════
//  VOICE INPUT  (Web Speech API)
// ══════════════════════════════════════════════════════════
let recognition = null;

function initRecognition() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) return null;
  const r = new SR();
  r.continuous      = false;
  r.interimResults  = true;
  r.lang            = 'en-US';
  r.maxAlternatives = 1;
  return r;
}

micBtn.addEventListener('click', () => {
  if (state.recognizing) { stopRecognition(); return; }

  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) {
    showToast('Voice input not supported in this browser. Try Chrome.', 'error');
    return;
  }

  recognition = initRecognition();

  recognition.onstart = () => {
    state.recognizing = true;
    micBtn.classList.add('active');
    voiceOverlay.style.display = 'flex';
    voiceLabel.textContent = 'Listening…';
    voiceTranscript.textContent = '';
  };

  recognition.onresult = (e) => {
    let interim = '', final = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const t = e.results[i][0].transcript;
      if (e.results[i].isFinal) final += t;
      else interim += t;
    }
    voiceTranscript.textContent = final || interim;
    if (final) {
      inputEl.value = (inputEl.value + ' ' + final).trim();
      inputEl.dispatchEvent(new Event('input'));
    }
  };

  recognition.onerror = (e) => {
    const msgs = { 'no-speech':'No speech detected. Try again.', 'audio-capture':'Microphone not found.', 'not-allowed':'Microphone permission denied.', 'network':'Network error during voice recognition.' };
    showToast(msgs[e.error] || `Voice error: ${e.error}`, 'error');
    stopRecognition();
  };

  recognition.onend = () => stopRecognition();

  recognition.start();
});

voiceStop.addEventListener('click', stopRecognition);

function stopRecognition() {
  state.recognizing = false;
  micBtn.classList.remove('active');
  voiceOverlay.style.display = 'none';
  if (recognition) { try { recognition.stop(); } catch(_) {} recognition = null; }
  voiceLabel.textContent = 'Listening…';
  voiceTranscript.textContent = '';
}

// ══════════════════════════════════════════════════════════
//  VOICE OUTPUT  (Web Speech Synthesis)
// ══════════════════════════════════════════════════════════

function populateVoices() {
  const voices = speechSynthesis.getVoices().filter(v => v.lang.startsWith('en'));
  voiceSelectEl.innerHTML = '';
  voices.forEach((v, i) => {
    const opt = document.createElement('option');
    opt.value = i;
    opt.textContent = v.name.replace(/Microsoft |Google /, '').slice(0, 18);
    voiceSelectEl.appendChild(opt);
  });
  if (voices.length) state.selectedVoice = voices[0];
}

speechSynthesis.addEventListener('voiceschanged', populateVoices);
populateVoices();

voiceSelectEl.addEventListener('change', () => {
  const voices = speechSynthesis.getVoices().filter(v => v.lang.startsWith('en'));
  state.selectedVoice = voices[parseInt(voiceSelectEl.value)];
});

voiceSpeedEl.addEventListener('input', () => {
  state.voiceSpeed = parseFloat(voiceSpeedEl.value);
});

autoSpeakToggle.addEventListener('change', () => {
  state.autoSpeak = autoSpeakToggle.checked;
  showToast(state.autoSpeak ? 'Auto-speak enabled 🔊' : 'Auto-speak disabled', state.autoSpeak ? 'success' : '');
});

function speakText(text) {
  if (!('speechSynthesis' in window)) { showToast('Text-to-speech not supported', 'error'); return; }
  stopSpeaking();

  // Strip markdown and emojis for cleaner speech
  const clean = text
    .replace(/```[\s\S]*?```/g, 'code block omitted.')
    .replace(/`[^`]+`/g, m => m.slice(1,-1))
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/#+\s/g, '')
    .replace(/\[(.+?)\]\(.+?\)/g, '$1')
    .replace(/[-•]\s/g, '')
    .replace(/\n{2,}/g, '. ')
    .replace(/\n/g, ' ')
    // Remove all emoji characters
    .replace(/[\u{1F000}-\u{1FFFF}]/gu, '')
    .replace(/[\u{2600}-\u{27BF}]/gu, '')
    .replace(/[\u{FE00}-\u{FEFF}]/gu, '')
    .replace(/[\u{1F900}-\u{1F9FF}]/gu, '')
    .replace(/[\u{231A}-\u{2B55}]/gu, '')
    // Clean up any double spaces left behind
    .replace(/  +/g, ' ')
    .trim();

  const utt = new SpeechSynthesisUtterance(clean);
  utt.rate  = state.voiceSpeed;
  utt.pitch = 1.0;
  if (state.selectedVoice) utt.voice = state.selectedVoice;

  utt.onstart = () => {
    state.speaking = true;
    speakIndicator.style.display = 'flex';
  };
  utt.onend = utt.onerror = () => {
    state.speaking = false;
    speakIndicator.style.display = 'none';
  };

  speechSynthesis.speak(utt);
}

function stopSpeaking() {
  if ('speechSynthesis' in window) speechSynthesis.cancel();
  state.speaking = false;
  speakIndicator.style.display = 'none';
}

stopSpeakBtn.addEventListener('click', stopSpeaking);

// ══════════════════════════════════════════════════════════
//  FILE PREVIEW MODAL
// ══════════════════════════════════════════════════════════
previewClose.addEventListener('click', () => previewModal.classList.remove('open'));
previewModal.addEventListener('click', (e) => { if (e.target === previewModal) previewModal.classList.remove('open'); });

window.openPreview = function (src) {
  previewContent.innerHTML = `<img src="${src}" alt="Preview"/>`;
  previewModal.classList.add('open');
};

// ══════════════════════════════════════════════════════════
//  MESSAGE RENDERING HELPERS
// ══════════════════════════════════════════════════════════
function nowTime() {
  return new Date().toLocaleTimeString('en-US', { hour:'2-digit', minute:'2-digit' });
}

function addMsgRow(role) {
  emptyState.style.display = 'none';

  const wrap   = document.createElement('div'); wrap.className = 'msg-wrap';
  const row    = document.createElement('div'); row.className  = `msg-row ${role}`;
  const av     = document.createElement('div'); av.className   = `avatar ${role === 'bot' ? 'av-bot' : 'av-user'}`; av.textContent = role === 'bot' ? 'AI' : 'U';
  const bwrap  = document.createElement('div'); bwrap.className = 'bubble-wrap';
  const bubble = document.createElement('div'); bubble.className = `bubble ${role === 'bot' ? 'bot-bubble' : 'user-bubble'}`;

  const meta = document.createElement('div'); meta.className = 'msg-meta';
  const ts   = document.createElement('span'); ts.className = 'meta-time'; ts.textContent = nowTime();
  meta.appendChild(ts);

  if (role === 'bot') {
    const copyBtn  = makeMetaBtn('Copy',    () => window.copyMessage(copyBtn));
    const speakBtn = makeMetaBtn('🔊 Speak', () => speakText(bubble.innerText));
    speakBtn.classList.add('speak-btn');
    meta.appendChild(copyBtn);
    meta.appendChild(speakBtn);
  }

  bwrap.appendChild(bubble); bwrap.appendChild(meta);
  row.appendChild(av); row.appendChild(bwrap);
  wrap.appendChild(row);
  chatArea.appendChild(wrap);
  chatArea.scrollTop = chatArea.scrollHeight;
  return bubble;
}

function makeMetaBtn(label, fn) {
  const b = document.createElement('button'); b.className = 'meta-btn'; b.textContent = label; b.onclick = fn; return b;
}

function showTyping() {
  const b = addMsgRow('bot');
  b.innerHTML = `<div class="typing"><span></span><span></span><span></span></div>`;
  return b;
}

async function streamRender(bubble, fullText) {
  const step = 8;
  for (let i = step; i < fullText.length; i += step) {
    bubble.innerHTML = renderMarkdownWithCopy(fullText.slice(0, i));
    chatArea.scrollTop = chatArea.scrollHeight;
    await tick(10);
  }
  bubble.innerHTML = renderMarkdownWithCopy(fullText);
  chatArea.scrollTop = chatArea.scrollHeight;
}

function tick(ms) { return new Promise(r => setTimeout(r, ms)); }

// ══════════════════════════════════════════════════════════
//  RENDER ATTACHMENTS IN USER BUBBLE
// ══════════════════════════════════════════════════════════
function renderAttachmentsIntoBubble(bubble, attachments) {
  attachments.forEach(att => {
    if (att.type === 'image') {
      const img = document.createElement('img');
      img.src       = att.dataUrl;
      img.className = 'att-img';
      img.alt       = att.file.name;
      img.onclick   = () => window.openPreview(att.dataUrl);
      bubble.appendChild(img);
    } else {
      const card = document.createElement('div');
      card.className = 'msg-attachment';
      card.innerHTML = `<span class="att-icon">${getFileIcon(att.file.name)}</span><div class="att-info"><span class="att-name">${att.file.name}</span><span class="att-size">${formatBytes(att.file.size)}</span></div>`;
      bubble.appendChild(card);
    }
  });
}

function formatBytes(b) {
  if (b < 1024) return `${b} B`;
  if (b < 1024*1024) return `${(b/1024).toFixed(1)} KB`;
  return `${(b/1024/1024).toFixed(1)} MB`;
}

// ══════════════════════════════════════════════════════════
//  BUILD GROQ PAYLOAD WITH ATTACHMENTS
// ══════════════════════════════════════════════════════════
function buildMessageWithAttachments(text, attachments) {
  // Append text file contents as context
  let contextText = text;
  attachments.filter(a => a.type === 'text').forEach(a => {
    contextText += `\n\n--- Attached file: ${a.file.name} ---\n${a.text.slice(0, 8000)}`;
  });

  // For images: note them (Groq llama text models can't process images natively, so we describe them)
  const images = attachments.filter(a => a.type === 'image');
  if (images.length) {
    contextText += `\n\n[User has attached ${images.length} image(s): ${images.map(i=>i.file.name).join(', ')}. Acknowledge and ask them to describe the image if needed for DSA context.]`;
  }

  return contextText;
}

// ══════════════════════════════════════════════════════════
//  SEND
// ══════════════════════════════════════════════════════════
async function send() {
  const rawText     = inputEl.value.trim();
  const attachments = [...state.attachments];
  if (!rawText && !attachments.length) return;
  if (state.loading) return;

  state.loading = true;
  sendBtn.disabled = true;
  stopSpeaking();

  // Build user bubble
  const userBubble = addMsgRow('user');
  if (attachments.length) renderAttachmentsIntoBubble(userBubble, attachments);
  if (rawText) {
    const p = document.createElement('p');
    p.style.margin = attachments.length ? '8px 0 0' : '0';
    p.textContent = rawText;
    userBubble.appendChild(p);
  }

  const fullMessage = buildMessageWithAttachments(rawText || '(see attached file)', attachments);
  state.history.push({ role:'user', content: fullMessage });
  state.msgCount++;
  updateStats();

  // Clear input + attachments
  inputEl.value = '';
  inputEl.style.height = 'auto';
  charCountEl.textContent = '';
  state.attachments = [];
  updateAttachStrip();

  const typingBubble = showTyping();

  try {
    const now = new Date();
    const currentDateTime = now.toLocaleString('en-US', {
      weekday: 'long', year: 'numeric', month: 'long',
      day: 'numeric', hour: '2-digit', minute: '2-digit',
      second: '2-digit', timeZoneName: 'short'
    });

    const res = await fetch('/api/chat', {
      method:  'POST',
      headers: { 'Content-Type':'application/json' },
      body:    JSON.stringify({
        message: fullMessage,
        history: state.history.slice(-12),
        model:   state.model,
        currentDateTime,
      }),
    });

    const data  = await res.json().catch(() => ({}));
    const reply = data.reply || 'No response received.';

    typingBubble.closest('.msg-wrap').remove();
    const botBubble = addMsgRow('bot');
    await streamRender(botBubble, reply);

    state.history.push({ role:'assistant', content: reply });
    state.msgCount++;
    updateStats();

    if (state.autoSpeak) speakText(reply);

  } catch (err) {
    typingBubble.innerHTML = `<span style="color:var(--red)">⚠ ${err.message || 'Connection error. Please try again.'}</span>`;
  } finally {
    state.loading = false;
    sendBtn.disabled = inputEl.value.trim().length === 0 && state.attachments.length === 0;
  }
}

window.send = send;

// ══════════════════════════════════════════════════════════
//  WELCOME
// ══════════════════════════════════════════════════════════
window.addEventListener('load', async () => {
  populateVoices();
  await tick(600);

  const bubble = addMsgRow('bot');
  const welcome = `Hey there! 👋 I'm **DSA.ai**, your personal algorithm tutor.

I can help you with:
- 🌳 **Data Structures** — trees, graphs, heaps, tries, linked lists
- ⚡ **Algorithms** — sorting, searching, dynamic programming
- 📊 **Complexity** — Big O, O(n log n), time & space tradeoffs
- 🎯 **Interview Prep** — LeetCode patterns & optimal solutions

**New features you can use right now:**
- 🎤 **Voice input** — click the mic button to ask with your voice
- 📎 **File upload** — attach images, PDFs, or code files
- 🔊 **Voice output** — click 🔊 Speak on any response to hear it read aloud

Pick a starter topic, or just ask me anything! 🚀`;

  await streamRender(bubble, welcome);
  state.history.push({ role:'assistant', content: welcome });
  state.msgCount++;
  updateStats();
});