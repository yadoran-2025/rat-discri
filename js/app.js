import { app, clearListeners } from "./state.js";
import { loadExternalAssets } from "./api.js";
import { showDashboard } from "./ui/dashboard.js";
import { buildAppShell, renderSidebar, renderNavFooter, bindKeyboard, toggleFirstVisibleAnswer } from "./ui/layout.js";
import { closeImageLightbox, closeFocusOverlay } from "./ui/components.js";
import { renderBlock, renderDivider } from "./ui/blocks.js";
import { escapeHtml } from "./utils.js";

/* ====================================================================
   진입점
   ==================================================================== */
async function init() {
  const params = new URLSearchParams(location.search);
  const lessonId = params.get("lesson");

  if (!lessonId) {
    await showDashboard();
    return;
  }

  try {
    const [lessonRes, indexRes] = await Promise.all([
      fetch(`lessons/${lessonId}.json?_=${Date.now()}`, { cache: "no-store" }),
      fetch(`lessons/index.json`).catch(() => null)
    ]);
    if (!lessonRes.ok) throw new Error(`${lessonRes.status}`);
    app.lesson = await lessonRes.json();

    try {
      if (indexRes?.ok) {
        const indexData = await indexRes.json();
        const group = indexData.groups?.find(g => g.lessons.some(l => l.id === lessonId));
        if (group) app.lesson.lessonGroup = group.title;
      }
    } catch (e) {
      console.warn("그룹 제목을 연동하지 못했습니다.");
    }

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

  startLesson();
}

/* ====================================================================
   수업 시작 및 섹션 이동
   ==================================================================== */
function startLesson() {
  document.body.innerHTML = "";
  document.body.style.cssText = "";

  buildAppShell();
  renderSidebar(goTo);
  renderNavFooter(goTo);

  const hash = location.hash.replace("#", "");
  const idx = app.lesson.sections.findIndex(s => s.id === hash);
  goTo(idx >= 0 ? idx : 0);

  bindKeyboard({
    goToIdx: goTo,
    toggleFirstVisibleAnswer,
    closeImageLightbox,
    closeFocusOverlay
  });

  window.addEventListener("hashchange", () => {
    const h = location.hash.replace("#", "");
    const i = app.lesson.sections.findIndex(s => s.id === h);
    if (i >= 0 && i !== app.currentIdx) goTo(i);
  });

  document.title = `${app.lesson.title} — ${app.lesson.lessonGroup || "수업 자료"}`;
}

function goTo(idx) {
  if (idx < 0 || idx >= app.lesson.sections.length) return;
  clearListeners();
  app.currentIdx = idx;
  const sec = app.lesson.sections[idx];

  document.querySelectorAll(".sidebar__section").forEach(el => {
    el.classList.toggle("is-active", Number(el.dataset.idx) === idx);
  });
  renderSection(sec);
  renderNavFooter(goTo);
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
      main.appendChild(el);
    }
    if (sec.blocks[idx + 1] && block.type !== "소제목") {
      main.appendChild(renderDivider());
    }
  });
}

// 시작
init();