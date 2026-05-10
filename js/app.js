import { app, clearListeners } from "./state.js";
import { loadExternalAssets } from "./api.js";
import { isJsonLessonUrl } from "./dashboard-data.js";
import { loadDashboardConfig, showDashboard } from "./ui/dashboard.js";
import { renderGuideGallery } from "./ui/guide-gallery.js";
import { buildAppShell, renderSidebar, renderNavFooter, bindKeyboard, toggleFirstVisibleAnswer } from "./ui/layout.js";
import { attachFocusAffordance, closeImageLightbox, closeFocusOverlay, closeBlockFullscreen, navigateBlockFullscreen, setBlockFullscreenSectionNavigator, expandNextFullscreenToggle, scrollBlockFullscreen } from "./ui/components.js";
import { renderBlock, renderBlockSeparator } from "./ui/blocks/index.js";
import { escapeHtml } from "./utils.js";
import { trackCurrentPage } from "./visitor-analytics.js";

/* ====================================================================
   진입점
   ==================================================================== */
async function init() {
  const params = new URLSearchParams(location.search);
  const lessonId = params.get("lesson");

  if (!lessonId) {
    trackCurrentPage();
    await showDashboard();
    return;
  }

  let lessonSource = `lessons/${lessonId}.json`;
  try {
    const dashboardConfig = await loadDashboardConfig();
    lessonSource = getLessonFetchSource(lessonId, dashboardConfig);
    const lessonRes = await fetch(withCacheBust(lessonSource), { cache: "no-store" });
    if (!lessonRes.ok) throw new Error(`${lessonRes.status}`);
    app.lesson = await lessonRes.json();
    applyLessonMetadata(lessonId, dashboardConfig);
    trackCurrentPage({ lessonId, title: app.lesson.title });

    await loadExternalAssets();
  } catch (err) {
    document.body.innerHTML = `
      <div style="padding:3rem;font-family:sans-serif;">
        <h1>수업 자료를 불러오지 못했습니다</h1>
        <p>파일: <code>${escapeHtml(lessonSource)}</code></p>
        <p>오류: ${err.message}</p>
      </div>`;
    return;
  }

  if (app.lesson.kind === "guide-gallery") {
    renderGuideGallery();
    return;
  }

  startLesson();
}

function applyLessonMetadata(lessonId, config) {
  const meta = findLessonMetadata(lessonId, config);
  app.lesson = {
    ...app.lesson,
    id: lessonId,
    title: meta?.lesson?.title || app.lesson.title || lessonId,
    subtitle: app.lesson.subtitle || "",
    lessonGroup: meta?.group?.title || app.lesson.lessonGroup || "",
    prev: meta?.prev ? getLessonTargetId(meta.prev) : app.lesson.prev || "",
    next: meta?.next ? getLessonTargetId(meta.next) : app.lesson.next || "",
  };
}

function getLessonFetchSource(lessonId, config) {
  const meta = findLessonMetadata(lessonId, config);
  const sourceUrl = meta?.lesson?.sourceUrl || "";
  if (sourceUrl) return sourceUrl;
  const legacyJsonPath = meta?.lesson?.jsonPath || "";
  if (isJsonLessonUrl(legacyJsonPath)) return legacyJsonPath;
  return `lessons/${encodeURIComponent(lessonId)}.json`;
}

function withCacheBust(url) {
  const separator = String(url).includes("?") ? "&" : "?";
  return `${url}${separator}_=${Date.now()}`;
}

function findLessonMetadata(lessonId, config) {
  const groups = Array.isArray(config?.groups) ? config.groups : [];
  for (const group of groups) {
    const lessons = Array.isArray(group.lessons) ? group.lessons : [];
    const index = lessons.findIndex(lesson => getLessonTargetId(lesson) === lessonId);
    if (index >= 0) {
      return {
        group,
        lesson: lessons[index],
        prev: lessons[index - 1] || null,
        next: lessons[index + 1] || null,
      };
    }
  }
  return null;
}

function getLessonTargetId(lesson) {
  if (lesson.link) {
    const match = String(lesson.link).match(/[?&]lesson=([^&#]+)/);
    if (match) return decodeURIComponent(match[1]);
  }
  if (lesson.jsonPath) {
    const match = String(lesson.jsonPath).match(/(?:^|\/)([^/]+)\.json$/i);
    if (match) return match[1];
  }
  return lesson.id || "";
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
  setBlockFullscreenSectionNavigator(navigateFullscreenSection);

  const hash = location.hash.replace("#", "");
  const idx = app.lesson.sections.findIndex(s => s.id === hash);
  goTo(idx >= 0 ? idx : 0);

  bindKeyboard({
    goToIdx: goTo,
    toggleFirstVisibleAnswer,
    closeImageLightbox,
    closeFocusOverlay,
    closeBlockFullscreen,
    navigateBlockFullscreen,
    expandNextFullscreenToggle,
    scrollBlockFullscreen
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
  attachFocusAffordance(header);
  main.appendChild(header);

  let previousBlockType = null;
  sec.blocks.forEach((block, idx) => {
    const el = renderBlock(block, idx);
    if (el) {
      if (previousBlockType && previousBlockType !== "구분선" && block.type !== "구분선") {
        main.appendChild(renderBlockSeparator());
      }
      main.appendChild(el);
      previousBlockType = block.type;
    }
  });
}

function navigateFullscreenSection(direction, options = {}) {
  const nextIdx = app.currentIdx + direction;
  if (nextIdx < 0 || nextIdx >= app.lesson.sections.length) return false;
  if (!options.dryRun) goTo(nextIdx);
  return true;
}

// 시작
init();
