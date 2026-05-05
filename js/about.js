import { createMakerWorkMap, createWorkMap, getMemberLookupKeys, loadCachedDashboardConfig, loadDashboardConfig } from "./dashboard-data.js";
import { escapeHtml } from "./utils.js";

const root = document.getElementById("about-root");

const MEMBER_COLORS = {
  choi: { color: "#1B6BFF", bg: "#E6EEFF" },
  hyum: { color: "#FF8C1B", bg: "#FFF3E6" },
  do: { color: "#2E7D4F", bg: "#EAF5EE" },
  han: { color: "#8B5CF6", bg: "#F9F4FF" },
};

const TYPE_COLORS = {
  lesson: { label: "수업", bg: "#E6EEFF", color: "#0A2E7A" },
  game: { label: "게임", bg: "#FFF3E6", color: "#7A3A0A" },
};

const state = {
  members: [],
  workMap: new Map(),
  makerWorkMap: new Map(),
  selectedMemberId: "",
};

init();

async function init() {
  root.innerHTML = renderLoading();

  try {
    const membersRes = await fetch(`members.json?_=${Date.now()}`, { cache: "no-store" });
    if (!membersRes.ok) throw new Error(`members.json ${membersRes.status}`);

    const memberData = await membersRes.json();
    state.members = Array.isArray(memberData.members) ? memberData.members : [];
    applyDashboardConfig(loadCachedDashboardConfig());
    state.selectedMemberId = getInitialSelectedMemberId(state.members);

    renderAbout();
    refreshWorks();
  } catch (err) {
    root.innerHTML = renderError(err);
  }
}

async function refreshWorks() {
  try {
    applyDashboardConfig(await loadDashboardConfig());
    renderMemberDetail();
  } catch (err) {
    console.warn("About works refresh failed:", err);
  }
}

function applyDashboardConfig(config) {
  if (!config) {
    state.workMap = new Map();
    state.makerWorkMap = new Map();
    return;
  }
  state.workMap = createWorkMap(config.groups || [], config.games || []);
  state.makerWorkMap = createMakerWorkMap(state.workMap, state.members);
}

function renderMemberDetail() {
  const detail = root.querySelector(".member-detail");
  if (!detail) return;
  const selectedMember = getSelectedMember();
  detail.innerHTML = selectedMember
    ? renderMemberCard(selectedMember, resolveMemberWorks(selectedMember, state.makerWorkMap))
    : renderHint();
  bindMemberCardActions();
}

function renderAbout() {
  root.innerHTML = `
    <main class="about">
      <div class="about__inner">
        <nav class="about__nav" aria-label="About us navigation">
          <a class="about__brand" href="index.html" aria-label="BOOONG 대시보드">
            <span class="about__brand-name">BOOONG</span>
            <span class="about__brand-meta">사회교육공동체</span>
          </a>
          <div class="about__nav-links">
            <a class="about__manage" href="connect.html">제작자 연결 편집</a>
            <a class="about__back" href="index.html">← 대시보드</a>
          </div>
        </nav>

        <header class="about__hero">
          <div class="about__hero-copy">
            <p class="about__eyebrow">About Us</p>
            <h1 class="about__slogan">
              타자를 돕고,<br>
              <span>타자로서</span> 돕는<br>
              사람들
            </h1>
            <p class="about__intro">
              교실에 앉아 사회변혁을 꿈꾸다.<br>
              그런 허황된 꿈을 꾸어 온 교사모임입니다.
            </p>
          </div>
          <div class="about__scene" aria-label="공적 질문이 모이는 밤의 장면">
            <div class="about__scene-image" aria-hidden="true">
              <img src="assets/about-hero.jpg?v=20260427" alt="">
            </div>
            <div class="about__hero-note">
              <span>PUBLIC QUESTIONS</span>
              <strong>사람이 모이는 장면을 수업으로 옮깁니다.</strong>
            </div>
          </div>
        </header>

        ${state.members.length ? renderMemberExplorer() : renderEmpty()}

        <footer class="about__footer" aria-label="BOOONG copyright">
          <div class="about__footer-line"></div>
          <div class="about__footer-meta">
            <span>BOOONG ${new Date().getFullYear()}</span>
            <a class="about__contact" href="mailto:jinyoung1571@naver.com">
              <span class="about__contact-label">Contact</span>
              <span class="about__contact-email">jinyoung1571@naver.com</span>
            </a>
          </div>
        </footer>
      </div>
    </main>
  `;

  bindMemberExplorer();
}

function renderMemberExplorer() {
  const selectedMember = getSelectedMember();

  return `
    <section class="member-explorer" aria-label="구성원 소개">
      <div class="member-codes" role="tablist" aria-label="구성원 선택">
        ${state.members.map((member, index) => renderMemberCode(member, index)).join("")}
      </div>
      <div class="member-detail" role="tabpanel" aria-live="polite">
        ${selectedMember ? renderMemberCard(selectedMember, resolveMemberWorks(selectedMember, state.makerWorkMap)) : renderHint()}
      </div>
    </section>
  `;
}

function renderMemberCode(member, index) {
  const id = String(member.id || "");
  const isActive = isSameMember(id, state.selectedMemberId);
  const label = getMemberCode(member);
  const { color } = getMemberColors(member);

  return `
    <button
      class="member-code ${isActive ? "is-active" : ""}"
      style="--member-color: ${escapeAttr(color)}; --member-delay: ${0.5 + index * 0.07}s;"
      type="button"
      role="tab"
      aria-selected="${isActive ? "true" : "false"}"
      data-member-id="${escapeAttr(id)}"
    >${escapeHtml(label)}</button>
    ${index < state.members.length - 1 ? `<span class="member-separator" style="--member-delay: ${0.54 + index * 0.07}s;" aria-hidden="true">—</span>` : ""}
  `;
}

function bindMemberExplorer() {
  root.querySelectorAll("[data-member-id]").forEach(button => {
    button.addEventListener("click", () => {
      selectMember(button.dataset.memberId || "");
    });
  });

  bindMemberCardActions();
}

function bindMemberCardActions() {
  root.querySelector("[data-action='close-member']")?.addEventListener("click", () => {
    selectMember("");
  });
}

function selectMember(memberId) {
  const clickedMember = state.members.find(member => isSameMember(member.id, memberId));
  const nextMember = clickedMember && !isSameMember(clickedMember.id, state.selectedMemberId) ? clickedMember : null;
  state.selectedMemberId = nextMember ? nextMember.id : "";

  const detail = root.querySelector(".member-detail");
  if (detail) {
    detail.innerHTML = nextMember
      ? renderMemberCard(nextMember, resolveMemberWorks(nextMember, state.makerWorkMap))
      : renderHint();
  }

  root.querySelectorAll("[data-member-id]").forEach(button => {
    const isActive = isSameMember(button.dataset.memberId, state.selectedMemberId);
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-selected", isActive ? "true" : "false");
  });

  bindMemberCardActions();

  if (nextMember) {
    history.replaceState(null, "", `#${encodeURIComponent(nextMember.id)}`);
    root.querySelector(".member-card")?.focus({ preventScroll: true });
  } else {
    history.replaceState(null, "", location.pathname + location.search);
  }
}

function renderMemberCard(member, works) {
  const name = member.name || "이름 미등록";
  const interests = splitInterests(member.interests);
  const career = normalizeCareer(member.career);
  const bio = member.bio || "";
  const code = getMemberCode(member);
  const { color, bg } = getMemberColors(member);

  return `
    <article
      class="member-card"
      id="${escapeAttr(member.id || "")}"
      style="--member-color: ${escapeAttr(color)}; --member-bg: ${escapeAttr(bg)};"
      tabindex="-1"
    >
      <button class="member-card__close" type="button" data-action="close-member" aria-label="프로필 닫기">×</button>

      <section class="member-card__identity" aria-label="${escapeAttr(name)} 소개">
        <div class="member-card__avatar" aria-hidden="true">${escapeHtml(getInitials(name))}</div>
        <h2 class="member-card__name">${escapeHtml(name)}</h2>
        <p class="member-card__code">${escapeHtml(code)}</p>
        ${interests.length ? renderInterests(interests) : ""}
        ${bio ? `<p class="member-card__bio">${escapeHtml(bio)}</p>` : ""}
      </section>

      <section class="member-card__career" aria-label="${escapeAttr(name)} 경력">
        <h3 class="member-card__section-title">경력</h3>
        ${career.length ? renderCareer(career) : `<p class="member-card__empty">—</p>`}
      </section>

      <aside class="member-lessons" aria-label="${escapeAttr(name)} 제작 자료">
        <h3 class="member-card__section-title">만든 자료</h3>
        ${works.length ? renderWorkLinks(works) : `<p class="member-card__empty">—</p>`}
      </aside>
    </article>
  `;
}

function renderInterests(interests) {
  return `
    <div class="member-card__interests" aria-label="관심사">
      ${interests.map(interest => `<span>${escapeHtml(interest)}</span>`).join("")}
    </div>
  `;
}

function renderCareer(career) {
  return `
    <ul class="member-career">
      ${career.map(item => `
        <li>
          <span class="member-career__place">${escapeHtml(item.place)}</span>
          ${item.period ? `<span class="member-career__period">${escapeHtml(item.period)}</span>` : ""}
        </li>
      `).join("")}
    </ul>
  `;
}

function renderWorkLinks(works) {
  return `
    <ul class="member-lessons__list">
      ${works.map(work => {
        const typeStyle = TYPE_COLORS[work.type] || { label: work.label || "자료", bg: "#F4F6FA", color: "#5A6372" };
        return `
          <li>
            <a href="${escapeAttr(work.href)}" ${work.external ? `target="_blank" rel="noopener"` : ""}>
              <span class="member-lessons__meta">${escapeHtml(work.groupTitle)}</span>
              <span class="member-lessons__name">${escapeHtml(getWorkTitle(work))}</span>
              <span
                class="member-lessons__type"
                style="--work-bg: ${escapeAttr(typeStyle.bg)}; --work-color: ${escapeAttr(typeStyle.color)};"
              >${escapeHtml(typeStyle.label)}</span>
            </a>
          </li>
        `;
      }).join("")}
    </ul>
  `;
}

function resolveMemberWorks(member, makerWorkMap) {
  return sortMemberWorks(uniqueWorks(getMemberLookupKeys(member).flatMap(key => makerWorkMap.get(key) || [])));
}

function getWorkTitle(work) {
  if (work.type === "game") return work.title || "";
  return work.label ? `${work.label}: ${work.title}` : work.title;
}

function uniqueWorks(works) {
  const seen = new Set();
  return works.filter(work => {
    const key = `${work.type}:${work.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function sortMemberWorks(works) {
  return [...works].sort((a, b) => {
    if (a.type !== b.type) return a.type === "game" ? 1 : -1;
    return 0;
  });
}

function getInitialSelectedMemberId(members) {
  const hashId = decodeURIComponent(location.hash.replace(/^#/, ""));
  const hashMember = members.find(member => isSameMember(member.id, hashId));
  return hashMember?.id || "";
}

function getSelectedMember() {
  return state.members.find(member => isSameMember(member.id, state.selectedMemberId)) || null;
}

function getMemberCode(member) {
  return String(member.id || member.name || "member").trim().toUpperCase();
}

function getMemberColors(member) {
  const key = String(member.id || "").trim().toLowerCase();
  return MEMBER_COLORS[key] || { color: "#1B6BFF", bg: "#E6EEFF" };
}

function splitInterests(interests) {
  if (Array.isArray(interests)) return interests.map(String).map(item => item.trim()).filter(Boolean);
  return String(interests || "")
    .split(/[,，]/)
    .map(item => item.trim())
    .filter(Boolean);
}

function normalizeCareer(career) {
  const items = Array.isArray(career) ? career : String(career || "").split(/\n+/);
  return items.map(parseCareerItem).filter(item => item.place || item.period).reverse();
}

function parseCareerItem(item) {
  if (item && typeof item === "object") {
    return {
      place: String(item.place || "").trim(),
      period: String(item.period || "").trim(),
    };
  }

  const text = String(item || "").trim();
  const match = text.match(/^(.*?)\s*[\(（]\s*([^()（）]+)\s*[\)）]\s*$/);
  if (!match) return { place: text, period: "" };

  return {
    place: match[1].trim(),
    period: match[2].trim(),
  };
}

function isSameMember(a, b) {
  return String(a || "").toLowerCase() === String(b || "").toLowerCase();
}
function getInitials(name) {
  const compact = String(name || "").replace(/\s+/g, "");
  return compact.slice(0, 1) || "B";
}

function renderHint() {
  return `<p class="member-hint">이름을 눌러 소개를 확인하세요</p>`;
}

function renderLoading() {
  return `
    <main class="about">
      <div class="about__inner">
        <p class="about__status">프로필을 불러오는 중입니다.</p>
      </div>
    </main>
  `;
}

function renderError(err) {
  return `
    <main class="about">
      <div class="about__inner">
        <a class="about__back" href="index.html">← 대시보드</a>
        <div class="about__notice">
          <h1>About us 데이터를 불러오지 못했습니다</h1>
          <p>오류: ${escapeHtml(err.message)}</p>
        </div>
      </div>
    </main>
  `;
}

function renderEmpty() {
  return `
    <section class="about__notice">
      <h2>등록된 프로필이 없습니다</h2>
      <p><code>members.json</code>의 <code>members</code> 배열에 프로필을 추가하면 이곳에 표시됩니다.</p>
    </section>
  `;
}

function escapeAttr(value) {
  return escapeHtml(String(value ?? ""));
}
