import { parseCSV } from "./api.js";

const DASHBOARD_SHEET_URLS = {
  groups: "https://docs.google.com/spreadsheets/d/e/2PACX-1vRqcg9kXgh8lcmeTO9xwQJKjqSQt6IotKtDHEbxj0YOpQ1V_TC3xSA3YoB4lcIr01g2FoiNapJfI8Wg/pub?gid=1091433397&single=true&output=csv",
  lessons: "https://docs.google.com/spreadsheets/d/e/2PACX-1vRqcg9kXgh8lcmeTO9xwQJKjqSQt6IotKtDHEbxj0YOpQ1V_TC3xSA3YoB4lcIr01g2FoiNapJfI8Wg/pub?gid=0&single=true&output=csv",
};

const DASHBOARD_CONFIG_CACHE_KEY = "booong-dashboard-config-v1";
const DASHBOARD_CONFIG_CACHE_TTL = 10 * 60 * 1000;

export async function loadDashboardConfig(options = {}) {
  const useCache = options.cache !== false;
  const cached = useCache ? loadCachedDashboardConfig() : null;
  if (cached) return cached;

  let config = await loadLocalDashboardConfig();

  try {
    const sheetGroups = await loadSheetLessonGroups();
    if (sheetGroups.length) {
      config = {
        ...config,
        groups: sheetGroups,
        games: [],
      };
    }
  } catch (err) {
    console.warn("Sheet lesson list load failed, using lessons/index.json:", err);
  }

  const normalized = normalizeDashboardConfig(config);
  if (useCache) saveCachedDashboardConfig(normalized);
  return normalized;
}

export async function loadLocalDashboardConfig() {
  let config = { dashboard: {}, groups: [], games: [], tools: [], notices: [] };

  try {
    const res = await fetch(`lessons/index.json?_=${Date.now()}`, { cache: "no-store" });
    if (res.ok) config = await res.json();
  } catch (err) {
    console.error("Dashboard config load failed:", err);
  }

  return normalizeDashboardConfig(config);
}

export function loadCachedDashboardConfig() {
  try {
    const raw = sessionStorage.getItem(DASHBOARD_CONFIG_CACHE_KEY);
    if (!raw) return null;
    const { ts, config } = JSON.parse(raw);
    if (!ts || Date.now() - ts > DASHBOARD_CONFIG_CACHE_TTL) return null;
    return normalizeDashboardConfig(config);
  } catch {
    return null;
  }
}

function saveCachedDashboardConfig(config) {
  try {
    sessionStorage.setItem(DASHBOARD_CONFIG_CACHE_KEY, JSON.stringify({ ts: Date.now(), config }));
  } catch {}
}

export function normalizeDashboardConfig(config = {}) {
  return {
    ...config,
    groups: normalizeGroups(config.groups || []),
    games: normalizeGames(config.games || []),
  };
}

export function isJsonLessonUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) return false;
  try {
    return new URL(raw, "https://booong.local/").pathname.toLowerCase().endsWith(".json");
  } catch {
    return false;
  }
}

export function createWorkMap(groups = [], games = []) {
  const map = new Map();
  groups.forEach(group => {
    if (normalizeKind(group.kind) === "game") {
      map.set(`game:${group.id}`, {
        type: "game",
        id: group.id,
        label: group.tag || "게임",
        title: group.title,
        groupTitle: stripHtml(group.discipline || group.subject || "게임"),
        href: group.link || "#",
        external: /^https?:\/\//i.test(group.link || ""),
        makers: normalizeMakers(group.makers),
      });
      return;
    }

    const groupTitle = stripHtml(group.title);
    (group.lessons || []).forEach(lesson => {
      map.set(`lesson:${lesson.id}`, {
        type: "lesson",
        id: lesson.id,
        label: lesson.label,
        title: lesson.title,
        groupTitle,
        href: `index.html?lesson=${encodeURIComponent(lesson.id)}`,
        external: false,
        makers: normalizeMakers(lesson.makers || group.makers),
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
      makers: normalizeMakers(game.makers),
    });
  });
  return map;
}

export function createMakerWorkMap(workMap, members = []) {
  const aliasMap = createMemberAliasMap(members);
  const makerMap = new Map();

  workMap.forEach(work => {
    normalizeMakers(work.makers).forEach(rawMaker => {
      const memberId = resolveMemberId(rawMaker, aliasMap);
      if (!memberId) return;
      if (!makerMap.has(memberId)) makerMap.set(memberId, []);
      makerMap.get(memberId).push(work);
    });
  });

  return makerMap;
}

export function getMemberLookupKeys(member) {
  return [
    member?.id,
    member?.code,
    member?.maker,
    ...(Array.isArray(member?.aliases) ? member.aliases : []),
  ].map(normalizeMakerKey).filter(Boolean);
}

export function normalizeMakers(value) {
  if (Array.isArray(value)) return unique(value.map(normalizeMakerKey).filter(Boolean));
  return unique(String(value || "")
    .split(/[,\n;/|]+/)
    .map(normalizeMakerKey)
    .filter(Boolean));
}

async function loadSheetLessonGroups() {
  const [groupText, lessonText] = await Promise.all([
    fetchSheetText(DASHBOARD_SHEET_URLS.groups),
    fetchSheetText(DASHBOARD_SHEET_URLS.lessons),
  ]);
  const groupRows = csvToObjects(groupText);
  const lessonRows = csvToObjects(lessonText);
  return buildLessonGroups(groupRows, lessonRows);
}

async function fetchSheetText(url) {
  const res = await fetch(`${url}&_=${Date.now()}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.text();
}

function csvToObjects(text) {
  const rows = parseCSV(text).filter(row => row.some(cell => String(cell || "").trim()));
  const headers = (rows.shift() || []).map(normalizeHeader);
  return rows.map(row => {
    const out = {};
    headers.forEach((header, index) => {
      if (!header) return;
      out[header] = normalizeSheetText(row[index] || "");
    });
    return out;
  });
}

function buildLessonGroups(groupRows, lessonRows) {
  const groupsById = new Map(groupRows.map(row => [row.group_id, row]));
  const publishedLessons = lessonRows
    .filter(row => row.lesson_id && row.group_id && isPublished(row.published))
    .sort(compareByOrder)
    .map(row => {
      const groupRow = groupsById.get(row.group_id) || {};
      const lessonMakers = normalizeMakers(row.maker);
      return {
        id: row.lesson_id,
        groupId: row.group_id,
        label: row.label || "차시",
        title: row.lesson_title || "수업",
        desc: row.desc || "",
        jsonPath: row.json_path || "",
        link: getExternalLessonRowLink(row),
        sourceUrl: getLessonRowSourceUrl(row),
        order: parseOrder(row.order),
        makers: lessonMakers.length ? lessonMakers : normalizeMakers(groupRow.maker),
      };
    });

  const lessonsByGroup = publishedLessons.reduce((acc, lesson) => {
    if (!acc[lesson.groupId]) acc[lesson.groupId] = [];
    return acc;
  }, {});

  publishedLessons.forEach(lesson => {
    if (!lessonsByGroup[lesson.groupId]) lessonsByGroup[lesson.groupId] = [];
    lessonsByGroup[lesson.groupId].push(pruneEmpty({
      id: lesson.id,
      label: lesson.label,
      title: lesson.title,
      desc: lesson.desc,
      link: getLessonLink(lesson),
      href: lesson.link,
      jsonPath: lesson.jsonPath,
      sourceUrl: lesson.sourceUrl,
      makers: lesson.makers,
    }));
  });

  return groupRows
    .filter(row => row.group_id && isPublished(row.published))
    .sort(compareByOrder)
    .map(row => {
      const kind = normalizeKind(row.kind);
      const lessons = lessonsByGroup[row.group_id] || [];
      return pruneEmpty({
        id: row.group_id,
        kind,
        discipline: row.discipline,
        subject: row.subject,
        school: row.school,
        majorUnit: row["대단원"],
        middleUnit: row["중단원"],
        title: row.group_title || (kind === "game" ? "게임" : "수업"),
        desc: row.desc || "",
        tag: kind === "game" ? "게임" : "",
        link: row.game_link || row.main_link || "",
        worksheet: row.worksheet_link || "",
        makers: normalizeMakers(row.maker),
        zeroSession: kind === "lesson" ? {
          label: "0차시",
          title: "지도안 및 수업자료",
          desc: "수업 지도안과 현장 읽기 자료",
          link: row.teacher_link || "",
        } : null,
        lessons: kind === "lesson" ? lessons : [],
        links: kind === "game" ? lessons : [],
      });
    });
}

function normalizeGroups(groups) {
  return groups.map(group => {
    const makers = normalizeMakers(group.makers || group.maker);
    return {
      ...group,
      kind: normalizeKind(group.kind),
      makers,
      majorUnit: normalizeUnitText(group.majorUnit || group["대단원"]),
      middleUnit: normalizeUnitText(group.middleUnit || group["중단원"]),
      lessons: (group.lessons || []).map(lesson => {
        const lessonMakers = normalizeMakers(lesson.makers || lesson.maker);
        const rowLink = lesson.link || lesson.href || "";
        const sourceUrl = lesson.sourceUrl || (isJsonLessonUrl(rowLink) ? rowLink : "") || (isJsonLessonUrl(lesson.jsonPath) ? lesson.jsonPath : "");
        return {
          ...lesson,
          link: isJsonLessonUrl(rowLink) ? "" : lesson.link,
          href: isJsonLessonUrl(rowLink) ? "" : lesson.href,
          sourceUrl,
          makers: lessonMakers.length ? lessonMakers : makers,
        };
      }),
    };
  });
}

function normalizeGames(games) {
  return games.map(game => ({
    ...game,
    kind: "game",
    makers: normalizeMakers(game.makers || game.maker),
    majorUnit: normalizeUnitText(game.majorUnit || game["대단원"]),
    middleUnit: normalizeUnitText(game.middleUnit || game["중단원"]),
  }));
}

function createMemberAliasMap(members) {
  const map = new Map();
  members.forEach(member => {
    const id = normalizeMakerKey(member?.id);
    if (!id) return;
    getMemberLookupKeys(member).forEach(key => map.set(key, id));
  });
  return map;
}

function resolveMemberId(maker, aliasMap) {
  const key = normalizeMakerKey(maker);
  return aliasMap.get(key) || key;
}

function getLessonLink(lesson) {
  if (lesson.link) return lesson.link;
  if (lesson.id) return `?lesson=${encodeURIComponent(lesson.id)}`;
  if (!lesson.jsonPath) return "";
  const match = lesson.jsonPath.match(/(?:^|\/)([^/]+)\.json$/i);
  return match ? `?lesson=${encodeURIComponent(match[1])}` : "";
}

function getLessonRowLink(row) {
  return row.link_url || row.link || row.href || row.url || row.game_link || row.main_link || "";
}

function getExternalLessonRowLink(row) {
  const link = getLessonRowLink(row);
  return isJsonLessonUrl(link) ? "" : link;
}

function getLessonRowSourceUrl(row) {
  const link = getLessonRowLink(row);
  if (isJsonLessonUrl(link)) return link;
  return isJsonLessonUrl(row.json_path) ? row.json_path : "";
}

function normalizeHeader(value) {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, "_");
}

function normalizeSheetText(value) {
  return String(value || "")
    .replace(/\r\n/g, "\n")
    .replace(/\\n/g, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .trim();
}

function normalizeUnitText(value) {
  return String(value || "").trim();
}

function isPublished(value) {
  const normalized = String(value ?? "").trim().toLowerCase();
  return !["false", "0", "no", "n", "hidden", "draft", "비공개"].includes(normalized);
}

function compareByOrder(a, b) {
  return parseOrder(a.order) - parseOrder(b.order);
}

function parseOrder(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : Number.MAX_SAFE_INTEGER;
}

function normalizeKind(kind) {
  const value = String(kind || "").trim().toLowerCase();
  return value === "game" ? "game" : "lesson";
}

function normalizeMakerKey(value) {
  return String(value || "").trim().toLowerCase();
}

function pruneEmpty(value) {
  const out = {};
  Object.entries(value).forEach(([key, child]) => {
    if (child === "" || child == null) return;
    if (Array.isArray(child) && !child.length) return;
    if (child && typeof child === "object" && !Array.isArray(child)) {
      const pruned = pruneEmpty(child);
      if (Object.keys(pruned).length) out[key] = pruned;
      return;
    }
    out[key] = child;
  });
  return out;
}

function stripHtml(value) {
  return String(value || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function unique(values) {
  return [...new Set(values)];
}
