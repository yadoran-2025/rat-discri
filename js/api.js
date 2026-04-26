import { app } from "./state.js";
import { inferMaterialKind, stripTextMarker, parseTextCutoutContent } from "./utils.js";

export const ASSET_SHEET_URLS = {
  media: "https://docs.google.com/spreadsheets/d/e/2PACX-1vT8z4eMwA6UaQLgnZTtj7Xk7-EzBagOfK8YDGUvfogcIa1RV_3h07ggcI2nbN93JbFFdciC9A6uph_4/pub?output=csv",
  exam: "https://docs.google.com/spreadsheets/d/e/2PACX-1vQYkmQF4OJAcQN2FXGrmjYZP1Kr4geSX3t3O2ArB0_ntOqbvfgRzuoRwKSG--c3czenNUzyBVpW_f1R/pub?output=csv",
};

export const SHEET_URLS = [ASSET_SHEET_URLS.media, ASSET_SHEET_URLS.exam];

const CACHE_KEY = "externalAssets_v2";
const CACHE_TTL = 60 * 60 * 1000; // 1시간

function loadFromCache() {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const { ts, data } = JSON.parse(raw);
    if (Date.now() - ts > CACHE_TTL) return null;
    return data;
  } catch {
    return null;
  }
}

function saveToCache(data) {
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), data }));
  } catch {}
}

/**
 * 외부 구글 시트 에셋 로드 (병렬 + sessionStorage 캐싱)
 */
export async function loadExternalAssets() {
  if (!app.lesson.assets) app.lesson.assets = {};

  const cached = loadFromCache();
  if (cached) {
    Object.assign(app.lesson.assets, cached);
    return;
  }

  const results = await Promise.allSettled(
    SHEET_URLS.map(url => fetch(url, { cache: "no-store" }).then(r => r.text()))
  );

  const assets = {};
  for (const result of results) {
    if (result.status !== "fulfilled") continue;
    parseCSV(result.value).forEach(columns => {
      if (columns.length < 2) return;
      const material = normalizeAssetColumns(columns);
      if (!material) return;
      assets[material.key] = material;
    });
  }

  saveToCache(assets);
  Object.assign(app.lesson.assets, assets);
}

export function normalizeAssetColumns(columns) {
  const key = (columns[0] || "").trim();
  if (!key || key === "JSON 상 호칭" || key === "JSON 코드" || /^key$/i.test(key)) return null;

  const second = (columns[1] || "").trim();
  const looksLikeTypedRow = /^(image|video|text|link)$/i.test(second);

  if (looksLikeTypedRow) {
    const kind = second.toLowerCase();
    const title = normalizeSheetText(columns[2] || "");
    const value = normalizeSheetText(columns[3] || "");
    const meta = normalizeSheetText(columns[4] || "");
    const keywords = splitKeywords(columns[5] || "");
    return buildMaterial({ key, kind, title, value, meta, keywords });
  }

  const value = normalizeSheetText(second);
  const keywords = splitKeywords(columns[2] || "");
  const inferredKind = inferMaterialKind(value);
  const reason = inferredKind === "text"
    ? normalizeSheetText(columns[4] || columns[3] || "")
    : normalizeSheetText(columns[4] || columns[3] || "");
  return buildMaterial({ key, value, meta: reason, keywords, reason });
}

function buildMaterial({ key, kind = "", title = "", value = "", meta = "", keywords = [], reason = "" }) {
  const inferredKind = inferMaterialKind(value, kind);
  const material = {
    key,
    kind: inferredKind,
    title,
    keywords,
    reason,
  };

  if (inferredKind === "text") {
    const parsed = parseTextCutoutContent(stripTextMarker(value));
    material.headline = title || parsed.headline || "";
    material.body = parsed.body;
    material.source = meta || parsed.source || "";
  } else {
    material.url = value;
    material.caption = meta || "";
  }

  return pruneEmpty(material);
}

function splitKeywords(value) {
  return String(value || "").split(",").map(item => item.trim()).filter(Boolean);
}

function normalizeSheetText(value) {
  return String(value || "").replace(/\\n/g, "\n").trim();
}

function pruneEmpty(value) {
  if (Array.isArray(value)) return value.filter(Boolean);
  if (!value || typeof value !== "object") return value;
  const out = {};
  Object.entries(value).forEach(([key, child]) => {
    if (child === "" || child == null) return;
    if (Array.isArray(child) && !child.length) return;
    out[key] = child;
  });
  return out;
}

/**
 * 간단한 CSV 파서
 */
export function parseCSV(text) {
  const rows = [];
  let row = [], field = "", inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i], n = text[i + 1];
    if (c === '"') {
      if (inQ && n === '"') { field += '"'; i++; } else inQ = !inQ;
    } else if (c === ',' && !inQ) {
      row.push(field); field = "";
    } else if ((c === '\r' || c === '\n') && !inQ) {
      if (c === '\r' && n === '\n') i++;
      row.push(field); rows.push(row);
      row = []; field = "";
    } else { field += c; }
  }
  if (row.length || field) { row.push(field); rows.push(row); }
  return rows;
}
