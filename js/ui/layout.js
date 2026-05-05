import { app } from "../state.js";
import { escapeHtml } from "../utils.js";

/**
 * 앱 전체 구조(Shell) 생성
 */
export function buildAppShell() {
  const appDiv = document.createElement("div");
  appDiv.className = "app";

  const aside = document.createElement("aside");
  aside.className = "sidebar";
  aside.innerHTML = `
    <a class="sidebar__back" href="index.html">← 대시보드</a>
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
  bindInlineBlankToggles(main);
}

export function bindInlineBlankToggles(root) {
  if (!root || root.dataset.inlineBlankBound === "true") return;
  root.dataset.inlineBlankBound = "true";
  root.addEventListener("click", event => {
    const blank = event.target.closest(".inline-blank");
    if (!blank || !root.contains(blank)) return;
    blank.classList.toggle("is-revealed");
    blank.setAttribute("aria-label", blank.classList.contains("is-revealed") ? "빈칸 숨기기" : "빈칸 보기");
  });
}

/**
 * 사이드바 렌더링
 */
export function renderSidebar(goToIdx) {
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
  subEl.innerHTML = app.lesson.subtitle || "";

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
    btn.addEventListener("click", () => goToIdx(idx));
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

/**
 * 하단 네비게이션 업데이트
 */
export function renderNavFooter(goToIdx) {
  const prev = document.getElementById("nav-prev");
  const next = document.getElementById("nav-next");
  const prog = document.getElementById("nav-progress");
  if (!prev) return;
  const total = app.lesson.sections.length;
  prev.disabled = app.currentIdx === 0;
  next.disabled = app.currentIdx >= total - 1;
  prog.textContent = `${app.currentIdx + 1} / ${total}`;
  prev.onclick = () => goToIdx(app.currentIdx - 1);
  next.onclick = () => goToIdx(app.currentIdx + 1);
}

/**
 * 키보드 단축키 바인딩
 */
export function bindKeyboard(callbacks) {
  const {
    goToIdx,
    toggleFirstVisibleAnswer,
    closeImageLightbox,
    closeFocusOverlay,
    closeBlockFullscreen,
    navigateBlockFullscreen,
    expandNextFullscreenToggle,
    scrollBlockFullscreen,
  } = callbacks;

  document.addEventListener("keydown", e => {
    if (e.target.matches("input, textarea")) return;

    if (e.key === "Escape") {
      if (document.getElementById("image-lightbox")) {
        e.preventDefault(); closeImageLightbox(); return;
      }
      if (document.getElementById("block-fullscreen")) {
        e.preventDefault(); closeBlockFullscreen(); return;
      }
      if (document.getElementById("focus-overlay")) {
        e.preventDefault(); closeFocusOverlay(); return;
      }
    }

    if (document.getElementById("block-fullscreen")) {
      if (e.key === "Enter") { e.preventDefault(); expandNextFullscreenToggle?.(); }
      else if (e.key === "ArrowRight" || e.key === "PageDown") { e.preventDefault(); navigateBlockFullscreen(1); }
      else if (e.key === "ArrowLeft" || e.key === "PageUp") { e.preventDefault(); navigateBlockFullscreen(-1); }
      else if (e.key === "ArrowDown") { e.preventDefault(); scrollBlockFullscreen?.(1); }
      else if (e.key === "ArrowUp") { e.preventDefault(); scrollBlockFullscreen?.(-1); }
      return;
    }

    if (document.getElementById("focus-overlay") || document.getElementById("image-lightbox")) return;

    if (e.key === "ArrowRight" || e.key === "PageDown") { e.preventDefault(); goToIdx(app.currentIdx + 1); }
    else if (e.key === "ArrowLeft" || e.key === "PageUp") { e.preventDefault(); goToIdx(app.currentIdx - 1); }
    else if (e.key === " " || e.key === "Enter") {
      if (e.target.tagName === "BUTTON") return;
      e.preventDefault(); toggleFirstVisibleAnswer();
    }
  });
}

export function toggleFirstVisibleAnswer() {
  const answers = document.querySelectorAll(".answer");
  for (const a of answers) {
    const rect = a.getBoundingClientRect();
    if (rect.top >= 0 && rect.top < window.innerHeight * 0.7) { a.classList.toggle("is-open"); return; }
  }
  if (answers.length) answers[0].classList.toggle("is-open");
}
