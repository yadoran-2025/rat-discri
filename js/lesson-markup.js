const BLOCK_OPENERS = new Map([
  ["[사례", "사례"],
  ["[개념", "개념"],
  ["[발문", "발문"],
  ["[문제", "기출문제"],
]);

const ANSWER_TAG = "답";
const COMMENT_TAG = "댓";

export function parseLessonMarkup(source) {
  const lines = String(source ?? "").replace(/\r\n?/g, "\n").split("\n");
  const blocks = [];
  const errors = [];
  const warnings = [];
  let i = 0;

  const pushTextChunk = chunk => {
    const text = chunk.join("\n").trim();
    if (!text) return;
    blocks.push({ type: "단락", text });
  };

  while (i < lines.length) {
    const trimmed = lines[i].trim();

    if (!trimmed) {
      i += 1;
      continue;
    }

    if (BLOCK_OPENERS.has(trimmed)) {
      const result = collectBlock(lines, i, errors, warnings);
      if (result.block) blocks.push(result.block);
      i = result.nextIndex;
      continue;
    }

    if (trimmed === `<${COMMENT_TAG}>`) {
      blocks.push({ type: "댓글" });
      i += 1;
      continue;
    }

    if (trimmed === "---") {
      blocks.push({ type: "구분선" });
      i += 1;
      continue;
    }

    const objectSeq = parseObjectSequence(trimmed);
    if (objectSeq) {
      blocks.push(sequenceToBlock(objectSeq));
      i += 1;
      continue;
    }

    if (isMalformedTextBoxLine(trimmed)) {
      errors.push({
        line: i + 1,
        message: "텍스트 박스 문법은 한 줄 전체를 {{내용}} 형태로 감싸야 합니다.",
      });
      i += 1;
      continue;
    }

    const heading = parseHeading(trimmed);
    if (heading) {
      blocks.push(heading);
      i += 1;
      continue;
    }

    const chunk = [];
    while (i < lines.length) {
      const nextTrimmed = lines[i].trim();
      if (!nextTrimmed) {
        chunk.push(lines[i]);
        i += 1;
        continue;
      }
      if (
        BLOCK_OPENERS.has(nextTrimmed) ||
        nextTrimmed === `<${COMMENT_TAG}>` ||
        nextTrimmed === "---" ||
        parseObjectSequence(nextTrimmed) ||
        isMalformedTextBoxLine(nextTrimmed) ||
        parseHeading(nextTrimmed)
      ) {
        break;
      }
      chunk.push(lines[i]);
      i += 1;
    }
    pushTextChunk(chunk);
  }

  return { blocks, errors, warnings };
}

export function stringifyLessonMarkup(blocks = []) {
  return blocks.map(blockToMarkup).filter(Boolean).join("\n\n");
}

function blockToMarkup(block) {
  if (!block || typeof block !== "object") return "";
  if (block.type === "소제목") return `## ${block.text || ""}`.trimEnd();
  if (block.type === "절") return `### ${block.text || ""}`.trimEnd();
  if (block.type === "구분선") return "---";
  if (block.type === "댓글") return `<${COMMENT_TAG}>`;
  if (block.type === "단락") return block.text || "";
  if (block.type === "텍스트박스") return textBoxLine(block.body || block.text || "");
  if (block.type === "미디어") return materialLine(block.items || block.materials || block.item, block.layout);
  if (block.type === "그룹") return objectSequenceLine(block.items || [], block.layout);
  if (block.type === "기출문제") {
    return (block.items || []).map(item => objectMarkup("문제", [
      item.image || "",
      answerTag(item.answer),
    ])).join("\n\n");
  }
  if (block.type === "사례") return objectMarkup("사례", objectContentMarkup(block));
  if (block.type === "개념") return objectMarkup("개념", objectContentMarkup(block));
  if (block.type === "발문") {
    return (block.prompts || []).map(prompt => objectMarkup("발문", objectContentMarkup({
      ...prompt,
      body: prompt.q,
      answer: prompt.answer,
    }))).join("\n\n");
  }
  return "";
}

function objectContentMarkup(block) {
  if (Array.isArray(block.flow) && block.flow.length) {
    return flowToMarkup(block.flow);
  }
  return [
    block.body || block.text || "",
    materialLine(block.materials, block.materialsLayout),
    answerTag(block.answer),
    block.comments ? `<${COMMENT_TAG}>` : "",
  ].filter(Boolean).join("\n");
}

function flowToMarkup(flow = []) {
  return asArray(flow).map(item => {
    if (!item || typeof item !== "object") return "";
    if (item.type === "text") return item.text || "";
    if (item.type === "divider") return "---";
    if (item.type === "materials") return materialLine(item.items, item.layout);
    if (item.type === "textBox") return textBoxLine(item.body || item.text || "");
    if (item.type === "group") return objectSequenceLine(item.items || [], item.layout || "row");
    if (item.type === "answer") return answerTag(item.answer);
    if (item.type === "comment") return `<${COMMENT_TAG}>`;
    return "";
  }).filter(Boolean).join("\n");
}

function objectMarkup(label, body) {
  const parts = Array.isArray(body) ? body : [body];
  return [`[${label}`, ...parts.filter(Boolean), "]"].join("\n");
}

function answerTag(answer) {
  const text = answerToText(answer);
  return text ? `<${ANSWER_TAG}>\n${text}\n</${ANSWER_TAG}>` : "";
}

function answerToText(answer) {
  if (Array.isArray(answer)) return answer.join("\n");
  return String(answer || "").trim();
}

function collectBlock(lines, startIndex, errors, warnings) {
  const opener = lines[startIndex].trim();
  const type = BLOCK_OPENERS.get(opener);
  const body = [];
  let i = startIndex + 1;

  for (; i < lines.length; i += 1) {
    const trimmed = lines[i].trim();
    if (trimmed === "]") {
      return {
        block: buildBlock(type, body, errors),
        nextIndex: i + 1,
      };
    }
    if (BLOCK_OPENERS.has(trimmed)) {
      errors.push({
        line: i + 1,
        message: "블록 안에는 다른 블록을 넣을 수 없습니다.",
      });
    }
    body.push(lines[i]);
  }

  warnings.push({
    line: startIndex + 1,
    message: `${type} 블록이 닫히지 않아 파일 끝에서 임시로 닫았습니다.`,
  });
  return {
    block: buildBlock(type, body, errors),
    nextIndex: lines.length,
  };
}

function buildBlock(type, lines, errors = []) {
  if (type === "발문") {
    const parsed = parseObjectContent(lines, errors);
    const legacy = deriveLegacyFromFlow(parsed.flow);
    const prompt = { q: legacy.text };
    if (legacy.answer) prompt.answer = legacy.answer;
    if (legacy.materials.length) prompt.materials = legacy.materials;
    if (legacy.materialsLayout) prompt.materialsLayout = legacy.materialsLayout;
    if (parsed.flow.length) prompt.flow = parsed.flow;
    return { type, prompts: [prompt] };
  }

  if (type === "기출문제") return buildProblemBlock(lines);

  const parsed = parseObjectContent(lines, errors);
  const legacy = deriveLegacyFromFlow(parsed.flow);
  const block = { type, body: legacy.text };
  if (legacy.answer) block.answer = legacy.answer;
  if (legacy.materials.length) block.materials = legacy.materials;
  if (legacy.materialsLayout) block.materialsLayout = legacy.materialsLayout;
  if (parsed.flow.length) block.flow = parsed.flow;
  return block;
}

function buildProblemBlock(lines) {
  const { text, matches } = extractTaggedText(lines.join("\n"), ANSWER_TAG);
  const image = text.split("\n").map(line => line.trim()).filter(Boolean)[0] || "";
  const answer = normalizeAnswer(matches.join("\n").trim());
  const item = { image };
  if (answer) item.answer = answer;
  return { type: "기출문제", items: [item] };
}

function parseObjectContent(lines, errors = []) {
  let kept = [];
  const flow = [];

  const flushText = () => {
    const text = kept.join("\n").trim();
    kept = [];
    if (!text) return;
    flow.push({ type: "text", text });
  };

  for (let i = 0; i < lines.length; i += 1) {
    const trimmed = lines[i].trim();

    if (!trimmed) {
      flushText();
      continue;
    }

    if (BLOCK_OPENERS.has(trimmed)) {
      errors.push({
        line: null,
        message: "블록 안에는 다른 블록을 넣을 수 없습니다.",
      });
      continue;
    }

    if (trimmed === "---") {
      flushText();
      flow.push({ type: "divider" });
      continue;
    }

    const objectSeq = parseObjectSequence(trimmed);
    if (objectSeq) {
      flushText();
      flow.push(sequenceToFlowItem(objectSeq));
      continue;
    }

    if (isMalformedTextBoxLine(trimmed)) {
      errors.push({
        line: null,
        message: "텍스트 박스 문법은 한 줄 전체를 {{내용}} 형태로 감싸야 합니다.",
      });
      continue;
    }

    if (trimmed === `<${ANSWER_TAG}>`) {
      flushText();
      const result = collectTaggedBlock(lines, i, ANSWER_TAG, []);
      const answer = normalizeAnswer(result.body.trim());
      if (answer) flow.push({ type: "answer", answer });
      i = result.nextIndex - 1;
      continue;
    }

    if (trimmed === `<${COMMENT_TAG}>`) {
      flushText();
      flow.push({ type: "comment" });
      continue;
    }

    kept.push(lines[i]);
  }

  flushText();
  const legacy = deriveLegacyFromFlow(flow);
  return {
    ...legacy,
    flow,
  };
}

function collectTaggedBlock(lines, startIndex, tag, warnings) {
  const close = `</${tag}>`;
  const body = [];
  let i = startIndex + 1;
  for (; i < lines.length; i += 1) {
    if (lines[i].trim() === close) {
      return { body: body.join("\n"), nextIndex: i + 1 };
    }
    body.push(lines[i]);
  }
  warnings.push({
    line: startIndex + 1,
    message: `<${tag}> 작은블록이 닫히지 않아 파일 끝에서 임시로 닫았습니다.`,
  });
  return { body: body.join("\n"), nextIndex: lines.length };
}

function deriveLegacyFromFlow(flow = []) {
  const textParts = [];
  const materials = [];
  let materialsLayout = "";
  const answers = [];

  asArray(flow).forEach(item => {
    if (!item || typeof item !== "object") return;
    if (item.type === "text") {
      if (item.text) textParts.push(item.text);
      return;
    }
    if (item.type === "materials") {
      const itemMaterials = asArray(item.items).filter(isMaterialAtom);
      if (itemMaterials.length) materials.push(...itemMaterials);
      if (item.layout === "row" && itemMaterials.length === asArray(item.items).length) materialsLayout = "row";
      return;
    }
    if (item.type === "answer") {
      const text = answerToText(item.answer);
      if (text) answers.push(text);
    }
  });

  return {
    text: textParts.join("\n\n").trim(),
    materials,
    materialsLayout,
    answer: normalizeAnswer(answers.join("\n").trim()),
  };
}

function parseHeading(trimmed) {
  const chapter = trimmed.match(/^##(?!#)\s+(.+)$/);
  if (chapter) return { type: "소제목", text: chapter[1].trim() };
  const section = trimmed.match(/^###(?!#)\s+(.+)$/);
  if (section) return { type: "절", text: section[1].trim() };
  return null;
}

function parseObjectSequence(line) {
  const parts = splitObjectSequence(line);
  if (!parts.length) return null;
  const items = [];
  for (const part of parts) {
    const parsed = parseObjectAtom(part.trim());
    if (!parsed) return null;
    items.push(parsed);
  }
  if (!items.length) return null;
  return {
    items,
    layout: items.length > 1 ? "row" : "stack",
  };
}

function splitObjectSequence(line) {
  const parts = [];
  let current = "";
  let atom = "";

  for (let i = 0; i < line.length; i += 1) {
    if (!atom && line.startsWith("[[", i)) {
      atom = "material";
      current += "[[";
      i += 1;
      continue;
    }
    if (!atom && line.startsWith("{{", i)) {
      atom = "textBox";
      current += "{{";
      i += 1;
      continue;
    }
    if (atom === "material" && line.startsWith("]]", i)) {
      atom = "";
      current += "]]";
      i += 1;
      continue;
    }
    if (atom === "textBox" && line.startsWith("}}", i)) {
      atom = "";
      current += "}}";
      i += 1;
      continue;
    }
    if (!atom && /\s/.test(line[i]) && line[i + 1] === "~" && /\s/.test(line[i + 2] || "")) {
      parts.push(current.trim());
      current = "";
      i += 2;
      continue;
    }
    current += line[i];
  }

  if (atom) return [line];
  if (current.trim()) parts.push(current.trim());
  return parts;
}

function parseObjectAtom(part) {
  const material = part.match(/^\[\[([^\]]+)\]\]$/);
  if (material) return parseMaterialAtom(material[1]);
  const textBox = part.match(/^\{\{(.+)\}\}$/);
  if (textBox) return { type: "텍스트박스", body: unescapeAtomText(textBox[1].trim()) };
  return null;
}

function parseMaterialAtom(value) {
  const raw = String(value || "").trim();
  const separatorIndex = raw.indexOf("==");
  if (separatorIndex < 0) return unescapeAtomText(raw);

  const ref = raw.slice(0, separatorIndex).trim();
  const caption = raw.slice(separatorIndex + 2).trim();
  if (!ref || !caption) return unescapeAtomText(raw);
  return { ref: unescapeAtomText(ref), caption: unescapeAtomText(caption) };
}

function sequenceToBlock(sequence) {
  if (sequence.items.length === 1) {
    const item = sequence.items[0];
    if (isMaterialAtom(item)) return { type: "미디어", layout: "stack", items: [item] };
    return item;
  }
  if (sequence.items.every(isMaterialAtom)) {
    return {
      type: "미디어",
      layout: sequence.layout,
      items: sequence.items,
    };
  }
  return {
    type: "그룹",
    layout: sequence.layout,
    items: sequence.items,
  };
}

function sequenceToFlowItem(sequence) {
  if (sequence.items.length === 1) {
    const item = sequence.items[0];
    if (isMaterialAtom(item)) return { type: "materials", items: [item], layout: "stack" };
    if (item.type === "텍스트박스") return { type: "textBox", body: item.body };
  }
  if (sequence.items.every(isMaterialAtom)) {
    return {
      type: "materials",
      items: sequence.items,
      layout: sequence.layout,
    };
  }
  return {
    type: "group",
    layout: sequence.layout,
    items: sequence.items,
  };
}

function isMaterialAtom(item) {
  return typeof item === "string" || Boolean(item?.ref);
}

function isMalformedTextBoxLine(line) {
  const trimmed = String(line || "").trim();
  return trimmed.startsWith("{{") && !parseObjectSequence(trimmed);
}

function textBoxLine(text) {
  return `{{${escapeAtomText(text)}}}`;
}

function objectSequenceLine(items, layout = "stack") {
  const values = asArray(items).map(objectAtomToMarkup).filter(Boolean);
  if (!values.length) return "";
  return values.join(layout === "row" ? " ~ " : "\n");
}

function objectAtomToMarkup(item) {
  if (!item) return "";
  if (typeof item === "string") return `[[${escapeAtomText(item)}]]`;
  if (item.type === "텍스트박스" || item.type === "textBox") return textBoxLine(item.body || item.text || "");
  if (item.ref) return materialAtomToMarkup(item);
  return "";
}

function materialAtomToMarkup(item) {
  const caption = String(item.caption || "").trim();
  const ref = escapeAtomText(item.ref || "");
  return `[[${ref}${caption ? `==${escapeAtomText(caption)}` : ""}]]`;
}

function escapeAtomText(value) {
  return String(value ?? "").replace(/\n/g, ";;");
}

function unescapeAtomText(value) {
  return String(value ?? "").replace(/;;/g, "\n").replace(/\\n/g, "\n");
}

function extractTaggedText(text, tag) {
  const matches = [];
  const pattern = new RegExp(`<${escapeRegExp(tag)}>\\n?([\\s\\S]*?)\\n?</${escapeRegExp(tag)}>`, "g");
  const clean = String(text || "").replace(pattern, (_, value) => {
    const trimmed = value.trim();
    if (trimmed) matches.push(trimmed);
    return "";
  }).trim();
  return { text: clean, matches };
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeAnswer(value) {
  const lines = String(value || "").split("\n").map(line => line.trim()).filter(Boolean);
  if (lines.length <= 1) return lines[0] || "";
  return lines;
}

function materialLine(items, layout = "stack") {
  const values = asArray(items).map(item => {
    if (!item) return "";
    if (typeof item === "string") return `[[${escapeAtomText(item)}]]`;
    if (item.ref) return materialAtomToMarkup(item);
    return "";
  }).filter(Boolean);
  if (!values.length) return "";
  return values.join(layout === "row" ? " ~ " : "\n");
}

function asArray(value) {
  return Array.isArray(value) ? value : value == null ? [] : [value];
}
