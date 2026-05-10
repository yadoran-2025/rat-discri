import { loadExternalAssets } from "../api.js";
import { loadDashboardConfig } from "../dashboard-data.js";
import { app } from "../state.js";
import { FULLSCREEN_TYPES, root, state } from "./state.js";
import { render, renderLessonPicker, renderPreview, renderStatus, renderUnitCount } from "./render.js";
import { countItems, stripHtml, truncate } from "./preview.js";

export function bindEvents() {
  root.addEventListener("click", event => {
    const button = event.target.closest("[data-action]");
    if (!button) return;

    if (button.dataset.action === "set-mode") {
      state.mode = button.dataset.mode || "basic";
      render();
    } else if (button.dataset.action === "select-all-units") {
      state.selectedUnitIds = new Set(state.fullscreenUnits.map(unit => unit.id));
      render();
      renderStatus(`${state.selectedUnitIds.size}개 단위를 선택했습니다.`);
    } else if (button.dataset.action === "clear-units") {
      state.selectedUnitIds.clear();
      render();
      renderStatus("선택한 단위를 모두 해제했습니다.");
    }
  });

  root.addEventListener("input", event => {
    updateField(event.target);
  });

  root.addEventListener("change", event => {
    const target = event.target;
    if (target.id === "worksheet-lesson-select") {
      selectLesson(target.value);
      return;
    }

    if (target.matches("[data-unit-check]")) {
      toggleUnit(target.value, target.checked);
      return;
    }

    updateField(target);
  });
}

export async function loadLessons() {
  state.lessonsLoading = true;
  state.lessonsError = "";
  renderLessonPicker();

  try {
    const config = await loadDashboardConfig({ cache: false });
    state.lessons = flattenLessons(config.groups || []);
    state.lessonsLoading = false;
    renderLessonPicker();
    renderStatus(`${state.lessons.length}개 lesson을 불러왔습니다.`);
  } catch (err) {
    state.lessons = [];
    state.lessonsLoading = false;
    state.lessonsError = err.message;
    renderLessonPicker();
    renderStatus("lesson 목록을 불러오지 못했습니다.");
  }
}

export function flattenLessons(groups) {
  return groups.flatMap(group => {
    const lessons = Array.isArray(group.lessons) ? group.lessons : [];
    return lessons.map(lesson => ({
      id: lesson.id || "",
      label: lesson.label || "",
      title: stripHtml(lesson.title || "이름 없는 lesson"),
      desc: stripHtml(lesson.desc || ""),
      groupTitle: stripHtml(group.title || ""),
      subject: stripHtml(group.subject || ""),
      school: stripHtml(group.school || ""),
      sourceUrl: lesson.sourceUrl || "",
    })).filter(lesson => lesson.id);
  });
}

export async function selectLesson(lessonId) {
  state.selectedLessonId = lessonId;
  state.selectedLesson = null;
  state.fullscreenUnits = [];
  state.selectedUnitIds.clear();
  state.lessonError = "";

  const selected = state.lessons.find(lesson => lesson.id === lessonId);
  if (!selected) {
    render();
    renderStatus("lesson 선택을 해제했습니다.");
    return;
  }

  state.title = selected.title;
  state.lesson = selected.groupTitle || selected.id;
  state.subject = selected.subject;
  state.lessonLoading = true;
  render();
  renderStatus(`${selected.label || selected.id} 데이터를 불러오는 중입니다.`);

  try {
    const source = selected.sourceUrl || `lessons/${encodeURIComponent(selected.id)}.json`;
    const res = await fetch(withCacheBust(source), { cache: "no-store" });
    if (!res.ok) throw new Error(`${source} ${res.status}`);
    state.selectedLesson = await res.json();
    app.lesson = state.selectedLesson;
    app.currentIdx = 0;
    await loadExternalAssets();
    state.fullscreenUnits = buildFullscreenUnits(state.selectedLesson);
    state.selectedUnitIds = new Set(state.fullscreenUnits.map(unit => unit.id));
    state.lessonLoading = false;
    render();
    renderStatus(`${state.fullscreenUnits.length}개 전체화면 단위를 불러왔습니다.`);
  } catch (err) {
    state.lessonLoading = false;
    state.lessonError = err.message;
    render();
    renderStatus("lesson 데이터를 불러오지 못했습니다.");
  }
}

function withCacheBust(url) {
  const separator = String(url).includes("?") ? "&" : "?";
  return `${url}${separator}_=${Date.now()}`;
}

export function buildFullscreenUnits(lesson) {
  const sections = Array.isArray(lesson?.sections) ? lesson.sections : [];
  return sections.flatMap((section, sectionIndex) => {
    const sectionId = section.id || `${sectionIndex + 1}`;
    const sectionTitle = stripHtml(section.title || `섹션 ${sectionIndex + 1}`);
    const headerUnit = {
      id: `${sectionId}:header`,
      kind: "section",
      type: "섹션",
      sectionId,
      sectionTitle,
      sectionIndex,
      title: sectionTitle,
      summary: stripHtml(lesson.title || ""),
    };

    const blockUnits = (section.blocks || [])
      .map((block, blockIndex) => ({ block, blockIndex }))
      .filter(({ block }) => FULLSCREEN_TYPES.has(block.type))
      .map(({ block, blockIndex }) => ({
        id: `${sectionId}:block:${blockIndex}`,
        kind: "block",
        type: block.type,
        sectionId,
        sectionTitle,
        sectionIndex,
        block,
        blockIndex,
        title: getBlockTitle(block, blockIndex),
        summary: getBlockSummary(block),
      }));

    return [headerUnit, ...blockUnits];
  });
}

export function toggleUnit(unitId, checked) {
  if (checked) state.selectedUnitIds.add(unitId);
  else state.selectedUnitIds.delete(unitId);
  renderPreview();
  renderUnitCount();
}

export function updateField(target) {
  const field = target.dataset.field;
  if (!field || !(field in state)) return;
  state[field] = target.value;
  renderPreview();
  renderStatus("미리보기를 갱신했습니다.");
}
