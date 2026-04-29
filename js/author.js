import { app } from "./state.js";
import { ASSET_SHEET_URLS, parseCSV, normalizeAssetColumns } from "./api.js";
import { renderBlock, renderBlockSeparator } from "./ui/blocks.js";
import { escapeHtml } from "./utils.js";
import { parseLessonMarkup, stringifyLessonMarkup } from "./lesson-markup.js";

const BLOCK_TYPE_GROUPS = [
  ["기본", ["소제목", "단락"]],
  ["활동", ["사례", "발문", "개념", "댓글"]],
  ["자료·문제", ["미디어", "기출문제"]],
];
const BLOCK_TYPES = BLOCK_TYPE_GROUPS.flatMap(([, types]) => types);
const LEGACY_BLOCK_TYPES = ["이미지곁글"];
const LOCAL_CACHE_KEY = "lessonAuthorDraft_v2";
const EXTERNAL_ASSETS_CACHE_KEY = "externalAssets_v2";
const LAYOUT_OPTIONS = [["stack", "아래로 나열"], ["row", "옆으로 나열"], ["figure", "사진+인용"]];
const TEXT_FORMAT_HINT = "`### 절`은 작은 제목으로, `*굵게*`와 `%기울임%`은 보편 문법으로 표시됩니다.";
const MARKUP_GUIDE_TEXT = `## 장 제목
### 절 제목

일반 문단은 그대로 씁니다.
- 불릿
  - 2단 불릿
*굵게*
%기울임체%

[사례
사례 본문
[[자료키]]
[[자료키==캡션]]
{{텍스트 박스;;둘째 줄}}
<답>
답 보기 내용
</답>
]

[발문
질문 내용
<댓>
]

[개념
개념 설명
[[자료1]] ~ [[자료2]]
]

[문제
문제이미지키
<답>
해설 내용
</답>
]

---
구분선`;
// Paste the deployed Google Apps Script Web App /exec URL here.
const ASSET_UPLOAD_ENDPOINT = "https://script.google.com/macros/s/AKfycbw_DJp0xMarEDwnQnpO0nEcQMhWygsMiBf_HGgnauh_ViU-KLmI1pG8ZI_CdNMNOi8P/exec";

const savedDraft = loadLocalDraft();

const state = {
  lesson: savedDraft?.lesson || createBlankLesson(),
  markupDrafts: savedDraft?.markupDrafts || [],
  markupGeneratedFromJson: [],
  syntaxMessages: { errors: [], warnings: [] },
  currentSection: 0,
  showAllPreview: false,
  assets: [],
  assetRows: { media: [], exam: [] },
  assetMap: {},
  assetTarget: null,
  assetMode: "single",
  assetSource: "media",
  assetSelection: new Set(),
  examSubject: "경제",
  examGroupOpen: new Set(),
  examSubgroupOpen: new Set(),
  upload: {
    file: null,
    dataUrl: "",
    key: "",
    lastKey: "",
    lastUrl: "",
    status: "",
    busy: false,
  },
  blockSort: null,
  openDetails: new Map(),
  focusPath: "",
};

const uiIds = new WeakMap();
let nextUiId = 1;
const root = document.getElementById("author-root");

init();

function init() {
  renderShell();
  bindRootEvents();
  renderEditor();
  refreshOutputs();
  loadAssetIndex();
}

function renderShell() {
  root.innerHTML = `
    <div class="author">
      <header class="author__topbar">
        <div class="author__brand">
          <a class="author__back" href="index.html" aria-label="대시보드로 이동">←</a>
          <div>
            <h1 class="author__title">BNG LANG 에디터</h1>
            <div class="author__subtitle">BNG LANG(붕랭) 문법으로 수업 정보, 섹션, 블록을 구성하고 발표용 JSON을 생성합니다.</div>
          </div>
        </div>
        <div class="author__actions">
          <button class="btn" type="button" data-action="save-local">작업 저장</button>
          <button class="btn" type="button" data-action="load-local">저장본 불러오기</button>
          <button class="btn" type="button" data-action="reset">초기화</button>
          <button class="btn" type="button" data-action="copy-json">JSON 복사</button>
          <button class="btn btn--primary" type="button" data-action="download-json">JSON 다운로드</button>
        </div>
      </header>

      <div class="author__layout">
        <div class="author__panel">
          <section class="panel">
            <div class="panel__head">
              <h2 class="panel__title">수업 정보</h2>
            </div>
            <div class="panel__body">
              <div id="meta-editor"></div>
            </div>
          </section>

          <section class="panel">
            <div class="panel__head">
              <h2 class="panel__title">섹션과 블록</h2>
              <div class="inline-tools">
                <button class="btn btn--sm" type="button" data-action="add-section">섹션 추가</button>
              </div>
            </div>
            <div class="panel__body">
              <div id="section-editor"></div>
            </div>
          </section>

          <section class="panel">
            <div class="panel__head">
              <h2 class="panel__title">생성된 JSON</h2>
            </div>
            <div class="panel__body">
              <textarea id="json-output" class="json-output" readonly spellcheck="false"></textarea>
            </div>
          </section>
        </div>

        <aside class="author__preview">
          <section class="panel">
            <div class="preview-toolbar">
              <h2 class="panel__title">실시간 미리보기</h2>
              <label class="check-field">
                <input type="checkbox" id="preview-all">
                전체 보기
              </label>
            </div>
            <div class="preview-stage">
              <div id="preview-errors"></div>
              <div id="main-content"></div>
            </div>
          </section>
        </aside>
      </div>

      <section class="panel asset-search" id="asset-search">
        <div class="panel__head">
          <h2 class="panel__title">외부 자료 목록</h2>
          <button class="btn btn--sm" type="button" data-action="close-assets">닫기</button>
        </div>
        <div class="asset-search__body">
          <div class="asset-target-note" id="asset-target-note"></div>
          <div class="asset-source-tabs" id="asset-source-tabs"></div>
          <input class="asset-search__input" id="asset-query" type="search" placeholder="키, 설명, 키워드로 검색" autocomplete="off">
          <div class="asset-search__bar" id="asset-search-bar"></div>
          <div id="asset-upload-panel"></div>
          <div class="asset-results" id="asset-results"></div>
        </div>
      </section>
    </div>
  `;
}

function bindRootEvents() {
  root.addEventListener("input", event => {
    const target = event.target;
    if (target.matches("[data-upload-field]")) {
      writeUploadField(target);
      return;
    }
    if (target.id === "markup-source") {
      writeMarkupSource(target.value);
      resizeTextarea(target);
      return;
    }
    if (target.matches("[data-path]") && !target.dataset.path.endsWith(".__commonImageInput")) {
      writeField(target);
      if (target.matches("textarea")) resizeTextarea(target);
      refreshOutputs();
    }
    if (target.id === "asset-query") renderAssetResults();
  });

  root.addEventListener("keydown", event => {
    const target = event.target;
    if (event.key === "Enter" && target.matches("[data-path$='.__commonImageInput']")) {
      event.preventDefault();
      writeField(target);
      refreshOutputs();
    }
  });

  root.addEventListener("paste", event => {
    const pasteZone = event.target.closest?.(".asset-upload");
    if (!pasteZone) return;
    const file = getClipboardImage(event.clipboardData);
    if (!file) {
      setUploadStatus("No image found in the clipboard.");
      return;
    }
    event.preventDefault();
    prepareUploadFile(file);
  });

  root.addEventListener("pointerdown", event => {
    const handle = event.target.closest?.(".drag-handle");
    if (!handle) return;
    startBlockSort(event, handle);
  });

  document.addEventListener("pointermove", event => {
    updateBlockSort(event);
  }, true);

  document.addEventListener("pointerup", event => {
    finishBlockSort(event);
  }, true);

  document.addEventListener("pointercancel", event => {
    cancelBlockSort(event);
  }, true);

  root.addEventListener("toggle", event => {
    const details = event.target.closest("details[data-detail-id]");
    if (!details) return;
    state.openDetails.set(details.dataset.detailId, details.open);
  }, true);

  root.addEventListener("change", event => {
    const target = event.target;
    if (target.id === "preview-all") {
      state.showAllPreview = target.checked;
      refreshOutputs();
      return;
    }
    if (target.matches("[data-action='toggle-exam-asset']")) {
      handleExamAssetToggle(target);
      return;
    }
    if (target.matches("[data-path]")) {
      writeField(target);
      refreshOutputs();
    }
    if (target.matches("[data-action='change-block-type']")) {
      const sectionIdx = Number(target.dataset.section);
      const blockIdx = Number(target.dataset.block);
      state.lesson.sections[sectionIdx].blocks[blockIdx] = createBlock(target.value);
      renderEditor();
      refreshOutputs();
    }
    if (target.matches("[data-action='change-child-type']")) {
      setPath(target.dataset.path, createBlock(target.value));
      renderEditor();
      refreshOutputs();
    }
  });

  root.addEventListener("click", event => {
    if (event.target.closest("button, select, input, textarea, a, .drag-handle") && event.target.closest("summary")) {
      event.preventDefault();
      event.stopPropagation();
    }

    const button = event.target.closest("[data-action]");
    if (!button) return;
    const action = button.dataset.action;
    const sectionIdx = numberOrNull(button.dataset.section);
    const blockIdx = numberOrNull(button.dataset.block);
    const itemIdx = numberOrNull(button.dataset.item);
    const path = button.dataset.path;

    if (action === "save-local") {
      saveLocalDraft();
      toast("현재 작업을 브라우저에 저장했습니다.");
    } else if (action === "load-local") {
      const draft = loadLocalDraft();
      if (!draft) return toast("저장된 작업이 없습니다.");
      state.lesson = draft.lesson;
      state.markupDrafts = draft.markupDrafts || [];
      state.markupGeneratedFromJson = [];
      state.currentSection = 0;
      renderEditor();
      refreshOutputs();
      toast("저장된 작업을 불러왔습니다.");
    } else if (action === "reset") {
      state.lesson = createBlankLesson();
      state.markupDrafts = state.lesson.sections.map(section => stringifyLessonMarkup(section.blocks));
      state.markupGeneratedFromJson = state.lesson.sections.map(() => false);
      state.currentSection = 0;
      renderEditor();
      refreshOutputs();
      toast("새 수업으로 초기화했습니다.");
    } else if (action === "copy-json") {
      copyJson();
    } else if (action === "download-json") {
      downloadJson();
    } else if (action === "insert-markup-asset") {
      state.assetTarget = "__markup__";
      openAssetSearch("multi", "media");
    } else if (action === "insert-markup-guide") {
      insertMarkupText(MARKUP_GUIDE_TEXT);
      toast("문법 설명을 넣었습니다.");
    } else if (action === "add-section") {
      const section = createSection(state.lesson.sections.length + 1);
      state.lesson.sections.push(section);
      state.markupDrafts.push(stringifyLessonMarkup(section.blocks));
      state.markupGeneratedFromJson.push(false);
      state.currentSection = state.lesson.sections.length - 1;
      renderEditor();
      refreshOutputs();
    } else if (action === "select-section") {
      state.currentSection = sectionIdx;
      renderEditor();
      refreshOutputs();
    } else if (action === "duplicate-section") {
      const clone = structuredClone(state.lesson.sections[sectionIdx]);
      clone.id = uniqueSectionId(clone.id || "section");
      clone.title = `${clone.title || "새 섹션"} 복사본`;
      state.lesson.sections.splice(sectionIdx + 1, 0, clone);
      state.markupDrafts.splice(sectionIdx + 1, 0, getSectionMarkup(sectionIdx));
      state.markupGeneratedFromJson.splice(sectionIdx + 1, 0, state.markupGeneratedFromJson[sectionIdx] || false);
      state.currentSection = sectionIdx + 1;
      renderEditor();
      refreshOutputs();
    } else if (action === "delete-section") {
      if (state.lesson.sections.length <= 1) return toast("섹션은 최소 1개가 필요합니다.");
      state.lesson.sections.splice(sectionIdx, 1);
      state.markupDrafts.splice(sectionIdx, 1);
      state.markupGeneratedFromJson.splice(sectionIdx, 1);
      state.currentSection = Math.max(0, Math.min(state.currentSection, state.lesson.sections.length - 1));
      renderEditor();
      refreshOutputs();
    } else if (action === "move-section") {
      const dir = Number(button.dataset.dir);
      moveItem(state.lesson.sections, sectionIdx, dir);
      moveItem(state.markupDrafts, sectionIdx, dir);
      moveItem(state.markupGeneratedFromJson, sectionIdx, dir);
      state.currentSection = Math.max(0, Math.min(state.lesson.sections.length - 1, sectionIdx + dir));
      renderEditor();
      refreshOutputs();
    } else if (action === "add-block") {
      state.lesson.sections[sectionIdx].blocks.push(createBlock(button.dataset.type || "단락"));
      renderEditor();
      refreshOutputs();
    } else if (action === "duplicate-block") {
      const blocks = state.lesson.sections[sectionIdx].blocks;
      blocks.splice(blockIdx + 1, 0, structuredClone(blocks[blockIdx]));
      renderEditor();
      refreshOutputs();
    } else if (action === "delete-block") {
      state.lesson.sections[sectionIdx].blocks.splice(blockIdx, 1);
      renderEditor();
      refreshOutputs();
    } else if (action === "array-add") {
      if (button.dataset.kind === "quiz") {
        state.assetTarget = path;
        openAssetSearch("quiz-items", "exam");
        return;
      }
      let arr = getPath(path);
      if (!Array.isArray(arr)) {
        arr = [];
        setPath(path, arr);
      }
      arr.push(createArrayItem(button.dataset.kind));
      renderEditor();
      refreshOutputs();
    } else if (action === "array-delete") {
      getPath(path).splice(itemIdx, 1);
      renderEditor();
      refreshOutputs();
    } else if (action === "array-move") {
      moveItem(getPath(path), itemIdx, Number(button.dataset.dir));
      renderEditor();
      refreshOutputs();
    } else if (action === "set-layout") {
      setPath(path, button.dataset.value || "stack");
      renderEditor();
      refreshOutputs();
    } else if (action === "add-material-caption") {
      addMaterialCaption(path, itemIdx);
      renderEditor();
      refreshOutputs();
    } else if (action === "remove-material-caption") {
      removeMaterialCaption(path, itemIdx);
      renderEditor();
      refreshOutputs();
    } else if (action === "add-quote-material") {
      addQuoteMaterial(path);
      renderEditor();
      refreshOutputs();
    } else if (action === "remove-common-image") {
      removeCommonImage(path, itemIdx);
      renderEditor();
      refreshOutputs();
    } else if (action === "pick-asset") {
      state.assetTarget = path;
      openAssetSearch("single", getDefaultAssetSource(path));
    } else if (action === "pick-assets") {
      state.assetTarget = path;
      openAssetSearch("multi", getDefaultAssetSource(path));
    } else if (action === "pick-exam-items") {
      state.assetTarget = path;
      openAssetSearch("quiz-items", "exam");
    } else if (action === "choose-asset-source") {
      state.assetSource = button.dataset.source || "media";
      state.assetSelection.clear();
      if (state.assetSource === "exam") state.examSubject = state.examSubject || "경제";
      const queryInput = document.getElementById("asset-query");
      if (queryInput) queryInput.value = "";
      renderAssetResults();
    } else if (action === "choose-exam-subject") {
      state.examSubject = button.dataset.subject || "경제";
      renderAssetResults();
    } else if (action === "toggle-exam-session") {
      toggleExamOpenState(state.examGroupOpen, button.dataset.group);
      renderAssetResults();
    } else if (action === "toggle-exam-group") {
      toggleExamOpenState(state.examGroupOpen, button.dataset.group);
      renderAssetResults();
    } else if (action === "toggle-exam-subgroup") {
      toggleExamOpenState(state.examSubgroupOpen, button.dataset.group);
      renderAssetResults();
    } else if (action === "choose-asset") {
      if (state.assetMode === "multi") {
        toggleAssetSelection(button.dataset.key);
        return;
      }
      if (state.assetMode === "quiz-items") {
        toggleAssetSelection(button.dataset.key);
        return;
      }
      if (state.assetTarget === "__markup__") {
        insertMarkupAssets([button.dataset.key]);
      } else if (state.assetTarget) {
        setPath(state.assetTarget, button.dataset.key);
      }
      closeAssetSearch();
      renderEditor();
      refreshOutputs();
      toast("외부자료 키를 넣었습니다.");
    } else if (action === "apply-assets") {
      applyAssetSelection();
    } else if (action === "upload-asset") {
      uploadClipboardAsset();
    } else if (action === "copy-upload-url") {
      copyUploadedAssetUrl();
    } else if (action === "insert-upload-url") {
      insertUploadedAssetUrl();
    } else if (action === "clear-upload-asset") {
      clearUploadAsset();
      renderUploadPanel();
    } else if (action === "close-assets") {
      closeAssetSearch();
    }
  });
}

function renderEditor() {
  renderMetaEditor();
  validateCurrentMarkup();
  renderSectionEditor();
  resizeTextareas();
  focusPendingField();
}

function validateCurrentMarkup() {
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

function renderMetaEditor() {
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

function renderSectionEditor() {
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

function renderMarkupEditor(sectionIdx) {
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

function renderSyntaxMessages(messages) {
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

function renderSyntaxMessage(item, kind) {
  const label = kind === "error" ? "오류" : "주의";
  return `
    <div class="markup-message markup-message--${kind}">
      <strong>${label}${item.line ? ` ${item.line}행` : ""}</strong>
      <span>${escapeHtml(item.message || "")}</span>
    </div>
  `;
}

function renderBlockEditor(block, sectionIdx, blockIdx, basePath) {
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

function renderFieldsForBlock(block, basePath) {
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

function commonImageFields(basePath) {
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

function getCommonImages(basePath) {
  const block = getPath(basePath) || {};
  return [block.image, ...(Array.isArray(block.images) ? block.images : [])].filter(Boolean);
}

function appendCommonImages(basePath, values) {
  const block = getPath(basePath);
  if (!block) return;
  const merged = getCommonImages(basePath);
  values.map(v => String(v).trim()).filter(Boolean).forEach(value => {
    if (!merged.includes(value)) merged.push(value);
  });
  syncCommonImages(block, merged);
}

function removeCommonImage(basePath, index) {
  const block = getPath(basePath);
  if (!block) return;
  const merged = getCommonImages(basePath);
  merged.splice(index, 1);
  syncCommonImages(block, merged);
}

function syncCommonImages(block, values) {
  delete block.image;
  delete block.images;
  if (values[0]) block.image = values[0];
  if (values.length > 1) block.images = values.slice(1);
}

function renderImageChips(images, basePath) {
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

function arrayEditor(title, path, kind) {
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

function renderArrayItem(item, idx, path, kind) {
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

function assetArrayEditor(title, path, kind) {
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

function inputField(id, label, path, placeholder = "", hint = "") {
  return `
    <label class="field">
      <span class="field__label">${label}</span>
      <input id="${id}" data-path="${path}" value="${escapeAttr(readDisplayValue(path))}" placeholder="${escapeAttr(placeholder)}">
      ${hint ? `<span class="field__hint">${hint}</span>` : ""}
    </label>
  `;
}

function textareaField(id, label, path, hint = "") {
  const helpText = hint ? `${hint}<br>${TEXT_FORMAT_HINT}` : TEXT_FORMAT_HINT;
  return `
    <label class="field field--full">
      <span class="field__label">${label}</span>
      <textarea id="${id}" data-path="${path}" spellcheck="false">${escapeHtml(readDisplayValue(path))}</textarea>
      <span class="field__hint">${helpText}</span>
    </label>
  `;
}

function listTextarea(id, label, path, hint = "한 줄에 하나씩 적습니다.") {
  const helpText = `${hint}<br>${TEXT_FORMAT_HINT}`;
  return `
    <label class="field field--full">
      <span class="field__label">${label}</span>
      <textarea id="${id}" data-path="${path}" data-kind="list" spellcheck="false">${escapeHtml((getPath(path) || []).join("\n"))}</textarea>
      <span class="field__hint">${helpText}</span>
    </label>
  `;
}

function assetListTextarea(id, label, path, hint = "한 줄에 하나씩 적습니다.") {
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

function selectField(id, label, path, options) {
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

function checkboxField(id, label, path) {
  return `
    <label class="check-field">
      <input id="${id}" type="checkbox" data-path="${path}" ${getPath(path) ? "checked" : ""}>
      ${label}
    </label>
  `;
}

function assetInput(id, label, path) {
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

function writeField(target) {
  const path = target.dataset.path;
  if (target.type === "checkbox") {
    setPath(path, target.checked);
  } else if (target.dataset.kind === "list") {
    setPath(path, target.value.split("\n").map(line => line.trim()).filter(Boolean));
  } else if (path.endsWith(".answerText")) {
    const answerPath = path.replace(/\.answerText$/, ".answer");
    setPath(answerPath, normalizeAnswer(target.value));
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
  }
}

function getSectionMarkup(sectionIdx = state.currentSection) {
  if (state.markupDrafts[sectionIdx] == null) {
    const blocks = state.lesson.sections[sectionIdx]?.blocks || [];
    state.markupDrafts[sectionIdx] = stringifyLessonMarkup(blocks);
    state.markupGeneratedFromJson[sectionIdx] = true;
  }
  return state.markupDrafts[sectionIdx] || "";
}

function writeMarkupSource(value) {
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

function renderMarkupMessages() {
  const target = document.getElementById("markup-messages");
  if (target) target.innerHTML = renderSyntaxMessages(state.syntaxMessages);
}

function insertMarkupAssets(keys) {
  const values = keys.map(key => String(key || "").trim()).filter(Boolean);
  if (!values.length) return;
  const snippet = values.map(key => `[[${key}]]`).join(" ~ ");
  insertMarkupText(snippet);
}

function insertMarkupText(snippet) {
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

function readDisplayValue(path) {
  if (path.endsWith(".answerText")) {
    const answer = getPath(path.replace(/\.answerText$/, ".answer"));
    return Array.isArray(answer) ? answer.join("\n") : answer || "";
  }
  return getPath(path) ?? "";
}

function normalizeAnswer(value) {
  const lines = value.split("\n").map(line => line.trim()).filter(Boolean);
  if (lines.length <= 1) return lines[0] || "";
  return lines;
}

function focusPendingField() {
  if (!state.focusPath) return;
  const path = state.focusPath;
  state.focusPath = "";
  requestAnimationFrame(() => {
    const field = root.querySelector(`[data-path="${CSS.escape(path)}"]`);
    if (!field) return;
    field.focus();
    if (typeof field.setSelectionRange === "function") {
      const end = field.value.length;
      field.setSelectionRange(end, end);
    }
  });
}

function resizeTextareas() {
  root.querySelectorAll("textarea[data-path]").forEach(resizeTextarea);
}

function resizeTextarea(textarea) {
  if (textarea.classList.contains("markup-source")) return;
  textarea.style.height = "auto";
  textarea.style.height = `${textarea.scrollHeight + 2}px`;
}

function refreshOutputs() {
  const json = JSON.stringify(cleanLesson({ includeComments: true }), null, 2);
  document.getElementById("json-output").value = json;
  renderPreview();
}

function renderPreview() {
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

function cleanLesson({ includeComments }) {
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

function cleanBlock(block, includeComments) {
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

function normalizeMaterialArrays(value) {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value.materials)) value.materials = cleanMaterialArray(value.materials);
  if (value.type === "미디어" && Array.isArray(value.items)) value.items = cleanMaterialArray(value.items);
  Object.values(value).forEach(child => {
    if (Array.isArray(child)) child.forEach(normalizeMaterialArrays);
    else normalizeMaterialArrays(child);
  });
}

function cleanMaterialArray(items) {
  return items.map(item => {
    if (!item || typeof item !== "object" || item.kind === "text") return item;
    if (!item.caption && item.ref) return item.ref;
    return item;
  });
}

function renderBlockTypeButtons(sectionIdx) {
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

function layoutButtonGroup(label, path) {
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

function getBlockTypeOptions(currentType) {
  if (BLOCK_TYPES.includes(currentType) || !LEGACY_BLOCK_TYPES.includes(currentType)) return BLOCK_TYPES;
  return [...BLOCK_TYPES, currentType];
}

function stripComments(value) {
  if (!value || typeof value !== "object") return;
  delete value.comments;
  Object.values(value).forEach(child => {
    if (Array.isArray(child)) child.forEach(stripComments);
    else stripComments(child);
  });
}

function pruneEmpty(value) {
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

async function loadAssetIndex() {
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
      rowsBySource[source].push({ ...material, assetSource: source });
    });
  });
  state.assetRows = rowsBySource;
  state.assets = [...rowsBySource.media, ...rowsBySource.exam];
  state.assetMap = map;
  renderAssetResults();
  refreshOutputs();
}

function openAssetSearch(mode = "single", source = "media") {
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

function closeAssetSearch() {
  document.getElementById("asset-search").classList.remove("is-open");
  state.assetTarget = null;
  state.assetMode = "single";
  state.assetSource = "media";
  state.assetSelection.clear();
  const queryInput = document.getElementById("asset-query");
  if (queryInput) queryInput.value = "";
}

function renderAssetResults() {
  const box = document.getElementById("asset-results");
  const bar = document.getElementById("asset-search-bar");
  const tabs = document.getElementById("asset-source-tabs");
  const note = document.getElementById("asset-target-note");
  const queryInput = document.getElementById("asset-query");
  if (!box) return;
  renderAssetSourceTabs(tabs);
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
  const filteredRows = sourceRows.filter(row => !query || getAssetSearchText(row).includes(query));
  const rows = filteredRows;
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

function renderAssetSourceTabs(tabs) {
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

function renderMediaAssetResults(rows) {
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

function renderExamAssetResults(rows, forceOpen = false) {
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

function legacyMediaFields(block, basePath) {
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

function materialListEditor(title, path, hint = "자료 DB 키, URL, 직접 텍스트를 순서대로 추가합니다.", layoutPath = null) {
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

function renderMaterialItem(item, idx, path) {
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

function renderMaterialChip(item, idx, path) {
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

function getMaterialMetaText(material) {
  if (!material || !Object.keys(material).length) return "";
  if (material.kind === "text") return material.source || material.caption || material.reason || "";
  return material.caption || material.source || material.reason || "";
}

function renderExamSubjectTab(subject, sessions, currentSubject) {
  const items = Object.values(sessions).flat();
  const selected = countSelectedAssets(items);
  return `
    <button class="asset-exam-subject-tab ${subject === currentSubject ? "is-active" : ""}" type="button" data-action="choose-exam-subject" data-subject="${escapeAttr(subject)}">
      <strong>${escapeHtml(subject)}</strong>
      <span>${selected ? `${selected}/` : ""}${items.length}개</span>
    </button>
  `;
}

function renderExamSession(prefix, subject, items, forceOpen) {
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

function renderExamAssetItem(row) {
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

function groupExamRowsBySubjectThenPrefix(rows) {
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

function getOrderedExamSubjects(subjects) {
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

function isExamOpen(store, id) {
  return !store.has(id);
}

function toggleExamOpenState(store, id) {
  if (!id) return;
  if (store.has(id)) store.delete(id);
  else store.add(id);
}

function countSelectedAssets(items) {
  return items.filter(item => state.assetSelection.has(item.key)).length;
}

function parseExamKeyMeta(key) {
  const tag = key.match(/\[(.+?)\]/)?.[1] || "기타";
  const prefix = key.match(/^(\d{4})/)?.[1] || "기타";
  return { tag, prefix };
}

function formatExamPrefix(prefix) {
  if (prefix === "기타") return "기타";
  return `'${prefix.slice(0, 2)}년 ${Number(prefix.slice(2, 4))}월`;
}

function getAssetSearchText(row) {
  return row.assetSource === "exam" ? getExamAssetSearchText(row) : getMediaAssetSearchText(row);
}

function getMediaAssetSearchText(row) {
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

function getExamAssetSearchText(row) {
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

function legacyRenderUploadPanel() {
  const panel = document.getElementById("asset-upload-panel");
  if (!panel) return;
  if (state.assetSource !== "upload") {
    panel.innerHTML = "";
    return;
  }
  const upload = state.upload;
  const targetLabel = getAssetTargetLabel();
  const endpointReady = Boolean(ASSET_UPLOAD_ENDPOINT.trim());
  const preview = upload.dataUrl
    ? `<img class="asset-upload__preview-img" src="${escapeAttr(upload.dataUrl)}" alt="">`
    : `<span class="asset-upload__placeholder">이미지를 여기에 붙여넣으세요</span>`;
  panel.innerHTML = `
    <div class="asset-upload" tabindex="0">
      <div class="asset-upload__head">
        <strong>클립보드 새 자료 등록</strong>
        <span>${escapeHtml(targetLabel)}</span>
      </div>
      <div class="asset-upload__drop">
        ${preview}
      </div>
      <div class="asset-upload__grid">
        <label class="field">
          <span class="field__label">Apps Script URL</span>
          <input data-upload-field="endpoint" value="${escapeAttr(upload.endpoint)}" placeholder="https://script.google.com/macros/s/.../exec">
        </label>
        <label class="field">
          <span class="field__label">JSON 키</span>
          <input data-upload-field="key" value="${escapeAttr(upload.key)}" placeholder="asset-key">
        </label>
        <label class="field">
          <span class="field__label">키워드</span>
          <input data-upload-field="keywords" value="${escapeAttr(upload.keywords)}" placeholder="키워드1, 키워드2">
        </label>
        <label class="field">
          <span class="field__label">설명 / 메모</span>
          <input data-upload-field="reason" value="${escapeAttr(upload.reason)}" placeholder="왜 가져왔는지 짧게 메모">
        </label>
      </div>
      <div class="asset-upload__actions">
        <label class="btn btn--sm" for="asset-upload-file">파일 선택</label>
        <input id="asset-upload-file" type="file" accept="image/*" hidden>
        <button class="btn btn--sm btn--primary" type="button" data-action="upload-asset" ${upload.busy ? "disabled" : ""}>업로드</button>
        <button class="btn btn--sm" type="button" data-action="clear-upload-asset">비우기</button>
      </div>
      <div class="asset-upload__status">${escapeHtml(upload.status || "이미지를 붙여넣거나 파일을 선택한 뒤 Drive/Sheets에 등록합니다.")}</div>
    </div>
  `;
}

function writeUploadField(target) {
  const field = target.dataset.uploadField;
  state.upload[field] = target.value;
}

function getClipboardImage(clipboardData) {
  const items = [...(clipboardData?.items || [])];
  const item = items.find(entry => entry.kind === "file" && entry.type.startsWith("image/"));
  return item?.getAsFile() || null;
}

async function legacyPrepareUploadFile(file) {
  if (!file.type.startsWith("image/")) {
    setUploadStatus("Only image files can be uploaded.");
    return;
  }
  state.upload.file = file;
  state.upload.dataUrl = await readFileAsDataUrl(file);
  if (!state.upload.key) state.upload.key = createAssetKey(file);
  state.upload.status = `${file.type || "image"} ready (${Math.round(file.size / 1024)} KB).`;
  renderUploadPanel();
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function legacyCreateAssetKey(file) {
  const base = (state.lesson.id || "asset")
    .toLowerCase()
    .replace(/[^a-z0-9가-힣_-]+/gi, "-")
    .replace(/^-+|-+$/g, "") || "asset";
  const stamp = new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);
  const ext = (file.type.split("/")[1] || "image").replace("jpeg", "jpg");
  return `${base}-${stamp}.${ext}`;
}

async function legacyUploadClipboardAsset() {
  const upload = state.upload;
  const endpoint = upload.endpoint.trim();
  const key = upload.key.trim();
  if (!endpoint) return setUploadStatus("Set the Apps Script Web App URL first.");
  if (!upload.file || !upload.dataUrl) return setUploadStatus("Paste or choose an image first.");
  if (!key) return setUploadStatus("Enter a JSON key first.");

  upload.busy = true;
  setUploadStatus("Uploading image...");
  try {
    const imageBase64 = upload.dataUrl.split(",")[1] || "";
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({
        key,
        imageBase64,
        mimeType: upload.file.type || "image/png",
        keywords: upload.keywords.trim(),
        reason: upload.reason.trim(),
      }),
    });
    const text = await response.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error(text || "Upload endpoint returned a non-JSON response.");
    }
    if (!response.ok || !data.ok) throw new Error(data.error || `Upload failed (${response.status}).`);
    const driveUrl = data.driveUrl || data.url;
    if (!driveUrl) throw new Error("Upload response did not include driveUrl.");
    upsertAssetRow({
      key: data.key || key,
      url: driveUrl,
      keywords: splitKeywords(upload.keywords),
      reason: upload.reason.trim(),
    });
    clearExternalAssetCache();
    insertUploadedAssetKey(data.key || key);
    upload.key = "";
    upload.keywords = "";
    upload.reason = "";
    upload.file = null;
    upload.dataUrl = "";
    setUploadStatus("Uploaded and added to the selected field.");
    renderEditor();
    refreshOutputs();
    renderAssetResults();
  } catch (err) {
    setUploadStatus(err.message || "Upload failed.");
  } finally {
    upload.busy = false;
    renderUploadPanel();
  }
}

function upsertAssetRow(row) {
  const nextRow = { kind: "image", keywords: [], reason: "", ...row, assetSource: "media" };
  state.assetMap[row.key] = nextRow;
  const mediaRows = state.assetRows.media;
  const existing = mediaRows.find(asset => asset.key === row.key);
  if (existing) Object.assign(existing, nextRow);
  else mediaRows.unshift(nextRow);
  state.assets = [...state.assetRows.media, ...state.assetRows.exam];
}

function splitKeywords(value) {
  return String(value || "").split(",").map(item => item.trim()).filter(Boolean);
}

function insertUploadedAssetKey(key) {
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

function clearExternalAssetCache() {
  try {
    sessionStorage.removeItem(EXTERNAL_ASSETS_CACHE_KEY);
  } catch { }
}

function legacyClearUploadAsset() {
  state.upload.file = null;
  state.upload.dataUrl = "";
  state.upload.key = "";
  state.upload.keywords = "";
  state.upload.reason = "";
  state.upload.status = "";
}

function setUploadStatus(message) {
  state.upload.status = message;
  renderUploadPanel();
}

function renderUploadPanel() {
  const panel = document.getElementById("asset-upload-panel");
  if (!panel) return;
  if (state.assetSource !== "upload") {
    panel.innerHTML = "";
    return;
  }

  const upload = state.upload;
  const endpointReady = Boolean(ASSET_UPLOAD_ENDPOINT.trim());
  const preview = upload.dataUrl
    ? `<img class="asset-upload__preview-img" src="${escapeAttr(upload.dataUrl)}" alt="">`
    : `<span class="asset-upload__placeholder">이미지를 여기에 붙여넣으세요</span>`;
  const status = upload.status || (
    endpointReady
      ? "이미지를 붙여넣고 JSON KEY를 확인한 뒤 확인을 누르세요."
      : "관리자 설정 필요: author.js의 ASSET_UPLOAD_ENDPOINT에 Apps Script /exec URL을 넣어주세요."
  );
  const uploadedLink = upload.lastUrl ? `
    <div class="asset-upload__link">
      <span class="asset-upload__link-label">Drive link</span>
      <a href="${escapeAttr(upload.lastUrl)}" target="_blank" rel="noopener">${escapeHtml(upload.lastUrl)}</a>
      <div class="asset-upload__link-actions">
        <button class="btn btn--sm" type="button" data-action="copy-upload-url">링크 복사</button>
        <button class="btn btn--sm" type="button" data-action="insert-upload-url">현재 칸에 링크 넣기</button>
      </div>
    </div>
  ` : "";

  panel.innerHTML = `
    <div class="asset-upload" tabindex="0">
      <div class="asset-upload__head">
        <strong>클립보드 새자료</strong>
        <span>${escapeHtml(getAssetTargetLabel())}</span>
      </div>
      <div class="asset-upload__drop">
        ${preview}
      </div>
      <div class="asset-upload__grid">
        <label class="field">
          <span class="field__label">JSON KEY</span>
          <input data-upload-field="key" value="${escapeAttr(upload.key)}" placeholder="asset-key">
        </label>
      </div>
      <div class="asset-upload__actions">
        <button class="btn btn--sm btn--primary" type="button" data-action="upload-asset" ${upload.busy ? "disabled" : ""}>확인</button>
        <button class="btn btn--sm" type="button" data-action="clear-upload-asset">초기화</button>
      </div>
      <div class="asset-upload__status">${escapeHtml(status)}</div>
      ${uploadedLink}
    </div>
  `;
}

async function prepareUploadFile(file) {
  if (!file.type.startsWith("image/")) {
    setUploadStatus("이미지 파일만 업로드할 수 있습니다.");
    return;
  }
  state.upload.file = file;
  try {
    state.upload.dataUrl = await readFileAsDataUrl(file);
    if (!state.upload.key) state.upload.key = createAssetKey(file);
    state.upload.status = `${file.type || "image"} 준비됨 (${Math.round(file.size / 1024)} KB).`;
  } catch (err) {
    state.upload.file = null;
    state.upload.dataUrl = "";
    state.upload.status = err?.message || "이미지를 읽지 못했습니다.";
  }
  renderUploadPanel();
}

function createAssetKey(file) {
  const base = (state.lesson.id || "asset")
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/gi, "-")
    .replace(/^-+|-+$/g, "") || "asset";
  const stamp = new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);
  const ext = (file.type.split("/")[1] || "image").replace("jpeg", "jpg");
  return `${base}-${stamp}.${ext}`;
}

async function uploadClipboardAsset() {
  const endpoint = ASSET_UPLOAD_ENDPOINT.trim();
  const upload = state.upload;
  const key = upload.key.trim();
  if (!endpoint) return setUploadStatus("관리자 설정 필요: ASSET_UPLOAD_ENDPOINT에 Apps Script /exec URL을 넣어주세요.");
  if (!upload.file || !upload.dataUrl) return setUploadStatus("이미지를 먼저 붙여넣으세요.");
  if (!key) return setUploadStatus("JSON KEY를 입력하세요.");

  upload.busy = true;
  setUploadStatus("구글 드라이브에 올리는 중입니다...");
  try {
    const imageBase64 = upload.dataUrl.split(",")[1] || "";
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({
        key,
        imageBase64,
        mimeType: upload.file.type || "image/png",
      }),
    });
    const text = await response.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error(text || "업로드 응답을 읽지 못했습니다.");
    }
    if (!response.ok || !data.ok) throw new Error(data.error || `업로드 실패 (${response.status}).`);
    const driveUrl = data.driveUrl || data.url;
    if (!driveUrl) throw new Error("업로드 응답에 driveUrl이 없습니다.");

    upsertAssetRow({
      key: data.key || key,
      url: driveUrl,
      keywords: [],
      reason: "",
    });
    clearExternalAssetCache();
    const uploadedKey = data.key || key;
    insertUploadedAssetKey(uploadedKey);
    clearUploadAsset();
    state.upload.lastKey = uploadedKey;
    state.upload.lastUrl = driveUrl;
    state.upload.status = "업로드했고 현재 입력칸에 JSON KEY를 넣었습니다. 아래 Drive 링크도 바로 사용할 수 있습니다.";
    renderEditor();
    refreshOutputs();
    renderAssetResults();
  } catch (err) {
    setUploadStatus(err.message || "업로드에 실패했습니다.");
  } finally {
    upload.busy = false;
    renderUploadPanel();
  }
}

function clearUploadAsset() {
  state.upload.file = null;
  state.upload.dataUrl = "";
  state.upload.key = "";
  state.upload.lastKey = "";
  state.upload.lastUrl = "";
  state.upload.status = "";
}

function copyUploadedAssetUrl() {
  const url = state.upload.lastUrl;
  if (!url) return setUploadStatus("복사할 Drive 링크가 없습니다.");
  navigator.clipboard?.writeText(url)
    .then(() => setUploadStatus("Drive 링크를 복사했습니다."))
    .catch(() => setUploadStatus("브라우저가 클립보드 복사를 막았습니다. 링크를 직접 선택해서 복사하세요."));
}

function insertUploadedAssetUrl() {
  const url = state.upload.lastUrl;
  if (!url) return setUploadStatus("넣을 Drive 링크가 없습니다.");
  insertUploadedAssetValue(url);
  state.upload.status = "현재 입력칸에 Drive 링크를 넣었습니다.";
  renderEditor();
  refreshOutputs();
  renderAssetResults();
}

function insertUploadedAssetValue(value) {
  if (!state.assetTarget) return;
  if (state.assetTarget === "__markup__") {
    insertMarkupAssets([value]);
  } else if (state.assetTarget.endsWith(".__commonImages")) {
    appendCommonImages(state.assetTarget.replace(/\.__commonImages$/, ""), [value]);
  } else if (/\.materials$|\.items$/.test(state.assetTarget)) {
    const current = Array.isArray(getPath(state.assetTarget)) ? getPath(state.assetTarget) : [];
    if (!hasMaterialRef(current, value)) current.push(value);
    setPath(state.assetTarget, current);
  } else if (Array.isArray(getPath(state.assetTarget))) {
    const current = getPath(state.assetTarget);
    if (!current.includes(value)) current.push(value);
  } else {
    setPath(state.assetTarget, value);
  }
}

function normalizeSheetText(value) {
  return String(value).replace(/\\n/g, "\n").trim();
}

function renderAssetThumb(row) {
  if (row.kind === "text") return `<span class="asset-result__placeholder">텍스트</span>`;
  const src = getPreviewImageUrl(row.url);
  if (!src) return `<span class="asset-result__placeholder">자료</span>`;
  return `<img src="${escapeAttr(src)}" alt="" loading="lazy" onerror="this.replaceWith(Object.assign(document.createElement('span'), { className: 'asset-result__placeholder', textContent: '자료' }))">`;
}

function getPreviewImageUrl(url) {
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

function extractYoutubeId(url) {
  try {
    const parsed = new URL(url);
    if (parsed.searchParams.has("v")) return parsed.searchParams.get("v");
    if (parsed.hostname === "youtu.be") return parsed.pathname.slice(1);
    const match = parsed.pathname.match(/^\/embed\/([^/?]+)/);
    if (match) return match[1];
  } catch { }
  return "";
}

function toggleAssetSelection(key) {
  if (state.assetSelection.has(key)) state.assetSelection.delete(key);
  else state.assetSelection.add(key);
  renderAssetResults();
}

function handleExamAssetToggle(target) {
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

function applyAssetSelection() {
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

function hasMaterialRef(items, key) {
  return items.some(item => {
    if (item === key) return true;
    return item && typeof item === "object" && item.ref === key;
  });
}

function getDefaultAssetSource(path) {
  return /\.items\.\d+\.image$/.test(path) ? "exam" : "media";
}

function getAssetTargetLabel() {
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

function copyJson() {
  const value = document.getElementById("json-output").value;
  navigator.clipboard?.writeText(value)
    .then(() => toast("JSON을 복사했습니다."))
    .catch(() => {
      document.getElementById("json-output").select();
      document.execCommand("copy");
      toast("JSON을 복사했습니다.");
    });
}

function downloadJson() {
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

function saveLocalDraft() {
  try {
    localStorage.setItem(LOCAL_CACHE_KEY, JSON.stringify({
      ts: Date.now(),
      lesson: state.lesson,
      markupDrafts: state.markupDrafts,
    }));
  } catch (err) {
    console.warn("작업 저장 실패:", err);
  }
}

function loadLocalDraft() {
  try {
    const raw = localStorage.getItem(LOCAL_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const lesson = parsed.lesson || null;
    if (!isValidLessonDraft(lesson)) {
      localStorage.removeItem(LOCAL_CACHE_KEY);
      return null;
    }
    return {
      lesson: normalizeLessonDraft(lesson),
      markupDrafts: Array.isArray(parsed.markupDrafts) ? parsed.markupDrafts : [],
    };
  } catch {
    try {
      localStorage.removeItem(LOCAL_CACHE_KEY);
    } catch { }
    return null;
  }
}

function isValidLessonDraft(lesson) {
  return Boolean(
    lesson &&
    typeof lesson === "object" &&
    Array.isArray(lesson.sections)
  );
}

function normalizeLessonDraft(lesson) {
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

function createBlankLesson() {
  return {
    id: "new-lesson",
    title: "새 수업",
    subtitle: "",
    imageBase: "assets/images/",
    prev: "",
    next: "",
    sections: [createSection(1)],
  };
}

function createSampleLesson() {
  return {
    id: "sample-lesson",
    title: "샘플 수업",
    subtitle: "폼으로 작성한 수업 예시",
    imageBase: "assets/images/",
    prev: "",
    next: "",
    sections: [
      {
        id: "1-1",
        title: "첫 번째 섹션",
        blocks: [
          { type: "단락", text: "본문은 이곳에 입력합니다. **굵게**와 줄바꿈을 사용할 수 있습니다." },
          { type: "발문", prompts: [{ q: "학생들에게 던질 질문을 적어보세요.", note: "", answer: "" }] },
          { type: "댓글" },
          { type: "개념", title: "핵심 개념", body: "개념 설명을 적습니다.\n- 중요한 항목 1\n- 중요한 항목 2" },
        ],
      },
    ],
  };
}

function createSection(number) {
  return {
    id: `section-${number}`,
    title: "새 섹션",
    blocks: [createBlock("단락")],
  };
}

function createBlock(type) {
  switch (type) {
    case "단락":
    case "소제목":
      return { type, text: "" };
    case "사례":
      return { type, title: "사례", body: "", footer: "", answer: "", materials: [] };
    case "발문":
      return { type, prompts: [{ q: "", note: "", answer: "", materials: [] }] };
    case "댓글":
      return { type };
    case "개념":
      return { type, title: "", body: "", materials: [] };
    case "이미지곁글":
      return { type, kind: "concept", image: "", caption: "", title: "", body: "", note: "" };
    case "미디어":
      return { type, layout: "stack", items: [] };
    case "기출문제":
      return { type, items: [] };
    default:
      return { type: "단락", text: "" };
  }
}

function createArrayItem(kind) {
  if (kind === "prompt") return { q: "", note: "", answer: "" };
  if (kind === "quiz") return { image: "", answer: "" };
  if (kind === "childBlock") return createBlock("단락");
  if (kind === "materialRef") return "";
  if (kind === "materialText") return { kind: "text", title: "", body: "", source: "" };
  return "";
}

function getPath(path) {
  const parts = normalizePath(path);
  let current = windowProxyRoot();
  for (const part of parts) {
    if (current == null) return undefined;
    current = current[part];
  }
  return current;
}

function setPath(path, value) {
  const parts = normalizePath(path);
  let current = windowProxyRoot();
  parts.slice(0, -1).forEach(part => {
    if (current[part] == null) current[part] = {};
    current = current[part];
  });
  current[parts.at(-1)] = value;
}

function normalizePath(path) {
  return path.replace(/^lesson\./, "").split(".").map(part => /^\d+$/.test(part) ? Number(part) : part);
}

function windowProxyRoot() {
  return state.lesson;
}

function moveItem(list, index, dir) {
  const next = index + dir;
  if (!Array.isArray(list) || next < 0 || next >= list.length) return;
  const [item] = list.splice(index, 1);
  list.splice(next, 0, item);
}

function addMaterialCaption(path, index) {
  const list = getPath(path);
  if (!Array.isArray(list)) return;
  const item = list[index];
  if (!item || typeof item !== "string") return;
  list[index] = { ref: item, caption: "" };
  state.focusPath = `${path}.${index}.caption`;
}

function removeMaterialCaption(path, index) {
  const list = getPath(path);
  if (!Array.isArray(list)) return;
  const item = list[index];
  if (!item || typeof item !== "object" || item.kind === "text") return;
  list[index] = item.ref || "";
}

function addQuoteMaterial(path) {
  let list = getPath(path);
  if (!Array.isArray(list)) {
    list = [];
    setPath(path, list);
  }
  list.push({ kind: "text", title: "", body: "", source: "" });
  state.focusPath = `${path}.${list.length - 1}.body`;
}

function startBlockSort(event, handle) {
  if (event.button != null && event.button !== 0) return;
  const card = handle.closest(".block-card[data-block]");
  const blockList = card?.parentElement;
  if (!card || !blockList?.matches(".section-card__blocks[data-section]")) return;

  event.preventDefault();
  event.stopPropagation();

  cancelBlockSort();
  const marker = document.createElement("div");
  marker.className = "block-drop-marker";

  state.blockSort = {
    pointerId: event.pointerId,
    handle,
    blockList,
    source: card,
    sectionIdx: Number(card.dataset.section),
    fromIdx: Number(card.dataset.block),
    insertIdx: Number(card.dataset.block),
    marker,
  };

  card.classList.add("is-sort-source");
  blockList.classList.add("is-sorting");
  document.body.classList.add("is-sorting-block");
  handle.setPointerCapture?.(event.pointerId);
  updateBlockSort(event);
}

function updateBlockSort(event) {
  const sort = state.blockSort;
  if (!sort || event.pointerId !== sort.pointerId) return;
  event.preventDefault();
  sort.insertIdx = getPointerBlockInsertIndex(event.clientY, sort.blockList, sort.fromIdx);
  placeBlockSortMarker(sort.blockList, sort.marker, sort.insertIdx);
}

function finishBlockSort(event) {
  const sort = state.blockSort;
  if (!sort || event.pointerId !== sort.pointerId) return;
  event.preventDefault();
  const { sectionIdx, fromIdx, insertIdx, handle } = sort;
  cleanupBlockSort();
  handle.releasePointerCapture?.(event.pointerId);
  if (moveBlockTo(sectionIdx, fromIdx, insertIdx)) {
    renderEditor();
    refreshOutputs();
  }
}

function cancelBlockSort(event) {
  const sort = state.blockSort;
  if (!sort) return;
  if (event?.pointerId != null && event.pointerId !== sort.pointerId) return;
  cleanupBlockSort();
}

function cleanupBlockSort() {
  const sort = state.blockSort;
  if (!sort) return;
  sort.source.classList.remove("is-sort-source");
  sort.blockList.classList.remove("is-sorting");
  sort.marker.remove();
  document.body.classList.remove("is-sorting-block");
  state.blockSort = null;
}

function getSortableBlockCards(blockList) {
  return [...blockList.children].filter(el => el.matches?.(".block-card[data-block]"));
}

function getPointerBlockInsertIndex(clientY, blockList, fromIdx) {
  const cards = getSortableBlockCards(blockList).filter(card => Number(card.dataset.block) !== fromIdx);
  for (const card of cards) {
    const rect = card.getBoundingClientRect();
    if (clientY < rect.top + rect.height / 2) return Number(card.dataset.block);
  }
  return getSortableBlockCards(blockList).length;
}

function placeBlockSortMarker(blockList, marker, insertIdx) {
  const cards = getSortableBlockCards(blockList).filter(card => !card.classList.contains("is-sort-source"));
  const beforeCard = cards.find(card => Number(card.dataset.block) >= insertIdx);
  blockList.insertBefore(marker, beforeCard || null);
}

function moveBlockTo(sectionIdx, fromIdx, insertIdx) {
  const blocks = state.lesson.sections[sectionIdx]?.blocks;
  if (!Array.isArray(blocks) || fromIdx < 0 || fromIdx >= blocks.length) return false;
  insertIdx = Math.max(0, Math.min(insertIdx, blocks.length));
  if (fromIdx < insertIdx) insertIdx -= 1;
  if (fromIdx === insertIdx) return false;
  const [item] = blocks.splice(fromIdx, 1);
  blocks.splice(insertIdx, 0, item);
  return true;
}

function getDetailState(item, prefix) {
  const id = getUiId(item, prefix);
  if (!state.openDetails.has(id)) state.openDetails.set(id, true);
  return { id, open: state.openDetails.get(id) };
}

function getUiId(item, prefix) {
  if (!item || typeof item !== "object") return `${prefix}-unknown`;
  if (!uiIds.has(item)) uiIds.set(item, `${prefix}-${nextUiId++}`);
  return uiIds.get(item);
}

function uniqueSectionId(base) {
  const ids = new Set(state.lesson.sections.map(section => section.id));
  let i = 2;
  let next = `${base}-${i}`;
  while (ids.has(next)) {
    i += 1;
    next = `${base}-${i}`;
  }
  return next;
}

function numberOrNull(value) {
  return value == null ? null : Number(value);
}

function escapeAttr(value) {
  return escapeHtml(String(value ?? ""));
}

function toast(message) {
  document.querySelector(".toast")?.remove();
  const el = document.createElement("div");
  el.className = "toast";
  el.textContent = message;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2200);
}
