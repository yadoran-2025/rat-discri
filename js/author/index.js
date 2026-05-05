import { applySavedDraft } from "./state.js";
import { loadLocalDraft, refreshOutputs, renderSavedSlotMenu } from "./output.js";
import { renderShell } from "./shell.js";
import { bindRootEvents } from "./events.js";
import { renderEditor } from "./editor.js";
import { loadAssetIndex } from "./assets.js";
import { bindInlineBlankToggles } from "../ui/layout.js";

const savedDraft = loadLocalDraft();
applySavedDraft(savedDraft);

renderShell();
bindRootEvents();
bindInlineBlankToggles(document.getElementById("main-content"));
renderEditor();
refreshOutputs();
renderSavedSlotMenu();
loadAssetIndex();
