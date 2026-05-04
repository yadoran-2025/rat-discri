import { state } from "./state.js";
import { LOCAL_CACHE_KEY, LOCAL_SAVE_SLOTS, LOCAL_SLOT_CACHE_KEY } from "./constants.js";
import { app } from "../state.js";
import { renderBlock, renderBlockSeparator } from "../ui/blocks/index.js";
import { escapeHtml } from "../utils.js";
import { createBlankLesson, createSection } from "./factory.js";
import { toast } from "./dom.js";
export function refreshOutputs() {
  const json = JSON.stringify(cleanLesson({ includeComments: true }), null, 2);
  document.getElementById("json-output").value = json;
  renderPreview();
}

export function renderPreview() {
  const main = document.getElementById("main-content");
  const errors = document.getElementById("preview-errors");
  main.innerHTML = "";
  errors.innerHTML = "";

  const lesson = structuredClone(state.lesson);
  lesson.assets = state.assetMap;
  app.lesson = lesson;

  const sections = state.showAllPreview ? lesson.sections : [lesson.sections[state.currentSection] || lesson.sections[0]];
  sections.forEach((sec, secOffset) => {
    if (!sec) return;
    app.currentIdx = state.showAllPreview ? secOffset : state.currentSection;
    const header = document.createElement("div");
    header.className = "section-header";
    header.innerHTML = `
      <div class="section-header__id">${escapeHtml(sec.id)} · ${escapeHtml(lesson.title || "수업 제목")}</div>
      <h1 class="section-header__title">${escapeHtml(sec.title || "섹션 제목")}</h1>
    `;
    main.appendChild(header);

    let previousBlockType = null;
    (sec.blocks || []).forEach((block, idx) => {
      try {
        const el = renderBlock(block, idx);
        if (el) {
          if (previousBlockType && previousBlockType !== "구분선" && block.type !== "구분선") {
            main.appendChild(renderBlockSeparator());
          }
          main.appendChild(el);
          previousBlockType = block.type;
        }
      } catch (err) {
        const div = document.createElement("div");
        div.className = "preview-error";
        div.textContent = `${block.type || "알 수 없는 블록"} 렌더링 오류: ${err.message}`;
        errors.appendChild(div);
      }
    });
  });
}

export function cleanLesson({ includeComments }) {
  const lesson = {
    id: state.lesson.id,
    title: state.lesson.title,
    subtitle: state.lesson.subtitle,
    imageBase: state.lesson.imageBase,
    prev: state.lesson.prev,
    next: state.lesson.next,
    sections: state.lesson.sections.map(section => ({
      id: section.id,
      title: section.title,
      blocks: section.blocks.map(block => cleanBlock(block, includeComments)).filter(Boolean),
    })),
  };
  return pruneEmpty(lesson);
}

export function cleanBlock(block, includeComments) {
  if (["접이식", "요약"].includes(block.type)) return null;
  const copy = structuredClone(block);
  if (!includeComments) stripComments(copy);
  normalizeMaterialArrays(copy);
  if (copy.type === "미디어") {
    if (copy.item || copy.items || copy.materials) {
      delete copy.kind;
      delete copy.src;
      delete copy.url;
      delete copy.images;
      delete copy.caption;
      delete copy.headline;
      delete copy.body;
      delete copy.source;
    } else {
      if (copy.kind !== "image") delete copy.src;
      if (copy.kind !== "video") delete copy.url;
      if (copy.kind !== "row") delete copy.images;
      if (copy.kind !== "text") {
        delete copy.headline;
        delete copy.source;
        if (copy.kind !== "image" && copy.kind !== "video") delete copy.caption;
        if (copy.kind !== "text") delete copy.body;
      }
    }
  }
  if (copy.type === "발문") {
    delete copy.conclusion;
    delete copy.materials;
    delete copy.materialsLayout;
  }
  if (copy.type === "단락" || copy.type === "소제목") {
    delete copy.materials;
    delete copy.materialsLayout;
  }
  if (copy.type === "개념") {
    delete copy.bullets;
    delete copy.footer;
  }
  return pruneEmpty(copy);
}

export function normalizeMaterialArrays(value) {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value.materials)) value.materials = cleanMaterialArray(value.materials);
  if (value.type === "미디어" && Array.isArray(value.items)) value.items = cleanMaterialArray(value.items);
  Object.values(value).forEach(child => {
    if (Array.isArray(child)) child.forEach(normalizeMaterialArrays);
    else normalizeMaterialArrays(child);
  });
}

export function cleanMaterialArray(items) {
  return items.map(item => {
    if (!item || typeof item !== "object" || item.kind === "text") return item;
    if (!item.caption && item.ref) return item.ref;
    return item;
  });
}

export function stripComments(value) {
  if (!value || typeof value !== "object") return;
  delete value.comments;
  Object.values(value).forEach(child => {
    if (Array.isArray(child)) child.forEach(stripComments);
    else stripComments(child);
  });
}

export function pruneEmpty(value) {
  if (Array.isArray(value)) {
    return value.map(pruneEmpty).filter(item => {
      if (item == null) return false;
      if (Array.isArray(item)) return item.length > 0;
      if (typeof item === "object") return Object.keys(item).length > 0;
      return item !== "";
    });
  }
  if (!value || typeof value !== "object") return value;
  const out = {};
  Object.entries(value).forEach(([key, child]) => {
    const pruned = pruneEmpty(child);
    if (pruned === "" || pruned == null || pruned === false) return;
    if (Array.isArray(pruned) && pruned.length === 0) return;
    if (typeof pruned === "object" && !Array.isArray(pruned) && Object.keys(pruned).length === 0) return;
    out[key] = pruned;
  });
  return out;
}

export function copyJson() {
  const value = document.getElementById("json-output").value;
  navigator.clipboard?.writeText(value)
    .then(() => toast("JSON을 복사했습니다."))
    .catch(() => {
      document.getElementById("json-output").select();
      document.execCommand("copy");
      toast("JSON을 복사했습니다.");
    });
}

export function downloadJson() {
  const json = document.getElementById("json-output").value;
  const blob = new Blob([json], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${state.lesson.id || "lesson"}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function saveLocalDraft(slotId = LOCAL_SAVE_SLOTS[0][0]) {
  const slot = getSaveSlot(slotId);
  const slots = readSlotStore();
  slots[slot.id] = {
    ...createDraftPayload(),
    slotId: slot.id,
    slotLabel: slot.label,
  };
  try {
    writeSlotStore(slots);
    renderSavedSlotMenu();
  } catch (err) {
    console.warn("작업 저장 실패:", err);
  }
}

export function loadLocalDraft(slotId = null) {
  if (slotId) {
    const slots = readSlotStore();
    return normalizeDraft(slots[slotId]);
  }

  const latestSlot = getSavedSlots()
    .filter(slot => slot.savedAt)
    .sort((a, b) => b.ts - a.ts)[0];
  if (latestSlot) return loadLocalDraft(latestSlot.id);

  try {
    const raw = localStorage.getItem(LOCAL_CACHE_KEY);
    return normalizeDraft(raw ? JSON.parse(raw) : null);
  } catch {
    try {
      localStorage.removeItem(LOCAL_CACHE_KEY);
    } catch { }
    return null;
  }
}

export function renderSavedSlotMenu() {
  renderSaveSlotSelect();

  const list = document.getElementById("saved-slot-list");
  if (!list) return;
  const slots = getSavedSlots();
  list.innerHTML = slots.map(slot => {
    const title = slot.lessonTitle || "저장된 작업 없음";
    const meta = slot.savedAt || "비어 있음";
    return `
      <button
        class="save-slot-menu__item"
        type="button"
        data-action="load-local-slot"
        data-slot="${escapeHtml(slot.id)}"
        ${slot.savedAt ? "" : "disabled"}
      >
        <span class="save-slot-menu__label">${escapeHtml(slot.label)}</span>
        <span class="save-slot-menu__title">${escapeHtml(title)}</span>
        <span class="save-slot-menu__meta">${escapeHtml(meta)}</span>
      </button>
    `;
  }).join("");
}

function renderSaveSlotSelect() {
  const select = document.getElementById("save-slot-select");
  if (!select) return;
  const selected = select.value || LOCAL_SAVE_SLOTS[0][0];
  select.innerHTML = getSavedSlots().map(slot => {
    const label = slot.lessonTitle || slot.label;
    return `<option value="${escapeHtml(slot.id)}">${escapeHtml(label)}</option>`;
  }).join("");
  select.value = getSaveSlot(selected).id;
}

export function getSavedSlots() {
  const store = readSlotStore();
  return LOCAL_SAVE_SLOTS.map(([id, label]) => {
    const draft = store[id] || null;
    const ts = Number(draft?.ts || 0);
    return {
      id,
      label,
      ts,
      savedAt: ts ? formatSavedAt(ts) : "",
      lessonTitle: draft?.lesson?.title || draft?.lesson?.id || "",
    };
  });
}

function createDraftPayload() {
  return {
    ts: Date.now(),
    lesson: state.lesson,
    markupDrafts: state.markupDrafts,
  };
}

function getSaveSlot(slotId) {
  const [id, label] = LOCAL_SAVE_SLOTS.find(([value]) => value === slotId) || LOCAL_SAVE_SLOTS[0];
  return { id, label };
}

function readSlotStore() {
  try {
    const parsed = JSON.parse(localStorage.getItem(LOCAL_SLOT_CACHE_KEY) || "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function writeSlotStore(slots) {
  localStorage.setItem(LOCAL_SLOT_CACHE_KEY, JSON.stringify(slots));
}

function normalizeDraft(parsed) {
  const lesson = parsed?.lesson || null;
  if (!isValidLessonDraft(lesson)) return null;
  return {
    lesson: normalizeLessonDraft(lesson),
    markupDrafts: Array.isArray(parsed.markupDrafts) ? parsed.markupDrafts : [],
  };
}

function formatSavedAt(ts) {
  return new Date(ts).toLocaleString("ko-KR", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function isValidLessonDraft(lesson) {
  return Boolean(
    lesson &&
    typeof lesson === "object" &&
    Array.isArray(lesson.sections)
  );
}

export function normalizeLessonDraft(lesson) {
  const normalized = {
    ...createBlankLesson(),
    ...lesson,
    sections: lesson.sections.length ? lesson.sections : [createSection(1)],
  };
  normalized.sections = normalized.sections.map((section, idx) => ({
    id: section?.id || `section-${idx + 1}`,
    title: section?.title || "새 섹션",
    blocks: Array.isArray(section?.blocks) ? section.blocks : [],
  }));
  return normalized;
}
