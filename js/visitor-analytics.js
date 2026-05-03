import { db, get, ref, runTransaction, serverTimestamp, set, update } from "./firebase-config.js";

const ANALYTICS_ROOT = "analytics";
const VISITOR_ID_KEY = "booong-visitor-id-v1";

const PAGE_LABELS = {
  dashboard: "대시보드",
  about: "소개",
  "asset-search": "수업자료 검색",
  author: "BNG LANG 에디터",
  connect: "시작과 연결",
  print: "인쇄 페이지",
  select: "문제 선택",
  "worksheet-maker": "활동지 메이커",
};

export async function trackCurrentPage(extra = {}) {
  return trackPage(getCurrentPageInfo(extra));
}

export async function trackPage(page) {
  const normalized = normalizePage(page);
  if (!normalized.key) return null;

  const visitorId = getVisitorId();
  const pageRef = ref(db, `${ANALYTICS_ROOT}/pages/${normalized.key}`);
  const visitorRef = ref(db, `${ANALYTICS_ROOT}/pageVisitors/${normalized.key}/${visitorId}`);

  try {
    await update(pageRef, {
      key: normalized.key,
      title: normalized.title,
      path: normalized.path,
      type: normalized.type,
      updatedAt: serverTimestamp(),
    });

    const existingVisitor = await get(visitorRef);
    if (!existingVisitor.exists()) {
      await set(visitorRef, { firstSeenAt: serverTimestamp() });
      await runTransaction(ref(db, `${ANALYTICS_ROOT}/pages/${normalized.key}/visitors`), value => (Number(value) || 0) + 1);
    }
  } catch (err) {
    console.warn("Visitor analytics update failed:", err);
  }

  return normalized;
}

export async function trackGroupClick(group) {
  const normalized = normalizeGroupClick(group);
  if (!normalized.groupId) return null;

  const visitorId = getVisitorId();
  const groupRef = ref(db, `${ANALYTICS_ROOT}/groupClicks/${normalized.groupId}`);
  const visitorRef = ref(db, `${ANALYTICS_ROOT}/groupClickVisitors/${normalized.groupId}/${visitorId}`);

  try {
    await Promise.all([
      runTransaction(ref(db, `${ANALYTICS_ROOT}/groupClicks/${normalized.groupId}/totalClicks`), value => (Number(value) || 0) + 1),
      update(groupRef, {
        groupId: normalized.groupId,
        title: normalized.title,
        type: normalized.type,
        lastHref: normalized.href,
        lastActionKey: normalized.actionKey,
        updatedAt: serverTimestamp(),
      }),
    ]);

    const existingVisitor = await get(visitorRef);
    if (existingVisitor.exists()) {
      await Promise.all([
        runTransaction(ref(db, `${ANALYTICS_ROOT}/groupClickVisitors/${normalized.groupId}/${visitorId}/count`), value => (Number(value) || 0) + 1),
        update(visitorRef, {
          lastClickedAt: serverTimestamp(),
          lastActionKey: normalized.actionKey,
          lastHref: normalized.href,
        }),
      ]);
    } else {
      await Promise.all([
        set(visitorRef, {
          count: 1,
          firstClickedAt: serverTimestamp(),
          lastClickedAt: serverTimestamp(),
          lastActionKey: normalized.actionKey,
          lastHref: normalized.href,
        }),
        runTransaction(ref(db, `${ANALYTICS_ROOT}/groupClicks/${normalized.groupId}/visitorCount`), value => (Number(value) || 0) + 1),
      ]);
    }
  } catch (err) {
    console.warn("Group click analytics update failed:", err);
  }

  return normalized;
}

export async function loadPageVisitStats() {
  try {
    const snapshot = await get(ref(db, `${ANALYTICS_ROOT}/pages`));
    const value = snapshot.val() || {};
    return Object.values(value)
      .filter(item => item && item.key)
      .map(item => ({
        key: item.key,
        title: item.title || item.key,
        path: item.path || "",
        type: item.type || "page",
        views: Number(item.views) || 0,
        visitors: Number(item.visitors) || 0,
        updatedAt: item.updatedAt || 0,
      }))
      .sort((a, b) => b.visitors - a.visitors || b.views - a.views || a.title.localeCompare(b.title, "ko"));
  } catch (err) {
    console.warn("Visitor analytics load failed:", err);
    return [];
  }
}

export async function loadGroupClickStats() {
  try {
    const snapshot = await get(ref(db, `${ANALYTICS_ROOT}/groupClicks`));
    const value = snapshot.val() || {};
    return Object.values(value)
      .filter(item => item && item.groupId)
      .map(item => ({
        groupId: item.groupId,
        title: item.title || item.groupId,
        type: item.type || "group",
        totalClicks: Number(item.totalClicks) || 0,
        visitorCount: Number(item.visitorCount) || 0,
        lastHref: item.lastHref || "",
        updatedAt: item.updatedAt || 0,
      }))
      .sort((a, b) => b.totalClicks - a.totalClicks || b.visitorCount - a.visitorCount || a.title.localeCompare(b.title, "ko"));
  } catch (err) {
    console.warn("Group click analytics load failed:", err);
    return [];
  }
}

export function getCurrentPageInfo(extra = {}) {
  const params = new URLSearchParams(location.search);
  const lessonId = extra.lessonId || params.get("lesson") || "";
  if (lessonId) {
    return {
      key: `lesson-${slugify(lessonId)}`,
      title: extra.title || document.title || lessonId,
      path: `index.html?lesson=${lessonId}`,
      type: "lesson",
    };
  }

  const fileName = getPageFileName();
  const id = fileName.replace(/\.html$/i, "") || "dashboard";
  const key = id === "index" ? "dashboard" : id;

  return {
    key,
    title: extra.title || PAGE_LABELS[key] || document.title || key,
    path: fileName || "index.html",
    type: key === "dashboard" ? "dashboard" : "page",
  };
}

function normalizePage(page = {}) {
  return {
    key: slugify(page.key).slice(0, 96),
    title: String(page.title || page.key || "").trim(),
    path: String(page.path || "").trim(),
    type: String(page.type || "page").trim(),
  };
}

function normalizeGroupClick(group = {}) {
  return {
    groupId: slugify(group.groupId || group.id).slice(0, 96),
    title: String(group.title || group.groupId || group.id || "").trim(),
    type: String(group.type || "group").trim(),
    href: String(group.href || "").trim(),
    actionKey: String(group.actionKey || "").trim(),
  };
}

function getVisitorId() {
  try {
    const stored = localStorage.getItem(VISITOR_ID_KEY);
    if (stored) return stored;
    const id = crypto?.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    localStorage.setItem(VISITOR_ID_KEY, id);
    return id;
  } catch {
    return `session-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }
}

function getPageFileName() {
  const last = location.pathname.split("/").filter(Boolean).pop() || "index.html";
  return last.includes(".") ? last : "index.html";
}

function slugify(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9가-힣_-]+/gi, "-")
    .replace(/^-+|-+$/g, "");
}
