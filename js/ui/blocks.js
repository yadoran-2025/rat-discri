import { app } from "../state.js";
import {
  formatInline,
  escapeHtml,
  parseExamTitle,
  extractYouTubeId,
  inferMaterialKind,
  stripTextMarker,
  parseTextCutoutContent,
} from "../utils.js";
import { attachFocusAffordance, openImageLightbox } from "./components.js";

const FULLSCREEN_TYPES  = new Set(['사례', '발문', '개념', '이미지곁글', '미디어', '기출문제']);
const IMG_SELF_HANDLED  = new Set(['이미지곁글', '미디어']); // 자체적으로 이미지를 처리하는 블록
const linkPreviewCache = new Map();

/**
 * 블록 디스패처: 타입에 맞는 렌더러 호출
 *
 * 블록 타입 목록:
 *   소제목, 단락            — 기본 텍스트
 *   사례, 발문, 개념        — 콜아웃
 *   이미지곁글              — 이미지 + 텍스트 좌우 배치
 *   미디어                  — 이미지·영상·텍스트 자료
 *   기출문제                — 수능 문제 아코디언
 */
export function renderBlock(block, blockIdx) {
  const map = {
    단락:      renderParagraph,
    소제목:    renderHeading,
    절:        renderSubsection,
    구분선:    renderDivider,
    댓글:      renderCommentBlock,
    인용:      renderQuote,
    텍스트박스: renderTextBox,
    그룹:      renderGroup,
    토글:      renderToggle,
    사례:      renderCase,
    발문:      renderQuestion,
    개념:      renderConcept,
    이미지곁글: renderFigure,
    미디어:    renderMedia,
    기출문제:  renderQuizAccordion,
  };
  const fn = map[block.type];
  if (!fn) { console.warn("Unknown block type:", block.type); return null; }
  const el = fn(block, blockIdx);
  if (el) {
    // [P0] 공통 이미지 필드: 이미지를 직접 처리하는 블록 타입 제외
    if (!IMG_SELF_HANDLED.has(block.type)) {
      if (block.image) {
        const img = buildImage(block.image);
        img.style.marginTop = "1rem";
        el.appendChild(img);
      }
      if (block.images) block.images.forEach(src => {
        const img = buildImage(src);
        img.style.marginTop = "1rem";
        el.appendChild(img);
      });
    }
    if (FULLSCREEN_TYPES.has(block.type)) attachFocusAffordance(el);
  }
  return el;
}

/* ── 기본 텍스트 ── */

function renderParagraph(block) {
  const wrap = document.createElement("div");
  wrap.className = "block paragraph";
  if (block.text) {
    const p = document.createElement("p");
    p.innerHTML = formatInline(block.text);
    wrap.appendChild(p);
  }
  appendAsides(wrap, block.asides);
  return wrap;
}

function renderHeading(block) {
  const h = document.createElement("h2");
  h.className = "block section-sub-heading";
  h.innerHTML = formatInline(block.text || "");
  return h;
}

function renderSubsection(block) {
  const h = document.createElement("h3");
  h.className = "block section-sub-section";
  h.innerHTML = formatInline(block.text || "");
  return h;
}

function renderQuote(block) {
  const div = document.createElement("blockquote");
  div.className = "block quote-block";
  div.innerHTML = formatInline(block.body || block.text || "");
  appendAsides(div, block.asides);
  return div;
}

function renderTextBox(block) {
  const div = document.createElement("div");
  div.className = "block text-cutout";
  const body = document.createElement("div");
  body.className = "text-cutout__body";
  body.innerHTML = formatInline(block.body || block.text || "");
  div.appendChild(body);
  return div;
}

function renderGroup(block) {
  return buildObjectGroup(block.items || [], block.layout || "row", "block");
}

function renderToggle(block) {
  const div = document.createElement("div");
  div.className = "block toggle-block";
  div.appendChild(buildAnswer(block.body || block.text || block.answer || "", block.label || "내용 보기"));
  return div;
}

export function renderDivider() {
  const hr = document.createElement("hr");
  hr.className = "block divider";
  return hr;
}

export function renderBlockSeparator() {
  const hr = document.createElement("hr");
  hr.className = "block-separator";
  return hr;
}

/* ── 콜아웃 (사례·개념·news 통합 렌더러) ── */

/**
 * [P1] 통합 콜아웃 렌더러
 * style: "case" | "concept" | "news"
 * 필드: title(=label), body(=text), footer(=sub/source)
 */
function renderCallout(block, defaultStyle, blockIdx) {
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
    else if (body) div.appendChild(buildTextElement("div", "case__text", formatInline(body)));
    if (footer) div.appendChild(buildTextElement("div", "case__sub", formatInline(footer)));
  }

  if (!block.flow?.length) {
    appendMaterials(div, block.materials, block.materialsLayout);
    appendAsides(div, block.asides);
  }
  if (block.answer && !hasFlowAnswer(block.flow)) div.appendChild(buildAnswer(block.answer));
  return div;
}

function renderCase(block, blockIdx) {
  const div = renderCallout(block, "case", blockIdx);

  if (!block.comments || hasFlowComment(block.flow)) return div;

  const wrapper = document.createElement("div");
  wrapper.className = "case-with-comments";
  div.classList.remove("block");
  wrapper.appendChild(div);
  appendCommentSection(wrapper, commentKey(blockIdx, "p0"), "case");
  return wrapper;
}

function renderQuestion(block, blockIdx) {
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

function appendCommentSection(parent, key, variant, label = null) {
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

function renderConcept(block, blockIdx) {
  const div = renderCallout(block, "concept", blockIdx);

  if (!block.comments || hasFlowComment(block.flow)) return div;

  const wrapper = document.createElement("div");
  wrapper.className = "concept-with-comments";
  div.classList.remove("block");
  wrapper.appendChild(div);
  appendCommentSection(wrapper, commentKey(blockIdx, "p0"), "concept", "학생 답변 보기");
  return wrapper;
}

function renderCommentBlock(_block, blockIdx) {
  const wrap = document.createElement("div");
  wrap.className = "block comment-object";
  appendCommentSection(wrap, commentKey(blockIdx, "standalone"), "question", "학생 답변 보기");
  return wrap;
}

function appendFlow(parent, flow, textClass, context = {}) {
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
    text.innerHTML = formatInline(item.text || "");
    parent.appendChild(text);
    appendAsides(parent, item.asides);
  });
}

function appendCommentObject(parent, key, variant = "question", label = "학생 답변 보기") {
  const wrap = document.createElement("div");
  wrap.className = "comment-object";
  parent.appendChild(wrap);
  appendCommentSection(wrap, key, variant, label);
}

function commentKey(blockIdx = 0, suffix = "comment") {
  const lessonId = app.lesson.id || app.lesson.title || "lesson";
  const sectionId = app.lesson.sections[app.currentIdx]?.id || `sec${app.currentIdx}`;
  return `${lessonId}__${sectionId}__b${blockIdx ?? 0}__${suffix}`;
}

function renderFlowQuote(item) {
  const quote = renderQuote({ body: item.body || item.text || "", asides: item.asides });
  quote.classList.remove("block");
  return quote;
}

function renderFlowTextBox(item) {
  const textBox = renderTextBox({ body: item.body || item.text || "" });
  textBox.classList.remove("block");
  return textBox;
}

function buildObjectGroup(items, layout = "row", extraClass = "") {
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

function applyObjectGroupCompositionClass(wrap, layout) {
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

function buildObjectGroupItem(item) {
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

function hasFlowAnswer(flow) {
  return Array.isArray(flow) && flow.some(item => item?.type === "answer");
}

function hasFlowComment(flow) {
  return Array.isArray(flow) && flow.some(item => item?.type === "comment");
}

function buildTextElement(tag, className, html, alreadyFormatted = true) {
  const el = document.createElement(tag);
  el.className = className;
  if (alreadyFormatted) el.innerHTML = html;
  else el.textContent = html;
  return el;
}

function appendAsides(parent, asides) {
  const items = asArray(asides).map(item => String(item || "").trim()).filter(Boolean);
  if (!items.length) return;
  const wrap = document.createElement("div");
  wrap.className = "soft-asides";
  wrap.innerHTML = items.map(item => `<div class="soft-aside">${formatInline(item)}</div>`).join("");
  parent.appendChild(wrap);
}

function renderAsideHtml(asides, className = "soft-aside") {
  return asArray(asides)
    .map(item => String(item || "").trim())
    .filter(Boolean)
    .map(item => `<div class="${className}">${formatInline(item)}</div>`)
    .join("");
}

/* ── 레이아웃 ── */

/**
 * figure — 이미지(왼쪽) + 텍스트(오른쪽) 좌우 배치
 *
 * title 있음 → 오른쪽이 concept 박스 스타일  (구 figure-concept)
 * title 없음 → 오른쪽이 인용문 스타일         (구 figure-quote)
 *
 * 필드: image, caption?, title?, body, note?
 */
function renderFigure(block) {
  const div = document.createElement("div");
  div.className = "block figure-row";

  const left = document.createElement("div");
  left.className = "figure-row__image-wrap";
  left.appendChild(buildImage(block.image, block.caption));
  if (block.caption) {
    const cap = document.createElement("div");
    cap.className = "figure-row__caption";
    cap.textContent = block.caption;
    left.appendChild(cap);
  }

  const right = document.createElement("div");
  const kind = block.kind ?? (block.title ? "concept" : "quote");
  if (kind === "concept") {
    right.className = "callout concept";
    right.style.margin = "0";
    right.innerHTML = `
      <div class="concept__title">${escapeHtml(block.title || "")}</div>
      <div class="concept__body">${formatInline(block.body || "")}</div>
    `;
  } else {
    const q = document.createElement("div");
    q.className = "figure-row__quote";
    q.innerHTML = formatInline(block.body || "");
    right.appendChild(q);
    if (block.note) {
      const n = document.createElement("div");
      n.className = "figure-row__note";
      n.innerHTML = formatInline(block.note);
      right.appendChild(n);
    }
  }

  div.appendChild(left);
  div.appendChild(right);
  return div;
}

/* ── 미디어 ── */

/**
 * media — 이미지·영상·텍스트 자료 통합 블록
 *
 * kind: "row"   — 이미지 여러 장 가로 나열 (구 image-row)
 * kind: "image" — 캡션 있는 단독 이미지
 * kind: "video" — 유튜브 썸네일 링크 (구 video-link)
 * kind: "text"  — 신문기사 스타일 텍스트 자료 (구 text: 접두사)
 *                 추가 필드: headline?, body, source?
 */
function renderMedia(block) {
  if (block.item || block.items || block.materials) {
    return buildMaterials(block.items || block.materials || block.item, block.layout || block.kind || "stack");
  }

  if (block.kind === "row") {
    const div = document.createElement("div");
    div.className = "block image-row";
    block.images.forEach(src => {
      const wrap = document.createElement("div");
      wrap.className = "image-row__item";
      wrap.appendChild(buildImage(src));
      div.appendChild(wrap);
    });
    return div;
  }

  if (block.kind === "text" || block.style === "news") {
    const tc = buildTextCutout(block);
    tc.classList.add("block");
    return tc;
  }

  const div = document.createElement("div");
  div.className = "block media";

  if (block.kind === "image") {
    div.classList.add("media--image");
    div.appendChild(buildImage(block.src, block.caption || ""));
    if (block.caption) {
      const cap = document.createElement("div");
      cap.className = "media__caption";
      cap.textContent = block.caption;
      div.appendChild(cap);
    }
  } else if (block.kind === "video") {
    div.classList.add("media--video");
    const videoId = extractYouTubeId(block.url);
    const link = document.createElement("a");
    link.href = block.url; link.target = "_blank"; link.rel = "noopener noreferrer";
    link.className = "media__thumb-link";
    link.setAttribute("aria-label", block.caption || "영상 보기");
    const thumbWrap = document.createElement("div");
    thumbWrap.className = "media__thumb-wrap";
    if (videoId) {
      const img = document.createElement("img");
      img.src = `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`;
      img.alt = block.caption || "YouTube 썸네일"; img.loading = "lazy";
      img.onerror = () => {
        const ph = document.createElement("div");
        ph.className = "image-placeholder"; ph.textContent = "썸네일 없음";
        img.replaceWith(ph);
      };
      thumbWrap.appendChild(img);
    }
    const play = document.createElement("div");
    play.className = "media__play-icon"; play.setAttribute("aria-hidden", "true"); play.textContent = "▶";
    thumbWrap.appendChild(play); link.appendChild(thumbWrap); div.appendChild(link);
    if (block.caption) {
      const cap = document.createElement("div");
      cap.className = "media__caption"; cap.textContent = block.caption; div.appendChild(cap);
    }
  }

  return div;
}

function appendMaterials(parent, materials, layout = "stack") {
  if (!materials || !asArray(materials).length) return;
  parent.appendChild(buildMaterials(materials, layout, "materials--embedded"));
}

function buildMaterials(materials, layout = "stack", extraClass = "") {
  const items = asArray(materials).map(material => resolveMaterial(material)).filter(Boolean);
  const wrap = document.createElement("div");
  const normalizedLayout = normalizeLayout(layout);
  const shouldBalanceRow = normalizedLayout === "row" && items.length >= 2 && items.every(isVisualMaterial);
  const balancedRowClass = shouldBalanceRow
    ? "materials--balanced-row"
    : "";
  wrap.className = `block materials materials--${normalizedLayout} ${balancedRowClass} ${extraClass}`.trim();
  items.forEach(material => {
    const el = buildMaterial(material);
    if (shouldBalanceRow) prepareBalancedMaterial(el, material, wrap);
    wrap.appendChild(el);
  });
  if (shouldBalanceRow) updateBalancedMaterialColumns(wrap);
  return wrap;
}

function isVisualMaterial(material) {
  return material.kind === "image" || material.kind === "video";
}

function prepareBalancedMaterial(el, material, wrap) {
  const defaultAspect = material.kind === "video" ? 16 / 9 : 4 / 3;
  setMaterialAspect(el, defaultAspect, wrap);

  if (material.kind !== "image") return;

  const img = el.querySelector("img");
  if (!img) return;

  const updateFromImage = () => {
    if (img.naturalWidth > 0 && img.naturalHeight > 0) {
      setMaterialAspect(el, img.naturalWidth / img.naturalHeight, wrap);
    }
  };

  if (img.complete) updateFromImage();
  img.addEventListener("load", updateFromImage, { once: true });
  img.addEventListener("error", () => setMaterialAspect(el, defaultAspect, wrap), { once: true });
}

function setMaterialAspect(el, aspect, wrap) {
  el.style.setProperty("--material-aspect", String(aspect));
  updateBalancedMaterialColumns(wrap);
}

function updateBalancedMaterialColumns(wrap) {
  const columns = [...wrap.children].map(child => {
    const aspect = Number.parseFloat(child.style.getPropertyValue("--material-aspect"));
    return `${Number.isFinite(aspect) && aspect > 0 ? aspect : 1}fr`;
  });
  if (columns.length) wrap.style.gridTemplateColumns = columns.join(" ");
}

function buildMaterial(material) {
  if (material.kind === "text") {
    return buildTextCutout({
      headline: material.headline ?? material.title,
      body: material.body ?? material.content ?? material.text ?? stripTextMarker(material.url ?? material.value ?? ""),
      source: material.source ?? material.footer ?? material.caption,
    });
  }

  if (material.kind === "video") {
    return buildVideoMaterial(material.url || material.src || material.value || material.key, material.caption || "");
  }

  if (material.kind === "link") {
    return buildLinkMaterial(material.url || material.src || material.value || material.key, material.caption || material.title || "");
  }

  const figure = document.createElement("figure");
  figure.className = "material material--image";
  figure.appendChild(buildImage(material.url || material.src || material.value || material.key, material.caption || material.title || ""));
  if (material.caption) {
    const cap = document.createElement("figcaption");
    cap.className = "media__caption";
    cap.textContent = material.caption;
    figure.appendChild(cap);
  }
  return figure;
}

function buildLinkMaterial(url, label = "") {
  const href = String(url || "").trim();
  const article = document.createElement("article");
  article.className = "material material--link-card";
  article.dataset.url = href;

  let host = href;
  try {
    host = new URL(href).hostname.replace(/^www\./, "");
  } catch { }

  article.innerHTML = `
    <a class="material-link-card__anchor" href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">
      <span class="material-link-card__body">
        <span class="material-link-card__title">${escapeHtml(label || host || href)}</span>
        <span class="material-link-card__desc">${escapeHtml(host || "")}</span>
        <span class="material-link-card__url">${escapeHtml(href)}</span>
      </span>
      <span class="material-link-card__thumb" hidden></span>
    </a>
  `;
  hydrateLinkPreview(article, href, label);
  return article;
}

function hydrateLinkPreview(card, href, label = "") {
  if (!href || !/^https?:\/\//i.test(href)) return;
  getLinkPreview(href)
    .then(meta => {
      if (!meta || !card.isConnected) return;
      const title = card.querySelector(".material-link-card__title");
      const desc = card.querySelector(".material-link-card__desc");
      const thumb = card.querySelector(".material-link-card__thumb");
      if (title && !label && meta.title) title.textContent = meta.title;
      if (desc && meta.description) desc.textContent = meta.description;
      if (thumb && meta.image) {
        const img = document.createElement("img");
        img.src = meta.image;
        img.alt = "";
        img.loading = "lazy";
        img.onerror = () => {
          thumb.hidden = true;
          thumb.innerHTML = "";
        };
        thumb.innerHTML = "";
        thumb.appendChild(img);
        thumb.hidden = false;
      }
    })
    .catch(() => {});
}

function getLinkPreview(href) {
  if (linkPreviewCache.has(href)) return linkPreviewCache.get(href);
  const request = fetch(`https://api.microlink.io/?url=${encodeURIComponent(href)}`)
    .then(response => response.ok ? response.json() : null)
    .then(data => {
      if (data?.status !== "success") return null;
      return {
        title: data.data?.title || "",
        description: data.data?.description || "",
        image: data.data?.image?.url || "",
      };
    })
    .catch(() => null);
  linkPreviewCache.set(href, request);
  return request;
}

function buildVideoMaterial(url, caption = "") {
  const div = document.createElement("div");
  div.className = "material media media--video";
  div.appendChild(buildVideoThumb(url, caption));
  if (caption) {
    const cap = document.createElement("div");
    cap.className = "media__caption";
    cap.textContent = caption;
    div.appendChild(cap);
  }
  return div;
}

/* ── 인터랙션 ── */

function renderQuizAccordion(block) {
  const container = document.createElement("div");
  container.className = "block quiz-accordion";
  block.items.forEach(item => {
    const itemEl = document.createElement("div");
    itemEl.className = "quiz-accordion__item";
    const summary = document.createElement("button");
    summary.className = "quiz-accordion__summary";
    summary.innerHTML = `<span class="quiz-accordion__title">${parseExamTitle(item.image)}</span>`;
    const content = document.createElement("div");
    content.className = "quiz-accordion__content";
    const imgWrap = document.createElement("div");
    imgWrap.className = "quiz-accordion__image-wrap";
    imgWrap.appendChild(buildImage(item.image));
    content.appendChild(imgWrap);
    if (item.answer) content.appendChild(buildAnswer(item.answer, "정답 및 해설 보기"));
    summary.addEventListener("click", () => itemEl.classList.toggle("is-open"));
    itemEl.appendChild(summary);
    itemEl.appendChild(content);
    container.appendChild(itemEl);
  });
  return container;
}

/* ── 내부 헬퍼 ── */

function buildAnswer(answer, label = "답 보기") {
  const wrap = document.createElement("div");
  wrap.className = "answer";
  const btn = document.createElement("button");
  btn.className = "answer__toggle";
  btn.textContent = label;
  btn.addEventListener("click", () => wrap.classList.toggle("is-open"));
  const content = document.createElement("div");
  content.className = "answer__content";
  if (Array.isArray(answer)) {
    if (answer.some(item => /^- /.test(String(item || "").trim()))) {
      content.innerHTML = formatInline(answer.join("\n"));
    } else {
      let html = "<ul>";
      answer.forEach(b => { html += `<li>${formatInline(b)}</li>`; });
      html += "</ul>";
      content.innerHTML = html;
    }
  } else {
    content.innerHTML = `<p>${formatInline(answer)}</p>`;
  }
  wrap.appendChild(btn);
  wrap.appendChild(content);
  return wrap;
}

function buildImagePair(paths) {
  const pair = document.createElement("div");
  pair.className = "image-pair";
  paths.forEach(p => pair.appendChild(buildImage(p)));
  return pair;
}

function buildImage(key, alt = "") {
  const material = resolveMaterial(key, alt, "image");
  if (material.kind === "text") return buildMaterial(material);
  if (material.kind === "video") return buildVideoThumb(material.url || material.src || material.value || key, alt || material.caption || material.title || "");

  let resolved = material.url || material.src || material.value || key;

  if (typeof resolved === "string" && resolved.includes("drive.google.com")) {
    const m = resolved.match(/\/d\/([^/]+)/) || resolved.match(/id=([^&]+)/);
    if (m?.[1]) resolved = `https://lh3.googleusercontent.com/d/${m[1]}`;
  }

  const videoId = extractYouTubeId(resolved);
  if (videoId) {
    return buildVideoThumb(resolved, alt);
  }

  const src = /^https?:\/\//.test(resolved) ? resolved : app.lesson.imageBase + resolved;
  const img = document.createElement("img");
  img.src = src; img.alt = alt; img.loading = "lazy";
  img.addEventListener("click", () => openImageLightbox(src));
  img.onerror = () => {
    const ph = document.createElement("div");
    ph.className = "image-placeholder"; ph.textContent = `이미지: ${key}`;
    img.replaceWith(ph);
  };
  return img;
}

function buildVideoThumb(url, alt = "") {
  const videoId = extractYouTubeId(url);
  const wrap = document.createElement("div"); wrap.className = "media__thumb-wrap";
  const link = document.createElement("a");
  link.href = url; link.target = "_blank"; link.rel = "noopener noreferrer";
  link.className = "media__thumb-link"; link.setAttribute("aria-label", alt || "YouTube 영상 보기");
  if (videoId) {
    const thumb = document.createElement("img");
    thumb.src = `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`;
    thumb.alt = alt || "YouTube 썸네일"; thumb.loading = "lazy";
    thumb.onerror = () => {
      const ph = document.createElement("div");
      ph.className = "image-placeholder"; ph.textContent = "썸네일 없음";
      thumb.replaceWith(ph);
    };
    link.appendChild(thumb);
  }
  const play = document.createElement("div");
  play.className = "media__play-icon"; play.setAttribute("aria-hidden", "true"); play.textContent = "▶";
  link.appendChild(play); wrap.appendChild(link);
  return wrap;
}

function buildTextCutout(block) {
  if (!block.body && (block.content || block.text || block.value || block.url)) {
    const parsed = parseTextCutoutContent(stripTextMarker(block.content || block.text || block.value || block.url));
    block = {
      ...block,
      headline: block.headline ?? block.title ?? parsed.headline,
      body: block.body || parsed.body,
      source: block.source ?? block.footer ?? parsed.source,
    };
  }
  const wrap = document.createElement("div");
  wrap.className = "text-cutout";
  const headline = block.headline ?? block.title ?? null;
  if (headline) {
    const h = document.createElement("div");
    h.className = "text-cutout__headline";
    h.innerHTML = formatInline(headline);
    wrap.appendChild(h);
  }
  const bodyEl = document.createElement("div");
  bodyEl.className = "text-cutout__body";
  bodyEl.innerHTML = formatInline(block.body || "");
  wrap.appendChild(bodyEl);
  const source = block.source ?? block.footer ?? null;
  if (source) {
    const src = document.createElement("div");
    src.className = "text-cutout__source";
    src.innerHTML = formatInline(source);
    wrap.appendChild(src);
  }
  return wrap;
}

function resolveMaterial(ref, alt = "", defaultKind = "") {
  if (ref && typeof ref === "object") {
    if (ref.ref) {
      const explicitCaption = ref.caption || "";
      const base = resolveMaterial(ref.ref, "", ref.kind || defaultKind || "image") || {};
      return {
        ...base,
        ...ref,
        key: base?.key ?? ref.ref,
        caption: explicitCaption,
        url: ref.url ?? base?.url,
        src: ref.src ?? base?.src,
        value: ref.value ?? base?.value,
        kind: inferMaterialKind(ref.url ?? ref.src ?? ref.content ?? ref.body ?? ref.text ?? ref.value ?? base?.url ?? base?.value ?? "", ref.kind || base?.kind),
      };
    }
    const value = ref.url ?? ref.src ?? ref.content ?? ref.body ?? ref.text ?? ref.value ?? "";
    return {
      ...ref,
      kind: inferMaterialKind(value, ref.kind),
    };
  }

  const key = String(ref ?? "").trim();
  if (!key) return null;
  const asset = app.lesson.assets?.[key];
  if (asset && typeof asset === "object") {
    const value = asset.url ?? asset.src ?? asset.content ?? asset.body ?? asset.text ?? asset.value ?? "";
    const kind = inferMaterialKind(value, asset.kind);
    if (kind === "text") {
      return {
        key,
        ...asset,
        kind,
      };
    }
    return {
      key,
      ...asset,
      kind,
      caption: alt,
    };
  }
  const value = asset || key;
  let kind = inferMaterialKind(value);
  if (defaultKind && kind === "text" && !/^text:/i.test(value) && !/^["“]/.test(value)) kind = defaultKind;
  if (kind === "text") {
    const parsed = parseTextCutoutContent(stripTextMarker(value));
    return { key, kind, headline: alt || parsed.headline, body: parsed.body, source: parsed.source };
  }
  return { key, kind, url: value, caption: alt };
}

function asArray(value) {
  return Array.isArray(value) ? value : [value];
}

function normalizeLayout(layout) {
  if (layout === "row" || layout === "grid") return "row";
  if (layout === "figure") return "figure";
  return "stack";
}
