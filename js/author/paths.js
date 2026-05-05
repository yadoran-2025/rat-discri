import { state } from "./state.js";
export function getPath(path) {
  const parts = normalizePath(path);
  let current = windowProxyRoot();
  for (const part of parts) {
    if (current == null) return undefined;
    current = current[part];
  }
  return current;
}

export function setPath(path, value) {
  const parts = normalizePath(path);
  let current = windowProxyRoot();
  parts.slice(0, -1).forEach(part => {
    if (current[part] == null) current[part] = {};
    current = current[part];
  });
  current[parts.at(-1)] = value;
}

export function deletePath(path) {
  const parts = normalizePath(path);
  let current = windowProxyRoot();
  for (const part of parts.slice(0, -1)) {
    if (current == null) return;
    current = current[part];
  }
  if (current && Object.prototype.hasOwnProperty.call(current, parts.at(-1))) {
    delete current[parts.at(-1)];
  }
}

export function normalizePath(path) {
  return path.replace(/^lesson\./, "").split(".").map(part => /^\d+$/.test(part) ? Number(part) : part);
}

export function windowProxyRoot() {
  return state.lesson;
}

export function moveItem(list, index, dir) {
  const next = index + dir;
  if (!Array.isArray(list) || next < 0 || next >= list.length) return;
  const [item] = list.splice(index, 1);
  list.splice(next, 0, item);
}

export function addMaterialCaption(path, index) {
  const list = getPath(path);
  if (!Array.isArray(list)) return;
  const item = list[index];
  if (!item || typeof item !== "string") return;
  list[index] = { ref: item, caption: "" };
  state.focusPath = `${path}.${index}.caption`;
}

export function removeMaterialCaption(path, index) {
  const list = getPath(path);
  if (!Array.isArray(list)) return;
  const item = list[index];
  if (!item || typeof item !== "object" || item.kind === "text") return;
  list[index] = item.ref || "";
}

export function addQuoteMaterial(path) {
  let list = getPath(path);
  if (!Array.isArray(list)) {
    list = [];
    setPath(path, list);
  }
  list.push({ kind: "text", title: "", body: "", source: "" });
  state.focusPath = `${path}.${list.length - 1}.body`;
}
