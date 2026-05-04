import { app } from "../../state.js";
import { formatInline } from "../../utils.js";
import { renderBlock } from "./index.js";
import { renderQuote, renderTextBox } from "./text.js";
import { appendMaterials, buildMaterial, resolveMaterial } from "./materials.js";
import { buildImagePair } from "./media.js";
import { buildAnswer } from "./quiz.js";
import { appendAsides, asArray, buildTextElement, hasFlowAnswer, hasFlowComment, normalizeLayout, renderAsideHtml } from "./shared.js";

const CASE_INLINE_OPTIONS = { accentStyle: "color: var(--text); --accent: var(--text)" };

export function renderCallout(block, defaultStyle, blockIdx) {
  const style = block.style ?? defaultStyle;

  if (style === "news") {
    const tc = buildTextCutout(block);
    tc.classList.add("block");
    return tc;
  }

  const title  = block.title  ?? block.label ?? (defaultStyle === "case" ? "사례" : null);
  const body   = block.body   ?? block.text  ?? null;
  const footer = style === "concept" ? null : block.footer ?? block.sub ?? null;

  const div = document.createElement("div");
  div.className = `block callout ${style}`;

  if (style === "concept") {
    if (title) div.appendChild(buildTextElement("div", "concept__title", title, false));
    if (block.flow?.length) appendFlow(div, block.flow, "concept__body", {
      blockIdx,
      variant: "concept",
      label: "학생 답변 보기",
    });
    else if (body) div.appendChild(buildTextElement("div", "concept__body", formatInline(body)));
  } else {
    if (title) div.appendChild(buildTextElement("div", "callout__label", title, false));
    if (block.flow?.length) appendFlow(div, block.flow, "case__text", {
      blockIdx,
      variant: "case",
    });
    else if (body) div.appendChild(buildTextElement("div", "case__text", formatCaseInline(body)));
    if (footer) div.appendChild(buildTextElement("div", "case__sub", formatCaseInline(footer)));
  }

  if (!block.flow?.length) {
    appendMaterials(div, block.materials, block.materialsLayout);
    appendAsides(div, block.asides);
  }
  if (block.answer && !hasFlowAnswer(block.flow)) div.appendChild(buildAnswer(block.answer));
  return div;
}

export function renderCase(block, blockIdx) {
  const div = renderCallout(block, "case", blockIdx);

  if (!block.comments || hasFlowComment(block.flow)) return div;

  const wrapper = document.createElement("div");
  wrapper.className = "case-with-comments";
  div.classList.remove("block");
  wrapper.appendChild(div);
  appendCommentSection(wrapper, commentKey(blockIdx, "p0"), "case");
  return wrapper;
}

export function renderQuestion(block, blockIdx) {
  const lessonId = app.lesson.id || app.lesson.title || "lesson";
  const sectionId = app.lesson.sections[app.currentIdx]?.id || `sec${app.currentIdx}`;
  const bIdx = blockIdx ?? 0;

  const div = document.createElement("div");
  div.className = "block callout question";
  div.innerHTML = `<div class="callout__label">생각해볼 문제</div>`;

  const commentSections = [];

  block.prompts.forEach((pr, promptIdx) => {
    if (pr.flow?.length) {
      const firstTextIdx = pr.flow.findIndex(item => item.type === "text");
      pr.flow.forEach((item, flowIdx) => {
        if (item.type === "materials") {
          appendMaterials(div, item.items, item.layout);
          return;
        }
        if (item.type === "divider") {
          const divider = document.createElement("hr");
          divider.className = "md-divider";
          div.appendChild(divider);
          return;
        }
        if (item.type === "answer") {
          div.appendChild(buildAnswer(item.answer, "답 보기"));
          return;
        }
        if (item.type === "quote") {
          div.appendChild(renderFlowQuote(item));
          return;
        }
        if (item.type === "textBox") {
          div.appendChild(renderFlowTextBox(item));
          return;
        }
        if (item.type === "group") {
          div.appendChild(buildObjectGroup(item.items, item.layout || "row"));
          return;
        }
        if (item.type === "comment") {
          appendCommentObject(div, commentKey(bIdx, `p${promptIdx}__f${flowIdx}`), "question", block.prompts.length > 1
            ? `Q${promptIdx + 1} 학생 답변 보기`
            : "학생 답변 보기");
          return;
        }
        const p = document.createElement("div");
        p.className = "question__prompt";
        const prefix = flowIdx === firstTextIdx ? "Q. " : "";
        p.innerHTML = `${prefix}${formatInline(item.text || "")}`;
        if (item.asides?.length) p.innerHTML += renderAsideHtml(item.asides, "question__note");
        div.appendChild(p);
      });
    } else {
      const p = document.createElement("div");
      p.className = "question__prompt";
      p.innerHTML = `Q. ${formatInline(pr.q)}`;
      if (pr.note) p.innerHTML += `<div class="question__note">${formatInline(pr.note)}</div>`;
      if (pr.asides?.length) p.innerHTML += renderAsideHtml(pr.asides, "question__note");
      div.appendChild(p);
      appendMaterials(div, pr.materials, pr.materialsLayout);
    }

    // answer는 항상 { text } 또는 { bullets } 객체
    if (pr.answer && !hasFlowAnswer(pr.flow)) div.appendChild(buildAnswer(pr.answer, "답 보기"));

    if (block.comments && !hasFlowComment(pr.flow)) {
      commentSections.push({
        key: `${lessonId}__${sectionId}__b${bIdx}__p${promptIdx}`,
        label: block.prompts.length > 1
          ? `Q${promptIdx + 1} 학생 답변 보기`
          : "학생 답변 보기",
      });
    }
  });

  if (block.imagePair) div.appendChild(buildImagePair(block.imagePair));

  if (!block.comments) return div;

  const outer = document.createElement("div");
  outer.className = "question-with-comments";
  div.classList.remove("block");
  outer.appendChild(div);
  commentSections.forEach(({ key, label }) => {
    appendCommentSection(outer, key, "question", label);
  });
  return outer;
}

export function appendCommentSection(parent, key, variant, label = null) {
  import("./comments.js")
    .then(({ buildCommentSection }) => {
      const section = buildCommentSection(key, variant);
      if (label) section.querySelector(".comment-section__toggle").textContent = label;
      parent.appendChild(section);
    })
    .catch(err => {
      console.warn("댓글 모듈을 불러오지 못했습니다:", err);
    });
}

export function renderConcept(block, blockIdx) {
  const div = renderCallout(block, "concept", blockIdx);

  if (!block.comments || hasFlowComment(block.flow)) return div;

  const wrapper = document.createElement("div");
  wrapper.className = "concept-with-comments";
  div.classList.remove("block");
  wrapper.appendChild(div);
  appendCommentSection(wrapper, commentKey(blockIdx, "p0"), "concept", "학생 답변 보기");
  return wrapper;
}

export function renderCommentBlock(_block, blockIdx) {
  const wrap = document.createElement("div");
  wrap.className = "block comment-object";
  appendCommentSection(wrap, commentKey(blockIdx, "standalone"), "question", "학생 답변 보기");
  return wrap;
}

export function appendFlow(parent, flow, textClass, context = {}) {
  flow.forEach((item, flowIdx) => {
    if (item.type === "materials") {
      appendMaterials(parent, item.items, item.layout);
      return;
    }
    if (item.type === "divider") {
      const divider = document.createElement("hr");
      divider.className = "md-divider";
      parent.appendChild(divider);
      return;
    }
    if (item.type === "answer") {
      parent.appendChild(buildAnswer(item.answer, "답 보기"));
      return;
    }
    if (item.type === "quote") {
      parent.appendChild(renderFlowQuote(item));
      return;
    }
    if (item.type === "textBox") {
      parent.appendChild(renderFlowTextBox(item));
      return;
    }
    if (item.type === "group") {
      parent.appendChild(buildObjectGroup(item.items, item.layout || "row"));
      return;
    }
    if (item.type === "comment") {
      appendCommentObject(parent, commentKey(context.blockIdx, `f${flowIdx}`), context.variant || "question", context.label);
      return;
    }
    const text = document.createElement("div");
    text.className = textClass;
    text.innerHTML = context.variant === "case"
      ? formatCaseInline(item.text || "")
      : formatInline(item.text || "");
    parent.appendChild(text);
    appendAsides(parent, item.asides);
  });
}

function formatCaseInline(text) {
  return formatInline(text, CASE_INLINE_OPTIONS);
}

export function appendCommentObject(parent, key, variant = "question", label = "학생 답변 보기") {
  const wrap = document.createElement("div");
  wrap.className = "comment-object";
  parent.appendChild(wrap);
  appendCommentSection(wrap, key, variant, label);
}

export function commentKey(blockIdx = 0, suffix = "comment") {
  const lessonId = app.lesson.id || app.lesson.title || "lesson";
  const sectionId = app.lesson.sections[app.currentIdx]?.id || `sec${app.currentIdx}`;
  return `${lessonId}__${sectionId}__b${blockIdx ?? 0}__${suffix}`;
}

export function renderFlowQuote(item) {
  const quote = renderQuote({ body: item.body || item.text || "", asides: item.asides });
  quote.classList.remove("block");
  return quote;
}

export function renderFlowTextBox(item) {
  const textBox = renderTextBox({ body: item.body || item.text || "" });
  textBox.classList.remove("block");
  return textBox;
}

export function buildObjectGroup(items, layout = "row", extraClass = "") {
  const wrap = document.createElement("div");
  const normalizedLayout = normalizeLayout(layout);
  wrap.className = `object-group object-group--${normalizedLayout} ${extraClass}`.trim();
  asArray(items).forEach(item => {
    const child = buildObjectGroupItem(item);
    if (child) wrap.appendChild(child);
  });
  applyObjectGroupCompositionClass(wrap, normalizedLayout);
  return wrap;
}

export function applyObjectGroupCompositionClass(wrap, layout) {
  if (layout !== "row" || wrap.children.length !== 2) return;

  const [first, second] = wrap.children;
  const firstIsImage = first.classList.contains("material--image");
  const secondIsImage = second.classList.contains("material--image");
  const firstIsQuote = first.classList.contains("quote-block") || first.classList.contains("text-cutout");
  const secondIsQuote = second.classList.contains("quote-block") || second.classList.contains("text-cutout");

  if (firstIsImage && secondIsQuote) {
    wrap.classList.add("object-group--image-quote");
  } else if (firstIsQuote && secondIsImage) {
    wrap.classList.add("object-group--quote-image");
  }
}

export function buildObjectGroupItem(item) {
  if (typeof item === "string" || item?.ref) {
    const material = resolveMaterial(item);
    return material ? buildMaterial(material) : null;
  }
  if (item?.type === "인용") {
    const quote = renderQuote(item);
    quote.classList.remove("block");
    return quote;
  }
  if (item?.type === "텍스트박스" || item?.type === "textBox") {
    const textBox = renderTextBox(item);
    textBox.classList.remove("block");
    return textBox;
  }
  return renderBlock(item);
}
