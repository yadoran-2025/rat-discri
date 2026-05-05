import { createBlankLesson } from "./factory.js";

export const root = document.getElementById("author-root");
export const uiIds = new WeakMap();
let nextUiId = 1;

export const state = {
  lesson: createBlankLesson(),
  markupDrafts: [],
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
  assetKindFilter: "all",
  assetSort: "latest",
  assetSelection: new Set(),
  examSubject: "경제",
  examGroupOpen: new Set(),
  examSubgroupOpen: new Set(),
  upload: {
    file: null,
    dataUrl: "",
    text: "",
    key: "",
    description: "",
    keyError: "",
    lastKey: "",
    lastUrl: "",
    status: "",
    busy: false,
  },
  blockSort: null,
  openDetails: new Map(),
  focusPath: "",
};

export function applySavedDraft(savedDraft) {
  state.lesson = savedDraft?.lesson || createBlankLesson();
  state.markupDrafts = savedDraft?.markupDrafts || [];
}

export function getNextUiId(prefix) {
  return `${prefix}-${nextUiId++}`;
}
