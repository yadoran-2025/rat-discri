import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const lessonsDir = path.join(rootDir, "lessons");
const shouldWrite = process.argv.includes("--write");

const files = (await readdir(lessonsDir))
  .filter(file => file.endsWith(".json"))
  .sort();

const totals = createStats();

for (const file of files) {
  const fullPath = path.join(lessonsDir, file);
  const beforeText = await readFile(fullPath, "utf8");
  const lesson = JSON.parse(beforeText);

  if (!Array.isArray(lesson.sections)) {
    console.log(`skip ${file}: no sections`);
    continue;
  }

  const stats = createStats();
  const migrated = lesson.id === "block-guide"
    ? buildBlockGuide(lesson)
    : migrateLesson(lesson, stats);
  if (lesson.id === "block-guide") stats.blockGuide = 1;

  const afterText = `${JSON.stringify(migrated, null, 2)}\n`;
  const changed = beforeText.replace(/\r\n/g, "\n") !== afterText;
  const remnants = scanRemnants(migrated);

  addStats(totals, stats);
  addStats(totals, remnants);

  console.log(`${changed ? "migrate" : "clean  "} ${file}: ${formatStats(stats)} remnants ${formatStats(remnants)}`);

  if (shouldWrite && changed) {
    await writeFile(fullPath, afterText, "utf8");
  }
}

console.log(`${shouldWrite ? "wrote" : "dry-run"} totals: ${formatStats(totals)}`);

function migrateLesson(lesson, stats) {
  return pruneEmpty({
    ...lesson,
    sections: lesson.sections.map(section => ({
      ...section,
      blocks: (section.blocks || []).map(block => migrateBlock(block, stats)),
    })),
  });
}

function migrateBlock(block, stats) {
  if (!block || typeof block !== "object") return block;

  if (block.type === "이미지곁글") {
    stats.figureBlocks += 1;
    return pruneEmpty({
      type: "미디어",
      layout: "figure",
      items: buildFigureItems(block),
    });
  }

  if (block.type === "미디어" && block.kind) {
    stats.legacyMedia += 1;
    return migrateLegacyMedia(block);
  }

  const next = { ...block };

  if (next.type === "사례") {
    if (next.label != null && next.title == null) {
      next.title = next.label;
      delete next.label;
      stats.caseFields += 1;
    }
    if (next.text != null && next.body == null) {
      next.body = next.text;
      delete next.text;
      stats.caseFields += 1;
    }
    if (next.sub != null && next.footer == null) {
      next.footer = next.sub;
      delete next.sub;
      stats.caseFields += 1;
    }
  }

  if (next.type === "발문" && Array.isArray(next.imagePair) && next.imagePair.length) {
    next.materials = mergeMaterials(next.materials, next.imagePair);
    next.materialsLayout ||= "row";
    delete next.imagePair;
    stats.imagePair += 1;
  }

  if (next.type !== "기출문제" && (next.image || next.images)) {
    const materials = [];
    if (next.image) materials.push(next.image);
    if (Array.isArray(next.images)) materials.push(...next.images);
    next.materials = mergeMaterials(next.materials, materials);
    delete next.image;
    delete next.images;
    stats.commonImages += materials.length;
  }

  if (Array.isArray(next.prompts)) {
    next.prompts = next.prompts.map(prompt => migratePrompt(prompt, stats));
  }

  if (Array.isArray(next.children)) {
    next.children = next.children.map(child => migrateBlock(child, stats));
  }

  return pruneEmpty(next);
}

function migratePrompt(prompt, stats) {
  if (!prompt || typeof prompt !== "object") return prompt;
  const next = { ...prompt };
  if (next.image || next.images) {
    const materials = [];
    if (next.image) materials.push(next.image);
    if (Array.isArray(next.images)) materials.push(...next.images);
    next.materials = mergeMaterials(next.materials, materials);
    delete next.image;
    delete next.images;
    stats.commonImages += materials.length;
  }
  return pruneEmpty(next);
}

function buildFigureItems(block) {
  const items = [];
  if (block.image) {
    items.push(block.caption ? { ref: block.image, caption: block.caption } : block.image);
  }
  if (block.title || block.body || block.note) {
    items.push(pruneEmpty({
      kind: "text",
      title: block.title || "",
      body: block.body || "",
      source: block.note || "",
    }));
  }
  return items;
}

function migrateLegacyMedia(block) {
  if (block.kind === "row") {
    return pruneEmpty({ type: "미디어", layout: "row", items: block.images || [] });
  }
  if (block.kind === "image") {
    return pruneEmpty({
      type: "미디어",
      layout: "stack",
      items: [block.caption ? { ref: block.src || "", caption: block.caption } : block.src || ""],
    });
  }
  if (block.kind === "video") {
    return pruneEmpty({
      type: "미디어",
      layout: "stack",
      items: [block.caption ? { ref: block.url || "", caption: block.caption } : block.url || ""],
    });
  }
  if (block.kind === "text" || block.style === "news") {
    return pruneEmpty({
      type: "미디어",
      layout: "stack",
      items: [{
        kind: "text",
        title: block.headline || block.title || "",
        body: block.body || "",
        source: block.source || block.footer || "",
      }],
    });
  }
  return pruneEmpty({ ...block, kind: undefined });
}

function mergeMaterials(current, incoming) {
  const merged = Array.isArray(current) ? [...current] : [];
  incoming.filter(Boolean).forEach(item => {
    const key = stableMaterialKey(item);
    if (!merged.some(existing => stableMaterialKey(existing) === key)) merged.push(item);
  });
  return merged;
}

function stableMaterialKey(item) {
  return typeof item === "string" ? item : JSON.stringify(item);
}

function scanRemnants(lesson) {
  const stats = createStats();
  walkBlocks(lesson, block => {
    if (block.type === "미디어" && block.kind) stats.legacyMedia += 1;
    if (block.type !== "기출문제" && (block.image || block.images)) stats.commonImages += 1;
    if (block.imagePair) stats.imagePair += 1;
    if (block.type === "이미지곁글") stats.figureBlocks += 1;
  });
  return stats;
}

function walkBlocks(lesson, visit) {
  (lesson.sections || []).forEach(section => {
    (section.blocks || []).forEach(block => walkBlock(block, visit));
  });
}

function walkBlock(block, visit) {
  if (!block || typeof block !== "object") return;
  visit(block);
  if (Array.isArray(block.children)) block.children.forEach(child => walkBlock(child, visit));
}

function buildBlockGuide(previous) {
  return {
    id: "block-guide",
    title: "블록 가이드 갤러리",
    subtitle: "자료 DB와 materials 중심의 새 수업 JSON 작성법",
    imageBase: previous.imageBase || "assets/images/",
    prev: null,
    next: previous.next || "rat-disc-1",
    sections: [
      {
        id: "intro",
        title: "새 자료 체계",
        blocks: [
          {
            type: "개념",
            title: "핵심 원칙",
            body: "이미지, 영상, 텍스트는 모두 같은 자료 DB에서 관리하고, 수업 JSON에서는 자료 키를 `items` 또는 `materials` 배열에 넣습니다.",
            bullets: [
              "`미디어` 블록은 독립 자료 묶음입니다.",
              "`사례`, `개념`, `발문`, 개별 질문에는 `materials`를 붙일 수 있습니다.",
              "자료 표시 방식은 `layout` 또는 `materialsLayout`으로 정합니다."
            ]
          },
          {
            type: "요약",
            items: [
              "`stack`: 자료를 세로로 표시",
              "`row`: 자료를 가로 그리드로 표시",
              "`figure`: 첫 자료와 다음 자료를 좌우로 배치"
            ]
          }
        ]
      },
      {
        id: "material-block",
        title: "독립 자료 블록",
        blocks: [
          {
            type: "단락",
            text: "`미디어` 블록의 `items` 배열에는 이미지 키, 영상 URL, 텍스트 자료 키, 직접 텍스트 객체를 함께 넣을 수 있습니다."
          },
          {
            type: "미디어",
            layout: "row",
            items: [
              { ref: "rational-discrimination/allport.png", caption: "이미지 자료" },
              { ref: "https://www.youtube.com/watch?v=jNQXAC9IVRw", caption: "영상 자료" },
              {
                kind: "text",
                title: "텍스트 자료",
                body: "본문 안에서는 **강조**, 줄바꿈, 불릿을 사용할 수 있습니다.\n- 첫 번째 항목\n- 두 번째 항목",
                source: "직접 입력 예시"
              }
            ]
          }
        ]
      },
      {
        id: "activity-materials",
        title: "활동 블록 안의 자료",
        blocks: [
          {
            type: "사례",
            title: "사례",
            body: "사례 본문 아래에 `materials` 배열을 붙이면 근거 자료가 함께 표시됩니다.",
            materialsLayout: "row",
            materials: [
              { ref: "rational-discrimination/allport.png", caption: "사례와 함께 보는 이미지" },
              {
                kind: "text",
                title: "법 조문 예시",
                body: "## 헌법 제11조\n모든 국민은 **법 앞에 평등**하다.\n---\n대한민국헌법",
                source: "텍스트 컷아웃 문법"
              }
            ]
          },
          {
            type: "발문",
            prompts: [
              {
                q: "이 자료를 근거로 판단할 때 핵심 기준은 무엇인가요?",
                materialsLayout: "stack",
                materials: [
                  {
                    kind: "text",
                    title: "질문별 자료",
                    body: "개별 질문에도 자료를 붙일 수 있습니다."
                  }
                ]
              }
            ],
            materialsLayout: "row",
            materials: ["rational-discrimination/allport.png"]
          }
        ]
      },
      {
        id: "interactive-blocks",
        title: "문제와 접이식",
        blocks: [
          {
            type: "접이식",
            summary: "접이식 안에도 새 자료 블록을 넣을 수 있습니다.",
            children: [
              {
                type: "미디어",
                layout: "stack",
                items: [
                  {
                    kind: "text",
                    title: "접이식 내부 자료",
                    body: "접이식 children에는 일반 블록과 자료 블록을 모두 넣을 수 있습니다."
                  }
                ]
              }
            ]
          },
          {
            type: "기출문제",
            items: [
              {
                image: "250611[사문]",
                answer: "기출문제의 `items[].image`는 문제 전용 구조로 유지합니다."
              }
            ]
          }
        ]
      }
    ]
  };
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

function createStats() {
  return {
    commonImages: 0,
    imagePair: 0,
    figureBlocks: 0,
    legacyMedia: 0,
    caseFields: 0,
    blockGuide: 0,
  };
}

function addStats(target, source) {
  Object.keys(target).forEach(key => {
    target[key] += source[key] || 0;
  });
}

function formatStats(stats) {
  return Object.entries(stats)
    .filter(([, value]) => value)
    .map(([key, value]) => `${key}=${value}`)
    .join(", ") || "none";
}
