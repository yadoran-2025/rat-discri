import { applySavedDraft } from "./state.js";
import { loadLocalDraft, refreshOutputs, renderSavedSlotMenu } from "./output.js";
import { renderShell } from "./shell.js";
import { bindRootEvents } from "./events.js";
import { renderEditor } from "./editor.js";
import { loadAssetIndex } from "./assets.js";

const savedDraft = loadLocalDraft();
applySavedDraft(savedDraft);

renderShell();
bindRootEvents();
renderEditor();
refreshOutputs();
renderSavedSlotMenu();
loadAssetIndex();
