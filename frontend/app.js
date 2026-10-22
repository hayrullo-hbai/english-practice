const API = '/api';
const state = { question: null, roundId: null, finished: false, nextTimer: null, selectedStage: 1, elapsedSeconds: 0 };
let editingQuestionId = null;
const $ = (selector) => document.querySelector(selector);

async function request(path, options = {}) {
  const response = await fetch(`${API}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
  });
  if (!response.ok) {
    const detail = await response.json().catch(() => ({}));
    throw new Error(detail.detail || 'So‘rov bajarilmadi.');
  }
  return response.status === 204 ? null : response.json();
}

function toast(message) {
  const el = $('#toast');
  el.textContent = message;
  el.classList.add('show');
  window.setTimeout(() => el.classList.remove('show'), 2400);
}

function showView(name) {
  document.querySelectorAll('.view').forEach((view) => view.classList.remove('active'));
  document.querySelectorAll('.tab').forEach((tab) => tab.classList.toggle('active', tab.dataset.view === name));
  $(`#${name}-view`).classList.add('active');
  if (name === 'library') loadQuestions();
  if (name === 'dashboard') loadDashboard();
  if (name === 'settings') loadSettings();
}

document.querySelectorAll('.tab').forEach((tab) => tab.addEventListener('click', () => showView(tab.dataset.view)));

document.querySelectorAll('.mode-option').forEach((option) => {
  option.addEventListener('click', () => {
    state.selectedStage = Number(option.dataset.stage);
    document.querySelectorAll('.mode-option').forEach((item) => {
      const selected = item === option;
      item.classList.toggle('selected', selected);
      item.setAttribute('aria-pressed', String(selected));
    });
    document.querySelectorAll('.stage-row[data-stage-row]').forEach((row) => {
      const selected = Number(row.dataset.stageRow) === state.selectedStage;
      row.classList.toggle('current', selected);
      row.querySelector('.stage-state').textContent = selected ? 'Tanlangan' : '';
    });
  });
});

function setPracticeEnabled(enabled) {
  $('#answer-input').disabled = !enabled;
  $('#submit-btn').disabled = !enabled;
  $('#listen-btn').disabled = !enabled;
}

async function nextQuestion() {
  window.clearTimeout(state.nextTimer);
  $('#practice-card').classList.remove('success-celebrate');
  if ('speechSynthesis' in window) window.speechSynthesis.cancel();
  const feedback = $('#feedback');
  feedback.className = 'feedback';
  feedback.textContent = '';
  $('#next-btn').hidden = true;
  $('#answer-input').value = '';
  try {
    state.question = await request(`/practice/next?stage=${state.selectedStage}`);
    state.roundId = state.question.round_id;
    state.finished = false;
    state.elapsedSeconds = 0;
    $('#prompt').textContent = state.question.prompt;
    const audioOnly = state.question.stage === 3;
    $('#prompt').hidden = audioOnly;
    $('#audio-only-note').hidden = !audioOnly;
    $('#stage-pill').textContent = `${state.question.stage}-BOSQICH`;
    $('#score-label').textContent = `${state.question.score} ball`;
    $('#attempt-label').textContent = '2 ta imkoniyat · keyin ishora';
    setPracticeEnabled(true);
    $('#listen-btn').focus();
    if (audioOnly) playQuestionAudio();
  } catch (error) {
    $('#prompt').hidden = false;
    $('#audio-only-note').hidden = true;
    $('#prompt').textContent = error.message;
    setPracticeEnabled(false);
  }
}

$('#start-btn').addEventListener('click', nextQuestion);
$('#next-btn').addEventListener('click', nextQuestion);
function playQuestionAudio() {
  if (!state.question || !('speechSynthesis' in window)) {
    toast('Brauzeringiz audio o‘qishni qo‘llab-quvvatlamaydi.');
    return;
  }
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(state.question.prompt);
  utterance.lang = 'en-US';
  utterance.rate = 0.88;
  window.speechSynthesis.speak(utterance);
}

$('#listen-btn').addEventListener('click', playQuestionAudio);

document.addEventListener('keydown', (event) => {
  if (!event.altKey || event.ctrlKey || event.metaKey || !state.question || state.finished) {
    return;
  }
  if (event.code === 'KeyL') {
    event.preventDefault();
    playQuestionAudio();
  } else if (event.code === 'KeyP') {
    event.preventDefault();
    $('#answer-input').focus();
  }
});

$('#answer-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!state.question || state.finished) return;
  const feedback = $('#feedback');
  try {
    const result = await request(`/practice/${state.question.id}/answer`, {
      method: 'POST',
      body: JSON.stringify({ answer: $('#answer-input').value, round_id: state.roundId, duration_seconds: Math.floor(state.elapsedSeconds) }),
    });
    feedback.className = `feedback ${result.correct ? 'success' : result.done ? 'error' : ''}`;
    feedback.textContent = result.hint ? `${result.message} ${result.hint}` : result.message;
    $('#attempt-label').textContent = `Urinish ${result.attempt_number} / 3`;
    $('#stage-pill').textContent = `${result.stage}-BOSQICH`;
    $('#score-label').textContent = `${result.score} ball`;
    if (result.done) {
      state.finished = true;
      $('#next-btn').hidden = result.correct;
      setPracticeEnabled(false);
      if (result.correct) {
        feedback.textContent = 'To‘g‘ri javob! Keyingi savol…';
        $('#practice-card').classList.add('success-celebrate');
        state.nextTimer = window.setTimeout(nextQuestion, 1400);
      }
    }
  } catch (error) {
    feedback.className = 'feedback error';
    feedback.textContent = error.message;
  }
});

setInterval(() => {
  if (state.question && !state.finished && document.visibilityState === 'visible' && document.hasFocus()) {
    state.elapsedSeconds += 1;
  }
}, 1000);

async function loadDashboard() {
  const period = $('#dashboard-period').value;
  try {
    const stats = await request(`/dashboard?period=${period}&timezone_offset_minutes=${new Date().getTimezoneOffset()}`);
    $('#metric-answered').textContent = stats.total_questions_answered;
    $('#metric-time').textContent = formatDuration(stats.total_seconds);
    $('#metric-days').textContent = period === 'all' ? `${stats.active_days} kun` : `${stats.active_days} / ${stats.days}`;
    $('#metric-accuracy').textContent = `${stats.accuracy_percent}%`;
    $('#metric-speed').textContent = formatAverage(stats.average_seconds_per_question);
    $('#dashboard-summary').textContent = `${stats.total_questions_answered} savol · ${formatDuration(stats.total_seconds)}`;
    renderGrowthTrend(stats.daily, stats.granularity);
    renderTrendChart($('#answers-chart'), stats.daily, (item) => item.questions_answered, true, stats.granularity, 'Jami javoblar');
    renderTrendChart($('#time-chart'), stats.daily, (item) => item.duration_seconds / 3600, true, stats.granularity, 'Jami soatlar');
    const container = $('#daily-activity');
    container.replaceChildren();
    const maxDuration = Math.max(1, ...stats.daily.map((item) => item.duration_seconds));
    stats.daily.slice().reverse().forEach((item) => {
      const row = document.createElement('div');
      row.className = 'daily-row';
      const date = document.createElement('span');
      date.className = 'daily-date';
      date.textContent = stats.granularity === 'month' ? formatMonth(item.date) : formatDay(item.date);
      const bar = document.createElement('div');
      bar.className = 'daily-bar-track';
      const fill = document.createElement('span');
      fill.className = 'daily-bar-fill';
      fill.style.width = `${item.duration_seconds ? Math.max(3, item.duration_seconds / maxDuration * 100) : 0}%`;
      bar.append(fill);
      const time = document.createElement('span');
      time.className = 'daily-time';
      time.textContent = formatDuration(item.duration_seconds);
      const answers = document.createElement('span');
      answers.className = 'daily-answers';
      answers.textContent = `${item.questions_answered} savol`;
      const accuracy = document.createElement('span');
      accuracy.className = 'daily-accuracy';
      accuracy.textContent = item.questions_answered ? `${item.accuracy_percent}% to‘g‘ri` : '—';
      row.append(date, bar, time, answers, accuracy);
      container.append(row);
    });
    $('#dashboard-empty').hidden = stats.total_questions_answered > 0 || stats.total_seconds > 0;
    container.hidden = stats.total_questions_answered === 0 && stats.total_seconds === 0;
  } catch (error) {
    toast(error.message);
  }
}

function renderGrowthTrend(buckets, granularity) {
  const firstHalfEnd = Math.floor(buckets.length / 2);
  const earlier = buckets.slice(0, firstHalfEnd);
  const later = buckets.slice(firstHalfEnd);
  const avg = (items, key) => items.length ? items.reduce((total, item) => total + item[key], 0) / items.length : 0;
  const earlierAnswers = avg(earlier, 'questions_answered');
  const laterAnswers = avg(later, 'questions_answered');
  const earlierTime = avg(earlier, 'duration_seconds');
  const laterTime = avg(later, 'duration_seconds');
  const rate = (items) => {
    const total = items.reduce((sum, item) => sum + item.questions_answered, 0);
    return total ? items.reduce((sum, item) => sum + item.correct_answers, 0) / total * 100 : null;
  };
  const earlierAccuracy = rate(earlier);
  const laterAccuracy = rate(later);
  const answerDelta = laterAnswers - earlierAnswers;
  const timeDelta = laterTime - earlierTime;
  const accuracyDelta = earlierAccuracy === null || laterAccuracy === null ? null : laterAccuracy - earlierAccuracy;
  const directionDelta = Math.abs(answerDelta) > 0 ? answerDelta : timeDelta;
  const hasActivity = buckets.some((item) => item.questions_answered || item.duration_seconds);
  const direction = $('#growth-direction');
  direction.className = 'growth-direction';
  if (!hasActivity) {
    direction.classList.add('neutral');
    direction.textContent = 'Hali ma’lumot yo‘q';
  } else if (buckets.length < 2 || directionDelta === 0) {
    direction.classList.add('neutral');
    direction.textContent = 'Barqaror';
  } else if (directionDelta > 0) {
    direction.classList.add('positive');
    direction.textContent = '↑ O‘sish';
  } else {
    direction.classList.add('negative');
    direction.textContent = '↓ Pasayish';
  }
  $('#growth-caption').textContent = granularity === 'month'
    ? 'Davrning ikkinchi yarmi birinchi yarmi bilan taqqoslandi; quyida oyma-oy o‘zgarish.'
    : 'Davrning ikkinchi yarmi birinchi yarmi bilan taqqoslandi; quyida kunma-kun o‘zgarish.';
  $('#growth-answers').textContent = buckets.length < 2 ? '—' : signedValue(answerDelta, 'savol');
  $('#growth-answers-detail').textContent = buckets.length < 2 ? 'taqqoslash uchun ko‘proq kun kerak' : 'kunlik o‘rtacha javoblar';
  $('#growth-time').textContent = buckets.length < 2 ? '—' : signedDuration(timeDelta);
  $('#growth-time-detail').textContent = buckets.length < 2 ? 'taqqoslash uchun ko‘proq kun kerak' : 'kunlik o‘rtacha mashq vaqti';
  $('#growth-accuracy').textContent = accuracyDelta === null ? '—' : `${accuracyDelta > 0 ? '+' : ''}${Math.round(accuracyDelta)} foiz band`;
  $('#growth-accuracy-detail').textContent = accuracyDelta === null ? 'taqqoslash uchun javoblar yetarli emas' : 'to‘g‘ri javoblar ulushidagi farq';

  const list = $('#growth-daily-list');
  list.replaceChildren();
  const visibleBuckets = granularity === 'month' ? buckets.slice(-12) : buckets;
  visibleBuckets.forEach((item) => {
    const index = buckets.indexOf(item);
    const previous = index > 0 ? buckets[index - 1] : null;
    const row = document.createElement('div');
    row.className = 'growth-daily-row';
    const date = document.createElement('b');
    date.textContent = granularity === 'month' ? formatMonth(item.date) : formatDay(item.date);
    const answers = document.createElement('span');
    answers.textContent = `${item.questions_answered} savol`;
    const time = document.createElement('span');
    time.textContent = formatDuration(item.duration_seconds);
    const accuracy = document.createElement('span');
    accuracy.textContent = item.questions_answered ? `${item.accuracy_percent}% to‘g‘ri` : '—';
    const change = document.createElement('span');
    if (!previous) {
      change.className = 'growth-change neutral';
      change.textContent = '—';
    } else {
      const difference = item.questions_answered - previous.questions_answered;
      const timeDifference = item.duration_seconds - previous.duration_seconds;
      const directionDifference = difference || timeDifference;
      change.className = `growth-change ${directionDifference > 0 ? 'positive' : directionDifference < 0 ? 'negative' : 'neutral'}`;
      change.textContent = `${difference > 0 ? '↑' : difference < 0 ? '↓' : '→'} ${Math.abs(difference)} savol · ${signedDuration(timeDifference)}`;
    }
    row.append(date, answers, time, accuracy, change);
    list.append(row);
  });
  $('#growth-list-title').textContent = granularity === 'month' ? 'Oylik ko‘rsatkichlar' : 'Kunlik ko‘rsatkichlar';
}

function signedValue(value, unit) {
  const rounded = Math.round(value * 10) / 10;
  const sign = rounded > 0 ? '+' : '';
  return `${sign}${rounded} ${unit}`;
}

function signedDuration(seconds) {
  const rounded = Math.round(seconds);
  const sign = rounded > 0 ? '+' : rounded < 0 ? '−' : '';
  return `${sign}${formatDuration(Math.abs(rounded))}`;
}

function renderTrendChart(container, buckets, valueFor, cumulative, granularity, label) {
  const width = 620;
  const height = 230;
  const margin = { top: 16, right: 22, bottom: 38, left: 46 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const values = [];
  let sum = 0;
  buckets.forEach((bucket) => {
    const value = valueFor(bucket);
    sum = cumulative ? sum + value : value;
    values.push(sum);
  });
  if (!values.some((value) => value > 0)) {
    container.textContent = 'Bu davrda grafik uchun ma’lumot yo‘q.';
    container.classList.add('chart-empty');
    return;
  }
  container.classList.remove('chart-empty');
  const max = Math.max(1, ...values);
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', `${label} grafigi`);
  const add = (tag, attrs, text = '') => {
    const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
    Object.entries(attrs).forEach(([key, value]) => node.setAttribute(key, value));
    if (text) node.textContent = text;
    svg.append(node);
    return node;
  };
  for (let index = 0; index <= 4; index += 1) {
    const y = margin.top + plotHeight * index / 4;
    const tick = max * (4 - index) / 4;
    add('line', { x1: margin.left, y1: y, x2: width - margin.right, y2: y, class: 'chart-gridline' });
    add('text', { x: margin.left - 8, y: y + 4, 'text-anchor': 'end', class: 'chart-tick' }, formatChartValue(tick, label));
  }
  if (values.length) {
    const points = values.map((value, index) => {
      const x = margin.left + (values.length === 1 ? plotWidth / 2 : index * plotWidth / (values.length - 1));
      const y = margin.top + plotHeight - value / max * plotHeight;
      return { x, y, value, bucket: buckets[index] };
    });
    add('polyline', { points: points.map((point) => `${point.x},${point.y}`).join(' '), class: 'chart-line' });
    points.forEach((point) => {
      const circle = add('circle', { cx: point.x, cy: point.y, r: 3.5, class: 'chart-point' });
      const title = document.createElementNS('http://www.w3.org/2000/svg', 'title');
      title.textContent = `${granularity === 'month' ? formatMonth(point.bucket.date) : formatDay(point.bucket.date)}: ${formatChartValue(point.value, label)}`;
      circle.append(title);
    });
    const labelCount = Math.min(5, points.length);
    for (let index = 0; index < labelCount; index += 1) {
      const point = points[Math.round(index * (points.length - 1) / Math.max(1, labelCount - 1))];
      const caption = granularity === 'month' ? formatMonth(point.bucket.date) : formatDay(point.bucket.date).split(',')[1].trim();
      add('text', { x: point.x, y: height - 10, 'text-anchor': 'middle', class: 'chart-label' }, caption);
    }
  }
  container.replaceChildren(svg);
}

function formatChartValue(value, label) {
  if (label === 'Jami soatlar') return `${Number(value.toFixed(1))}s`;
  return `${Math.round(value)}`;
}

function formatDuration(seconds) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours) return `${hours} soat ${minutes} daq`;
  if (minutes) return `${minutes} daq`;
  return `${seconds} son`;
}

function formatDay(dateString) {
  const date = new Date(`${dateString}T12:00:00`);
  const weekdays = ['Yak', 'Du', 'Se', 'Cho', 'Pay', 'Ju', 'Sha'];
  const months = ['yan', 'fev', 'mar', 'apr', 'may', 'iyn', 'iyl', 'avg', 'sen', 'okt', 'noy', 'dek'];
  return `${weekdays[date.getDay()]}, ${date.getDate()} ${months[date.getMonth()]}`;
}

function formatMonth(dateString) {
  const date = new Date(`${dateString}T12:00:00`);
  const months = ['yan', 'fev', 'mar', 'apr', 'may', 'iyn', 'iyl', 'avg', 'sen', 'okt', 'noy', 'dek'];
  return `${months[date.getMonth()]} ${date.getFullYear()}`;
}

function formatAverage(seconds) {
  if (seconds >= 60) return `${Math.floor(seconds / 60)} daq ${seconds % 60} son`;
  return `${seconds} son`;
}

$('#dashboard-period').addEventListener('change', loadDashboard);

async function loadQuestions() {
  try {
    const questions = await request('/questions');
    $('#question-count').textContent = questions.length;
    const list = $('#question-list');
    list.replaceChildren();
    if (!questions.length) {
      list.innerHTML = '<p class="empty">Savollar hozircha yo‘q. Birinchi savolni qo‘shing.</p>';
      return;
    }
    questions.forEach((question) => {
      const item = document.createElement('div');
      item.className = 'question-item';
      const info = document.createElement('div');
      const title = document.createElement('p');
      title.textContent = question.prompt;
      const meta = document.createElement('small');
      meta.textContent = `${question.stage}-bosqich · ${question.score} ball`;
      info.append(title, meta);
      const actions = document.createElement('div');
      actions.className = 'question-actions';
      const edit = document.createElement('button');
      edit.className = 'edit-btn';
      edit.type = 'button';
      edit.textContent = 'Tahrirlash';
      edit.addEventListener('click', () => beginEdit(question));
      const remove = document.createElement('button');
      remove.className = 'delete-btn';
      remove.type = 'button';
      remove.textContent = 'O‘chirish';
      remove.addEventListener('click', async () => {
        if (!window.confirm('Bu savolni o‘chirasizmi?')) return;
        try {
          await request(`/questions/${question.id}`, { method: 'DELETE' });
          if (editingQuestionId === question.id) resetQuestionForm();
          loadQuestions();
          toast('Savol o‘chirildi.');
        }
        catch (error) { toast(error.message); }
      });
      actions.append(edit, remove);
      item.append(info, actions);
      list.append(item);
    });
  } catch (error) { toast(error.message); }
}

function beginEdit(question) {
  editingQuestionId = question.id;
  $('#question-form-title').textContent = 'Savolni tahrirlash';
  $('#save-question-btn').innerHTML = 'O‘zgarishlarni saqlash <span>↗</span>';
  $('#cancel-edit-btn').hidden = false;
  $('#prompt-input').value = question.prompt;
  $('#correct-input').value = question.answer;
  $('#hint-input').value = question.hint;
  $('#stage-input').value = question.stage;
  $('#form-message').textContent = '';
  $('#question-form').scrollIntoView({ behavior: 'smooth', block: 'start' });
  $('#prompt-input').focus({ preventScroll: true });
}

function resetQuestionForm() {
  editingQuestionId = null;
  $('#question-form').reset();
  $('#question-form-title').textContent = 'Yangi savol';
  $('#save-question-btn').innerHTML = 'Savolni saqlash <span>↗</span>';
  $('#cancel-edit-btn').hidden = true;
  $('#form-message').textContent = '';
}

$('#cancel-edit-btn').addEventListener('click', resetQuestionForm);

$('#question-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const message = $('#form-message');
  try {
    const questionData = {
      prompt: $('#prompt-input').value.trim(), answer: $('#correct-input').value.trim(),
      hint: $('#hint-input').value.trim(), stage: Number($('#stage-input').value),
    };
    const editing = editingQuestionId !== null;
    await request(editing ? `/questions/${editingQuestionId}` : '/questions', {
      method: editing ? 'PUT' : 'POST',
      body: JSON.stringify(questionData),
    });
    resetQuestionForm();
    message.textContent = editing ? 'Savol yangilandi.' : 'Savol saqlandi.';
    loadQuestions();
  } catch (error) { message.textContent = error.message; }
});

async function loadSettings() {
  try {
    const settings = await request('/settings');
    $('#threshold-one').value = settings.stage_one_threshold;
    $('#threshold-two').value = settings.stage_two_threshold;
    $('#return-score').value = settings.stage_two_return_score;
  } catch (error) { toast(error.message); }
}

$('#settings-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  try {
    await request('/settings', { method: 'PUT', body: JSON.stringify({
      stage_one_threshold: Number($('#threshold-one').value),
      stage_two_threshold: Number($('#threshold-two').value),
      stage_two_return_score: Number($('#return-score').value),
    }) });
    $('#settings-message').textContent = 'Sozlamalar saqlandi.';
  } catch (error) { $('#settings-message').textContent = error.message; }
});
