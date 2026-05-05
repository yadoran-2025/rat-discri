import { state, root } from "./state.js";
import { MARKUP_GUIDE_TEXT } from "./constants.js";
import { stringifyLessonMarkup } from "../lesson-markup.js";
import { removeCommonImage, renderEditor, writeField } from "./editor.js";
import { getSectionMarkup, insertMarkupAssets, insertMarkupText, writeMarkupSource } from "./markup-editor.js";
import { applyAssetSelection, closeAssetSearch, getDefaultAssetSource, handleExamAssetToggle, openAssetSearch, renderAssetResults, toggleAssetSelection, toggleExamOpenState } from "./assets.js";
import { clearUploadAsset, copyUploadedAssetUrl, getClipboardImage, getClipboardText, insertUploadedAssetUrl, prepareUploadFile, renderUploadPanel, setUploadStatus, uploadClipboardAsset, writeUploadField } from "./upload.js";
import { copyJson, downloadJson, loadLocalDraft, refreshOutputs, renderSavedSlotMenu, saveLocalDraft } from "./output.js";
import { createArrayItem, createBlankLesson, createBlock, createSection } from "./factory.js";
import { addMaterialCaption, addQuoteMaterial, getPath, moveItem, removeMaterialCaption, setPath } from "./paths.js";
import { cancelBlockSort, finishBlockSort, startBlockSort, updateBlockSort } from "./sort.js";
import { numberOrNull, resizeTextarea, toast, uniqueSectionId } from "./dom.js";
export function bindRootEvents() {
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
    if (event.target.matches?.("[data-upload-field]")) return;
    const file = getClipboardImage(event.clipboardData);
    event.preventDefault();
    if (file) {
      prepareUploadFile(file);
      return;
    }
    const text = getClipboardText(event.clipboardData);
    if (!text) return setUploadStatus("붙여넣을 이미지나 텍스트가 없습니다.");
    state.upload.file = null;
    state.upload.dataUrl = "";
    state.upload.text = text;
    state.upload.status = "텍스트 자료가 준비되었습니다.";
    renderUploadPanel();
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
    if (target.matches("[data-action='toggle-exam-asset']")) {
      handleExamAssetToggle(target);
      return;
    }
    if (target.matches("[data-action='sort-assets']")) {
      state.assetSort = target.value === "oldest" ? "oldest" : "latest";
      renderAssetResults();
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
      const slotSelect = document.getElementById("save-slot-select");
      const slotId = slotSelect?.value || "";
      saveLocalDraft(slotId);
      toast("현재 작업을 선택한 저장칸에 저장했습니다.");
    } else if (action === "load-local-slot") {
      const draft = loadLocalDraft(button.dataset.slot || "");
      if (!draft) return toast("해당 저장칸에 저장된 작업이 없습니다.");
      state.lesson = draft.lesson;
      state.markupDrafts = draft.markupDrafts || [];
      state.markupGeneratedFromJson = [];
      state.currentSection = 0;
      renderEditor();
      refreshOutputs();
      renderSavedSlotMenu();
      button.closest("details")?.removeAttribute("open");
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
    } else if (action === "insert-markup-upload") {
      state.assetTarget = "__markup__";
      openAssetSearch("single", "upload");
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
      if (state.assetSource !== "media") state.assetKindFilter = "all";
      if (state.assetSource === "exam") state.examSubject = state.examSubject || "경제";
      const queryInput = document.getElementById("asset-query");
      if (queryInput) queryInput.value = "";
      renderAssetResults();
    } else if (action === "choose-asset-kind") {
      state.assetKindFilter = button.dataset.kind || "all";
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
