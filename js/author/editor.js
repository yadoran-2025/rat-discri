import { state } from "./state.js";
import { BLOCK_TYPE_GROUPS, BLOCK_TYPES, LAYOUT_OPTIONS, LEGACY_BLOCK_TYPES, TEXT_FORMAT_HINT } from "./constants.js";
import { escapeHtml } from "../utils.js";
import { renderMarkupEditor, validateCurrentMarkup } from "./markup-editor.js";
import { deletePath, getPath, setPath } from "./paths.js";
import { escapeAttr, focusPendingField, getDetailState, resizeTextareas } from "./dom.js";
export function renderEditor() {
  renderMetaEditor();
  validateCurrentMarkup();
  renderSectionEditor();
  resizeTextareas();
  focusPendingField();
}

export function renderMetaEditor() {
  document.getElementById("meta-editor").innerHTML = `
    <div class="form-grid">
      ${inputField("id", "수업 ID", "lesson.id", "rat-disc-1", "다운로드 파일명과 URL의 lesson 값으로 사용됩니다.")}
      ${inputField("title", "수업 제목", "lesson.title", "1차시: 제목")}
      ${inputField("subtitle", "부제", "lesson.subtitle", "짧은 설명")}
      ${inputField("imageBase", "이미지 기본 경로", "lesson.imageBase", "assets/images/")}
      ${inputField("prev", "이전 차시 ID", "lesson.prev", "없으면 비워두세요")}
      ${inputField("next", "다음 차시 ID", "lesson.next", "없으면 비워두세요")}
    </div>
  `;
}

export function renderSectionEditor() {
  const current = state.lesson.sections[state.currentSection] || state.lesson.sections[0];
  const sectionIdx = state.lesson.sections.indexOf(current);
  const sectionDetail = getDetailState(current, "section");
  const tabs = state.lesson.sections.map((section, idx) => `
    <button class="btn btn--sm section-tab ${idx === sectionIdx ? "is-active" : ""}" type="button" data-action="select-section" data-section="${idx}">
      ${escapeHtml(section.id || `section-${idx + 1}`)} · ${escapeHtml(section.title || "제목 없음")}
    </button>
  `).join("");

  document.getElementById("section-editor").innerHTML = `
    <div class="sections-tabs">${tabs}</div>
    <details class="section-card" data-detail-id="${sectionDetail.id}" ${sectionDetail.open ? "open" : ""}>
      <summary class="section-card__head">
        <span class="section-card__title">
          <strong>${escapeHtml(current.id || "새 섹션")}</strong>
          <span>${escapeHtml(current.title || "제목 없음")}</span>
        </span>
        <div class="block-card__actions">
          <button class="btn btn--sm" type="button" data-action="move-section" data-section="${sectionIdx}" data-dir="-1">위</button>
          <button class="btn btn--sm" type="button" data-action="move-section" data-section="${sectionIdx}" data-dir="1">아래</button>
          <button class="btn btn--sm" type="button" data-action="duplicate-section" data-section="${sectionIdx}">복제</button>
          <button class="btn btn--sm btn--danger" type="button" data-action="delete-section" data-section="${sectionIdx}">삭제</button>
        </div>
      </summary>
      <div class="block-card__body">
        <div class="form-grid">
          ${inputField("section-id", "섹션 ID", `lesson.sections.${sectionIdx}.id`, "1-1")}
          ${inputField("section-title", "섹션 제목", `lesson.sections.${sectionIdx}.title`, "섹션 제목")}
        </div>
        ${renderMarkupEditor(sectionIdx)}
      </div>
    </details>
  `;
}

export function renderBlockEditor(block, sectionIdx, blockIdx, basePath) {
  const detail = getDetailState(block, "block");
  return `
    <details class="block-card" data-detail-id="${detail.id}" data-section="${sectionIdx}" data-block="${blockIdx}" ${detail.open ? "open" : ""}>
      <summary class="block-card__head">
        <div class="block-card__type">
          <span class="drag-handle" title="드래그해서 순서 변경" aria-label="드래그해서 순서 변경">⋮⋮</span>
          <strong class="block-card__index">#${blockIdx + 1}</strong>
          <span class="block-type-select">
            <select data-action="change-block-type" data-section="${sectionIdx}" data-block="${blockIdx}">
              ${getBlockTypeOptions(block.type).map(type => `<option value="${type}" ${block.type === type ? "selected" : ""}>${type}</option>`).join("")}
            </select>
          </span>
        </div>
        <div class="block-card__actions">
          <button class="btn btn--sm" type="button" data-action="duplicate-block" data-section="${sectionIdx}" data-block="${blockIdx}">복제</button>
          <button class="btn btn--sm btn--danger" type="button" data-action="delete-block" data-section="${sectionIdx}" data-block="${blockIdx}">삭제</button>
        </div>
      </summary>
      <div class="block-card__body">
        ${renderFieldsForBlock(block, basePath)}
      </div>
    </details>
  `;
}

export function renderFieldsForBlock(block, basePath) {
  if (block.type === "단락" || block.type === "소제목") return `<div class="form-grid">${textareaField("text", "텍스트", `${basePath}.text`)}</div>`;
  if (block.type === "사례") {
    return `
      <div class="form-grid">
        ${inputField("title", "상단 태그/제목", `${basePath}.title`, "사례")}
        ${selectField("style", "스타일", `${basePath}.style`, [["", "기본"], ["news", "신문 기사"]])}
        ${textareaField("body", "본문", `${basePath}.body`)}
        ${textareaField("footer", "출처/부연", `${basePath}.footer`)}
        ${textareaField("answer", "답 보기", `${basePath}.answerText`, "줄마다 항목을 적으면 배열로 저장됩니다.")}
      </div>
      ${materialListEditor("첨부 자료", `${basePath}.materials`, "사례 본문 아래에 붙일 자료를 추가합니다.", `${basePath}.materialsLayout`)}
    `;
  }
  if (block.type === "개념") {
    return `
      <div class="form-grid">
        ${inputField("title", "개념 제목", `${basePath}.title`, "핵심 개념")}
        ${textareaField("body", "본문", `${basePath}.body`, "`- `로 줄을 시작하면 불릿 기능이 지원됩니다.")}
      </div>
      ${materialListEditor("첨부 자료", `${basePath}.materials`, "개념 설명 아래에 붙일 자료를 추가합니다.", `${basePath}.materialsLayout`)}
    `;
  }
  if (block.type === "발문") {
    return `
      ${arrayEditor("질문", `${basePath}.prompts`, "prompt")}
    `;
  }
  if (block.type === "댓글") return "";
  if (block.type === "이미지곁글") {
    return `
      <div class="form-grid">
        ${selectField("kind", "형태", `${basePath}.kind`, [["concept", "개념"], ["quote", "인용"]])}
        ${assetInput("image", "이미지 키/URL", `${basePath}.image`)}
        ${inputField("caption", "캡션", `${basePath}.caption`)}
        ${inputField("title", "제목", `${basePath}.title`)}
        ${textareaField("body", "본문/인용문", `${basePath}.body`)}
        ${textareaField("note", "추가 설명", `${basePath}.note`)}
      </div>
    `;
  }
  if (block.type === "미디어") {
    return `
      <div class="form-grid">
        ${selectField("layout", "표시 방식", `${basePath}.layout`, LAYOUT_OPTIONS)}
      </div>
      ${materialListEditor("자료", `${basePath}.items`, "이미지, 영상, 텍스트 자료 키를 같은 목록에 넣습니다.")}
      ${legacyMediaFields(block, basePath)}
    `;
  }
  if (block.type === "기출문제") return arrayEditor("문제", `${basePath}.items`, "quiz");
  return "";
}

export function commonImageFields(basePath) {
  const images = getCommonImages(basePath);
  return `
    <div class="array-card">
      <div class="array-card__head">
        <strong>공통 이미지</strong>
      </div>
      <div class="array-card__body">
        <label class="field field--full">
          <span class="field__label">이미지</span>
          <span class="asset-field">
            <input data-path="${basePath}.__commonImageInput" value="" placeholder="키, 파일명, 이미지 URL">
            <button class="btn btn--sm" type="button" data-action="pick-assets" data-path="${basePath}.__commonImages">키 찾기</button>
          </span>
          ${renderImageChips(images, basePath)}
          <span class="field__hint">키 찾기에서 하나 또는 여러 개를 선택하거나, 직접 입력 후 입력 완료로 추가합니다.</span>
        </label>
      </div>
    </div>
  `;
}

export function getCommonImages(basePath) {
  const block = getPath(basePath) || {};
  return [block.image, ...(Array.isArray(block.images) ? block.images : [])].filter(Boolean);
}

export function appendCommonImages(basePath, values) {
  const block = getPath(basePath);
  if (!block) return;
  const merged = getCommonImages(basePath);
  values.map(v => String(v).trim()).filter(Boolean).forEach(value => {
    if (!merged.includes(value)) merged.push(value);
  });
  syncCommonImages(block, merged);
}

export function removeCommonImage(basePath, index) {
  const block = getPath(basePath);
  if (!block) return;
  const merged = getCommonImages(basePath);
  merged.splice(index, 1);
  syncCommonImages(block, merged);
}

export function syncCommonImages(block, values) {
  delete block.image;
  delete block.images;
  if (values[0]) block.image = values[0];
  if (values.length > 1) block.images = values.slice(1);
}

export function renderImageChips(images, basePath) {
  if (!images.length) return `<div class="image-chip-list image-chip-list--empty">선택된 이미지가 없습니다.</div>`;
  return `
    <div class="image-chip-list">
      ${images.map((image, idx) => `
        <span class="image-chip">
          <span>${escapeHtml(image)}</span>
          <button class="image-chip__remove" type="button" data-action="remove-common-image" data-path="${basePath}" data-item="${idx}" title="이미지 제거" aria-label="이미지 제거">×</button>
        </span>
      `).join("")}
    </div>
  `;
}

export function arrayEditor(title, path, kind) {
  const items = getPath(path) || [];
  const addLabel = kind === "quiz" ? "새 문제 추가" : "추가";
  const emptyMessage = kind === "quiz" ? "현재 추가된 문제가 없습니다" : "항목을 추가하세요.";
  return `
    <div class="array-card">
      <div class="array-card__head">
        <strong>${title}</strong>
        <button class="btn btn--sm" type="button" data-action="array-add" data-path="${path}" data-kind="${kind}">${addLabel}</button>
      </div>
      <div class="array-card__body row-list">
        ${items.length ? items.map((item, idx) => renderArrayItem(item, idx, path, kind)).join("") : `<p class="field__hint">${emptyMessage}</p>`}
      </div>
    </div>
  `;
}

export function renderArrayItem(item, idx, path, kind) {
  const itemPath = `${path}.${idx}`;
  let body = "";
  if (kind === "prompt") {
    body = `
      <div class="form-grid">
        ${textareaField("q", "질문", `${itemPath}.q`)}
        ${textareaField("note", "힌트/보충", `${itemPath}.note`)}
        ${textareaField("answer", "답", `${itemPath}.answer`)}
      </div>
      ${materialListEditor("질문 첨부 자료", `${itemPath}.materials`, "이 질문 바로 아래에 붙일 자료를 추가합니다.", `${itemPath}.materialsLayout`)}
    `;
  } else if (kind === "quiz") {
    body = `
      <div class="form-grid">
        ${assetInput("image", "문제 이미지 키", `${itemPath}.image`)}
        ${textareaField("answer", "정답/해설", `${itemPath}.answerText`, "줄마다 항목을 적으면 배열로 저장됩니다.")}
      </div>
    `;
  } else if (kind === "childBlock") {
    body = `
      <details class="block-card" style="margin-top:0;" open>
        <summary class="block-card__head">
          <div class="block-card__type">
            <strong>하위 #${idx + 1}</strong>
            <select data-action="change-child-type" data-path="${itemPath}">
              ${getBlockTypeOptions(item.type).map(type => `<option value="${type}" ${item.type === type ? "selected" : ""}>${type}</option>`).join("")}
            </select>
          </div>
        </summary>
        <div class="block-card__body">
          ${renderFieldsForBlock(item, itemPath)}
        </div>
      </details>
    `;
  }
  return `
    <div class="row-item">
      <div>${body}</div>
      <div class="inline-tools">
        <button class="btn btn--sm" type="button" data-action="array-move" data-path="${path}" data-item="${idx}" data-dir="-1">위</button>
        <button class="btn btn--sm" type="button" data-action="array-move" data-path="${path}" data-item="${idx}" data-dir="1">아래</button>
        <button class="btn btn--sm btn--danger" type="button" data-action="array-delete" data-path="${path}" data-item="${idx}">삭제</button>
      </div>
    </div>
  `;
}

export function assetArrayEditor(title, path, kind) {
  const items = getPath(path) || [];
  return `
    <div class="array-card">
      <div class="array-card__head">
        <strong>${title}</strong>
        <button class="btn btn--sm" type="button" data-action="array-add" data-path="${path}" data-kind="${kind}">추가</button>
      </div>
      <div class="array-card__body row-list">
        ${items.length ? items.map((_, idx) => `
          <div class="row-item">
            ${assetInput(`asset-${idx}`, `이미지 ${idx + 1}`, `${path}.${idx}`)}
            <div class="inline-tools">
              <button class="btn btn--sm" type="button" data-action="array-move" data-path="${path}" data-item="${idx}" data-dir="-1">위</button>
              <button class="btn btn--sm" type="button" data-action="array-move" data-path="${path}" data-item="${idx}" data-dir="1">아래</button>
              <button class="btn btn--sm btn--danger" type="button" data-action="array-delete" data-path="${path}" data-item="${idx}">삭제</button>
            </div>
          </div>
        `).join("") : `<p class="field__hint">필요하면 이미지를 추가하세요.</p>`}
      </div>
    </div>
  `;
}

export function inputField(id, label, path, placeholder = "", hint = "") {
  return `
    <label class="field">
      <span class="field__label">${label}</span>
      <input id="${id}" data-path="${path}" value="${escapeAttr(readDisplayValue(path))}" placeholder="${escapeAttr(placeholder)}">
      ${hint ? `<span class="field__hint">${hint}</span>` : ""}
    </label>
  `;
}

export function textareaField(id, label, path, hint = "") {
  const helpText = hint ? `${hint}<br>${TEXT_FORMAT_HINT}` : TEXT_FORMAT_HINT;
  return `
    <label class="field field--full">
      <span class="field__label">${label}</span>
      <textarea id="${id}" data-path="${path}" spellcheck="false">${escapeHtml(readDisplayValue(path))}</textarea>
      <span class="field__hint">${helpText}</span>
    </label>
  `;
}

export function listTextarea(id, label, path, hint = "한 줄에 하나씩 적습니다.") {
  const helpText = `${hint}<br>${TEXT_FORMAT_HINT}`;
  return `
    <label class="field field--full">
      <span class="field__label">${label}</span>
      <textarea id="${id}" data-path="${path}" data-kind="list" spellcheck="false">${escapeHtml((getPath(path) || []).join("\n"))}</textarea>
      <span class="field__hint">${helpText}</span>
    </label>
  `;
}

export function assetListTextarea(id, label, path, hint = "한 줄에 하나씩 적습니다.") {
  return `
    <label class="field field--full">
      <span class="field__label">${label}</span>
      <span class="asset-list-field">
        <textarea id="${id}" data-path="${path}" data-kind="list" spellcheck="false">${escapeHtml((getPath(path) || []).join("\n"))}</textarea>
        <button class="btn btn--sm" type="button" data-action="pick-assets" data-path="${path}">여러 키 찾기</button>
      </span>
      <span class="field__hint">${hint}</span>
    </label>
  `;
}

export function selectField(id, label, path, options) {
  const value = getPath(path) ?? "";
  return `
    <label class="field">
      <span class="field__label">${label}</span>
      <select id="${id}" data-path="${path}">
        ${options.map(([key, text]) => `<option value="${escapeAttr(key)}" ${value === key ? "selected" : ""}>${text}</option>`).join("")}
      </select>
    </label>
  `;
}

export function checkboxField(id, label, path) {
  return `
    <label class="check-field">
      <input id="${id}" type="checkbox" data-path="${path}" ${getPath(path) ? "checked" : ""}>
      ${label}
    </label>
  `;
}

export function assetInput(id, label, path) {
  return `
    <label class="field">
      <span class="field__label">${label}</span>
      <span class="asset-field">
        <input id="${id}" data-path="${path}" value="${escapeAttr(readDisplayValue(path))}" placeholder="키, 파일명, 이미지 URL">
        <button class="btn btn--sm" type="button" data-action="pick-asset" data-path="${path}">키 찾기</button>
      </span>
    </label>
  `;
}

export function writeField(target) {
  const path = target.dataset.path;
  if (target.type === "checkbox") {
    setPath(path, target.checked);
  } else if (target.dataset.kind === "list") {
    setPath(path, target.value.split("\n").map(line => line.trim()).filter(Boolean));
  } else if (path.endsWith(".answerText")) {
    const answerPath = path.replace(/\.answerText$/, ".answer");
    setPath(answerPath, normalizeAnswer(target.value));
    clearStaleFlowForTextEdit(answerPath);
  } else if (path.endsWith(".__commonImageInput")) {
    const value = target.value.trim();
    const basePath = path.replace(/\.__commonImageInput$/, "");
    if (value) {
      appendCommonImages(basePath, [value]);
      target.value = "";
      renderEditor();
    }
  } else {
    setPath(path, target.value);
    clearStaleFlowForTextEdit(path);
  }
}

export function clearStaleFlowForTextEdit(path) {
  const blockPath = path.match(/^(.*\.blocks\.\d+)\.(?:body|text|footer|note|answer)$/)?.[1];
  if (blockPath) deletePath(`${blockPath}.flow`);
  const promptPath = path.match(/^(.*\.prompts\.\d+)\.(?:q|note|answer)$/)?.[1];
  if (promptPath) deletePath(`${promptPath}.flow`);
}

export function readDisplayValue(path) {
  if (path.endsWith(".answerText")) {
    const answer = getPath(path.replace(/\.answerText$/, ".answer"));
    return Array.isArray(answer) ? answer.join("\n") : answer || "";
  }
  return getPath(path) ?? "";
}

export function normalizeAnswer(value) {
  const lines = value.split("\n").map(line => line.trim()).filter(Boolean);
  if (lines.length <= 1) return lines[0] || "";
  return lines;
}

export function renderBlockTypeButtons(sectionIdx) {
  return `
    <div class="block-type-groups">
      ${BLOCK_TYPE_GROUPS.map(([label, types]) => `
        <div class="block-type-group">
          <span class="block-type-group__label">${escapeHtml(label)}</span>
          <div class="block-card__actions">
            ${types.map(type => `<button class="btn btn--sm" type="button" data-action="add-block" data-section="${sectionIdx}" data-type="${type}">${type}</button>`).join("")}
          </div>
        </div>
      `).join("")}
    </div>
  `;
}

export function layoutButtonGroup(label, path) {
  const value = getPath(path) || "stack";
  return `
    <div class="layout-button-field">
      <span class="field__label">${label}</span>
      <div class="layout-button-group">
        ${LAYOUT_OPTIONS.map(([key, text]) => `
          <button class="btn btn--sm layout-button ${value === key ? "is-active" : ""}" type="button" data-action="set-layout" data-path="${path}" data-value="${key}" aria-pressed="${value === key ? "true" : "false"}">${text}</button>
        `).join("")}
      </div>
    </div>
  `;
}

export function getBlockTypeOptions(currentType) {
  if (BLOCK_TYPES.includes(currentType) || !LEGACY_BLOCK_TYPES.includes(currentType)) return BLOCK_TYPES;
  return [...BLOCK_TYPES, currentType];
}

export function legacyMediaFields(block, basePath) {
  if (block.item || block.items || block.materials) return "";
  const hasLegacyData = block.kind || block.src || block.url || block.caption || block.headline || block.body || block.source || block.images?.length;
  if (!hasLegacyData) return "";
  return `
    <details class="array-card">
      <summary class="array-card__head"><strong>구버전 직접 입력</strong></summary>
      <div class="array-card__body">
        <div class="form-grid">
          ${selectField("kind", "미디어 종류", `${basePath}.kind`, [["image", "이미지"], ["video", "YouTube 영상"], ["row", "이미지 여러 장"], ["text", "텍스트 컷아웃"]])}
          ${assetInput("src", "이미지 키/URL", `${basePath}.src`)}
          ${inputField("url", "영상 URL", `${basePath}.url`)}
          ${inputField("caption", "캡션", `${basePath}.caption`)}
          ${inputField("headline", "기사 제목", `${basePath}.headline`)}
          ${textareaField("body", "기사 본문", `${basePath}.body`)}
          ${inputField("source", "출처", `${basePath}.source`)}
        </div>
        ${assetArrayEditor("이미지 여러 장", `${basePath}.images`, "image")}
      </div>
    </details>
  `;
}

export function materialListEditor(title, path, hint = "자료 DB 키, URL, 직접 텍스트를 순서대로 추가합니다.", layoutPath = null) {
  const items = getPath(path) || [];
  const isFigureQuote = layoutPath && (getPath(layoutPath) || "stack") === "figure";
  return `
    <div class="array-card">
      <div class="array-card__head">
        <strong>${title}</strong>
      </div>
      <div class="array-card__body">
        ${layoutPath ? layoutButtonGroup("표시 방식", layoutPath) : ""}
        <div class="material-add-row">
          <button class="btn btn--sm btn--primary" type="button" data-action="pick-assets" data-path="${path}">새 자료 추가</button>
          ${isFigureQuote ? `<button class="btn btn--sm" type="button" data-action="add-quote-material" data-path="${path}">인용문 직접 입력</button>` : ""}
        </div>
        <div class="field__hint">${escapeHtml(hint)}</div>
        <div class="row-list material-editor-list">
          ${items.length ? items.map((item, idx) => renderMaterialItem(item, idx, path)).join("") : `<p class="field__hint">선택된 자료가 없습니다.</p>`}
        </div>
      </div>
    </div>
  `;
}

export function renderMaterialItem(item, idx, path) {
  const itemPath = `${path}.${idx}`;
  const isText = item && typeof item === "object" && item.kind === "text";
  const isObjectRef = item && typeof item === "object" && !isText;
  const ref = isObjectRef ? item.ref : item;
  const body = isText ? `
    <div class="form-grid">
      ${inputField(`material-title-${idx}`, "제목", `${itemPath}.title`)}
      ${textareaField(`material-body-${idx}`, "본문", `${itemPath}.body`, "`## 제목`, `---`, `**강조**`, 불릿 문법을 사용할 수 있습니다.")}
      ${inputField(`material-source-${idx}`, "출처", `${itemPath}.source`)}
    </div>
  ` : ref ? `
    ${renderMaterialChip(item, idx, path)}
  ` : `
    <div class="form-grid">
      ${assetInput(`material-ref-${idx}`, "자료 키/URL", itemPath)}
    </div>
  `;
  return `
    <div class="row-item material-editor-item">
      <div class="material-editor-item__head">
        <span class="material-editor-item__label">첨부 자료 ${idx + 1}</span>
        <div class="inline-tools">
          <button class="btn btn--sm" type="button" data-action="array-move" data-path="${path}" data-item="${idx}" data-dir="-1">위</button>
          <button class="btn btn--sm" type="button" data-action="array-move" data-path="${path}" data-item="${idx}" data-dir="1">아래</button>
          <button class="btn btn--sm btn--danger" type="button" data-action="array-delete" data-path="${path}" data-item="${idx}">삭제</button>
        </div>
      </div>
      <div class="material-editor-item__body">${body}</div>
    </div>
  `;
}

export function renderMaterialChip(item, idx, path) {
  const itemPath = `${path}.${idx}`;
  const isObjectRef = item && typeof item === "object";
  const ref = isObjectRef ? item.ref : item;
  const material = state.assetMap[ref] || {};
  const kind = material.kind || (isObjectRef ? item.kind : "") || "자료";
  const label = material.title || material.headline || ref;
  const showKey = String(label || "").trim() !== String(ref || "").trim();
  const meta = getMaterialMetaText(material);
  return `
    <div class="material-chip">
      <div class="material-chip__body">
        <span class="material-chip__kind">${escapeHtml(kind)}</span>
        <span class="material-chip__title">${escapeHtml(label)}</span>
        ${showKey ? `<span class="material-chip__key">${escapeHtml(ref)}</span>` : ""}
        ${meta ? `<span class="material-chip__meta">${escapeHtml(meta)}</span>` : ""}
      </div>
      <div class="material-chip__actions">
        ${isObjectRef ? `
          ${inputField(`material-caption-${idx}`, "직접 표시할 캡션", `${itemPath}.caption`, "예: 영상의 핵심 장면")}
          <button class="btn btn--sm" type="button" data-action="remove-material-caption" data-path="${path}" data-item="${idx}">캡션 제거</button>
        ` : `<button class="btn btn--sm" type="button" data-action="add-material-caption" data-path="${path}" data-item="${idx}">캡션 추가</button>`}
      </div>
    </div>
  `;
}

export function getMaterialMetaText(material) {
  if (!material || !Object.keys(material).length) return "";
  if (material.kind === "text") return material.source || material.caption || material.reason || "";
  return material.caption || material.source || material.reason || "";
}
