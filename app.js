/* ============ ESTADO ============ */
const state = {
  milestones: [],          // [{name, duration}] duration en minutos
  currentIndex: 0,
  running: false,
  accumulatedMs: 0,        // ms acumulados antes del último "resume"
  resumeAt: 0,              // timestamp del último resume
  segmentStartMs: 0,        // elapsed (ms) en que empezó el hito actual
  fired: {},                // flags de avisos ya disparados por hito actual
  log: [],                  // hitos ya completados: {name, plannedSec, actualSec}
  sessionStartedAt: null,
  templates: [],
  activeTemplateName: null,
  tickHandle: null
};

const RING_CIRC = 2 * Math.PI * 96;

/* ============ UTILS ============ */
function fmt(sec) {
  sec = Math.max(0, Math.round(sec));
  const m = Math.floor(sec / 60).toString().padStart(2, "0");
  const s = Math.floor(sec % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}
function fmtSigned(sec) {
  const sign = sec > 0 ? "+" : sec < 0 ? "−" : "";
  return `${sign}${fmt(Math.abs(sec))}`;
}
function elapsedMs() {
  if (!state.running) return state.accumulatedMs;
  return state.accumulatedMs + (Date.now() - state.resumeAt);
}
function currentMilestone() {
  return state.milestones[state.currentIndex] || null;
}

/* ============ AVISOS: sonido / vibración / toast ============ */
let audioCtx = null;
function beep(freq, dur, delay = 0) {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const t0 = audioCtx.currentTime + delay;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(0.25, t0 + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  } catch (e) { /* audio no disponible */ }
}
function vibrate(pattern) {
  if (navigator.vibrate) navigator.vibrate(pattern);
  // Nota: Safari/iOS no soporta la Vibration API — en iPhone solo tendrás sonido + aviso visual.
}
function showToast(message, kind = "info") {
  const el = document.createElement("div");
  el.className = `toast ${kind}`;
  el.textContent = message;
  document.getElementById("toast-container").appendChild(el);
  setTimeout(() => el.remove(), 3000);
}

const ALERTS = {
  half:    { toast: (n) => `⏳ Vas a la mitad de "${n}"`,        kind: "info",    beep: () => beep(600, 0.15) },
  ten:     { toast: (n) => `⏳ Quedan 10 min para "${n}"`,        kind: "info",    beep: () => { beep(750, 0.15); beep(750, 0.15, 0.2); } },
  five:    { toast: (n) => `⚠️ Quedan 5 min para "${n}"`,         kind: "warn",    beep: () => { beep(900, 0.15); beep(900, 0.15, 0.2); beep(900,0.15,0.4);} },
  reached: { toast: (n) => `⏰ Tiempo objetivo de "${n}" cumplido`, kind: "warn",  beep: () => { beep(420, 0.25); beep(420, 0.25, 0.35); } }
};
function fireAlert(key, name) {
  if (state.fired[key]) return;
  state.fired[key] = true;
  const a = ALERTS[key];
  showToast(a.toast(name), a.kind);
  a.beep();
  vibrate(key === "reached" ? [120, 80, 120, 80, 200] : [80]);
}

/* ============ TIMER ENGINE ============ */
function tick() {
  const ms = elapsedMs();
  const totalSec = ms / 1000;
  document.getElementById("elapsed-time").textContent = fmt(totalSec);

  const m = currentMilestone();
  if (!m) return;

  const segStartSec = state.segmentStartMs / 1000;
  const targetSec = m.duration * 60;
  const inSegmentSec = totalSec - segStartSec;
  const remaining = targetSec - inSegmentSec;

  // avisos
  if (remaining <= 0) fireAlert("reached", m.name);
  else if (targetSec > 300 && remaining <= 300) fireAlert("five", m.name);
  else if (targetSec > 600 && remaining <= 600) fireAlert("ten", m.name);
  else if (remaining <= targetSec / 2) fireAlert("half", m.name);

  // anillo de progreso
  const ratio = Math.min(1, Math.max(0, inSegmentSec / targetSec));
  const ring = document.getElementById("ring-fill");
  ring.style.strokeDashoffset = RING_CIRC * (1 - ratio);
  ring.style.stroke = remaining < 0 ? "var(--accent-warning)"
                     : remaining <= 300 ? "var(--accent-primary)"
                     : "var(--accent-secondary)";

  document.getElementById("current-milestone-name").textContent = m.name;
  const remLabel = document.getElementById("remaining-label");
  if (remaining >= 0) {
    remLabel.textContent = `quedan ${fmt(remaining)}`;
    remLabel.classList.remove("over");
  } else {
    remLabel.textContent = `${fmtSigned(remaining)} sobre el objetivo`;
    remLabel.classList.add("over");
  }

  renderMilestoneTrack();
}

function startTimer() {
  state.running = true;
  state.resumeAt = Date.now();
  state.tickHandle = setInterval(tick, 250);
}
function pauseTimer() {
  state.running = false;
  state.accumulatedMs = elapsedMs();
  clearInterval(state.tickHandle);
}

/* ============ FLUJO DE SESIÓN ============ */
function beginSession() {
  const rows = [...document.querySelectorAll(".milestone-row")];
  const milestones = rows.map(r => ({
    name: r.querySelector(".ms-name").value.trim() || "Hito",
    duration: parseFloat(r.querySelector(".ms-duration").value) || 1
  }));
  if (milestones.length === 0) {
    showToast("Añade al menos un hito para empezar", "warn");
    return;
  }
  state.milestones = milestones;
  state.currentIndex = 0;
  state.accumulatedMs = 0;
  state.segmentStartMs = 0;
  state.fired = {};
  state.log = [];
  state.sessionStartedAt = Date.now();

  document.getElementById("setup-panel").classList.add("hidden");
  document.getElementById("run-panel").classList.remove("hidden");
  renderMilestoneTrack();
  startTimer();
}

function goNextMilestone() {
  const m = currentMilestone();
  if (!m) return;
  const nowSec = elapsedMs() / 1000;
  const actualSec = nowSec - state.segmentStartMs / 1000;
  state.log.push({ name: m.name, plannedSec: m.duration * 60, actualSec });

  state.currentIndex++;
  state.segmentStartMs = elapsedMs();
  state.fired = {};

  if (!currentMilestone()) {
    finishSession();
  } else {
    renderMilestoneTrack();
  }
}

async function finishSession() {
  pauseTimer();
  const totalActual = elapsedMs() / 1000;
  const totalPlanned = state.milestones.reduce((s, m) => s + m.duration * 60, 0);

  const session = {
    templateName: state.activeTemplateName || "Sesión libre",
    startedAt: state.sessionStartedAt,
    totalPlannedSec: totalPlanned,
    totalActualSec: totalActual,
    milestones: state.log
  };
  try {
    await FirebaseAPI.saveSession(session);
  } catch (e) { showToast("No se pudo guardar en el historial", "warn"); }

  showToast("Sesión guardada ✨", "success");
  resetToSetup();
  renderHistory();
}

function resetToSetup() {
  clearInterval(state.tickHandle);
  state.running = false;
  document.getElementById("run-panel").classList.add("hidden");
  document.getElementById("setup-panel").classList.remove("hidden");
  document.getElementById("elapsed-time").textContent = "00:00";
}

/* ============ RENDER: editor de hitos (reutilizable) ============ */
function addMilestoneRow(container, data = { name: "", duration: "" }) {
  const tpl = document.getElementById("milestone-row-template");
  const row = tpl.content.firstElementChild.cloneNode(true);
  row.querySelector(".ms-name").value = data.name;
  row.querySelector(".ms-duration").value = data.duration;
  row.querySelector(".ms-remove").addEventListener("click", () => row.remove());
  container.appendChild(row);
  return row;
}

function loadMilestonesIntoSetup(milestones) {
  const editor = document.getElementById("milestone-editor");
  editor.innerHTML = "";
  milestones.forEach(m => addMilestoneRow(editor, m));
}

/* ============ RENDER: pista de hitos durante la sesión ============ */
function renderMilestoneTrack() {
  const track = document.getElementById("milestone-track");
  track.innerHTML = "";
  state.milestones.forEach((m, i) => {
    const item = document.createElement("div");
    let cls = "track-item";
    let deltaHtml = "";
    if (i < state.currentIndex) {
      cls += " done";
      const entry = state.log[i];
      const delta = entry.actualSec - entry.plannedSec;
      const deltaCls = delta > 0 ? "late" : delta < 0 ? "early" : "";
      deltaHtml = `<span class="delta ${deltaCls}">${fmtSigned(delta)}</span>`;
    } else if (i === state.currentIndex) {
      cls += " current";
      deltaHtml = `<span class="delta">${m.duration} min</span>`;
    } else {
      deltaHtml = `<span class="delta">${m.duration} min</span>`;
    }
    item.className = cls;
    item.innerHTML = `<span class="name">${i + 1}. ${m.name}</span>${deltaHtml}`;
    track.appendChild(item);
  });
}

/* ============ RENDER: plantillas ============ */
async function renderTemplates() {
  const list = document.getElementById("templates-list");
  list.innerHTML = `<p class="empty-state">Cargando…</p>`;
  try {
    state.templates = await FirebaseAPI.getTemplates();
  } catch (e) {
    list.innerHTML = `<p class="empty-state">No se pudieron cargar las plantillas.</p>`;
    return;
  }
  const picker = document.getElementById("template-picker");
  picker.innerHTML = `<option value="">— Sesión libre (sin plantilla) —</option>`;
  state.templates.forEach(t => {
    const opt = document.createElement("option");
    opt.value = t.id;
    opt.textContent = t.name;
    picker.appendChild(opt);
  });

  if (state.templates.length === 0) {
    list.innerHTML = `<p class="empty-state">Aún no tienes plantillas guardadas 💕</p>`;
    return;
  }
  list.innerHTML = "";
  state.templates.forEach(t => {
    const card = document.createElement("div");
    card.className = "card";
    const totalMin = t.milestones.reduce((s, m) => s + Number(m.duration), 0);
    card.innerHTML = `
      <p class="card-title">${t.name}</p>
      <p class="card-sub">${t.milestones.length} hitos · ${totalMin} min total</p>
      <div class="card-actions">
        <button class="btn btn-secondary use-btn">Usar</button>
        <button class="btn btn-ghost edit-btn">Editar</button>
        <button class="btn btn-ghost btn-danger del-btn">Borrar</button>
      </div>`;
    card.querySelector(".use-btn").addEventListener("click", () => {
      state.activeTemplateName = t.name;
      loadMilestonesIntoSetup(t.milestones);
      switchView("timer");
    });
    card.querySelector(".edit-btn").addEventListener("click", () => openTemplateEditor(t));
    card.querySelector(".del-btn").addEventListener("click", async () => {
      if (!confirm(`¿Borrar la plantilla "${t.name}"?`)) return;
      await FirebaseAPI.deleteTemplate(t.id);
      renderTemplates();
    });
    list.appendChild(card);
  });
}

function openTemplateEditor(template = null) {
  const list = document.getElementById("templates-list");
  const card = document.createElement("div");
  card.className = "card";
  card.innerHTML = `
    <input type="text" class="select tpl-name" placeholder="Nombre de la plantilla (ej. Manicura completa)" style="margin-bottom:10px;" value="${template ? template.name : ""}">
    <div class="milestone-editor tpl-editor"></div>
    <button class="btn btn-ghost add-row-btn">+ Añadir hito</button>
    <div class="card-actions">
      <button class="btn btn-primary save-tpl-btn">Guardar</button>
      <button class="btn btn-ghost cancel-tpl-btn">Cancelar</button>
    </div>`;
  list.prepend(card);

  const editor = card.querySelector(".tpl-editor");
  (template ? template.milestones : [{ name: "", duration: "" }]).forEach(m => addMilestoneRow(editor, m));

  card.querySelector(".add-row-btn").addEventListener("click", () => addMilestoneRow(editor));
  card.querySelector(".cancel-tpl-btn").addEventListener("click", () => card.remove());
  card.querySelector(".save-tpl-btn").addEventListener("click", async () => {
    const name = card.querySelector(".tpl-name").value.trim();
    const rows = [...editor.querySelectorAll(".milestone-row")];
    const milestones = rows.map(r => ({
      name: r.querySelector(".ms-name").value.trim() || "Hito",
      duration: parseFloat(r.querySelector(".ms-duration").value) || 1
    }));
    if (!name || milestones.length === 0) {
      showToast("Ponle nombre y al menos un hito", "warn");
      return;
    }
    await FirebaseAPI.saveTemplate({ id: template ? template.id : null, name, milestones });
    showToast("Plantilla guardada ✨", "success");
    renderTemplates();
  });
}

/* ============ RENDER: historial ============ */
async function renderHistory() {
  const list = document.getElementById("history-list");
  list.innerHTML = `<p class="empty-state">Cargando…</p>`;
  let sessions = [];
  try {
    sessions = await FirebaseAPI.getHistory();
  } catch (e) {
    list.innerHTML = `<p class="empty-state">No se pudo cargar el historial.</p>`;
    return;
  }
  if (sessions.length === 0) {
    list.innerHTML = `<p class="empty-state">Todavía no hay sesiones guardadas 📈</p>`;
    return;
  }
  list.innerHTML = "";
  sessions.forEach(s => {
    const date = new Date(s.startedAt);
    const dateStr = date.toLocaleDateString("es-ES", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
    const delta = s.totalActualSec - s.totalPlannedSec;
    const deltaCls = delta > 0 ? "late" : delta < 0 ? "early" : "";
    const card = document.createElement("div");
    card.className = "card";
    card.innerHTML = `
      <p class="card-title">${s.templateName}</p>
      <p class="card-sub">${dateStr}</p>
      <div class="card-row"><span>Previsto</span><span>${fmt(s.totalPlannedSec)}</span></div>
      <div class="card-row"><span>Real</span><span>${fmt(s.totalActualSec)}</span></div>
      <div class="card-row"><span>Diferencia</span><span class="delta ${deltaCls}">${fmtSigned(delta)}</span></div>
      ${(s.milestones || []).map(m => `
        <div class="card-row"><span>· ${m.name}</span><span class="delta ${m.actualSec > m.plannedSec ? 'late' : 'early'}">${fmtSigned(m.actualSec - m.plannedSec)}</span></div>
      `).join("")}
    `;
    list.appendChild(card);
  });
}

/* ============ NAVEGACIÓN ============ */
function switchView(view) {
  document.querySelectorAll(".view").forEach(v => v.classList.remove("active"));
  document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
  document.getElementById(`view-${view}`).classList.add("active");
  document.querySelector(`.tab[data-view="${view}"]`).classList.add("active");
  if (view === "templates") renderTemplates();
  if (view === "history") renderHistory();
}

/* ============ INIT ============ */
document.addEventListener("DOMContentLoaded", () => {
  loadMilestonesIntoSetup([{ name: "", duration: "" }]);

  document.querySelectorAll(".tab").forEach(tab => {
    tab.addEventListener("click", () => switchView(tab.dataset.view));
  });

  document.getElementById("add-milestone-btn").addEventListener("click", () => {
    addMilestoneRow(document.getElementById("milestone-editor"));
  });

  document.getElementById("template-picker").addEventListener("change", (e) => {
    const t = state.templates.find(t => t.id === e.target.value);
    if (t) {
      state.activeTemplateName = t.name;
      loadMilestonesIntoSetup(t.milestones);
    } else {
      state.activeTemplateName = null;
      loadMilestonesIntoSetup([{ name: "", duration: "" }]);
    }
  });

  document.getElementById("start-btn").addEventListener("click", beginSession);
  document.getElementById("next-btn").addEventListener("click", goNextMilestone);
  document.getElementById("finish-btn").addEventListener("click", () => {
    if (confirm("¿Terminar la sesión ahora?")) finishSession();
  });
  document.getElementById("pause-btn").addEventListener("click", () => {
    const btn = document.getElementById("pause-btn");
    if (state.running) {
      pauseTimer();
      btn.textContent = "▶ Reanudar";
    } else {
      startTimer();
      btn.textContent = "⏸ Pausa";
    }
  });
  document.getElementById("new-template-btn").addEventListener("click", () => openTemplateEditor());

  renderTemplates();

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("service-worker.js").catch(() => {});
  }
});
