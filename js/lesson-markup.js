const OBJECT_BLOCKS = new Map([
  ["[사례", "사례"],
  ["[개념", "개념"],
  ["[발문", "발문"],
]);

const FENCE_BLOCKS = new Map([
  [">>", "토글"],
  ["```", "텍스트박스"],
]);

export function parseLessonMarkup(source) {
  const lines = String(source ?? "").replace(/\r\n?/g, "\n").split("\n");
  const blocks = [];
  const errors = [];
  const warnings = [];
  let i = 0;

  const pushTextChunk = chunk => {
    const text = chunk.join("\n").trim();
    if (!text) return;
    const { text: cleanText, asides } = extractAsides(text);
    const block = { type: "단락", text: cleanText };
    if (asides.length) block.asides = asides;
    blocks.push(block);
  };

  while (i < lines.length) {
    const raw = lines[i];
    const trimmed = raw.trim();

    if (!trimmed) {
      i += 1;
      continue;
    }

    if (OBJECT_BLOCKS.has(trimmed)) {
      const result = collectObjectBlock(lines, i, errors, warnings);
      if (result.block) blocks.push(result.block);
      i = result.nextIndex;
      continue;
    }

    if (FENCE_BLOCKS.has(trimmed)) {
      const result = collectFenceBlock(lines, i, warnings);
      blocks.push(result.block);
      i = result.nextIndex;
      continue;
    }

    if (trimmed === "<p>") {
      const result = collectTaggedBlock(lines, i, "p", warnings);
      blocks.push(buildExamBlock(result.body));
      i = result.nextIndex;
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

    if (isMalformedQuoteLine(trimmed)) {
      errors.push({
        line: i + 1,
        message: "인용 문법은 한 줄 전체를 {{내용}} 형태로 닫아야 합니다.",
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
        OBJECT_BLOCKS.has(nextTrimmed) ||
        FENCE_BLOCKS.has(nextTrimmed) ||
        nextTrimmed === "<p>" ||
        nextTrimmed === "---" ||
        parseObjectSequence(nextTrimmed) ||
        isMalformedQuoteLine(nextTrimmed) ||
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
  if (block.type === "단락") return withAsides(block.text || "", block.asides);
  if (block.type === "인용") return quoteLine(block.body || block.text || "");
  if (block.type === "토글") return fenceMarkup(">>", block.body || block.text || block.answer || "");
  if (block.type === "텍스트박스") return fenceMarkup("```", withAsides(block.body || block.text || "", block.asides));
  if (block.type === "미디어") return materialLine(block.items || block.materials || block.item, block.layout);
  if (block.type === "그룹") return objectSequenceLine(block.items || [], block.layout);
  if (block.type === "기출문제") {
    return (block.items || []).map(item => {
      const answer = answerToText(item.answer);
      return ["<p>", item.image || "", answer, "</p>"].filter(line => line !== "").join("\n");
    }).join("\n\n");
  }
  if (block.type === "사례") {
    return objectMarkup("사례", [
      withAsides(block.body || block.text || "", block.asides),
      materialLine(block.materials, block.materialsLayout),
      answerTag(block.answer),
      block.comments ? "<c>\n</c>" : "",
    ]);
  }
  if (block.type === "개념") {
    return objectMarkup("개념", [
      block.title ? `## ${block.title}` : "",
      withAsides(block.body || block.text || "", block.asides),
      materialLine(block.materials, block.materialsLayout),
      answerTag(block.answer),
      block.comments ? "<c>\n</c>" : "",
    ]);
  }
  if (block.type === "발문") {
    return (block.prompts || []).map(prompt => objectMarkup("발문", [
      withAsides(prompt.q || "", prompt.asides || (prompt.note ? [prompt.note] : [])),
      materialLine(prompt.materials, prompt.materialsLayout),
      answerTag(prompt.answer),
      block.comments ? "<c>\n</c>" : "",
    ])).join("\n\n");
  }
  return "";
}

function objectMarkup(label, parts) {
  return [`[${label}`, ...parts.filter(Boolean), "]"].join("\n");
}

function fenceMarkup(fence, body) {
  return [fence, body || "", fence].join("\n");
}

function withAsides(text, asides = []) {
  const body = String(text || "").trim();
  const asideText = asArray(asides).map(aside => `%${aside}%`).join("\n");
  return [body, asideText].filter(Boolean).join("\n");
}

function answerTag(answer) {
  const text = answerToText(answer);
  return text ? `<a>\n${text}\n</a>` : "";
}

function answerToText(answer) {
  if (Array.isArray(answer)) return answer.join("\n");
  return String(answer || "").trim();
}

function collectObjectBlock(lines, startIndex, errors, warnings) {
  const opener = lines[startIndex].trim();
  const type = OBJECT_BLOCKS.get(opener);
  const body = [];
  let i = startIndex + 1;

  for (; i < lines.length; i += 1) {
    const trimmed = lines[i].trim();
    if (trimmed === "]") {
      return {
        block: buildObjectBlock(type, body, errors),
        nextIndex: i + 1,
      };
    }
    if (OBJECT_BLOCKS.has(trimmed)) {
      errors.push({
        line: i + 1,
        message: "객체 블록 안에서는 새 객체 블록을 열 수 없습니다.",
      });
    }
    body.push(lines[i]);
  }

  warnings.push({
    line: startIndex + 1,
    message: `${type} 블록이 닫히지 않아 파일 끝에서 임시로 닫았습니다.`,
  });
  return {
    block: buildObjectBlock(type, body, errors),
    nextIndex: lines.length,
  };
}

function collectFenceBlock(lines, startIndex, warnings) {
  const fence = lines[startIndex].trim();
  const type = FENCE_BLOCKS.get(fence);
  const body = [];
  let i = startIndex + 1;

  for (; i < lines.length; i += 1) {
    if (lines[i].trim() === fence) {
      return {
        block: buildFenceBlock(type, body.join("\n")),
        nextIndex: i + 1,
      };
    }
    body.push(lines[i]);
  }

  warnings.push({
    line: startIndex + 1,
    message: `${type} 블록이 닫히지 않아 파일 끝에서 임시로 닫았습니다.`,
  });
  return {
    block: buildFenceBlock(type, body.join("\n")),
    nextIndex: lines.length,
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
    message: `<${tag}> 블록이 닫히지 않아 파일 끝에서 임시로 닫았습니다.`,
  });
  return { body: body.join("\n"), nextIndex: lines.length };
}

function buildFenceBlock(type, body) {
  const { text, asides } = extractAsides(body.trim());
  const block = { type, body: text };
  if (asides.length) block.asides = asides;
  return block;
}

function buildObjectBlock(type, lines, errors = []) {
  if (type === "발문") {
    const parsed = parsePromptContent(lines, errors);
    const block = {
      type,
      prompts: parsed.prompts.length ? parsed.prompts : [{ q: "" }],
    };
    if (parsed.comments) block.comments = true;
    return block;
  }

  const parsed = parseObjectContent(lines, errors);
  const block = { type, body: parsed.text };
  if (parsed.answer) block.answer = parsed.answer;
  if (parsed.materials.length) block.materials = parsed.materials;
  if (parsed.materialsLayout) block.materialsLayout = parsed.materialsLayout;
  if (parsed.asides.length) block.asides = parsed.asides;
  if (parsed.flow.length) block.flow = parsed.flow;
  if (parsed.comments) block.comments = true;
  return block;
}

function parsePromptContent(lines, errors = []) {
  const prompts = [];
  let buffer = [];
  let comments = false;

  const flushPrompt = answer => {
    const parsed = parseObjectContent(buffer, errors);
    buffer = [];
    const prompt = { q: parsed.text };
    if (answer) prompt.answer = normalizeAnswer(answer);
    else if (parsed.answer) prompt.answer = parsed.answer;
    if (parsed.materials.length) prompt.materials = parsed.materials;
    if (parsed.materialsLayout) prompt.materialsLayout = parsed.materialsLayout;
    if (parsed.asides.length) prompt.asides = parsed.asides;
    if (parsed.flow.length) prompt.flow = parsed.flow;
    if (parsed.comments) comments = true;
    if (prompt.q || prompt.answer || prompt.materials?.length || prompt.flow?.length) {
      prompts.push(prompt);
    }
  };

  for (let i = 0; i < lines.length; i += 1) {
    const trimmed = lines[i].trim();
    if (trimmed === "<a>") {
      const result = collectTaggedBlock(lines, i, "a", []);
      flushPrompt(result.body.trim());
      i = result.nextIndex - 1;
      continue;
    }
    if (trimmed === "<c>") {
      const result = collectTaggedBlock(lines, i, "c", []);
      comments = true;
      i = result.nextIndex - 1;
      continue;
    }
    buffer.push(lines[i]);
  }

  flushPrompt("");
  return { prompts, comments };
}

function parseObjectContent(lines, errors = []) {
  let kept = [];
  const flow = [];
  const textParts = [];
  const materials = [];
  let materialsLayout = "";
  let comments = false;
  const answers = [];

  const flushText = () => {
    const { text, asides } = extractAsides(kept.join("\n").trim());
    kept = [];
    if (!text && !asides.length) return;
    if (text) textParts.push(text);
    const item = { type: "text" };
    if (text) item.text = text;
    if (asides.length) item.asides = asides;
    flow.push(item);
  };

  for (let i = 0; i < lines.length; i += 1) {
    const trimmed = lines[i].trim();
    if (!trimmed) {
      kept.push(lines[i]);
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
      const materialItems = objectSeq.items.filter(item => typeof item === "string");
      if (materialItems.length) materials.push(...materialItems);
      if (objectSeq.layout === "row" && materialItems.length === objectSeq.items.length) materialsLayout = "row";
      flow.push(sequenceToFlowItem(objectSeq));
      continue;
    }

    if (isMalformedQuoteLine(trimmed)) {
      errors.push({
        line: null,
        message: "인용 문법은 한 줄 전체를 {{내용}} 형태로 닫아야 합니다.",
      });
      continue;
    }

    if (trimmed === "<a>") {
      flushText();
      const result = collectTaggedBlock(lines, i, "a", []);
      const answer = normalizeAnswer(result.body.trim());
      if (answer) {
        answers.push(result.body.trim());
        flow.push({ type: "answer", answer });
      }
      i = result.nextIndex - 1;
      continue;
    }

    if (trimmed === "<c>") {
      flushText();
      const result = collectTaggedBlock(lines, i, "c", []);
      comments = true;
      i = result.nextIndex - 1;
      continue;
    }

    kept.push(lines[i]);
  }

  flushText();
  const asides = flow.flatMap(item => item.asides || []);
  return {
    text: textParts.join("\n\n").trim(),
    asides,
    materials,
    materialsLayout,
    flow,
    comments,
    answer: normalizeAnswer(answers.join("\n").trim()),
  };
}

function buildExamBlock(body) {
  const answerExtracted = extractInlineTag(body, "a");
  const lines = answerExtracted.text.split("\n").map(line => line.trim()).filter(Boolean);
  const image = lines.shift() || "";
  const answerText = [lines.join("\n"), answerExtracted.matches.join("\n")].filter(Boolean).join("\n").trim();
  return {
    type: "기출문제",
    items: [{
      image,
      answer: normalizeAnswer(answerText),
    }],
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
  const parts = line.split(/\s+~\s+/);
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

function parseObjectAtom(part) {
  const material = part.match(/^\[\[([^\]]+)\]\]$/);
  if (material) return material[1].trim();
  const quote = part.match(/^\{\{(.+)\}\}$/);
  if (quote) return { type: "인용", body: quote[1].trim() };
  return null;
}

function sequenceToBlock(sequence) {
  if (sequence.items.length === 1) {
    const item = sequence.items[0];
    if (typeof item === "string") {
      return { type: "미디어", layout: "stack", items: [item] };
    }
    return item;
  }
  if (sequence.items.every(item => typeof item === "string")) {
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
    if (typeof item === "string") {
      return { type: "materials", items: [item], layout: "stack" };
    }
    if (item.type === "인용") return { type: "quote", body: item.body };
  }
  if (sequence.items.every(item => typeof item === "string")) {
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

function isMalformedQuoteLine(line) {
  const trimmed = String(line || "").trim();
  return trimmed.startsWith("{{") && !parseObjectSequence(trimmed);
}

function quoteLine(text) {
  return `{{${String(text || "").trim()}}}`;
}

function objectSequenceLine(items, layout = "stack") {
  const values = asArray(items).map(objectAtomToMarkup).filter(Boolean);
  if (!values.length) return "";
  return values.join(layout === "row" ? " ~ " : "\n");
}

function objectAtomToMarkup(item) {
  if (!item) return "";
  if (typeof item === "string") return `[[${item}]]`;
  if (item.type === "인용") return quoteLine(item.body || item.text || "");
  if (item.ref) return `[[${item.ref}]]`;
  return "";
}

function extractAsides(text) {
  const asides = [];
  const clean = String(text || "").replace(/%([^%\n]+)%/g, (_, value) => {
    const trimmed = value.trim();
    if (trimmed) asides.push(trimmed);
    return "";
  }).replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  return { text: clean, asides };
}

function extractInlineTag(text, tag) {
  const matches = [];
  const pattern = new RegExp(`<${tag}>\\n?([\\s\\S]*?)\\n?</${tag}>`, "g");
  const clean = String(text || "").replace(pattern, (_, value) => {
    const trimmed = value.trim();
    if (trimmed) matches.push(trimmed);
    return "";
  }).trim();
  return { text: clean, matches };
}

function normalizeAnswer(value) {
  const lines = String(value || "").split("\n").map(line => line.trim()).filter(Boolean);
  if (lines.length <= 1) return lines[0] || "";
  return lines;
}

function materialLine(items, layout = "stack") {
  const values = asArray(items).map(item => {
    if (!item) return "";
    if (typeof item === "string") return `[[${item}]]`;
    if (item.ref) return `[[${item.ref}]]`;
    return "";
  }).filter(Boolean);
  if (!values.length) return "";
  return values.join(layout === "row" ? " ~ " : "\n");
}

function asArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}
