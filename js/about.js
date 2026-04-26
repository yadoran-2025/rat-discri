import { escapeHtml } from "./utils.js";

const root = document.getElementById("about-root");

init();

async function init() {
  root.innerHTML = renderLoading();

  try {
    const [indexRes, membersRes] = await Promise.all([
      fetch(`lessons/index.json?_=${Date.now()}`, { cache: "no-store" }),
      fetch(`members.json?_=${Date.now()}`, { cache: "no-store" }),
    ]);
    if (!indexRes.ok) throw new Error(`lessons/index.json ${indexRes.status}`);
    if (!membersRes.ok) throw new Error(`members.json ${membersRes.status}`);
    const config = await indexRes.json();
    const memberData = await membersRes.json();
    renderAbout(config, memberData);
  } catch (err) {
    root.innerHTML = renderError(err);
  }
}

function renderAbout(config, memberData) {
  const members = Array.isArray(memberData.members) ? memberData.members : [];
  const workMap = createWorkMap(config.groups || [], config.games || []);

  root.innerHTML = `
    <main class="about">
      <div class="about__inner">
        <header class="about__header">
          <div class="about__nav">
            <a class="about__back" href="index.html">대시보드로 돌아가기</a>
            <a class="about__manage" href="connect.html">제작자 연결 편집</a>
          </div>
          <p class="about__eyebrow">About us</p>
          <h1 class="about__title">만든 사람들</h1>
          <p class="about__intro">사회교육공동체 BOOONG(朋)을 소개합니다.</p>
        </header>

        ${members.length ? renderMembers(members, workMap) : renderEmpty()}
      </div>
    </main>
  `;

  focusHashMember();
}

function renderMembers(members, workMap) {
  return `
    <section class="member-list" aria-label="기여자 프로필">
      ${members.map(member => renderMemberCard(member, resolveMemberWorks(member, workMap))).join("")}
    </section>
  `;
}

function renderMemberCard(member, works) {
  const name = member.name || "이름 미등록";
  const interests = member.interests || "";
  const career = member.career || "";
  const bio = member.bio || "";

  return `
    <article class="member-card" id="${escapeAttr(member.id || "")}" tabindex="-1">
      ${renderAvatar(member, name)}
      <div class="member-card__profile">
        <div class="member-card__head">
          <div>
            <h2 class="member-card__name">${escapeHtml(name)}</h2>
            ${interests ? `<p class="member-card__role">관심사: ${escapeHtml(interests)}</p>` : ""}
          </div>
        </div>

        ${bio ? `<p class="member-card__bio">${escapeHtml(bio)}</p>` : ""}
        ${career ? renderCareer(career) : ""}
      </div>

      <aside class="member-lessons" aria-label="${escapeAttr(name)} 제작 자료">
        <h3 class="member-lessons__title">만든 자료</h3>
        ${works.length ? renderWorkLinks(works) : `<p class="member-lessons__empty">아직 연결된 자료가 없습니다.</p>`}
      </aside>
    </article>
  `;
}

function renderAvatar(member, name) {
  if (member.avatar) {
    return `<img class="member-card__avatar" src="${escapeAttr(member.avatar)}" alt="${escapeAttr(name)} 프로필">`;
  }
  return `<div class="member-card__avatar member-card__avatar--fallback" aria-hidden="true">${escapeHtml(getInitials(name))}</div>`;
}

function renderWorkLinks(works) {
  return `
    <ul class="member-lessons__list">
      ${works.map(work => `
        <li>
          <a href="${escapeAttr(work.href)}" ${work.external ? `target="_blank" rel="noopener"` : ""}>
            <span class="member-lessons__group">${escapeHtml(work.groupTitle)}</span>
            <span class="member-lessons__name">${escapeHtml(work.label ? `${work.label}: ${work.title}` : work.title)}</span>
            ${work.missing ? `<span class="member-lessons__missing">자료를 찾을 수 없음</span>` : ""}
          </a>
        </li>
      `).join("")}
    </ul>
  `;
}

function createWorkMap(groups, games) {
  const map = new Map();
  groups.forEach(group => {
    (group.lessons || []).forEach(lesson => {
      map.set(`lesson:${lesson.id}`, {
        type: "lesson",
        id: lesson.id,
        label: lesson.label,
        title: lesson.title,
        groupTitle: stripHtml(group.title),
        href: `index.html?lesson=${encodeURIComponent(lesson.id)}`,
        external: false,
      });
    });
  });
  games.forEach(game => {
    map.set(`game:${game.id}`, {
      type: "game",
      id: game.id,
      label: game.tag || "게임",
      title: game.title,
      groupTitle: "게임",
      href: game.link || "#",
      external: true,
    });
  });
  return map;
}

function resolveMemberWorks(member, workMap) {
  const works = Array.isArray(member.works) ? member.works : [];
  return works.map(work => {
    const key = `${work.type}:${work.id}`;
    return workMap.get(key) || {
      type: work.type,
      id: work.id,
      label: work.type === "game" ? "게임" : "자료",
      title: work.id || "알 수 없는 자료",
      groupTitle: "미등록 자료",
      href: "#",
      external: false,
      missing: true,
    };
  });
}

function renderCareer(career) {
  if (Array.isArray(career)) {
    return `
      <div class="member-card__career">
        <h3>경력</h3>
        <ul>${career.map(item => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
      </div>
    `;
  }
  return `
    <div class="member-card__career">
      <h3>경력</h3>
      <p>${escapeHtml(career).replace(/\n/g, "<br>")}</p>
    </div>
  `;
}

function stripHtml(value) {
  return String(value || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function focusHashMember() {
  const id = decodeURIComponent(location.hash.replace(/^#/, ""));
  if (!id) return;
  const target = document.getElementById(id);
  if (!target) return;
  target.focus({ preventScroll: true });
  target.scrollIntoView({ block: "start", behavior: "smooth" });
}

function getInitials(name) {
  const compact = String(name || "").replace(/\s+/g, "");
  return compact.slice(0, 2) || "B";
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
        <a class="about__back" href="index.html">대시보드로 돌아가기</a>
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
      <p><code>lessons/index.json</code>의 <code>members</code> 배열에 프로필을 추가하면 이곳에 표시됩니다.</p>
    </section>
  `;
}

function escapeAttr(value) {
  return escapeHtml(String(value ?? ""));
}
