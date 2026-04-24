/* ====================================================================
   수업용 프리젠터 — 애플리케이션 로직
   Firebase Realtime Database + 수업 코드 + QR 입장
   ==================================================================== */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getDatabase, ref, push, set, get, remove,
  onChildAdded, onChildRemoved, serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

/* ── Firebase 설정 ── */
const firebaseConfig = {
  apiKey: "AIzaSyB_wsXQ_THiDLIvlaQAKEJCzIlz5M5dbDY",
  authDomain: "yadoran-2025.firebaseapp.com",
  databaseURL: "https://yadoran-2025-default-rtdb.firebaseio.com",
  projectId: "yadoran-2025",
  storageBucket: "yadoran-2025.firebasestorage.app",
  messagingSenderId: "266288546185",
  appId: "1:266288546185:web:727060b22ce9643d0c2158",
  measurementId: "G-7MX74KVJCE",
};
const firebaseApp = initializeApp(firebaseConfig);
const db = getDatabase(firebaseApp);

/* ── Firebase key 정규화
   Firebase path 금지문자: . # $ [ ] / 및 공백
   한글 포함 나머지는 허용 ── */
function toFbKey(str) {
  if (!str) return "_empty_";
  return String(str).replace(/[.#$[\]\/\s]/g, "_");
}

/* ── 활성 Firebase 리스너 해제 관리 ── */
const activeUnsubscribers = [];
function clearListeners() {
  while (activeUnsubscribers.length) activeUnsubscribers.pop()();
}

/* ====================================================================
   앱 상태
   ==================================================================== */

const app = {
  lesson: null,
  currentIdx: 0,
  isTeacher: false,
  sessionCode: null,   // 현재 수업 코드
};

/* ====================================================================
   진입점 — 수업 코드 게이팅
   ==================================================================== */
async function init() {
  const params = new URLSearchParams(location.search);
  const lessonId = params.get("lesson");
  app.isTeacher = params.get("teacher") === "1";
  const codeInUrl = params.get("code") || "";

  // 레슨 파라미터가 없으면 대시보드 표시
  if (!lessonId) {
    showDashboard();
    return;
  }

  // 레슨 데이터 로드
  try {
    const res = await fetch(`lessons/${lessonId}.json?_=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) throw new Error(`${res.status}`);
    app.lesson = await res.json();
    await loadExternalAssets();
  } catch (err) {
    document.body.innerHTML = `
      <div style="padding:3rem;font-family:sans-serif;">
        <h1>수업 자료를 불러오지 못했습니다</h1>
        <p>파일: <code>lessons/${lessonId}.json</code></p>
        <p>오류: ${err.message}</p>
      </div>`;
    return;
  }

  // QR로 코드가 URL에 있으면 바로 입장
  if (codeInUrl) {
    enterSession(codeInUrl.trim());
    return;
  }

  // 교사 모드: 세션 관리 화면
  if (app.isTeacher) {
    showTeacherGate();
    return;
  }

  // 학생 모드: 코드 입력 화면
  showStudentGate();
}

/* ====================================================================
   대시보드 메인 화면
   ==================================================================== */
function showDashboard() {
  document.body.innerHTML = "";
  document.body.style.background = ""; // 배경 초기화

  const lessons = [
    { id: "rat-disc-1", group: "합리적 차별 금지", title: "1차시: 차별금지가 적용되는 영역", desc: "편견과 차별의 정의를 배우고 우리 주변의 사례를 탐구합니다." },
    { id: "rat-disc-2", group: "합리적 차별 금지", title: "2차시: 합리적 차별의 판단 기준", desc: "어떤 차별이 정당한지, 합리적 차별의 요건을 알아봅니다." },
    { id: "family-law-1", group: "법과 생활", title: "1차시: 현대 사회와 가족법", desc: "가족 관계에서 발생하는 법적 문제와 권리를 학습합니다." }
  ];

  const container = document.createElement("div");
  container.className = "dashboard";

  const inner = document.createElement("div");
  inner.className = "dashboard__inner";

  // 헤더
  const header = document.createElement("header");
  header.className = "dashboard__header";
  header.innerHTML = `
    <div class="dashboard__logo">🛵</div>
    <h1 class="dashboard__title">사회교육플랫폼 BOOONG</h1>
    <p class="dashboard__subtitle">배움의 즐거움을 배달하는 스마트 수업 프리젠터</p>
  `;
  inner.appendChild(header);

  // 수업 목록 섹션
  const lessonSection = document.createElement("section");
  lessonSection.className = "dashboard__section";
  lessonSection.innerHTML = `<h2 class="dashboard__section-title">수업 목록</h2>`;
  
  const lessonGrid = document.createElement("div");
  lessonGrid.className = "dashboard__grid";

  lessons.forEach(l => {
    const card = document.createElement("a");
    card.className = "dash-card";
    card.href = `?lesson=${l.id}`;
    card.innerHTML = `
      <div class="dash-card__tag">${l.group}</div>
      <h3 class="dash-card__title">${l.title}</h3>
      <p class="dash-card__desc">${l.desc}</p>
      <div class="dash-card__footer">수업 입장 <span class="dash-card__arrow">→</span></div>
    `;
    lessonGrid.appendChild(card);
  });
  lessonSection.appendChild(lessonGrid);
  inner.appendChild(lessonSection);

  // 도구 섹션
  const toolSection = document.createElement("section");
  toolSection.className = "dashboard__section";
  toolSection.innerHTML = `<h2 class="dashboard__section-title">도구 및 가이드</h2>`;

  const toolGrid = document.createElement("div");
  toolGrid.className = "dashboard__grid";

  // 블록 가이드 카드
  const guideCard = document.createElement("a");
  guideCard.className = "dash-card dash-card--tool";
  guideCard.href = `?lesson=block-guide`;
  guideCard.innerHTML = `
    <div class="dash-card__tag">시스템 가이드</div>
    <h3 class="dash-card__title">블록 가이드 갤러리</h3>
    <p class="dash-card__desc">모든 블록 유형의 시각적 예시와 JSON 작성법을 한눈에 확인하세요.</p>
    <div class="dash-card__footer">가이드 열기 <span class="dash-card__arrow">→</span></div>
  `;
  toolGrid.appendChild(guideCard);

  // 인쇄 모드 카드
  const printCard = document.createElement("a");
  printCard.className = "dash-card dash-card--print";
  printCard.href = `print.html`;
  printCard.innerHTML = `
    <div class="dash-card__tag">도구</div>
    <h3 class="dash-card__title">인쇄용 페이지 생성</h3>
    <p class="dash-card__desc">구글 스프레드시트의 자료를 A4 크기에 맞게 자동으로 배치하여 출력합니다.</p>
    <div class="dash-card__footer">인쇄 페이지로 이동 <span class="dash-card__arrow">→</span></div>
  `;
  toolGrid.appendChild(printCard);

  toolSection.appendChild(toolGrid);
  inner.appendChild(toolSection);

  container.appendChild(inner);
  document.body.appendChild(container);
}

/* ====================================================================
   게이트 화면 — 학생
   ==================================================================== */
function showStudentGate() {
  document.body.innerHTML = "";
  const gate = buildGateShell("학생 입장", "선생님이 알려준 수업 코드를 입력하세요");

  const input = document.createElement("input");
  input.type = "text";
  input.placeholder = "예) 잠원중3반";
  input.className = "gate__input";
  input.autofocus = true;

  const btn = document.createElement("button");
  btn.className = "gate__btn";
  btn.textContent = "입장하기 →";

  const err = document.createElement("div");
  err.className = "gate__error";

  const enter = async () => {
    const code = input.value.trim();
    if (!code) { showGateError(err, "수업 코드를 입력해주세요."); return; }
    btn.disabled = true;
    btn.textContent = "확인 중…";
    // 학생은 코드 존재 여부 확인 없이 그냥 입장 (코드=방 이름)
    enterSession(code);
  };

  btn.addEventListener("click", enter);
  input.addEventListener("keydown", e => { if (e.key === "Enter") enter(); });

  gate.form.appendChild(input);
  gate.form.appendChild(err);
  gate.form.appendChild(btn);
  document.body.appendChild(gate.el);
  input.focus();
}

/* ====================================================================
   게이트 화면 — 교사
   ==================================================================== */
function showTeacherGate() {
  document.body.innerHTML = "";
  const gate = buildGateShell("교사 모드", "수업 코드를 만들거나 기존 코드로 입장하세요");

  // 새 수업 코드 생성 섹션
  const createLabel = document.createElement("div");
  createLabel.className = "gate__section-label";
  createLabel.textContent = "새 수업 코드 만들기";

  const createInput = document.createElement("input");
  createInput.type = "text";
  createInput.placeholder = "예) 잠원중3반";
  createInput.className = "gate__input";

  const createBtn = document.createElement("button");
  createBtn.className = "gate__btn";
  createBtn.textContent = "코드 생성 →";

  const createErr = document.createElement("div");
  createErr.className = "gate__error";

  createBtn.addEventListener("click", async () => {
    const code = createInput.value.trim();
    if (!code) { showGateError(createErr, "코드를 입력해주세요."); return; }

    createBtn.disabled = true;
    createBtn.textContent = "확인 중…";

    // 중복 체크
    const snap = await get(ref(db, `sessions/${toFbKey(code)}`));
    if (snap.exists()) {
      createBtn.disabled = false;
      createBtn.textContent = "코드 생성 →";
      showGateError(createErr, "이미 사용 중인 코드입니다. 다른 코드를 입력해주세요.");
      return;
    }

    // Firebase에 세션 등록
    await set(ref(db, `sessions/${toFbKey(code)}`), {
      code,
      createdAt: new Date().toISOString(),
    });

    enterSession(code);
  });

  // 기존 코드로 입장 섹션
  const joinLabel = document.createElement("div");
  joinLabel.className = "gate__section-label gate__section-label--secondary";
  joinLabel.textContent = "기존 코드로 입장";

  const joinInput = document.createElement("input");
  joinInput.type = "text";
  joinInput.placeholder = "기존 수업 코드";
  joinInput.className = "gate__input gate__input--secondary";

  const joinBtn = document.createElement("button");
  joinBtn.className = "gate__btn gate__btn--secondary";
  joinBtn.textContent = "입장하기 →";

  const joinErr = document.createElement("div");
  joinErr.className = "gate__error";

  const joinEnter = async () => {
    const code = joinInput.value.trim();
    if (!code) { showGateError(joinErr, "코드를 입력해주세요."); return; }
    joinBtn.disabled = true;
    joinBtn.textContent = "확인 중…";
    const snap = await get(ref(db, `sessions/${toFbKey(code)}`));
    if (!snap.exists()) {
      joinBtn.disabled = false;
      joinBtn.textContent = "입장하기 →";
      showGateError(joinErr, "존재하지 않는 코드입니다.");
      return;
    }
    enterSession(code);
  };

  joinBtn.addEventListener("click", joinEnter);
  joinInput.addEventListener("keydown", e => { if (e.key === "Enter") joinEnter(); });

  gate.form.appendChild(createLabel);
  gate.form.appendChild(createInput);
  gate.form.appendChild(createErr);
  gate.form.appendChild(createBtn);

  const divider = document.createElement("div");
  divider.className = "gate__divider";
  divider.innerHTML = "<span>또는</span>";
  gate.form.appendChild(divider);

  gate.form.appendChild(joinLabel);
  gate.form.appendChild(joinInput);
  gate.form.appendChild(joinErr);
  gate.form.appendChild(joinBtn);

  document.body.appendChild(gate.el);
  createInput.focus();
}

function buildGateShell(title, subtitle) {
  const el = document.createElement("div");
  el.className = "gate";

  const box = document.createElement("div");
  box.className = "gate__box";

  const logo = document.createElement("div");
  logo.className = "gate__logo";
  logo.textContent = "🎓";

  const h1 = document.createElement("h1");
  h1.className = "gate__title";
  h1.textContent = title;

  const sub = document.createElement("p");
  sub.className = "gate__subtitle";
  sub.textContent = subtitle;

  const form = document.createElement("div");
  form.className = "gate__form";

  box.appendChild(logo);
  box.appendChild(h1);
  box.appendChild(sub);
  box.appendChild(form);
  el.appendChild(box);

  return { el, form };
}

function showGateError(el, msg) {
  el.textContent = msg;
  setTimeout(() => { el.textContent = ""; }, 4000);
}

/* ====================================================================
   수업 입장 — 공통
   ==================================================================== */
function enterSession(code) {
  app.sessionCode = code;

  // 코드를 localStorage에 저장 (새로고침 시 재입력 불필요)
  localStorage.setItem("session-code", code);

  document.body.innerHTML = "";
  document.body.style.cssText = "";

  buildAppShell();
  renderSidebar();
  renderNavFooter();

  if (app.isTeacher) {
    showQRPanel(code);
    const badge = document.createElement("div");
    badge.className = "teacher-badge";
    badge.textContent = `👩‍🏫 교사 모드 · ${code}`;
    document.body.appendChild(badge);
  } else {
    const badge = document.createElement("div");
    badge.className = "student-badge";
    badge.textContent = `📚 ${code}`;
    document.body.appendChild(badge);
  }

  const hash = location.hash.replace("#", "");
  const idx = app.lesson.sections.findIndex(s => s.id === hash);
  goTo(idx >= 0 ? idx : 0);

  bindKeyboard();
  window.addEventListener("hashchange", () => {
    const h = location.hash.replace("#", "");
    const i = app.lesson.sections.findIndex(s => s.id === h);
    if (i >= 0 && i !== app.currentIdx) goTo(i);
  });

  document.title = `${app.lesson.title} — ${app.lesson.lessonGroup || "수업 자료"}`;
}

function buildAppShell() {
  const appDiv = document.createElement("div");
  appDiv.className = "app";

  const aside = document.createElement("aside");
  aside.className = "sidebar";
  aside.innerHTML = `
    <div class="sidebar__group" id="sidebar-group"></div>
    <h1 class="sidebar__title" id="sidebar-title"></h1>
    <div class="sidebar__subtitle" id="sidebar-subtitle"></div>
    <nav id="sidebar-sections"></nav>
    <div class="sidebar__lesson-links" id="sidebar-lesson-links"></div>
    <div class="sidebar__hotkeys">
      <div><kbd>←</kbd> <kbd>→</kbd> 섹션 이동</div>
      <div><kbd>Space</kbd> 답 열기/닫기</div>
      <div><kbd>Click</kbd> 목차 점프</div>
    </div>
    <div class="sidebar__guide">
      <div class="sidebar__guide-label">📋 수업 지도안</div>
      <a class="sidebar__guide-link"
         href="https://booong.notion.site/rational-discrimination?source=copy_link"
         target="_blank" rel="noopener">지도안 열기</a>
    </div>
  `;

  const main = document.createElement("main");
  main.className = "main";
  main.innerHTML = `
    <div class="main__inner">
      <div id="main-content"></div>
      <div class="nav-footer">
        <button id="nav-prev">← 이전 섹션</button>
        <div class="nav-footer__progress" id="nav-progress"></div>
        <button id="nav-next">다음 섹션 →</button>
      </div>
    </div>
  `;

  appDiv.appendChild(aside);
  appDiv.appendChild(main);
  document.body.appendChild(appDiv);
}

/* ====================================================================
   QR 패널 (교사용)
   ==================================================================== */
function showQRPanel(code) {
  const params = new URLSearchParams(location.search);
  const lessonId = params.get("lesson") || DEFAULT_LESSON;
  const baseUrl = `${location.origin}${location.pathname}`;
  const studentUrl = `${baseUrl}?lesson=${lessonId}&code=${encodeURIComponent(code)}`;

  const panel = document.createElement("div");
  panel.className = "qr-panel";
  panel.id = "qr-panel";

  panel.innerHTML = `
    <div class="qr-panel__inner">
      <div class="qr-panel__header">
        <div class="qr-panel__code-label">수업 코드</div>
        <div class="qr-panel__code">${escapeHtml(code)}</div>
      </div>
      <div class="qr-panel__qr" id="qr-image"></div>
      <div class="qr-panel__url">${escapeHtml(studentUrl)}</div>
      <div class="qr-panel__actions">
        <button class="qr-panel__btn" id="qr-download-csv">📥 CSV 다운로드</button>
        <button class="qr-panel__btn qr-panel__btn--close" id="qr-close">닫기</button>
      </div>
    </div>
  `;

  // QR 이미지 생성 (Google Charts API — 외부 의존성 없이)
  const qrImg = document.createElement("img");
  qrImg.src = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(studentUrl)}`;
  qrImg.alt = "QR 코드";
  qrImg.className = "qr-panel__qr-img";
  panel.querySelector("#qr-image").appendChild(qrImg);

  panel.querySelector("#qr-close").addEventListener("click", () => {
    panel.classList.remove("is-open");
  });

  panel.querySelector("#qr-download-csv").addEventListener("click", () => {
    downloadCSV(code);
  });

  document.body.appendChild(panel);

  // QR 버튼을 사이드바에 추가
  const qrBtn = document.createElement("button");
  qrBtn.className = "sidebar__qr-btn";
  qrBtn.textContent = "📱 QR / 다운로드";
  qrBtn.addEventListener("click", () => panel.classList.toggle("is-open"));

  const guide = document.querySelector(".sidebar__guide");
  if (guide) guide.before(qrBtn);

  // 처음엔 열어서 보여줌
  requestAnimationFrame(() => panel.classList.add("is-open"));
}

/* ====================================================================
   CSV 다운로드
   ==================================================================== */
async function downloadCSV(code) {
  const snap = await get(ref(db, `comments/${toFbKey(code)}`));
  if (!snap.exists()) {
    alert("저장된 답변이 없습니다.");
    return;
  }

  const rows = [["섹션", "질문번호", "이름", "답변", "시간"]];

  snap.forEach(sectionSnap => {
    const rawKey = sectionSnap.key; // e.g. "rat-disc-1__1-1__0"
    sectionSnap.forEach(commentSnap => {
      const c = commentSnap.val();
      // key에서 섹션ID / promptIdx 파싱
      const parts = (c.key || rawKey).split("__");
      const sectionId = parts[1] || rawKey;
      const promptIdx = parts[2] !== undefined ? `Q${Number(parts[2]) + 1}` : "";
      const time = c.createdAt
        ? new Date(c.createdAt).toLocaleString("ko-KR")
        : "";
      rows.push([sectionId, promptIdx, c.name || "", c.text || "", time]);
    });
  });

  const csv = rows.map(r =>
    r.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(",")
  ).join("\n");

  const bom = "\uFEFF"; // Excel UTF-8 BOM
  const blob = new Blob([bom + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${code}_answers.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

/* ====================================================================
   외부 에셋
   ==================================================================== */
async function loadExternalAssets() {
  const SHEET_URLS = [
    // 1. 수업용 에셋 (CTn 계열)
    "https://docs.google.com/spreadsheets/d/e/2PACX-1vT8z4eMwA6UaQLgnZTtj7Xk7-EzBagOfK8YDGUvfogcIa1RV_3h07ggcI2nbN93JbFFdciC9A6uph_4/pub?output=csv",
    // 2. 시험문제 에셋 (날짜[과목] 계열)
    "https://docs.google.com/spreadsheets/d/e/2PACX-1vQYkmQF4OJAcQN2FXGrmjYZP1Kr4geSX3t3O2ArB0_ntOqbvfgRzuoRwKSG--c3czenNUzyBVpW_f1R/pub?output=csv"
  ];

  if (!app.lesson.assets) app.lesson.assets = {};

  for (const url of SHEET_URLS) {
    try {
      const response = await fetch(`${url}&_=${Date.now()}`, { cache: "no-store" });
      const csvText = await response.text();
      
      parseCSV(csvText).forEach(columns => {
        if (columns.length < 4) return;
        const key = columns[1].trim();   // B열: 키 (CT1, 260305[사문] 등)
        const assetUrl = columns[3].trim(); // D열: 실제 URL
        
        if (!key || !assetUrl || key === "JSON 상 호칭" || key === "JSON 코드") return;
        app.lesson.assets[key] = assetUrl;
      });
    } catch (err) {
      console.warn(`Failed to load external assets from ${url}:`, err);
    }
  }
}

function parseCSV(text) {
  const rows = [];
  let row = [], field = "", inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i], n = text[i + 1];
    if (c === '"') {
      if (inQ && n === '"') { field += '"'; i++; } else inQ = !inQ;
    } else if (c === ',' && !inQ) {
      row.push(field); field = "";
    } else if ((c === '\r' || c === '\n') && !inQ) {
      if (c === '\r' && n === '\n') i++;
      row.push(field); rows.push(row);
      row = []; field = "";
    } else { field += c; }
  }
  if (row.length || field) { row.push(field); rows.push(row); }
  return rows;
}

/* ====================================================================
   사이드바
   ==================================================================== */
function renderSidebar() {
  const groupEl = document.getElementById("sidebar-group");
  const titleEl = document.getElementById("sidebar-title");
  const subEl = document.getElementById("sidebar-subtitle");
  if (!titleEl) return;

  if (app.lesson.lessonGroup) {
    groupEl.textContent = app.lesson.lessonGroup;
    groupEl.style.display = "block";
  } else {
    groupEl.style.display = "none";
  }
  titleEl.textContent = app.lesson.title;
  subEl.textContent = app.lesson.subtitle || "";

  const container = document.getElementById("sidebar-sections");
  container.innerHTML = "";
  const list = document.createElement("ul");
  list.className = "sidebar__section-list";
  app.lesson.sections.forEach((sec, idx) => {
    const li = document.createElement("li");
    const btn = document.createElement("button");
    btn.className = "sidebar__section";
    btn.dataset.idx = idx;
    btn.innerHTML = `<span class="sidebar__section-id">${sec.id}</span>${escapeHtml(sec.title)}`;
    btn.addEventListener("click", () => goTo(idx));
    li.appendChild(btn);
    list.appendChild(li);
  });
  container.appendChild(list);
  renderLessonLinks();
}

function renderLessonLinks() {
  const wrap = document.getElementById("sidebar-lesson-links");
  if (!wrap) return;
  wrap.innerHTML = "";
  const { prev, next } = app.lesson;
  if (!prev && !next) { wrap.style.display = "none"; return; }
  wrap.style.display = "flex";
  if (prev) {
    const a = document.createElement("a");
    a.className = "sidebar__lesson-link";
    a.href = `?lesson=${prev}`;
    a.innerHTML = `<span class="sidebar__lesson-link-arrow">←</span> 이전 차시`;
    wrap.appendChild(a);
  } else { wrap.appendChild(document.createElement("span")); }
  if (next) {
    const a = document.createElement("a");
    a.className = "sidebar__lesson-link";
    a.href = `?lesson=${next}`;
    a.innerHTML = `다음 차시 <span class="sidebar__lesson-link-arrow">→</span>`;
    wrap.appendChild(a);
  }
}

/* ====================================================================
   섹션 이동 / 렌더링
   ==================================================================== */
function goTo(idx) {
  if (idx < 0 || idx >= app.lesson.sections.length) return;
  clearListeners();
  app.currentIdx = idx;
  const sec = app.lesson.sections[idx];

  document.querySelectorAll(".sidebar__section").forEach(el => {
    el.classList.toggle("is-active", Number(el.dataset.idx) === idx);
  });
  renderSection(sec);
  renderNavFooter();
  history.replaceState(null, "", `#${sec.id}`);
  window.scrollTo({ top: 0, behavior: "instant" });
}

function renderSection(sec) {
  const main = document.getElementById("main-content");
  if (!main) return;
  main.innerHTML = "";

  const header = document.createElement("div");
  header.className = "section-header";
  header.innerHTML = `
    <div class="section-header__id">${escapeHtml(sec.id)} · ${escapeHtml(app.lesson.title)}</div>
    <h1 class="section-header__title">${escapeHtml(sec.title)}</h1>
  `;
  main.appendChild(header);

  sec.blocks.forEach((block, idx) => {
    const el = renderBlock(block, idx);
    if (el) {
      if (block.type !== "divider") attachFocusAffordance(el);
      main.appendChild(el);
    }
    // 다음 블록이 있고, 현재 블록이 heading이 아닐 때만 구분선 추가
    if (sec.blocks[idx + 1] && block.type !== "heading") {
      main.appendChild(renderDivider());
    }
  });
}

/* ====================================================================
   포커스 오버레이
   ==================================================================== */
function attachFocusAffordance(blockEl) {
  blockEl.classList.add("block--focusable");
  const btn = document.createElement("button");
  btn.className = "focus-btn";
  btn.type = "button";
  btn.setAttribute("aria-label", "이 블록 화면 포커스");
  btn.setAttribute("title", "이 블록에 집중 (ESC로 닫기)");
  btn.textContent = "📺";
  btn.addEventListener("click", e => { e.stopPropagation(); openFocusOverlay(blockEl); });
  blockEl.appendChild(btn);
}

function openFocusOverlay(originalBlockEl) {
  closeFocusOverlay();
  const overlay = document.createElement("div");
  overlay.className = "focus-overlay";
  overlay.id = "focus-overlay";
  const stage = document.createElement("div");
  stage.className = "focus-overlay__stage";
  const closeBtn = document.createElement("button");
  closeBtn.className = "focus-overlay__close";
  closeBtn.type = "button";
  closeBtn.textContent = "✕";
  closeBtn.addEventListener("click", e => { e.stopPropagation(); closeFocusOverlay(); });
  const clone = originalBlockEl.cloneNode(true);
  clone.classList.add("block--focused");
  clone.querySelectorAll(".focus-btn, .comment-section").forEach(b => b.remove());
  rewireToggles(clone);
  stage.appendChild(closeBtn);
  stage.appendChild(clone);
  overlay.appendChild(stage);
  overlay.addEventListener("click", e => { if (e.target === overlay) closeFocusOverlay(); });
  stage.addEventListener("click", e => e.stopPropagation());
  document.body.appendChild(overlay);
  document.body.classList.add("is-focus-locked");
  requestAnimationFrame(() => overlay.classList.add("is-open"));
}

function closeFocusOverlay() {
  const overlay = document.getElementById("focus-overlay");
  if (!overlay) return;
  overlay.classList.remove("is-open");
  document.body.classList.remove("is-focus-locked");
  setTimeout(() => overlay.remove(), 200);
}

function rewireToggles(root) {
  root.querySelectorAll(".answer").forEach(ans => {
    const t = ans.querySelector(".answer__toggle");
    if (t) t.addEventListener("click", () => ans.classList.toggle("is-open"));
  });
  root.querySelectorAll(".expandable").forEach(exp => {
    const s = exp.querySelector(".expandable__summary");
    if (s) s.addEventListener("click", () => exp.classList.toggle("is-open"));
  });
}

/* ====================================================================
   블록 디스패처
   ==================================================================== */
function renderBlock(block, blockIdx) {
  const map = {
    paragraph: renderParagraph,
    heading: renderHeading,
    case: renderCase,
    question: renderQuestion,
    concept: renderConcept,
    "figure-concept": renderFigureConcept,
    "figure-quote": renderFigureQuote,
    "image-row": renderImageRow,
    "quiz-accordion": renderQuizAccordion,
    expandable: renderExpandable,
    summary: renderSummary,
    media: renderMedia,
    divider: renderDivider,
  };
  const fn = map[block.type];
  if (!fn) { console.warn("Unknown block type:", block.type); return null; }
  return fn(block, blockIdx);
}

/* ====================================================================
   블록 렌더러
   ==================================================================== */
function renderParagraph(block) {
  const p = document.createElement("p");
  p.className = "block paragraph";
  p.innerHTML = formatInline(block.text);
  return p;
}

function renderHeading(block) {
  const h = document.createElement("h2");
  h.className = "block section-sub-heading";
  h.innerHTML = formatInline(block.text);
  return h;
}

function renderImageRow(block) {
  const row = document.createElement("div");
  row.className = "block image-row";
  block.images.forEach(src => {
    const wrap = document.createElement("div");
    wrap.className = "image-row__item";
    wrap.appendChild(buildImage(src));
    row.appendChild(wrap);
  });
  return row;
}

function renderCase(block, blockIdx) {
  const div = document.createElement("div");
  div.className = "block callout case";
  let html = "";
  if (block.label) html += `<div class="callout__label">${escapeHtml(block.label)}</div>`;
  html += `<div class="case__text">${formatInline(block.text)}</div>`;
  if (block.sub) html += `<div class="case__sub">${formatInline(block.sub)}</div>`;
  div.innerHTML = html;
  if (block.answer) div.appendChild(buildAnswer(block.answer));

  if (!block.comments) return div;

  // comments: true 이면 case 박스 + 댓글창을 래퍼로 묶어서 반환
  // 댓글창은 초록 박스 바깥, 독립된 영역으로 붙음
  const lessonId = app.lesson.id || app.lesson.title || "lesson";
  const sectionId = app.lesson.sections[app.currentIdx]?.id || `sec${app.currentIdx}`;
  const bIdx = (blockIdx !== undefined) ? blockIdx : 0;
  const commentKey = `${lessonId}__${sectionId}__b${bIdx}__p0`;

  const wrapper = document.createElement("div");
  wrapper.className = "case-with-comments";
  div.classList.remove("block"); // block 마진은 wrapper가 담당
  wrapper.appendChild(div);
  wrapper.appendChild(buildCommentSection(commentKey, "case"));
  return wrapper;
}

function renderQuestion(block, blockIdx) {
  const lessonId = app.lesson.id || app.lesson.title || "lesson";
  const sectionId = app.lesson.sections[app.currentIdx]?.id || `sec${app.currentIdx}`;
  const bIdx = (blockIdx !== undefined) ? blockIdx : 0;

  const div = document.createElement("div");
  div.className = "block callout question";
  div.innerHTML = `<div class="callout__label">🗨️ 생각해볼 문제</div>`;

  const commentSections = [];

  block.prompts.forEach((pr, promptIdx) => {
    const p = document.createElement("div");
    p.className = "question__prompt";
    p.innerHTML = `Q. ${formatInline(pr.q)}`;
    if (pr.note) p.innerHTML += `<div class="question__note">${formatInline(pr.note)}</div>`;
    div.appendChild(p);

    if (pr.answer) div.appendChild(buildAnswer({ text: pr.answer }, "답 보기"));

    if (block.comments) {
      const commentKey = `${lessonId}__${sectionId}__b${bIdx}__p${promptIdx}`;
      commentSections.push({ key: commentKey, label: block.prompts.length > 1 ? `💬 Q${promptIdx + 1} 학생 답변 보기` : "💬 학생 답변 보기" });
    }
  });

  if (block.imagePair) div.appendChild(buildImagePair(block.imagePair));
  if (block.conclusion) {
    const concl = document.createElement("div");
    concl.className = "question__conclusion";
    concl.innerHTML = formatInline(block.conclusion);
    div.appendChild(concl);
  }

  if (!block.comments) return div;

  const outer = document.createElement("div");
  outer.className = "question-with-comments";
  div.classList.remove("block"); // block 마진은 wrapper가 담당
  outer.appendChild(div);

  commentSections.forEach(({ key, label }) => {
    const cs = buildCommentSection(key, "question");
    cs.querySelector(".comment-section__toggle").textContent = label;
    outer.appendChild(cs);
  });

  return outer;
}

function renderConcept(block) {
  const div = document.createElement("div");
  div.className = "block callout concept";
  let html = "";
  if (block.title) html += `<div class="concept__title">💡 ${escapeHtml(block.title)}</div>`;
  if (block.body) html += `<div class="concept__body">${formatInline(block.body)}</div>`;
  if (block.bullets) {
    html += `<ul class="concept__bullets">`;
    block.bullets.forEach(b => { html += `<li>${formatInline(b)}</li>`; });
    html += `</ul>`;
  }
  div.innerHTML = html;
  if (block.image) {
    const img = buildImage(block.image);
    img.style.marginTop = "1rem";
    div.appendChild(img);
  }
  return div;
}

function renderFigureConcept(block) {
  const div = document.createElement("div");
  div.className = "block figure-row";
  const left = document.createElement("div");
  left.className = "figure-row__image-wrap";
  left.appendChild(buildImage(block.figure.image, block.figure.caption));
  if (block.figure.caption) {
    const cap = document.createElement("div");
    cap.className = "figure-row__caption";
    cap.textContent = block.figure.caption;
    left.appendChild(cap);
  }
  const right = document.createElement("div");
  right.className = "callout concept";
  right.style.margin = "0";
  right.innerHTML = `
    <div class="concept__title">💡 ${escapeHtml(block.concept.title)}</div>
    <div class="concept__body">${formatInline(block.concept.body)}</div>
  `;
  div.appendChild(left);
  div.appendChild(right);
  return div;
}

function renderFigureQuote(block) {
  const div = document.createElement("div");
  div.className = "block figure-row";
  const left = document.createElement("div");
  left.className = "figure-row__image-wrap";
  left.appendChild(buildImage(block.figure.image, block.figure.caption));
  if (block.figure.caption) {
    const cap = document.createElement("div");
    cap.className = "figure-row__caption";
    cap.textContent = block.figure.caption;
    left.appendChild(cap);
  }
  const right = document.createElement("div");
  const q = document.createElement("div");
  q.className = "figure-row__quote";
  q.innerHTML = formatInline(block.quote);
  right.appendChild(q);
  if (block.note) {
    const n = document.createElement("div");
    n.className = "figure-row__note";
    n.innerHTML = formatInline(block.note);
    right.appendChild(n);
  }
  div.appendChild(left);
  div.appendChild(right);
  return div;
}

function parseExamTitle(filename) {
  // 예: 250611[사문] -> 2025학년도 6월 11번 [사문]
  const regex = /^(\d{2})(\d{2})(\d{2})\[(.*)\]$/;
  const match = filename.match(regex);
  if (!match) return filename; // 형식에 맞지 않으면 원본 반환

  const [_, yy, mm, nn, subject] = match;
  const year = `20${yy}학년도`;
  const month = `${parseInt(mm, 10)}월`;
  const num = `${parseInt(nn, 10)}번`;
  return `${year} ${month} ${num} [${subject}]`;
}

function renderQuizAccordion(block) {
  const container = document.createElement("div");
  container.className = "block quiz-accordion";

  block.items.forEach(item => {
    const itemEl = document.createElement("div");
    itemEl.className = "quiz-accordion__item";

    const summary = document.createElement("button");
    summary.className = "quiz-accordion__summary";
    summary.innerHTML = `<span class="quiz-accordion__title">${parseExamTitle(item.image)}</span>`;
    
    const content = document.createElement("div");
    content.className = "quiz-accordion__content";
    
    // 문제 이미지
    const imgWrap = document.createElement("div");
    imgWrap.className = "quiz-accordion__image-wrap";
    imgWrap.appendChild(buildImage(item.image));
    content.appendChild(imgWrap);

    // 정답 (있는 경우에만)
    if (item.answer) {
      content.appendChild(buildAnswer(item.answer, "정답 및 해설 보기"));
    }

    summary.addEventListener("click", () => {
      itemEl.classList.toggle("is-open");
    });

    itemEl.appendChild(summary);
    itemEl.appendChild(content);
    container.appendChild(itemEl);
  });

  return container;
}

function renderExpandable(block) {
  const div = document.createElement("div");
  div.className = "block expandable";
  const btn = document.createElement("button");
  btn.className = "expandable__summary";
  btn.textContent = block.summary;
  const content = document.createElement("div");
  content.className = "expandable__content";
  block.children.forEach(child => {
    const el = renderBlock(child);
    if (el) content.appendChild(el);
  });
  btn.addEventListener("click", () => div.classList.toggle("is-open"));
  div.appendChild(btn);
  div.appendChild(content);
  return div;
}

function renderSummary(block) {
  const div = document.createElement("div");
  div.className = "block summary";
  let html = "<ol>";
  block.items.forEach(item => { html += `<li>${formatInline(item)}</li>`; });
  html += "</ol>";
  div.innerHTML = html;
  return div;
}

function extractYouTubeId(url) {
  try {
    const u = new URL(url);
    if (u.searchParams.has("v")) return u.searchParams.get("v");
    if (u.hostname === "youtu.be") return u.pathname.slice(1);
    const m = u.pathname.match(/^\/embed\/([^/?]+)/);
    if (m) return m[1];
  } catch (_) { }
  return null;
}

function renderMedia(block) {
  const div = document.createElement("div");
  div.className = "block media";
  if (block.kind === "image") {
    div.classList.add("media--image");
    div.appendChild(buildImage(block.src, block.caption || ""));
    if (block.caption) {
      const cap = document.createElement("div");
      cap.className = "media__caption";
      cap.textContent = block.caption;
      div.appendChild(cap);
    }
  } else if (block.kind === "video-link") {
    div.classList.add("media--video-link");
    const videoId = extractYouTubeId(block.url);
    const link = document.createElement("a");
    link.href = block.url; link.target = "_blank"; link.rel = "noopener noreferrer";
    link.className = "media__thumb-link";
    link.setAttribute("aria-label", block.caption || "영상 보기");
    const thumbWrap = document.createElement("div");
    thumbWrap.className = "media__thumb-wrap";
    if (videoId) {
      const img = document.createElement("img");
      img.src = `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`;
      img.alt = block.caption || "YouTube 썸네일"; img.loading = "lazy";
      img.onerror = () => { const ph = document.createElement("div"); ph.className = "image-placeholder"; ph.textContent = "썸네일 없음"; img.replaceWith(ph); };
      thumbWrap.appendChild(img);
    }
    const play = document.createElement("div");
    play.className = "media__play-icon"; play.setAttribute("aria-hidden", "true"); play.textContent = "▶";
    thumbWrap.appendChild(play); link.appendChild(thumbWrap); div.appendChild(link);
    if (block.caption) {
      const cap = document.createElement("div");
      cap.className = "media__caption"; cap.textContent = block.caption; div.appendChild(cap);
    }
  }
  return div;
}

function renderDivider() {
  const hr = document.createElement("hr");
  hr.className = "block divider";
  return hr;
}

/* ====================================================================
   댓글 시스템
   ==================================================================== */
function buildCommentSection(key, variant = "question") {
  // variant: "case" | "question" — 부모 블록 색톤 결정
  const wrap = document.createElement("div");
  wrap.className = `comment-section comment-section--${variant}`;

  const btn = document.createElement("button");
  btn.className = "comment-section__toggle";
  btn.textContent = "💬 학생 답변 보기";
  btn.type = "button";

  const content = document.createElement("div");
  content.className = "comment-section__body";

  const list = document.createElement("div");
  list.className = "comment-list";
  list.dataset.key = key;

  content.appendChild(list);
  content.appendChild(buildCommentForm(key, list));

  btn.addEventListener("click", () => {
    const isOpen = wrap.classList.toggle("is-open");
    if (isOpen && !content.dataset.loaded) {
      content.dataset.loaded = "1";
      subscribeComments(key, list);
    }
  });

  wrap.appendChild(btn);
  wrap.appendChild(content);
  return wrap;
}

function subscribeComments(key, list) {
  list.innerHTML = `<div class="comment-loading">불러오는 중…</div>`;

  const fbSessionKey = toFbKey(app.sessionCode);
  const fbCommentKey = toFbKey(key);
  const dbRef = ref(db, `comments/${fbSessionKey}/${fbCommentKey}`);
  let initialized = false;

  const unsubAdded = onChildAdded(dbRef, snap => {
    if (!initialized) { list.innerHTML = ""; initialized = true; }
    appendCommentItem(list, { id: snap.key, fbKey: fbCommentKey, ...snap.val() });
  });

  const emptyTimer = setTimeout(() => {
    if (!initialized) {
      list.innerHTML = `<div class="comment-empty">아직 답변이 없습니다. 첫 번째로 작성해보세요!</div>`;
      initialized = true;
    }
  }, 600);

  const unsubRemoved = onChildRemoved(dbRef, snap => {
    const item = list.querySelector(`.comment-item[data-id="${CSS.escape(snap.key)}"]`);
    if (item) item.remove();
    if (!list.querySelector(".comment-item")) {
      list.innerHTML = `<div class="comment-empty">아직 답변이 없습니다. 첫 번째로 작성해보세요!</div>`;
    }
  });

  activeUnsubscribers.push(() => {
    clearTimeout(emptyTimer);
    unsubAdded();
    unsubRemoved();
  });
}

function appendCommentItem(list, comment) {
  if (list.querySelector(`.comment-item[data-id="${CSS.escape(comment.id)}"]`)) return;
  list.querySelector(".comment-empty")?.remove();

  const item = document.createElement("div");
  item.className = "comment-item";
  item.dataset.id = comment.id;

  const time = comment.createdAt
    ? new Date(comment.createdAt).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })
    : "";

  item.innerHTML = `
    <div class="comment-item__header">
      <span class="comment-item__name">${escapeHtml(comment.name)}</span>
      <span class="comment-item__time">${time}</span>
    </div>
    <div class="comment-item__text">${escapeHtml(comment.text)}</div>
  `;

  if (app.isTeacher) {
    const del = document.createElement("button");
    del.className = "comment-item__delete";
    del.type = "button";
    del.textContent = "✕";
    del.title = "삭제";
    del.addEventListener("click", () => {
      if (confirm("이 답변을 삭제할까요?")) {
        remove(ref(db, `comments/${toFbKey(app.sessionCode)}/${comment.fbKey || toFbKey(list.dataset.key)}/${comment.id}`));
      }
    });
    item.appendChild(del);
  }

  list.appendChild(item);
  item.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function buildCommentForm(key, list) {
  const form = document.createElement("div");
  form.className = "comment-form";

  const nameInput = document.createElement("input");
  nameInput.type = "text";
  nameInput.placeholder = "이름";
  nameInput.className = "comment-form__name";
  nameInput.maxLength = 30;
  const saved = localStorage.getItem("comment-name") || "";
  if (saved) nameInput.value = saved;
  nameInput.addEventListener("input", () => localStorage.setItem("comment-name", nameInput.value));

  const textarea = document.createElement("textarea");
  textarea.placeholder = "이 질문에 대한 내 생각을 적어보세요…";
  textarea.className = "comment-form__text";
  textarea.rows = 3;
  textarea.maxLength = 500;

  const footer = document.createElement("div");
  footer.className = "comment-form__footer";

  const counter = document.createElement("span");
  counter.className = "comment-form__counter";
  counter.textContent = "0 / 500";
  textarea.addEventListener("input", () => { counter.textContent = `${textarea.value.length} / 500`; });

  const submit = document.createElement("button");
  submit.type = "button";
  submit.className = "comment-form__submit";
  submit.textContent = "답변 제출";

  submit.addEventListener("click", async () => {
    const name = nameInput.value.trim();
    const text = textarea.value.trim();
    if (!name) { nameInput.focus(); showFormError(form, "이름을 입력해주세요."); return; }
    if (!text) { textarea.focus(); showFormError(form, "답변 내용을 입력해주세요."); return; }

    submit.disabled = true;
    submit.textContent = "전송 중…";

    try {
      await push(ref(db, `comments/${toFbKey(app.sessionCode)}/${toFbKey(key)}`), {
        key, name, text, createdAt: new Date().toISOString(),
      });
      textarea.value = "";
      counter.textContent = "0 / 500";
      submit.textContent = "✓ 제출됨";
      setTimeout(() => { submit.textContent = "답변 제출"; }, 2000);
    } catch (err) {
      console.error(err);
      showFormError(form, "저장에 실패했습니다. 잠시 후 다시 시도해주세요.");
    } finally {
      submit.disabled = false;
    }
  });

  footer.appendChild(counter);
  footer.appendChild(submit);
  form.appendChild(nameInput);
  form.appendChild(textarea);
  form.appendChild(footer);
  return form;
}

function showFormError(form, msg) {
  let el = form.querySelector(".comment-form__error");
  if (!el) {
    el = document.createElement("div");
    el.className = "comment-form__error";
    form.insertBefore(el, form.querySelector(".comment-form__footer"));
  }
  el.textContent = msg;
  setTimeout(() => el.remove(), 3000);
}

/* ====================================================================
   헬퍼
   ==================================================================== */
function buildAnswer(answer, label = "답 보기") {
  const wrap = document.createElement("div");
  wrap.className = "answer";
  const btn = document.createElement("button");
  btn.className = "answer__toggle";
  btn.textContent = label;
  btn.addEventListener("click", () => wrap.classList.toggle("is-open"));
  const content = document.createElement("div");
  content.className = "answer__content";
  if (answer.bullets) {
    let html = "<ul>";
    answer.bullets.forEach(b => { html += `<li>${formatInline(b)}</li>`; });
    html += "</ul>";
    content.innerHTML = html;
  } else if (answer.text) {
    content.innerHTML = `<p>${formatInline(answer.text)}</p>`;
  }
  wrap.appendChild(btn);
  wrap.appendChild(content);
  return wrap;
}

function buildImagePair(paths) {
  const pair = document.createElement("div");
  pair.className = "image-pair";
  paths.forEach(p => pair.appendChild(buildImage(p)));
  return pair;
}

function buildImage(key, alt = "") {
  let resolved = key;
  if (app.lesson.assets?.[key]) resolved = app.lesson.assets[key];

  // 구글 드라이브 링크 자동 변환 로직 추가
  if (typeof resolved === "string" && resolved.includes("drive.google.com")) {
    const driveIdMatch = resolved.match(/\/d\/([^/]+)/) || resolved.match(/id=([^&]+)/);
    if (driveIdMatch && driveIdMatch[1]) {
      resolved = `https://lh3.googleusercontent.com/d/${driveIdMatch[1]}`;
    }
  }

  if (typeof resolved === "string" && resolved.startsWith("text:")) return buildTextCutout(resolved.slice(5), alt);

  const videoId = extractYouTubeId(resolved);
  if (videoId) {
    const wrap = document.createElement("div"); wrap.className = "media__thumb-wrap";
    const link = document.createElement("a"); link.href = resolved; link.target = "_blank"; link.rel = "noopener noreferrer"; link.className = "media__thumb-link"; link.setAttribute("aria-label", alt || "YouTube 영상 보기");
    const thumb = document.createElement("img"); thumb.src = `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`; thumb.alt = alt || "YouTube 썸네일"; thumb.loading = "lazy";
    thumb.onerror = () => { const ph = document.createElement("div"); ph.className = "image-placeholder"; ph.textContent = "썸네일 없음"; thumb.replaceWith(ph); };
    const play = document.createElement("div"); play.className = "media__play-icon"; play.setAttribute("aria-hidden", "true"); play.textContent = "▶";
    link.appendChild(thumb); link.appendChild(play); wrap.appendChild(link); return wrap;
  }

  const src = /^https?:\/\//.test(resolved) ? resolved : app.lesson.imageBase + resolved;
  const img = document.createElement("img");
  img.src = src; img.alt = alt; img.loading = "lazy";
  
  // 전체화면 보기 이벤트 추가
  img.addEventListener("click", () => openImageLightbox(src));

  img.onerror = () => { const ph = document.createElement("div"); ph.className = "image-placeholder"; ph.textContent = `이미지: ${key}`; img.replaceWith(ph); };
  return img;
}

function formatInline(text) {
  if (!text) return "";
  let s = escapeHtml(text);
  s = s.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  s = s.replace(/\n/g, "<br>");
  return s;
}

function buildTextCutout(body, alt = "") {
  const wrap = document.createElement("div");
  wrap.className = "text-cutout";

  // 줄바꿈 정규화 (\r\n -> \n) 및 앞뒤 공백 제거
  const cleanBody = body.trim().replace(/\r\n/g, "\n");
  
  // 출처 분리 (--- 기준)
  const parts = cleanBody.split(/\n---\n/);
  const mainPart = parts[0].trim();
  const sourcePart = parts[1] ? parts[1].trim() : null;

  // 본문을 줄 단위로 분리
  const lines = mainPart.split("\n");
  let headline = null;
  let restLines = [...lines];

  // 첫 줄이 ## 로 시작하는지 확인 (공백 유무 상관없이 허용)
  if (lines[0] && /^##\s?/.test(lines[0])) {
    headline = lines[0].replace(/^##\s?/, "").trim();
    restLines = lines.slice(1);
    // 제목 다음의 빈 줄들 제거
    while (restLines.length && !restLines[0].trim()) {
      restLines.shift();
    }
  }

  if (headline) {
    const h = document.createElement("div");
    h.className = "text-cutout__headline";
    h.innerHTML = formatInline(headline);
    wrap.appendChild(h);
  }

  const bodyEl = document.createElement("div");
  bodyEl.className = "text-cutout__body";
  bodyEl.innerHTML = formatInline(restLines.join("\n"));
  wrap.appendChild(bodyEl);

  if (sourcePart) {
    const src = document.createElement("div");
    src.className = "text-cutout__source";
    src.innerHTML = formatInline(sourcePart);
    wrap.appendChild(src);
  }

  return wrap;
}

function escapeHtml(s) {
  if (s == null) return "";
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/* ====================================================================
   이미지 라이트박스 (전체화면 보기)
   ==================================================================== */
function openImageLightbox(src) {
  closeImageLightbox();
  const lightbox = document.createElement("div");
  lightbox.className = "image-lightbox";
  lightbox.id = "image-lightbox";
  
  const img = document.createElement("img");
  img.src = src;
  img.className = "image-lightbox__img";
  
  const closeBtn = document.createElement("button");
  closeBtn.className = "image-lightbox__close";
  closeBtn.innerHTML = "✕";
  closeBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    closeImageLightbox();
  });

  lightbox.appendChild(img);
  lightbox.appendChild(closeBtn);
  
  lightbox.addEventListener("click", () => closeImageLightbox());
  img.addEventListener("click", (e) => e.stopPropagation());

  document.body.appendChild(lightbox);
  document.body.classList.add("is-focus-locked");
  
  requestAnimationFrame(() => lightbox.classList.add("is-open"));
}

function closeImageLightbox() {
  const lightbox = document.getElementById("image-lightbox");
  if (!lightbox) return;
  lightbox.classList.remove("is-open");
  document.body.classList.remove("is-focus-locked");
  setTimeout(() => lightbox.remove(), 250);
}

/* ====================================================================
   하단 네비 / 키보드
   ==================================================================== */
function renderNavFooter() {
  const prev = document.getElementById("nav-prev");
  const next = document.getElementById("nav-next");
  const prog = document.getElementById("nav-progress");
  if (!prev) return;
  const total = app.lesson.sections.length;
  prev.disabled = app.currentIdx === 0;
  next.disabled = app.currentIdx >= total - 1;
  prog.textContent = `${app.currentIdx + 1} / ${total}`;
  prev.onclick = () => goTo(app.currentIdx - 1);
  next.onclick = () => goTo(app.currentIdx + 1);
}

function bindKeyboard() {
  document.addEventListener("keydown", e => {
    if (e.target.matches("input, textarea")) return;
    
    // 라이트박스/포커스 오버레이 닫기
    if (e.key === "Escape") {
      if (document.getElementById("image-lightbox")) {
        e.preventDefault(); closeImageLightbox();
        return;
      }
      if (document.getElementById("focus-overlay")) {
        e.preventDefault(); closeFocusOverlay();
        return;
      }
    }

    if (document.getElementById("focus-overlay") || document.getElementById("image-lightbox")) return;

    if (e.key === "ArrowRight" || e.key === "PageDown") { e.preventDefault(); goTo(app.currentIdx + 1); }
    else if (e.key === "ArrowLeft" || e.key === "PageUp") { e.preventDefault(); goTo(app.currentIdx - 1); }
    else if (e.key === " " || e.key === "Enter") {
      if (e.target.tagName === "BUTTON") return;
      e.preventDefault(); toggleFirstVisibleAnswer();
    }
  });
}

function toggleFirstVisibleAnswer() {
  const answers = document.querySelectorAll(".answer");
  for (const a of answers) {
    const rect = a.getBoundingClientRect();
    if (rect.top >= 0 && rect.top < window.innerHeight * 0.7) { a.classList.toggle("is-open"); return; }
  }
  if (answers.length) answers[0].classList.toggle("is-open");
}

/* ====================================================================
   시작
   ==================================================================== */
init();