import { state } from "./state.js";
import { escapeHtml } from "../utils.js";
import { parseLessonMarkup, stringifyLessonMarkup } from "../lesson-markup.js";
import { refreshOutputs } from "./output.js";
import { resizeTextarea } from "./dom.js";
export function validateCurrentMarkup() {
  const source = getSectionMarkup(state.currentSection);
  if (state.markupGeneratedFromJson[state.currentSection]) {
    state.syntaxMessages = { errors: [], warnings: [] };
    return;
  }
  const result = parseLessonMarkup(source);
  state.syntaxMessages = {
    errors: result.errors,
    warnings: result.warnings,
  };
  if (!result.errors.length) {
    const section = state.lesson.sections[state.currentSection];
    if (section) section.blocks = result.blocks;
  }
}

export function renderMarkupEditor(sectionIdx) {
  const source = getSectionMarkup(sectionIdx);
  const messages = state.syntaxMessages || { errors: [], warnings: [] };
  return `
    <div class="markup-editor">
      <div class="markup-editor__head">
        <h3 class="panel__title">문법 입력</h3>
        <div class="inline-tools">
          <button class="btn btn--sm" type="button" data-action="insert-markup-guide">문법 띄워보기</button>
          <span class="markup-help">
            <button class="btn btn--sm" type="button">문법 설명</button>
            <span class="markup-help__popover" role="tooltip">
              <span class="markup-help__row markup-help__row--head"><span>문법</span><span>기능</span></span>
              <span class="markup-help__group">블록</span>
              <span class="markup-help__row"><code>[사례</code><span>사례 블록</span></span>
              <span class="markup-help__row"><code>[개념</code><span>개념 블록</span></span>
              <span class="markup-help__row"><code>[발문</code><span>발문 블록</span></span>
              <span class="markup-help__row"><code>[문제</code><span>문제 블록</span></span>
              <span class="markup-help__row"><code>]</code><span>최근 블록 닫기</span></span>
              <span class="markup-help__row"><code>##</code><span>장</span></span>
              <span class="markup-help__group">작은블록</span>
              <span class="markup-help__row"><code>&lt;답&gt;...&lt;/답&gt;</code><span>답 보기</span></span>
              <span class="markup-help__row"><code>&lt;댓&gt;</code><span>댓글 칸</span></span>
              <span class="markup-help__group">객체</span>
              <span class="markup-help__row"><code>[[자료키]]</code><span>외부자료 호출</span></span>
              <span class="markup-help__row"><code>[[https://...]]</code><span>링크 자료 호출</span></span>
              <span class="markup-help__row"><code>[[자료키==캡션]]</code><span>자료 캡션</span></span>
              <span class="markup-help__row"><code>[[a]] ~ [[b]]</code><span>자료 병렬 연결</span></span>
              <span class="markup-help__row"><code>{{텍스트}}</code><span>텍스트 박스</span></span>
              <span class="markup-help__row"><code>{{a}} ~ {{b}}</code><span>텍스트 박스 병렬 연결</span></span>
              <span class="markup-help__group">객체 내부 문법</span>
              <span class="markup-help__row"><code>;;</code><span>객체 내부 줄바꿈</span></span>
              <span class="markup-help__row"><code>==</code><span>자료 캡션 구분자</span></span>
              <span class="markup-help__group">보편 문법</span>
              <span class="markup-help__row"><code>###</code><span>절</span></span>
              <span class="markup-help__row"><code>*내용*</code><span>굵게</span></span>
              <span class="markup-help__row"><code>%내용%</code><span>기울임체</span></span>
              <span class="markup-help__row"><code>-</code><span>불릿</span></span>
              <span class="markup-help__row"><code>  -</code><span>하위 불릿</span></span>
              <span class="markup-help__row"><code>---</code><span>구분선</span></span>
            </span>
          </span>
          <button class="btn btn--sm" type="button" data-action="insert-markup-asset">자료 키 넣기</button>
          <button class="btn btn--sm" type="button" data-action="insert-markup-upload">새 자료 추가</button>
        </div>
      </div>
      <label class="field field--full">
        <span class="field__label">현재 섹션 블록</span>
        <textarea id="markup-source" class="markup-source" spellcheck="false" wrap="soft">${escapeHtml(source)}</textarea>
        <span class="field__hint">[사례, [개념, [발문, [문제는 ]로 닫고, 자료는 [[키]], 텍스트 박스는 {{내용}}, 댓글 칸은 &lt;댓&gt;, 병렬 연결은 ~, 구분선은 --- 로 씁니다.</span>
      </label>
      <div id="markup-messages">
        ${renderSyntaxMessages(messages)}
      </div>
    </div>
  `;
}

export function renderSyntaxMessages(messages) {
  const errors = messages?.errors || [];
  const warnings = messages?.warnings || [];
  if (!errors.length && !warnings.length) {
    return `<div class="markup-message markup-message--ok">문법 오류가 없습니다.</div>`;
  }
  return `
    <div class="markup-message-list">
      ${errors.map(item => renderSyntaxMessage(item, "error")).join("")}
      ${warnings.map(item => renderSyntaxMessage(item, "warning")).join("")}
    </div>
  `;
}

export function renderSyntaxMessage(item, kind) {
  const label = kind === "error" ? "오류" : "주의";
  return `
    <div class="markup-message markup-message--${kind}">
      <strong>${label}${item.line ? ` ${item.line}행` : ""}</strong>
      <span>${escapeHtml(item.message || "")}</span>
    </div>
  `;
}

export function getSectionMarkup(sectionIdx = state.currentSection) {
  if (state.markupDrafts[sectionIdx] == null) {
    const blocks = state.lesson.sections[sectionIdx]?.blocks || [];
    state.markupDrafts[sectionIdx] = stringifyLessonMarkup(blocks);
    state.markupGeneratedFromJson[sectionIdx] = true;
  }
  return state.markupDrafts[sectionIdx] || "";
}

export function writeMarkupSource(value) {
  const sectionIdx = state.currentSection;
  state.markupDrafts[sectionIdx] = value;
  state.markupGeneratedFromJson[sectionIdx] = false;
  const result = parseLessonMarkup(value);
  state.syntaxMessages = {
    errors: result.errors,
    warnings: result.warnings,
  };
  renderMarkupMessages();
  if (result.errors.length) return;
  const section = state.lesson.sections[sectionIdx];
  if (!section) return;
  section.blocks = result.blocks;
  refreshOutputs();
}

export function renderMarkupMessages() {
  const target = document.getElementById("markup-messages");
  if (target) target.innerHTML = renderSyntaxMessages(state.syntaxMessages);
}

export function insertMarkupAssets(keys) {
  const values = keys.map(key => String(key || "").trim()).filter(Boolean);
  if (!values.length) return;
  const snippet = values.map(key => `[[${key}]]`).join(" ~ ");
  insertMarkupText(snippet);
}

export function insertMarkupText(snippet) {
  const textarea = document.getElementById("markup-source");
  const sectionIdx = state.currentSection;
  const current = getSectionMarkup(sectionIdx);

  let next;
  let cursor;
  if (textarea && document.activeElement === textarea) {
    const start = textarea.selectionStart ?? current.length;
    const end = textarea.selectionEnd ?? start;
    const before = current.slice(0, start);
    const after = current.slice(end);
    const prefix = before && !before.endsWith("\n") ? "\n" : "";
    const suffix = after && !after.startsWith("\n") ? "\n" : "";
    next = `${before}${prefix}${snippet}${suffix}${after}`;
    cursor = before.length + prefix.length + snippet.length;
  } else {
    const separator = current.trim() ? "\n\n" : "";
    next = `${current}${separator}${snippet}`;
    cursor = next.length;
  }

  state.markupDrafts[sectionIdx] = next;
  if (textarea) {
    textarea.value = next;
    textarea.focus();
    textarea.setSelectionRange(cursor, cursor);
    resizeTextarea(textarea);
  }
  writeMarkupSource(next);
}
