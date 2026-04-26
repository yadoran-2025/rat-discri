import { escapeHtml } from "../utils.js";

const SUBJECT_COLORS = {
  "법": "#1B6BFF",
  "경제": "#FF8C1B",
  "정치": "#2E7D4F",
  "사회": "#8B5CF6",
  "사회학": "#8B5CF6",
  "기타": "#5A6372",
};

const TYPE_COLORS = {
  lesson: { label: "수업", color: "#1B6BFF", bg: "#E6EEFF", text: "#0A2E7A" },
  game: { label: "게임", color: "#FF8C1B", bg: "#FFF3E6", text: "#7A3A0A" },
  tool: { label: "도구", color: "#5A6372", bg: "#F4F6FA", text: "#3A4455" },
  notice: { label: "공지", color: "#2E7D4F", bg: "#EAF5EE", text: "#16402A" },
};

/**
 * 대시보드 메인 화면 렌더링
 */
export async function showDashboard() {
  document.body.innerHTML = "";
  document.body.style.background = "";

  let config = { dashboard: {}, subjects: [], groups: [], games: [], tools: [], notices: [] };
  try {
    const res = await fetch(`lessons/index.json?_=${Date.now()}`, { cache: "no-store" });
    if (res.ok) config = await res.json();
  } catch (err) {
    console.error("대시보드 설정 로드 실패:", err);
  }

  const state = {
    noticeIndex: 0,
    openPanels: new Set(),
  };

  const container = document.createElement("div");
  container.className = "dashboard";
  container.innerHTML = `
    <div class="dashboard__top-nav">
      <a class="dashboard__ds-link" href="design-system.html">DESIGN SYSTEM</a>
      <a class="dashboard__about-link" href="about.html">ABOUT US</a>
    </div>
  `;

  const inner = document.createElement("div");
  inner.className = "dashboard__inner";
  container.appendChild(inner);
  document.body.appendChild(container);

  initializeOpenPanels(config, state);
  renderDashboard(inner, config, state);
}

function initializeOpenPanels(config, state) {
  getSchools(config.groups || [], false).forEach(school => state.openPanels.add(`lesson:${school}`));
  getSchools(config.games || [], true).forEach(school => state.openPanels.add(`game:${school}`));
}

function renderDashboard(root, config, state) {
  root.innerHTML = "";
  root.appendChild(renderHeader(config.dashboard || {}));

  const notices = Array.isArray(config.notices) ? config.notices : [];
  root.appendChild(renderNoticeBanner(notices, state));

  const tools = Array.isArray(config.tools) ? config.tools : [];
  if (tools.length) root.appendChild(renderTools(tools));

  const groups = Array.isArray(config.groups) ? config.groups : [];
  if (groups.length) {
    root.appendChild(renderPanelSection({
      title: "수업",
      type: "lesson",
      accent: TYPE_COLORS.lesson.color,
      items: groups,
      subjects: getSubjectOrder(config.subjects, groups, false),
      schools: getSchools(groups, false),
      state,
    }));
  }

  const games = Array.isArray(config.games) ? config.games : [];
  if (games.length) {
    root.appendChild(renderPanelSection({
      title: "게임",
      type: "game",
      accent: TYPE_COLORS.game.color,
      items: games,
      subjects: getSubjectOrder(config.subjects, games, true),
      schools: getSchools(games, true),
      state,
    }));
  }

  bindDashboardEvents(root, config, state);
}

function renderHeader(dashboard) {
  const header = document.createElement("header");
  header.className = "dashboard__header";
  header.innerHTML = `
    <div class="dashboard__logo" aria-hidden="true">${getLogoHTML(dashboard.logo)}</div>
    <div class="dashboard__header-copy">
      <h1 class="dashboard__title">${escapeHtml(dashboard.title || "사회교육공동체 BOOONG")}</h1>
      <p class="dashboard__subtitle">${formatDashboardText(dashboard.subtitle || "스마트 수업 프리젠터")}</p>
      ${dashboard.source ? `<p class="dashboard__source">— ${escapeHtml(dashboard.source)}</p>` : ""}
    </div>
  `;
  return header;
}

function renderNoticeBanner(notices, state) {
  const current = notices[Math.min(state.noticeIndex, notices.length - 1)] || {
    title: "등록된 공지사항이 없습니다.",
    desc: "새 소식이 생기면 이곳에 표시됩니다.",
  };
  const href = current.link ? escapeAttr(current.link) : "";
  const banner = document.createElement("div");
  banner.className = "dashboard-notice";
  const body = `
    <span class="dashboard-notice__title">${escapeHtml(current.title || "공지")}</span>
    ${current.desc ? `<span class="dashboard-notice__desc">${escapeHtml(current.desc)}</span>` : ""}
  `;
  banner.innerHTML = `
    <span class="dashboard-notice__tag">공지사항</span>
    ${href ? `<a class="dashboard-notice__body" href="${href}">${body}</a>` : `<span class="dashboard-notice__body">${body}</span>`}
    ${notices.length > 1 ? `
      <span class="dashboard-notice__dots" aria-label="공지 선택">
        ${notices.map((_, index) => `
          <button
            type="button"
            class="dashboard-notice__dot ${index === state.noticeIndex ? "is-active" : ""}"
            data-notice-index="${index}"
            aria-label="${index + 1}번째 공지 보기"
          ></button>
        `).join("")}
      </span>
    ` : ""}
  `;
  return banner;
}

function renderTools(tools) {
  const section = document.createElement("section");
  section.className = "dashboard__section dashboard__section--tools";
  section.innerHTML = `
    ${renderSectionTitle("도구", TYPE_COLORS.tool.color)}
    <div class="dashboard-tools">
      ${tools.map(tool => `
        <a class="dashboard-tool" href="${escapeAttr(tool.link || "#")}">
          <span class="dashboard-tool__body">
            <span class="dashboard-tool__title">${escapeHtml(tool.title || "도구")}</span>
            <span class="dashboard-tool__desc">${escapeHtml(tool.desc || "")}</span>
          </span>
          <span class="dashboard-tool__arrow" aria-hidden="true">→</span>
        </a>
      `).join("")}
    </div>
  `;
  return section;
}

function renderPanelSection({ title, type, accent, items, subjects, schools, state }) {
  const section = document.createElement("section");
  section.className = `dashboard__section dashboard__section--${type}`;
  section.innerHTML = `
    ${renderSectionTitle(title, accent)}
    <div class="dashboard-panels">
      ${schools.map(school => renderSchoolPanel({ type, school, subjects, items, state })).join("")}
    </div>
  `;
  return section;
}

function renderSchoolPanel({ type, school, subjects, items, state }) {
  const panelKey = `${type}:${school}`;
  const isOpen = state.openPanels.has(panelKey);
  const schoolItems = items.filter(item => normalizeSchool(item.school, type === "game") === school);
  const subjectMap = subjects.reduce((acc, subject) => {
    acc[subject] = schoolItems.filter(item => normalizeSubject(item.subject, type === "game") === subject);
    return acc;
  }, {});

  return `
    <article class="dashboard-panel ${isOpen ? "is-open" : ""}" data-panel-key="${escapeAttr(panelKey)}">
      <button class="dashboard-panel__toggle" type="button" data-panel-toggle="${escapeAttr(panelKey)}" aria-expanded="${isOpen ? "true" : "false"}">
        <span class="dashboard-panel__school">${escapeHtml(school)}</span>
        <span class="dashboard-panel__count">${schoolItems.length}개</span>
        <span class="dashboard-panel__chevron" aria-hidden="true">▾</span>
      </button>
      <div class="dashboard-panel__body" ${isOpen ? "" : "hidden"}>
        <div class="dashboard-subject-grid" style="--subject-count: ${subjects.length};">
          ${subjects.map(subject => renderSubjectBlock(subject, subjectMap[subject] || [], type)).join("")}
        </div>
      </div>
    </article>
  `;
}

function renderSubjectBlock(subject, items, type) {
  return `
    <div class="dashboard-subject">
      ${renderSubjectHeader(subject, items.length)}
      ${renderSubjectColumn(subject, items, type)}
    </div>
  `;
}

function renderSubjectHeader(subject, count) {
  const color = SUBJECT_COLORS[subject] || SUBJECT_COLORS["기타"];
  return `
    <div class="dashboard-subject-head">
      <span class="dashboard-subject-head__dot" style="--subject-color: ${escapeAttr(color)};"></span>
      <span class="dashboard-subject-head__label">${escapeHtml(subject)}</span>
      <span class="dashboard-subject-head__count">${count}</span>
    </div>
  `;
}

function renderSubjectColumn(subject, items, type) {
  return `
    <div class="dashboard-subject-column ${items.length ? "" : "is-empty"}" aria-label="${escapeAttr(subject)} ${type === "game" ? "게임" : "수업"}">
      ${items.length ? items.map(item => type === "game" ? renderGameCard(item) : renderLessonGroup(item)).join("") : `<span class="dashboard-empty">—</span>`}
    </div>
  `;
}

function renderLessonGroup(group) {
  const lessons = Array.isArray(group.lessons) ? group.lessons : [];
  return `
    <article class="dash-card dash-card--lesson">
      <div class="dash-card__meta">
        <span class="dash-tag">${escapeHtml(group.school || "학교급")}</span>
        <span class="dash-tag dash-tag--soft">${lessons.length}차시</span>
      </div>
      <h3 class="dash-card__title">${formatDashboardText(group.title || "수업")}</h3>
      <p class="dash-card__desc">${escapeHtml(group.desc || "")}</p>
      <div class="dash-card__links">
        ${lessons.map(lesson => `
          <a class="lesson-sub-card" href="?lesson=${encodeURIComponent(lesson.id)}">
            <span class="lesson-sub-card__label">${escapeHtml(lesson.label || "차시")}</span>
            <span class="lesson-sub-card__title">${escapeHtml(lesson.title || "수업 열기")}</span>
            <span class="lesson-sub-card__arrow" aria-hidden="true">→</span>
          </a>
        `).join("")}
      </div>
    </article>
  `;
}

function renderGameCard(game) {
  const href = game.link || "#";
  return `
    <a class="dash-card dash-card--game" href="${escapeAttr(href)}" target="_blank" rel="noopener">
      <div class="dash-card__meta">
        <span class="dash-tag dash-tag--game">${escapeHtml(game.tag || "게임")}</span>
      </div>
      <h3 class="dash-card__title">${escapeHtml(game.title || "게임")}</h3>
      <p class="dash-card__desc">${escapeHtml(game.desc || "")}</p>
      <span class="dash-card__footer">게임 열기 <span class="dash-card__arrow" aria-hidden="true">→</span></span>
    </a>
  `;
}

function bindDashboardEvents(root, config, state) {
  root.querySelectorAll("[data-panel-toggle]").forEach(button => {
    button.addEventListener("click", () => {
      const key = button.dataset.panelToggle;
      if (!key) return;
      if (state.openPanels.has(key)) state.openPanels.delete(key);
      else state.openPanels.add(key);
      renderDashboard(root, config, state);
    });
  });

  root.querySelectorAll("[data-notice-index]").forEach(button => {
    button.addEventListener("click", event => {
      event.preventDefault();
      event.stopPropagation();
      state.noticeIndex = Number(button.dataset.noticeIndex) || 0;
      renderDashboard(root, config, state);
    });
  });
}

function renderSectionTitle(label, color) {
  return `
    <h2 class="dashboard__section-title" style="--section-color: ${escapeAttr(color)};">
      ${escapeHtml(label)}
    </h2>
  `;
}

function getLogoHTML(logo) {
  if (logo && logo !== "scooter-pictogram") return escapeHtml(logo);
  return `
    <svg width="52" height="52" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="6" cy="18" r="2.5"></circle>
      <circle cx="18" cy="18" r="2.5"></circle>
      <path d="M6 15.5V11l2-2h3.5l1.5 1.5v5"></path>
      <path d="M10 9V5h3"></path>
    </svg>
  `;
}

function getSubjectOrder(configSubjects = [], items = [], useFallback) {
  const configured = Array.isArray(configSubjects) ? configSubjects.filter(Boolean) : [];
  const discovered = items.map(item => normalizeSubject(item.subject, useFallback));
  const subjects = unique(configured.length ? [...configured, ...discovered] : discovered);
  return subjects.filter(Boolean);
}

function getSchools(items = [], useFallback) {
  return unique(items.map(item => normalizeSchool(item.school, useFallback))).filter(Boolean);
}

function normalizeSchool(school, useFallback) {
  const value = String(school || "").trim();
  return value || (useFallback ? "기타" : "");
}

function normalizeSubject(subject, useFallback) {
  const value = String(subject || "").trim();
  return value || (useFallback ? "기타" : "");
}

function unique(values) {
  return [...new Set(values)];
}

function formatDashboardText(value) {
  return escapeHtml(String(value ?? "")).replace(/&lt;br\s*\/?&gt;/gi, "<br>");
}

function escapeAttr(value) {
  return escapeHtml(String(value ?? ""));
}
