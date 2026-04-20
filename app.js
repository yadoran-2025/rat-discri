/* ====================================================================
   수업용 프리젠터 — 애플리케이션 로직
   ==================================================================== */

const DEFAULT_LESSON = "rat-disc-1";

const app = {
  lesson: null,
  currentIdx: 0,
};

/* ---------- 초기화 ---------- */
async function init() {
  const params = new URLSearchParams(location.search);
  const lessonId = params.get("lesson") || DEFAULT_LESSON;

  try {
    const res = await fetch(`lessons/${lessonId}.json`);
    if (!res.ok) throw new Error(`${res.status}`);
    app.lesson = await res.json();
  } catch (err) {
    document.body.innerHTML = `
      <div style="padding: 3rem; font-family: sans-serif;">
        <h1>수업 자료를 불러오지 못했습니다</h1>
        <p>파일: <code>lessons/${lessonId}.json</code></p>
        <p>오류: ${err.message}</p>
        <p style="color: #888; margin-top: 2rem;">
          로컬에서 열 때는 <code>file://</code>가 아니라 로컬 서버를 띄워야 합니다.<br>
          터미널에서: <code>python3 -m http.server</code>
        </p>
      </div>`;
    return;
  }

  renderSidebar();
  renderNavFooter();

  // URL 해시로 초기 섹션 결정
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

/* ---------- 사이드바 ---------- */
function renderSidebar() {
  const groupEl = document.getElementById("sidebar-group");
  const titleEl = document.getElementById("sidebar-title");
  const subEl = document.getElementById("sidebar-subtitle");

  if (app.lesson.lessonGroup) {
    groupEl.textContent = app.lesson.lessonGroup;
    groupEl.style.display = "block";
  } else {
    groupEl.style.display = "none";
  }
  titleEl.textContent = app.lesson.title;
  subEl.textContent = app.lesson.subtitle || "";

  // 섹션 목차
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
  wrap.innerHTML = "";

  const { prev, next } = app.lesson;
  if (!prev && !next) {
    wrap.style.display = "none";
    return;
  }
  wrap.style.display = "flex";

  if (prev) {
    const a = document.createElement("a");
    a.className = "sidebar__lesson-link";
    a.href = `?lesson=${prev}`;
    a.innerHTML = `<span class="sidebar__lesson-link-arrow">←</span> 이전 차시`;
    wrap.appendChild(a);
  } else {
    const spacer = document.createElement("span");
    wrap.appendChild(spacer);
  }

  if (next) {
    const a = document.createElement("a");
    a.className = "sidebar__lesson-link";
    a.href = `?lesson=${next}`;
    a.innerHTML = `다음 차시 <span class="sidebar__lesson-link-arrow">→</span>`;
    wrap.appendChild(a);
  }
}

/* ---------- 섹션 이동 ---------- */
function goTo(idx) {
  if (idx < 0 || idx >= app.lesson.sections.length) return;
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

/* ---------- 섹션 렌더링 ---------- */
function renderSection(sec) {
  const main = document.getElementById("main-content");
  main.innerHTML = "";

  const header = document.createElement("div");
  header.className = "section-header";
  header.innerHTML = `
    <div class="section-header__id">${escapeHtml(sec.id)} · ${escapeHtml(app.lesson.title)}</div>
    <h1 class="section-header__title">${escapeHtml(sec.title)}</h1>
  `;
  main.appendChild(header);

  sec.blocks.forEach(block => {
    const el = renderBlock(block);
    if (el) main.appendChild(el);
  });
}

/* ---------- 블록 렌더링 디스패처 ---------- */
function renderBlock(block) {
  const render = {
    paragraph: renderParagraph,
    heading: renderHeading,
    case: renderCase,
    question: renderQuestion,
    concept: renderConcept,
    "figure-concept": renderFigureConcept,
    "figure-quote": renderFigureQuote,
    "image-row": renderImageRow,
    expandable: renderExpandable,
    summary: renderSummary,
  }[block.type];

  if (!render) {
    console.warn("Unknown block type:", block.type);
    return null;
  }
  return render(block);
}

/* ---------- 개별 블록 렌더러 ---------- */
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

function renderCase(block) {
  const div = document.createElement("div");
  div.className = "block callout case";
  let html = "";
  if (block.label) html += `<div class="callout__label">${escapeHtml(block.label)}</div>`;
  html += `<div class="case__text">${formatInline(block.text)}</div>`;
  if (block.sub) html += `<div class="case__sub">${formatInline(block.sub)}</div>`;
  div.innerHTML = html;

  if (block.answer) {
    div.appendChild(buildAnswer(block.answer));
  }
  return div;
}

function renderQuestion(block) {
  const div = document.createElement("div");
  div.className = "block callout question";
  div.innerHTML = `<div class="callout__label">🗨️ 생각해볼 문제</div>`;

  block.prompts.forEach(pr => {
    const p = document.createElement("div");
    p.className = "question__prompt";
    p.innerHTML = `Q. ${formatInline(pr.q)}`;
    if (pr.note) p.innerHTML += `<div class="question__note">${formatInline(pr.note)}</div>`;
    div.appendChild(p);

    if (pr.answer) {
      const ans = buildAnswer({ text: pr.answer }, "답 보기");
      div.appendChild(ans);
    }
  });

  if (block.imagePair) {
    div.appendChild(buildImagePair(block.imagePair));
  }

  if (block.conclusion) {
    const concl = document.createElement("div");
    concl.className = "question__conclusion";
    concl.innerHTML = formatInline(block.conclusion);
    div.appendChild(concl);
  }

  return div;
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

/* ---------- 헬퍼 ---------- */
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

function buildImage(filename, alt = "") {
  const src = app.lesson.imageBase + filename;
  const img = document.createElement("img");
  img.src = src;
  img.alt = alt;
  img.loading = "lazy";

  img.onerror = () => {
    const ph = document.createElement("div");
    ph.className = "image-placeholder";
    ph.textContent = `이미지: ${filename}`;
    img.replaceWith(ph);
  };

  return img;
}

function formatInline(text) {
  if (!text) return "";
  let s = escapeHtml(text);
  s = s.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  s = s.replace(/\n/g, "<br>");
  return s;
}

function escapeHtml(s) {
  if (s == null) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/* ---------- 하단 네비 ---------- */
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

/* ---------- 키보드 ---------- */
function bindKeyboard() {
  document.addEventListener("keydown", e => {
    if (e.target.matches("input, textarea")) return;

    if (e.key === "ArrowRight" || e.key === "PageDown") {
      e.preventDefault();
      goTo(app.currentIdx + 1);
    } else if (e.key === "ArrowLeft" || e.key === "PageUp") {
      e.preventDefault();
      goTo(app.currentIdx - 1);
    } else if (e.key === " " || e.key === "Enter") {
      if (e.target.tagName === "BUTTON") return;
      e.preventDefault();
      toggleFirstVisibleAnswer();
    }
  });
}

function toggleFirstVisibleAnswer() {
  const answers = document.querySelectorAll(".answer");
  for (const a of answers) {
    const rect = a.getBoundingClientRect();
    if (rect.top >= 0 && rect.top < window.innerHeight * 0.7) {
      a.classList.toggle("is-open");
      return;
    }
  }
  if (answers.length > 0) answers[0].classList.toggle("is-open");
}

/* ---------- 시작 ---------- */
init();
