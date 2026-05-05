import { state } from "./state.js";
import { EXTERNAL_ASSETS_CACHE_KEY } from "./constants.js";
import { ASSET_SHEET_URLS, parseCSV, normalizeAssetColumns } from "../api.js";
import { escapeHtml } from "../utils.js";
import { appendCommonImages, renderEditor } from "./editor.js";
import { insertMarkupAssets } from "./markup-editor.js";
import { renderUploadPanel } from "./upload.js";
import { refreshOutputs } from "./output.js";
import { getPath, setPath } from "./paths.js";
import { escapeAttr, toast } from "./dom.js";
export async function loadAssetIndex() {
  const entries = Object.entries(ASSET_SHEET_URLS);
  const results = await Promise.allSettled(entries.map(([, url]) => fetch(url, { cache: "no-store" }).then(res => res.text())));
  const rowsBySource = { media: [], exam: [] };
  const map = {};
  results.forEach((result, resultIdx) => {
    if (result.status !== "fulfilled") return;
    const source = entries[resultIdx][0];
    parseCSV(result.value).forEach((columns, idx) => {
      if (idx === 0 || columns.length < 2) return;
      const material = normalizeAssetColumns(columns);
      if (!material) return;
      map[material.key] = material;
      rowsBySource[source].push({ ...material, assetSource: source, assetOrder: idx });
    });
  });
  state.assetRows = rowsBySource;
  state.assets = [...rowsBySource.media, ...rowsBySource.exam];
  state.assetMap = map;
  renderAssetResults();
  refreshOutputs();
}

export function openAssetSearch(mode = "single", source = "media") {
  state.assetMode = mode;
  state.assetSource = source;
  state.assetSelection = new Set();
  document.getElementById("asset-search").classList.add("is-open");
  const queryInput = document.getElementById("asset-query");
  if (queryInput) {
    queryInput.value = "";
    if (source !== "upload") queryInput.focus();
  }
  renderAssetResults();
}

export function closeAssetSearch() {
  document.getElementById("asset-search").classList.remove("is-open");
  state.assetTarget = null;
  state.assetMode = "single";
  state.assetSource = "media";
  state.assetSelection.clear();
  const queryInput = document.getElementById("asset-query");
  if (queryInput) queryInput.value = "";
}

export function renderAssetResults() {
  const box = document.getElementById("asset-results");
  const bar = document.getElementById("asset-search-bar");
  const filters = document.getElementById("asset-filter-toolbar");
  const tabs = document.getElementById("asset-source-tabs");
  const note = document.getElementById("asset-target-note");
  const queryInput = document.getElementById("asset-query");
  if (!box) return;
  renderAssetSourceTabs(tabs);
  renderAssetFilterToolbar(filters);
  if (note) note.textContent = `현재 대상: ${getAssetTargetLabel()}`;
  if (queryInput) {
    queryInput.hidden = state.assetSource === "upload";
    queryInput.placeholder = state.assetSource === "exam" ? "문제 키, 과목, 연월로 검색" : "키, 설명, 키워드로 검색";
  }
  renderUploadPanel();
  if (state.assetSource === "upload") {
    if (bar) bar.innerHTML = `<span>클립보드 이미지를 붙여넣거나 파일을 선택해 새 자료를 등록합니다.</span>`;
    box.innerHTML = "";
    return;
  }
  if (bar) {
    bar.innerHTML = state.assetMode === "multi" || state.assetMode === "quiz-items"
      ? `<span>${state.assetSelection.size}개 선택됨</span><button class="btn btn--sm btn--primary" type="button" data-action="apply-assets" ${state.assetSelection.size ? "" : "disabled"}>선택 추가</button>`
      : `<span>키를 선택하면 현재 입력칸에 바로 들어갑니다.</span>`;
  }
  const query = (queryInput?.value || "").toLowerCase().trim();
  const sourceRows = state.assetRows[state.assetSource] || [];
  const filteredRows = sourceRows
    .filter(row => state.assetSource !== "media" || state.assetKindFilter === "all" || row.kind === state.assetKindFilter)
    .filter(row => !query || getAssetSearchText(row).includes(query));
  const rows = sortAssetRows(filteredRows);
  if (!sourceRows.length) {
    box.innerHTML = `<p class="field__hint">외부자료 목록을 불러오는 중입니다.</p>`;
    return;
  }
  if (!rows.length) {
    box.innerHTML = `<p class="field__hint">검색 결과가 없습니다.</p>`;
    return;
  }
  box.innerHTML = state.assetSource === "exam" ? renderExamAssetResults(rows, Boolean(query)) : renderMediaAssetResults(rows);
}

export function renderAssetSourceTabs(tabs) {
  if (!tabs) return;
  const sources = [
    ["media", "자료 DB", "이미지·영상·텍스트"],
    ["exam", "기출문제 DB", "문제 자료"],
    ["upload", "새 자료 등록", "클립보드"],
  ];
  tabs.innerHTML = sources.map(([source, title, desc]) => `
    <button class="asset-source-tab ${state.assetSource === source ? "is-active" : ""}" type="button" data-action="choose-asset-source" data-source="${source}">
      <strong>${title}</strong>
      <span>${desc}</span>
    </button>
  `).join("");
}

export function renderAssetFilterToolbar(filters) {
  if (!filters) return;
  if (state.assetSource !== "media") {
    filters.innerHTML = "";
    filters.hidden = true;
    return;
  }
  filters.hidden = false;
  const kinds = [
    ["all", "전체"],
    ["image", "이미지"],
    ["video", "비디오"],
    ["text", "텍스트"],
    ["link", "링크"],
  ];
  filters.innerHTML = `
    <div class="asset-kind-tabs" role="group" aria-label="자료 유형">
      ${kinds.map(([kind, label]) => `
        <button class="asset-kind-tab ${state.assetKindFilter === kind ? "is-active" : ""}" type="button" data-action="choose-asset-kind" data-kind="${kind}">
          ${label}
        </button>
      `).join("")}
    </div>
    <label class="asset-sort-select">
      <span class="sr-only">자료 정렬</span>
      <select data-action="sort-assets">
        <option value="latest" ${state.assetSort === "latest" ? "selected" : ""}>최신순</option>
        <option value="oldest" ${state.assetSort === "oldest" ? "selected" : ""}>오래된 순</option>
      </select>
    </label>
  `;
}

export function renderMediaAssetResults(rows) {
  return rows.map(row => `
    <button class="asset-result ${state.assetSelection.has(row.key) ? "is-selected" : ""}" type="button" data-action="choose-asset" data-key="${escapeAttr(row.key)}">
      <span class="asset-result__thumb">${renderAssetThumb(row)}</span>
      <span class="asset-result__content">
        <span class="asset-result__key">[${escapeHtml(row.kind || "자료")}] ${escapeHtml(row.title || row.headline || row.key)}</span>
        <span class="asset-result__meta">${escapeHtml(row.caption || row.source || row.reason || row.keywords?.join(", ") || row.key)}</span>
      </span>
    </button>
  `).join("");
}

export function sortAssetRows(rows) {
  const direction = state.assetSort === "oldest" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const ai = getAssetOrderValue(a);
    const bi = getAssetOrderValue(b);
    if (ai !== bi) return (ai - bi) * direction;
    return String(a.key || "").localeCompare(String(b.key || "")) * direction;
  });
}

export function getAssetOrderValue(row) {
  if (Number.isFinite(row.assetCreatedAt)) return row.assetCreatedAt;
  if (Number.isFinite(row.assetOrder)) return row.assetOrder;
  return 0;
}

export function renderExamAssetResults(rows, forceOpen = false) {
  const subjects = groupExamRowsBySubjectThenPrefix(rows);
  const orderedSubjects = getOrderedExamSubjects(subjects);
  if (!orderedSubjects.length) return `<p class="field__hint">검색 결과가 없습니다.</p>`;
  if (!orderedSubjects.includes(state.examSubject)) state.examSubject = orderedSubjects[0];
  const currentSubject = state.examSubject || orderedSubjects[0];
  const sessions = subjects[currentSubject] || {};
  return `
    <div class="asset-exam-subject-tabs">
      ${orderedSubjects.map(subject => renderExamSubjectTab(subject, subjects[subject] || {}, currentSubject)).join("")}
    </div>
    <div class="asset-exam-session-list">
      ${Object.entries(sessions).map(([prefix, items]) => renderExamSession(prefix, currentSubject, items, forceOpen)).join("")}
    </div>
  `;
}

export function renderExamSubjectTab(subject, sessions, currentSubject) {
  const items = Object.values(sessions).flat();
  const selected = countSelectedAssets(items);
  return `
    <button class="asset-exam-subject-tab ${subject === currentSubject ? "is-active" : ""}" type="button" data-action="choose-exam-subject" data-subject="${escapeAttr(subject)}">
      <strong>${escapeHtml(subject)}</strong>
      <span>${selected ? `${selected}/` : ""}${items.length}개</span>
    </button>
  `;
}

export function renderExamSession(prefix, subject, items, forceOpen) {
  const groupId = `session:${subject}:${prefix}`;
  const open = forceOpen || isExamOpen(state.examGroupOpen, groupId);
  const selected = countSelectedAssets(items);
  return `
    <div class="asset-exam-session">
      <button class="asset-exam-session__head ${open ? "is-open" : ""}" type="button" data-action="toggle-exam-session" data-group="${escapeAttr(groupId)}">
        <span class="asset-exam-toggle" aria-hidden="true"></span>
        <strong>${escapeHtml(formatExamPrefix(prefix))}</strong>
        <span>${selected ? `${selected}/` : "0/"}${items.length}개 선택</span>
      </button>
      ${open ? `
        <div class="asset-exam-list">
          ${items.map(row => renderExamAssetItem(row)).join("")}
        </div>
      ` : ""}
    </div>
  `;
}

export function renderExamAssetItem(row) {
  const selected = state.assetSelection.has(row.key);
  const meta = row.reason || row.keywords?.join(", ");
  return `
    <label class="asset-exam-item ${selected ? "is-selected" : ""}">
      <input type="checkbox" data-action="toggle-exam-asset" value="${escapeAttr(row.key)}" ${selected ? "checked" : ""}>
      <span class="asset-exam-item__check" aria-hidden="true"></span>
      <span class="asset-exam-item__body">
        <span class="asset-exam-item__key">${escapeHtml(row.key)}</span>
        ${meta ? `<span class="asset-exam-item__meta">${escapeHtml(meta)}</span>` : ""}
      </span>
    </label>
  `;
}

export function groupExamRowsBySubjectThenPrefix(rows) {
  const grouped = rows.reduce((acc, row) => {
    const { tag, prefix } = parseExamKeyMeta(row.key);
    acc[tag] ||= {};
    acc[tag][prefix] ||= [];
    acc[tag][prefix].push(row);
    return acc;
  }, {});
  Object.values(grouped).forEach(sessions => {
    Object.keys(sessions).forEach(prefix => {
      sessions[prefix].sort((a, b) => a.key.localeCompare(b.key));
    });
  });
  Object.keys(grouped).forEach(subject => {
    grouped[subject] = Object.fromEntries(Object.entries(grouped[subject]).sort(([a], [b]) => b.localeCompare(a)));
  });
  return grouped;
}

export function getOrderedExamSubjects(subjects) {
  const preferred = ["경제", "사문", "정법"];
  return Object.keys(subjects).sort((a, b) => {
    const ai = preferred.indexOf(a);
    const bi = preferred.indexOf(b);
    if (ai !== -1 || bi !== -1) {
      if (ai === -1) return 1;
      if (bi === -1) return -1;
      return ai - bi;
    }
    return a.localeCompare(b);
  });
}

export function isExamOpen(store, id) {
  return !store.has(id);
}

export function toggleExamOpenState(store, id) {
  if (!id) return;
  if (store.has(id)) store.delete(id);
  else store.add(id);
}

export function countSelectedAssets(items) {
  return items.filter(item => state.assetSelection.has(item.key)).length;
}

export function parseExamKeyMeta(key) {
  const tag = key.match(/[\[(（]\s*([^\]\)）]+?)\s*[\])）]/)?.[1] || "기타";
  const prefix = key.match(/^(\d{4})/)?.[1] || "기타";
  return { tag, prefix };
}

export function formatExamPrefix(prefix) {
  if (prefix === "기타") return "기타";
  return `'${prefix.slice(0, 2)}년 ${Number(prefix.slice(2, 4))}월`;
}

export function getAssetSearchText(row) {
  return row.assetSource === "exam" ? getExamAssetSearchText(row) : getMediaAssetSearchText(row);
}

export function getMediaAssetSearchText(row) {
  return [
    row.key,
    row.title,
    row.headline,
    row.caption,
    row.body,
    row.source,
    row.reason,
    ...(row.keywords || []),
  ].join(" ").toLowerCase();
}

export function getExamAssetSearchText(row) {
  const { tag, prefix } = parseExamKeyMeta(row.key);
  return [
    row.key,
    tag,
    prefix,
    formatExamPrefix(prefix),
    row.reason,
    ...(row.keywords || []),
  ].join(" ").toLowerCase();
}

export function upsertAssetRow(row) {
  const nextRow = { kind: "image", keywords: [], reason: "", ...row, assetSource: "media", assetCreatedAt: Date.now() };
  state.assetMap[row.key] = nextRow;
  const mediaRows = state.assetRows.media;
  const existing = mediaRows.find(asset => asset.key === row.key);
  if (existing) Object.assign(existing, nextRow);
  else mediaRows.unshift(nextRow);
  state.assets = [...state.assetRows.media, ...state.assetRows.exam];
}

export function splitKeywords(value) {
  return String(value || "").split(",").map(item => item.trim()).filter(Boolean);
}

export function insertUploadedAssetKey(key) {
  if (!state.assetTarget) return;
  if (state.assetTarget === "__markup__") {
    insertMarkupAssets([key]);
  } else if (state.assetTarget.endsWith(".__commonImages")) {
    appendCommonImages(state.assetTarget.replace(/\.__commonImages$/, ""), [key]);
  } else if (/\.materials$|\.items$/.test(state.assetTarget)) {
    const current = Array.isArray(getPath(state.assetTarget)) ? getPath(state.assetTarget) : [];
    if (!hasMaterialRef(current, key)) current.push(key);
    setPath(state.assetTarget, current);
  } else if (Array.isArray(getPath(state.assetTarget))) {
    const current = getPath(state.assetTarget);
    if (!current.includes(key)) current.push(key);
  } else {
    setPath(state.assetTarget, key);
  }
}

export function clearExternalAssetCache() {
  try {
    sessionStorage.removeItem(EXTERNAL_ASSETS_CACHE_KEY);
  } catch { }
}

export function normalizeSheetText(value) {
  return String(value).replace(/\\n/g, "\n").trim();
}

export function renderAssetThumb(row) {
  if (row.kind === "text") return `<span class="asset-result__placeholder">텍스트</span>`;
  const src = getPreviewImageUrl(row.url);
  if (!src) return `<span class="asset-result__placeholder">자료</span>`;
  return `<img src="${escapeAttr(src)}" alt="" loading="lazy" onerror="this.replaceWith(Object.assign(document.createElement('span'), { className: 'asset-result__placeholder', textContent: '자료' }))">`;
}

export function getPreviewImageUrl(url) {
  if (!url) return "";
  const videoId = extractYoutubeId(url);
  if (videoId) return `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`;
  if (url.includes("drive.google.com")) {
    const match = url.match(/\/d\/([^/]+)/) || url.match(/id=([^&]+)/);
    if (match?.[1]) return `https://lh3.googleusercontent.com/d/${match[1]}`;
  }
  if (/\.(png|jpe?g|gif|webp|avif|bmp|svg)(\?|#|$)/i.test(url)) return url;
  if (/^https?:\/\/[^ ]+$/i.test(url)) return url;
  return "";
}

export function extractYoutubeId(url) {
  try {
    const parsed = new URL(url);
    if (parsed.searchParams.has("v")) return parsed.searchParams.get("v");
    if (parsed.hostname === "youtu.be") return parsed.pathname.slice(1);
    const match = parsed.pathname.match(/^\/embed\/([^/?]+)/);
    if (match) return match[1];
  } catch { }
  return "";
}

export function toggleAssetSelection(key) {
  if (state.assetSelection.has(key)) state.assetSelection.delete(key);
  else state.assetSelection.add(key);
  renderAssetResults();
}

export function handleExamAssetToggle(target) {
  const key = target.value;
  if (!key) return;
  if (state.assetMode === "single") {
    if (!target.checked) {
      renderAssetResults();
      return;
    }
    if (state.assetTarget) setPath(state.assetTarget, key);
    closeAssetSearch();
    renderEditor();
    refreshOutputs();
    toast("기출문제 키를 넣었습니다.");
    return;
  }
  if (target.checked) state.assetSelection.add(key);
  else state.assetSelection.delete(key);
  renderAssetResults();
}

export function applyAssetSelection() {
  if (!state.assetTarget) return;
  if (state.assetMode === "quiz-items") {
    const list = Array.isArray(getPath(state.assetTarget)) ? getPath(state.assetTarget) : [];
    const count = state.assetSelection.size;
    state.assetSelection.forEach(key => {
      if (!list.some(item => item?.image === key)) list.push({ image: key, answer: "" });
    });
    setPath(state.assetTarget, list);
    closeAssetSearch();
    renderEditor();
    refreshOutputs();
    toast(`${count}개 기출문제를 추가했습니다.`);
    return;
  }
  if (state.assetTarget.endsWith(".__commonImages")) {
    const basePath = state.assetTarget.replace(/\.__commonImages$/, "");
    const count = state.assetSelection.size;
    appendCommonImages(basePath, [...state.assetSelection]);
    closeAssetSearch();
    renderEditor();
    refreshOutputs();
    toast(`${count}개 키를 추가했습니다.`);
    return;
  }
  if (state.assetTarget === "__markup__") {
    const count = state.assetSelection.size;
    insertMarkupAssets([...state.assetSelection]);
    closeAssetSearch();
    renderEditor();
    refreshOutputs();
    toast(`${count}개 키를 문법 입력에 추가했습니다.`);
    return;
  }
  const current = Array.isArray(getPath(state.assetTarget)) ? getPath(state.assetTarget) : [];
  const merged = [...current];
  const count = state.assetSelection.size;
  state.assetSelection.forEach(key => {
    if (!hasMaterialRef(merged, key)) merged.push(key);
  });
  setPath(state.assetTarget, merged);
  closeAssetSearch();
  renderEditor();
  refreshOutputs();
  toast(`${count}개 키를 추가했습니다.`);
}

export function hasMaterialRef(items, key) {
  return items.some(item => {
    if (item === key) return true;
    return item && typeof item === "object" && item.ref === key;
  });
}

export function getDefaultAssetSource(path) {
  return /\.items\.\d+\.image$/.test(path) ? "exam" : "media";
}

export function getAssetTargetLabel() {
  if (!state.assetTarget) return "선택된 입력칸 없음";
  if (state.assetTarget === "__markup__") return "현재 섹션 문법 입력";
  if (state.assetTarget.endsWith(".__commonImages")) return "공통 이미지";
  if (state.assetMode === "quiz-items") return "기출문제 여러 개";
  if (/\.items\.\d+\.image$/.test(state.assetTarget)) return "기출문제 이미지";
  if (/\.materials(\.\d+)?$/.test(state.assetTarget)) return "첨부 자료";
  if (/\.items(\.\d+)?$/.test(state.assetTarget)) return "자료";
  if (/\.imagePair(\.\d+)?$/.test(state.assetTarget)) return "이미지 2장 비교";
  if (/\.images(\.\d+)?$/.test(state.assetTarget)) return "이미지 여러 장";
  if (/\.src$/.test(state.assetTarget)) return "미디어 소스";
  if (/\.image$/.test(state.assetTarget)) return "이미지";
  return "외부자료";
}
