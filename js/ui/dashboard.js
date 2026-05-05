import { loadCachedDashboardConfig, loadDashboardConfig as loadSharedDashboardConfig, loadLocalDashboardConfig } from "../dashboard-data.js";
import { escapeHtml } from "../utils.js";
import { loadGroupClickStats, loadPageVisitStats, trackGroupClick } from "../visitor-analytics.js";

const SUBJECT_COLOR_PALETTE = [
  "#639922",
  "#1D9E75",
  "#534AB7",
  "#D85A30",
  "#185FA5",
  "#9A5B12",
  "#0F766E",
  "#BE185D",
];

const DISCIPLINE_COLORS = {
  "법": "#185FA5",
  "정치": "#D85A30",
  "경제": "#84A51F",
  "사회": "#7C3AAE",
  "사회학": "#7C3AAE",
  "지리": "#8A5A2B",
};

const SUBJECT_ORDER = ["사회1", "사회2", "통사1", "통사2", "정치", "법과사회", "경제", "국제정치"];
const SCHOOL_ORDER = ["초등학교", "중학교", "고등학교", "대학교", "기타"];
const RECENT_STORAGE_KEY = "booong-dashboard-recent-v1";
const MAX_RECENT_ITEMS = 12;

const TOOL_LABELS = {
  "asset-search": "수업자료 검색",
  "print-mode": "기출문제 디스펜서",
  "worksheet-maker": "학습지 메이커",
  "block-guide": "BNG LANG 설명서",
  "lesson-author": "BNG LANG 에디터",
};

const SIDEBAR_TOOL_GROUPS = [
  {
    label: "제작",
    items: [
      { id: "worksheet-maker", icon: "pencil" },
      { id: "print-mode", icon: "plus-square" },
      { id: "lesson-author", icon: "file" },
    ],
  },
  {
    label: "참고",
    items: [
      { id: "asset-search", icon: "search" },
      { id: "block-guide", icon: "bookmark" },
    ],
  },
];

export async function showDashboard() {
  document.body.innerHTML = "";
  document.body.style.background = "";

  const config = loadCachedDashboardConfig() || await loadLocalDashboardConfig();
  const state = {
    section: "all",
    kind: "",
    school: "",
    subject: "",
    query: "",
    viewMode: "list",
    sortMode: "default",
    clickStats: [],
  };

  const container = document.createElement("div");
  container.className = "dashboard";
  document.body.appendChild(container);

  renderDashboard(container, config, state);
  refreshDashboardConfig(container, config, state);
}

export async function loadDashboardConfig() {
  return loadSharedDashboardConfig();
}

function renderDashboard(root, config, state) {
  const items = createLibraryItems(config);
  normalizeState(items, state);

  const filteredItems = getFilteredItems(items, state);
  root.innerHTML = `
    <div class="dashboard-shell">
      ${renderSidebar(config, items, state)}
      <main class="dashboard-main">
        ${renderMobileNav(config, items, state)}
        ${renderMainHeader(config)}
        ${renderSearchAndFilters(items, filteredItems, state)}
        ${renderResults(filteredItems, state)}
      </main>
    </div>
  `;

  bindDashboardEvents(root, config, state);
  hydrateVisitStats(root, state);
}

async function refreshDashboardConfig(root, currentConfig, state) {
  try {
    const nextConfig = await loadDashboardConfig({ cache: false });
    if (!root.isConnected || isSameDashboardConfig(currentConfig, nextConfig)) return;
    renderDashboard(root, nextConfig, state);
  } catch (err) {
    console.warn("Dashboard refresh failed:", err);
  }
}

function renderVisitStatsShell() {
  return `
    <details class="dashboard-visit-stats" data-visit-stats>
      <summary class="dashboard-visit-stats__head">
        <span>대시보드 방문 인원</span>
        <span>불러오는 중</span>
      </summary>
    </details>
  `;
}

async function hydrateVisitStats(root, state) {
  const target = root.querySelector("[data-visit-stats]");
  if (!target) return;

  const [pageStats, clickStats] = await Promise.all([
    loadPageVisitStats(),
    loadGroupClickStats(),
  ]);
  if (!root.contains(target)) return;
  state.clickStats = clickStats;

  const dashboardStats = pageStats.find(item => item.key === "dashboard");
  const dashboardVisitors = dashboardStats?.visitors || 0;
  target.innerHTML = `
    <summary class="dashboard-visit-stats__head">
      <span>대시보드 방문 인원</span>
      <span>${escapeHtml(formatNumber(dashboardVisitors))}명</span>
    </summary>
    ${clickStats.length ? `
      <div class="dashboard-visit-stats__subhead">
        <span>수업 그룹 클릭</span>
        <span>고유 인원 · 클릭 수</span>
      </div>
      <div class="dashboard-visit-stats__list">
        ${clickStats.slice(0, 8).map(renderGroupClickStatRow).join("")}
      </div>
    ` : `
      <p class="dashboard-visit-stats__empty">수업 링크 클릭 기록이 쌓이면 여기에 그룹별 클릭 수가 표시됩니다.</p>
    `}
  `;
}

function renderGroupClickStatRow(item) {
  return `
    <div class="dashboard-visit-stats__row">
      <span class="dashboard-visit-stats__title">${escapeHtml(item.title)}</span>
      <span class="dashboard-visit-stats__meta">${escapeHtml(formatNumber(item.visitorCount))}명</span>
      <span class="dashboard-visit-stats__count">${escapeHtml(formatNumber(item.totalClicks))}회</span>
    </div>
  `;
}

function renderSidebar(config, items, state) {
  const tools = Array.isArray(config.tools) ? config.tools : [];
  const toolsById = new Map(tools.filter(tool => tool?.id).map(tool => [tool.id, tool]));
  const lessonCount = items.filter(item => item.kind === "lesson-group").length;
  const gameCount = items.filter(item => item.kind === "game").length;
  const recentCount = getRecentItems(items).length;

  return `
    <aside class="dashboard-sidebar" aria-label="대시보드 탐색">
      <div class="dashboard-brand">
        <span class="dashboard-brand__mark" aria-hidden="true">
          ${renderScooterPictogram()}
        </span>
        <span class="dashboard-brand__copy">
          <span class="dashboard-brand__eyebrow">사회교육공동체</span>
          <span class="dashboard-brand__name">BOOONG</span>
        </span>
      </div>

      <nav class="dashboard-nav" aria-label="탐색">
        <span class="dashboard-nav__label">탐색</span>
        ${renderNavButton({ section: "all", label: "모든 수업", count: items.length, icon: "grid", state })}
        ${renderNavButton({ section: "lesson", label: "수업", count: lessonCount, icon: "list", state })}
        ${renderNavButton({ section: "game", label: "게임", count: gameCount, icon: "play", state })}
        ${renderNavButton({ section: "recent", label: "최근 본 항목", count: recentCount || "", icon: "clock", state })}
      </nav>

      ${SIDEBAR_TOOL_GROUPS.map(group => renderToolSection(group, toolsById)).join("")}
      ${renderVisitStatsShell()}
      ${renderSidebarFooterLink()}
      <a class="dashboard-sidebar__create" href="author.html">
        ${renderSidebarIcon("plus")}
        <span>새 수업 만들기</span>
      </a>
    </aside>
  `;
}

function renderMobileNav(config, items, state) {
  const tools = Array.isArray(config.tools) ? config.tools : [];
  const toolsById = new Map(tools.filter(tool => tool?.id).map(tool => [tool.id, tool]));
  const lessonCount = items.filter(item => item.kind === "lesson-group").length;
  const gameCount = items.filter(item => item.kind === "game").length;
  const recentCount = getRecentItems(items).length;
  const toolLinks = SIDEBAR_TOOL_GROUPS
    .flatMap(group => group.items)
    .map(item => {
      const tool = toolsById.get(item.id);
      return tool ? renderToolLink(tool, item.icon) : "";
    })
    .filter(Boolean)
    .join("");

  return `
    <div class="dashboard-mobile-nav" aria-label="모바일 대시보드 탐색">
      <div class="dashboard-mobile-nav__head">
        <span class="dashboard-mobile-nav__brand">
          <span class="dashboard-brand__mark" aria-hidden="true">${renderScooterPictogram()}</span>
          <span>
            <span class="dashboard-brand__eyebrow">사회교육공동체</span>
            <span class="dashboard-brand__name">BOOONG</span>
          </span>
        </span>
        <a class="dashboard-mobile-nav__create" href="author.html">
          ${renderSidebarIcon("plus")}
          <span>새 수업</span>
        </a>
      </div>
      <nav class="dashboard-mobile-nav__primary" aria-label="탐색">
        ${renderNavButton({ section: "all", label: "전체", count: items.length, icon: "grid", state })}
        ${renderNavButton({ section: "lesson", label: "수업", count: lessonCount, icon: "list", state })}
        ${renderNavButton({ section: "game", label: "게임", count: gameCount, icon: "play", state })}
        ${renderNavButton({ section: "recent", label: "최근", count: recentCount || "", icon: "clock", state })}
      </nav>
      ${toolLinks ? `
        <details class="dashboard-mobile-tools">
          <summary>도구</summary>
          <div class="dashboard-mobile-tools__list">${toolLinks}</div>
        </details>
      ` : ""}
    </div>
  `;
}

function renderScooterPictogram() {
  return `
    <svg viewBox="0 0 24 24" role="img" focusable="false">
      <circle cx="6" cy="18" r="2.5" />
      <circle cx="18" cy="18" r="2.5" />
      <path d="M6 15.5V11l2-2h3.5l1.5 1.5v5" />
      <path d="M10 9V5h3" />
    </svg>
  `;
}

function renderNavButton({ section, label, count, icon, state }) {
  const selected = state.section === section;
  return `
    <button
      class="dashboard-nav__item ${selected ? "is-active" : ""}"
      type="button"
      data-section="${escapeAttr(section)}"
      aria-pressed="${selected ? "true" : "false"}"
    >
      <span class="dashboard-nav__item-main">
        ${renderSidebarIcon(icon)}
        <span>${escapeHtml(label)}</span>
      </span>
      ${count !== "" ? `<span class="dashboard-nav__count">${escapeHtml(count)}</span>` : ""}
    </button>
  `;
}

function renderToolSection(group, toolsById) {
  const links = group.items
    .map(item => {
      const tool = toolsById.get(item.id);
      return tool ? renderToolLink(tool, item.icon) : "";
    })
    .filter(Boolean)
    .join("");

  if (!links) return "";

  return `
    <nav class="dashboard-nav dashboard-nav--tools" aria-label="${escapeAttr(group.label)}">
      <span class="dashboard-nav__label">${escapeHtml(group.label)}</span>
      ${links}
    </nav>
  `;
}

function renderToolLink(tool, icon) {
  const label = TOOL_LABELS[tool.id] || tool.title || "도구";
  const href = tool.link || "#";
  return `
    <a class="dashboard-nav__item dashboard-nav__link" href="${escapeAttr(href)}">
      <span class="dashboard-nav__item-main">
        ${renderSidebarIcon(icon)}
        <span>${escapeHtml(label)}</span>
      </span>
    </a>
  `;
}

function renderSidebarFooterLink() {
  return `
    <a class="dashboard-sidebar__footer-link" href="https://yadoran-2025.github.io/booong-design-system/" target="_blank" rel="noopener">
      <span>디자인 시스템</span>
      <span aria-hidden="true">→</span>
    </a>
  `;
}

function renderSidebarIcon(name) {
  const paths = {
    grid: `
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    `,
    list: `
      <path d="M8 6h13" />
      <path d="M8 12h13" />
      <path d="M8 18h13" />
      <path d="M3 6h.01" />
      <path d="M3 12h.01" />
      <path d="M3 18h.01" />
    `,
    play: `<path d="M7 5v14l12-7-12-7Z" />`,
    clock: `
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    `,
    pencil: `
      <path d="M4 20h4l10.5-10.5a2.1 2.1 0 0 0-3-3L5 17v3Z" />
      <path d="M13.5 7.5l3 3" />
    `,
    "plus-square": `
      <rect x="4" y="4" width="16" height="16" rx="3" />
      <path d="M12 8v8" />
      <path d="M8 12h8" />
    `,
    file: `
      <path d="M7 3h7l4 4v14H7z" />
      <path d="M14 3v5h5" />
    `,
    search: `
      <circle cx="11" cy="11" r="6" />
      <path d="M16 16l4 4" />
    `,
    bookmark: `
      <path d="M6 4h12v17l-6-4-6 4z" />
    `,
    plus: `
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    `,
  };

  return `
    <svg class="dashboard-sidebar-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      ${paths[name] || paths.grid}
    </svg>
  `;
}

function renderMainHeader(config) {
  const dashboard = config.dashboard || {};
  const notices = Array.isArray(config.notices) ? config.notices : [];
  const notice = notices[0] || null;

  return `
    <header class="dashboard-main__header">
      <a class="dashboard-quote" href="about.html">
        <p>${formatDashboardText(dashboard.subtitle || "스마트 수업 프리젠터")}</p>
        <span class="dashboard-quote__meta">
          <span class="dashboard-quote__more">
            about us
            <svg viewBox="0 0 14 14" aria-hidden="true" focusable="false">
              <path d="M2 7h10M8 3l4 4-4 4" />
            </svg>
          </span>
          ${dashboard.source ? `<span class="dashboard-quote__source">${escapeHtml(dashboard.source)}</span>` : ""}
        </span>
      </a>
      ${notice ? `
        <a class="dashboard-notice" href="${escapeAttr(notice.link || "#")}" ${notice.link ? "" : "aria-disabled=\"true\""}>
          <span class="dashboard-notice__tag">공지</span>
          <span class="dashboard-notice__title">${escapeHtml(notice.title || "공지사항")}</span>
          ${notice.desc ? `<span class="dashboard-notice__desc">${escapeHtml(notice.desc)}</span>` : ""}
        </a>
      ` : ""}
    </header>
  `;
}

function renderSearchAndFilters(items, filteredItems, state) {
  const sectionItems = getSectionItems(items, state.section);

  return `
    <section class="dashboard-controls" aria-label="라이브러리 필터">
      <div class="dashboard-search">
        <label class="dashboard-search__field">
          <span class="dashboard-search__icon" aria-hidden="true">🔍</span>
          <input
            class="dashboard-search__input"
            type="search"
            value="${escapeAttr(state.query)}"
            placeholder="수업 제목, 단원, 키워드로 검색"
            data-query-input
          >
        </label>
      </div>

      <div class="dashboard-control-row">
        <div class="dashboard-filterbar">
          ${renderFilterGroup({
            label: "과목",
            key: "subject",
            values: getSubjects(sectionItems, false),
            selected: state.subject,
            allLabel: "전체",
          })}
        </div>
        <div class="dashboard-results-actions">
          <label class="dashboard-sort-select" aria-label="정렬">
            <select data-sort-select>
              <option value="default" ${state.sortMode === "default" ? "selected" : ""}>기본순</option>
              <option value="popular" ${state.sortMode === "popular" ? "selected" : ""}>인기순</option>
              <option value="date" ${state.sortMode === "date" ? "selected" : ""}>날짜순</option>
            </select>
          </label>
          <div class="dashboard-view-toggle" role="group" aria-label="보기 방식">
            <button class="${state.viewMode === "list" ? "is-active" : ""}" type="button" data-view-mode="list" aria-label="리스트 보기">${renderSidebarIcon("list")}</button>
            <button class="${state.viewMode === "card" ? "is-active" : ""}" type="button" data-view-mode="card" aria-label="카드 보기">${renderSidebarIcon("grid")}</button>
          </div>
        </div>
      </div>

      <div class="dashboard-results-head">
        <span>${escapeHtml(getResultLabel(state, filteredItems.length))}</span>
      </div>
    </section>
  `;
}

function renderSortButton({ mode, label, state }) {
  const selected = state.sortMode === mode;
  return `
    <button
      class="${selected ? "is-active" : ""}"
      type="button"
      data-sort-mode="${escapeAttr(mode)}"
      aria-pressed="${selected ? "true" : "false"}"
    >${escapeHtml(label)}</button>
  `;
}

function renderFilterGroup({ label, key, values, selected, allLabel, labelForValue = value => value }) {
  const buttons = [
    `${renderFilterButton({ key, value: "", label: allLabel, selected: !selected })}${key === "subject" ? `<span class="dashboard-filterbar__separator" aria-hidden="true"></span>` : ""}`,
    ...values.map(value => {
      const button = renderFilterButton({
        key,
        value,
        label: labelForValue(value),
        selected: value === selected,
      });
      if (key === "subject" && value === "사회2") {
        return `${button}<span class="dashboard-filterbar__separator" aria-hidden="true"></span>`;
      }
      return button;
    }),
  ].join("");

  return `
    <div class="dashboard-filterbar__group">
      <span class="dashboard-filterbar__label">${escapeHtml(label)}</span>
      <div class="dashboard-filterbar__buttons">
        ${buttons}
      </div>
    </div>
  `;
}

function renderFilterButton({ key, value, label, selected }) {
  return `
    <button
      class="dashboard-filterbar__button ${selected ? "is-active" : ""}"
      type="button"
      data-filter="${escapeAttr(key)}"
      data-filter-value="${escapeAttr(value)}"
      aria-pressed="${selected ? "true" : "false"}"
    >
      ${escapeHtml(label)}
    </button>
  `;
}

function renderResults(items, state) {
  if (!items.length) {
    return `
      <div class="empty-state dashboard-empty-state">
        <div class="empty-state__icon empty-state__icon--search" aria-hidden="true">?</div>
        <div class="empty-state__title">조건에 맞는 항목이 없습니다.</div>
        <div class="empty-state__desc">검색어나 필터를 조금 넓혀 다시 찾아보세요.</div>
      </div>
    `;
  }

  if (state.viewMode === "card") {
    return `
      <section class="dashboard-card-grid" aria-label="수업 카드">
        ${items.map(renderResultCard).join("")}
      </section>
    `;
  }

  return `
    <section class="dashboard-result-list" aria-label="수업 목록">
      ${items.map(renderResultRow).join("")}
    </section>
  `;
}

function renderResultRow(item) {
  return `
    <article class="dashboard-result-row" data-item-key="${escapeAttr(item.key)}">
      ${renderDisciplineBadge(item, "dashboard-result-row__discipline")}
      <span class="dashboard-result-row__body">
        <span class="dashboard-result-row__title-line">
          <span class="dashboard-result-row__title">
            <span class="dashboard-result-row__title-text">${formatDashboardText(item.title)}</span>
            ${item.lessonCount ? `<span class="dashboard-result-row__lesson-count">${escapeHtml(`${item.lessonCount}차시`)}</span>` : ""}
          </span>
          <span class="dashboard-result-row__taxonomy">
            ${item.meta.length ? `<span class="dashboard-result-row__meta">${escapeHtml(item.meta.join(" · "))}</span>` : ""}
            ${renderSubjectChips(item)}
            ${item.kind === "game" ? `<span class="dashboard-kind-badge dashboard-kind-badge--game">게임</span>` : ""}
          </span>
        </span>
        ${item.desc ? `<span class="dashboard-result-row__desc">${formatDashboardText(item.desc)}</span>` : ""}
      </span>
      ${renderLessonPanel(item)}
    </article>
  `;
}

function renderResultCard(item) {
  return `
    <article class="dashboard-library-card" data-item-key="${escapeAttr(item.key)}">
      <span class="dashboard-library-card__thumb" style="--item-color: ${escapeAttr(item.color)};">
        <span>${escapeHtml(item.discipline || getPrimarySubject(item) || getKindLabel(item.kind))}</span>
        ${item.kind === "game" ? `<b>게임</b>` : ""}
      </span>
      <span class="dashboard-library-card__body">
        <span class="dashboard-library-card__title">
          <span>${formatDashboardText(item.title)}</span>
          ${item.lessonCount ? `<span class="dashboard-library-card__lesson-count">${escapeHtml(`${item.lessonCount}차시`)}</span>` : ""}
        </span>
        ${item.meta.length ? `<span class="dashboard-library-card__meta">${escapeHtml(item.meta.join(" · "))}</span>` : ""}
        <span class="dashboard-library-card__tags">
          ${renderSubjectChips(item)}
        </span>
        ${item.desc ? `<span class="dashboard-library-card__desc">${formatDashboardText(item.desc)}</span>` : ""}
      </span>
      ${renderLessonPanel(item)}
    </article>
  `;
}

function renderDisciplineBadge(item, className) {
  const label = item.discipline || getPrimarySubject(item) || "미분류";
  return `
    <span
      class="${escapeAttr(className)}"
      style="--discipline-color: ${escapeAttr(item.color)};"
    >${escapeHtml(label)}</span>
  `;
}

function renderSubjectChips(item) {
  return getItemSubjects(item, false)
    .map(subject => `<span class="chip">${escapeHtml(subject)}</span>`)
    .join("");
}

function renderLessonPanel(item) {
  const actions = item.actions || [];
  return `
    <div class="dashboard-lesson-panel" aria-label="${escapeAttr(item.title)} 하위 항목">
      ${actions.length ? actions.map(action => renderLessonAction(action)).join("") : `
        <span class="dashboard-lesson-link is-disabled">
          <span class="dashboard-lesson-link__label">준비 중</span>
          <span class="dashboard-lesson-link__title">연결된 항목이 없습니다.</span>
        </span>
      `}
    </div>
  `;
}

function renderLessonAction(action) {
  const classes = [
    "dashboard-lesson-link",
    action.variant ? `dashboard-lesson-link--${action.variant}` : "",
    action.disabled ? "is-disabled" : "",
  ].filter(Boolean).join(" ");
  const attrs = action.disabled
    ? `aria-disabled="true"`
    : [
        `href="${escapeAttr(action.href)}"`,
        action.external ? `target="_blank" rel="noopener"` : "",
        `data-action-key="${escapeAttr(action.key)}"`,
        `data-group-id="${escapeAttr(action.groupId)}"`,
        `data-group-title="${escapeAttr(action.groupTitle)}"`,
        `data-group-type="${escapeAttr(action.groupType)}"`,
      ].filter(Boolean).join(" ");
  const tag = action.disabled ? "span" : "a";
  return `
    <${tag} class="${classes}" ${attrs}>
      <span class="dashboard-lesson-link__label">${escapeHtml(action.label || "항목")}</span>
      <span class="dashboard-lesson-link__title">${formatDashboardText(action.title || "열기")}</span>
      <span class="dashboard-lesson-link__arrow" aria-hidden="true">${action.disabled ? "준비 중" : "→"}</span>
    </${tag}>
  `;
}

function bindDashboardEvents(root, config, state) {
  root.querySelectorAll("[data-section]").forEach(button => {
    button.addEventListener("click", () => {
      state.section = button.dataset.section || "all";
      state.kind = "";
      state.school = "";
      state.subject = "";
      renderDashboard(root, config, state);
    });
  });

  root.querySelectorAll("[data-filter]").forEach(button => {
    button.addEventListener("click", () => {
      const key = button.dataset.filter;
      if (!key) return;
      state[key] = button.dataset.filterValue || "";
      renderDashboard(root, config, state);
    });
  });

  root.querySelectorAll("[data-view-mode]").forEach(button => {
    button.addEventListener("click", () => {
      state.viewMode = button.dataset.viewMode === "card" ? "card" : "list";
      renderDashboard(root, config, state);
    });
  });

  root.querySelectorAll("[data-sort-mode]").forEach(button => {
    button.addEventListener("click", () => {
      state.sortMode = normalizeSortMode(button.dataset.sortMode);
      renderDashboard(root, config, state);
    });
  });

  const sortSelect = root.querySelector("[data-sort-select]");
  if (sortSelect) {
    sortSelect.addEventListener("change", event => {
      state.sortMode = normalizeSortMode(event.target.value);
      renderDashboard(root, config, state);
    });
  }

  const queryInput = root.querySelector("[data-query-input]");
  if (queryInput) {
    let isComposing = false;
    queryInput.addEventListener("compositionstart", () => {
      isComposing = true;
    });
    queryInput.addEventListener("compositionend", event => {
      isComposing = false;
      state.query = event.target.value || "";
      renderDashboard(root, config, state);
      restoreQueryFocus(root);
    });
    queryInput.addEventListener("input", event => {
      if (isComposing || event.isComposing) {
        state.query = event.target.value || "";
        return;
      }
      state.query = event.target.value || "";
      renderDashboard(root, config, state);
      restoreQueryFocus(root);
    });
  }

  root.querySelectorAll("[data-action-key]").forEach(link => {
    link.addEventListener("click", event => {
      if (event.detail > 0) link.blur();
      saveRecentKey(link.dataset.actionKey || "");
      trackDashboardActionClick(event, link);
    });
  });
}

function restoreQueryFocus(root) {
  const nextInput = root.querySelector("[data-query-input]");
  if (!nextInput) return;
  nextInput.focus();
  const length = nextInput.value.length;
  nextInput.setSelectionRange(length, length);
}

function trackDashboardActionClick(event, link) {
  const href = link.getAttribute("href") || "";
  const tracking = trackGroupClick({
    groupId: link.dataset.groupId || "",
    title: link.dataset.groupTitle || "",
    type: link.dataset.groupType || "",
    href,
    actionKey: link.dataset.actionKey || "",
  });

  const opensInNewContext = link.target === "_blank" || event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0;
  if (opensInNewContext || !href) return;

  event.preventDefault();
  Promise.race([tracking, wait(500)]).finally(() => {
    window.location.href = href;
  });
}

function createLibraryItems(config) {
  const groups = Array.isArray(config.groups) ? config.groups : [];
  const games = Array.isArray(config.games) ? config.games : [];
  const knownGroupIds = new Set(groups.map(group => group.id).filter(Boolean));
  const items = groups.map(createGroupItem);

  games
    .filter(game => game.id && !knownGroupIds.has(game.id))
    .forEach((game, index) => items.push(createGameItem(game, groups.length + index)));

  return items.map((item, sortIndex) => ({ ...item, sortIndex }));
}

function createGroupItem(group, index = 0) {
  if (normalizeKind(group.kind) === "game") return createGameItem(group, index);

  const lessons = Array.isArray(group.lessons) ? group.lessons : [];
  const zeroSession = normalizeZeroSession(group.zeroSession);
  const actions = [
    createLessonAction(zeroSession, group, 0, true),
    ...lessons.map((lesson, lessonIndex) => createLessonAction(lesson, group, lessonIndex + 1, false)),
  ].filter(Boolean);
  const schools = getItemSchools(group, true);
  const subjects = normalizeSubjects(group.subject, true);
  const subject = subjects[0] || "";
  const discipline = normalizeDiscipline(group.discipline || subject, true);

  return {
    key: `group:${group.id || index}`,
    groupId: group.id || "",
    kind: "lesson-group",
    title: group.title || "수업",
    desc: group.desc || "",
    href: actions.find(action => !action.disabled)?.href || "",
    schools,
    subject,
    subjects,
    discipline,
    color: getSubjectColor(discipline, index),
    actions,
    lessonCount: lessons.length,
    meta: [],
    searchText: buildSearchText([
      group.title,
      group.desc,
      subjects.join(" "),
      discipline,
      schools.join(" "),
      ...actions.flatMap(action => [action.title, action.label, action.desc]),
    ]),
  };
}

function createGameItem(game, index = 0) {
  const href = game.link || "";
  const schools = getItemSchools(game, true);
  const subjects = normalizeSubjects(game.subject, true);
  const subject = subjects[0] || "";
  const discipline = normalizeDiscipline(game.discipline || subject, true);
  const actions = createGameActions(game, index, href);
  const worksheetHref = getGameWorksheetHref(game);
  if (worksheetHref) {
    actions.push({
      key: `game:${game.id || index}:worksheet`,
      groupId: game.id || `game-${index}`,
      groupTitle: game.title || "게임",
      groupType: "game",
      label: "학습지",
      title: "학습지 열기",
      href: worksheetHref,
      external: /^https?:\/\//i.test(worksheetHref),
      disabled: false,
    });
  }

  return {
    key: `game:${game.id || index}`,
    groupId: game.id || "",
    kind: "game",
    title: game.title || "게임",
    desc: game.desc || "",
    href,
    schools,
    subject,
    subjects,
    discipline,
    color: getSubjectColor(discipline, index),
    actions,
    meta: [],
    searchText: buildSearchText([
      game.title,
      game.desc,
      subjects.join(" "),
      discipline,
      schools.join(" "),
      "게임",
      ...actions.flatMap(action => [action.title, action.label]),
    ]),
  };
}

function createGameActions(game, index, fallbackHref) {
  const groupId = game.id || `game-${index}`;
  const groupTitle = game.title || "게임";
  const links = Array.isArray(game.links) ? game.links : [];
  const linkedActions = links
    .map((link, linkIndex) => {
      const href = link.link || link.href || "";
      if (!href) return null;
      return {
        key: `game:${groupId}:link-${link.id || linkIndex}`,
        groupId,
        groupTitle,
        groupType: "game",
        label: link.label || game.tag || "게임",
        title: link.title || "게임 열기",
        href,
        external: /^https?:\/\//i.test(href),
        variant: "game",
        disabled: false,
      };
    })
    .filter(Boolean);

  if (linkedActions.length) return linkedActions;

  return [
    {
      key: `game:${groupId}:open`,
      groupId,
      groupTitle,
      groupType: "game",
      label: game.tag || "게임",
      title: "게임 열기",
      href: fallbackHref,
      external: /^https?:\/\//i.test(fallbackHref),
      variant: "game",
      disabled: !fallbackHref,
    },
  ];
}

function createLessonAction(lesson, group, index, isZeroSession) {
  if (!lesson) return null;
  const href = lesson.link || lesson.href || (!isZeroSession && lesson.id ? `?lesson=${encodeURIComponent(lesson.id)}` : "");
  const label = lesson.label || (isZeroSession ? "0차시" : `${index}차시`);
  return {
    key: `lesson:${group.id || "group"}:${lesson.id || label}:${index}`,
    groupId: group.id || "group",
    groupTitle: group.title || "수업",
    groupType: normalizeKind(group.kind) === "game" ? "game" : "lesson-group",
    label,
    title: lesson.title || "수업 열기",
    desc: lesson.desc || "",
    href,
    external: /^https?:\/\//i.test(href),
    disabled: !href,
  };
}

function normalizeState(items, state) {
  if (!["all", "lesson", "game", "recent"].includes(state.section)) state.section = "all";
  const sectionItems = getSectionItems(items, state.section);
  state.kind = "";
  state.school = "";
  const subjects = getSubjects(sectionItems, false);
  if (state.subject && !subjects.includes(state.subject)) state.subject = "";
}

function getFilteredItems(items, state) {
  const query = normalizeSearchQuery(state.query);
  const filtered = getSectionItems(items, state.section).filter(item => {
    if (state.subject && !getItemSubjects(item, false).includes(state.subject)) return false;
    if (query && !item.searchText.includes(query)) return false;
    return true;
  });
  return sortItems(filtered, state);
}

function sortItems(items, state) {
  const mode = normalizeSortMode(state.sortMode);
  if (mode === "popular") {
    const statsByGroupId = createClickStatsByGroupId(state.clickStats);
    return [...items].sort((a, b) => {
      const aStats = statsByGroupId.get(a.groupId) || {};
      const bStats = statsByGroupId.get(b.groupId) || {};
      const visitorDiff = (Number(bStats.visitorCount) || 0) - (Number(aStats.visitorCount) || 0);
      if (visitorDiff) return visitorDiff;
      const clickDiff = (Number(bStats.totalClicks) || 0) - (Number(aStats.totalClicks) || 0);
      if (clickDiff) return clickDiff;
      return a.sortIndex - b.sortIndex;
    });
  }

  if (mode === "date") {
    return [...items].sort((a, b) => b.sortIndex - a.sortIndex);
  }

  return [...items].sort((a, b) => a.sortIndex - b.sortIndex);
}

function createClickStatsByGroupId(stats = []) {
  return new Map(stats.map(item => [item.groupId, item]));
}

function normalizeSortMode(mode) {
  return ["default", "popular", "date"].includes(mode) ? mode : "default";
}

function isSameDashboardConfig(a, b) {
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
}

function getSectionItems(items, section) {
  if (section === "lesson") return items.filter(item => item.kind === "lesson-group");
  if (section === "game") return items.filter(item => item.kind === "game");
  if (section === "recent") return getRecentItems(items);
  return items;
}

function getRecentItems(items) {
  const recentKeys = getRecentKeys();
  const groupIds = unique(recentKeys.map(key => parseRecentGroupId(key)).filter(Boolean));
  return groupIds
    .map(groupId => items.find(item => item.groupId === groupId || item.key === groupId))
    .filter(Boolean);
}

function parseRecentGroupId(key) {
  const parts = String(key || "").split(":");
  if (parts[0] === "lesson" && parts[1]) return parts[1];
  if (parts[0] === "game" && parts[1]) return parts[1];
  if (parts[0] === "group" && parts[1]) return parts[1];
  return "";
}

function getResultLabel(state, count) {
  const sectionLabel = {
    all: "모든 수업",
    lesson: "수업",
    game: "게임",
    recent: "최근 본 항목",
  }[state.section] || "모든 수업";
  return `${sectionLabel} · ${count}개`;
}

function formatNumber(value) {
  return new Intl.NumberFormat("ko-KR").format(Number(value) || 0);
}

function getKindOptions(items) {
  return unique(items.map(item => item.kind)).filter(Boolean);
}

function getKindLabel(kind) {
  return kind === "game" ? "게임" : "수업";
}

function getSchools(items = [], useFallback) {
  return sortSchools(unique(items.flatMap(item => {
    if (Array.isArray(item.schools)) return item.schools;
    return getItemSchools(item, useFallback);
  })).filter(Boolean));
}

function sortSchools(schools) {
  return [...schools].sort((a, b) => {
    const aIndex = SCHOOL_ORDER.indexOf(a);
    const bIndex = SCHOOL_ORDER.indexOf(b);
    const aKnown = aIndex >= 0;
    const bKnown = bIndex >= 0;
    if (aKnown && bKnown) return aIndex - bIndex;
    if (aKnown) return -1;
    if (bKnown) return 1;
    return a.localeCompare(b, "ko");
  });
}

function getSubjects(items = [], useFallback) {
  return sortSubjects(unique(items.flatMap(item => getItemSubjects(item, useFallback))).filter(Boolean));
}

function sortSubjects(subjects) {
  return [...subjects].sort((a, b) => {
    const aIndex = SUBJECT_ORDER.indexOf(a);
    const bIndex = SUBJECT_ORDER.indexOf(b);
    const aKnown = aIndex >= 0;
    const bKnown = bIndex >= 0;
    if (aKnown && bKnown) return aIndex - bIndex;
    if (aKnown) return -1;
    if (bKnown) return 1;
    return a.localeCompare(b, "ko");
  });
}

function getItemSchools(item, useFallback) {
  const schools = splitList(item?.school).map(value => normalizeSchool(value, false)).filter(Boolean);
  if (schools.length) return schools;
  const fallback = normalizeSchool("", useFallback);
  return fallback ? [fallback] : [];
}

function normalizeZeroSession(zeroSession) {
  return {
    id: zeroSession?.id || "zero-session",
    label: zeroSession?.label || "0차시",
    title: zeroSession?.title || "지도안 및 수업자료",
    desc: zeroSession?.desc || "수업 지도안과 확장 읽기 자료",
    link: zeroSession?.link || "",
    href: zeroSession?.link || "",
  };
}

function getGameWorksheetHref(game) {
  if (game.worksheetLink) return game.worksheetLink;
  if (game.worksheet && /^https?:\/\//i.test(game.worksheet)) return game.worksheet;
  if (!game.worksheet) return "";
  const params = new URLSearchParams();
  params.set("game", game.id || "");
  params.set("worksheet", game.worksheet);
  return `worksheet-maker.html?${params.toString()}`;
}

function normalizeKind(kind) {
  const value = String(kind || "").trim().toLowerCase();
  return value === "game" ? "game" : "lesson";
}

function normalizeSchool(school, useFallback) {
  const value = String(school || "").trim();
  return value || (useFallback ? "기타" : "");
}

function normalizeSubject(subject, useFallback) {
  const value = String(subject || "").trim();
  return value || (useFallback ? "미분류" : "");
}

function normalizeSubjects(subject, useFallback) {
  const subjects = splitList(subject).map(value => normalizeSubject(value, false)).filter(Boolean);
  if (subjects.length) return unique(subjects);
  const fallback = normalizeSubject("", useFallback);
  return fallback ? [fallback] : [];
}

function normalizeDiscipline(discipline, useFallback) {
  const value = String(discipline || "").trim();
  if (value === "사회학") return "사회";
  return value || (useFallback ? "미분류" : "");
}

function splitList(value) {
  return String(value || "").split(/[,;/|]+/).map(item => item.trim()).filter(Boolean);
}

function getItemSubjects(item, useFallback) {
  if (Array.isArray(item?.subjects)) return item.subjects;
  return normalizeSubjects(item?.subject, useFallback);
}

function getPrimarySubject(item) {
  return getItemSubjects(item, false)[0] || item.subject || "";
}

function getSubjectColor(value, index = 0) {
  const normalized = normalizeDiscipline(value, true);
  if (DISCIPLINE_COLORS[normalized]) return DISCIPLINE_COLORS[normalized];
  const hash = [...normalized].reduce((sum, char) => sum + char.charCodeAt(0), index);
  return SUBJECT_COLOR_PALETTE[Math.abs(hash) % SUBJECT_COLOR_PALETTE.length];
}

function buildSearchText(values) {
  return normalizeSearchQuery(values.filter(Boolean).map(stripHtml).join(" "));
}

function normalizeSearchQuery(value) {
  return String(value || "").trim().toLowerCase();
}

function stripHtml(value) {
  return String(value || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function formatDashboardText(value) {
  return escapeHtml(String(value ?? ""))
    .replace(/&lt;br\s*\/?&gt;/gi, "<br>")
    .replace(/\r?\n/g, "<br>");
}

function escapeAttr(value) {
  return escapeHtml(String(value ?? ""));
}

function unique(values) {
  return [...new Set(values)];
}

function getRecentKeys() {
  try {
    const parsed = JSON.parse(localStorage.getItem(RECENT_STORAGE_KEY) || "[]");
    return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
  } catch {
    return [];
  }
}

function saveRecentKey(key) {
  if (!key) return;
  try {
    const next = [key, ...getRecentKeys().filter(value => value !== key)].slice(0, MAX_RECENT_ITEMS);
    localStorage.setItem(RECENT_STORAGE_KEY, JSON.stringify(next));
  } catch {}
}

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
