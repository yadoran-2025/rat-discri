import { app } from "./state.js";

const SHEET_URLS = [
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vT8z4eMwA6UaQLgnZTtj7Xk7-EzBagOfK8YDGUvfogcIa1RV_3h07ggcI2nbN93JbFFdciC9A6uph_4/pub?output=csv",
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vQYkmQF4OJAcQN2FXGrmjYZP1Kr4geSX3t3O2ArB0_ntOqbvfgRzuoRwKSG--c3czenNUzyBVpW_f1R/pub?output=csv"
];

const CACHE_KEY = "externalAssets_v1";
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
      const key = columns[0].trim();
      const assetUrl = columns[1].trim();
      if (!key || !assetUrl || key === "JSON 상 호칭" || key === "JSON 코드") return;
      assets[key] = assetUrl;
    });
  }

  saveToCache(assets);
  Object.assign(app.lesson.assets, assets);
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
