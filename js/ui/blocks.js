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

/**
 * 블록 디스패처: 타입에 맞는 렌더러 호출
 *
 * 블록 타입 목록:
 *   소제목, 단락            — 기본 텍스트
 *   사례, 발문, 개념        — 콜아웃
 *   이미지곁글              — 이미지 + 텍스트 좌우 배치
 *   미디어                  — 이미지·영상·텍스트박스
 *   기출문제                — 수능 문제 아코디언
 */
export function renderBlock(block, blockIdx) {
  const map = {
    단락:      renderParagraph,
    소제목:    renderHeading,
    구분선:    () => null,
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
  const p = document.createElement("p");
  p.className = "block paragraph";
  p.innerHTML = formatInline(block.text);
  return p;
}

function renderHeading(block) {
  const h = document.createElement("h2");
  h.className = "block section-sub-heading";
  h.innerHTML = formatInline(block.text || "");
  return h;
}

export function renderDivider() {
  const hr = document.createElement("hr");
  hr.className = "block divider";
  return hr;
}

/* ── 콜아웃 (사례·개념·news 통합 렌더러) ── */

/**
 * [P1] 통합 콜아웃 렌더러
 * style: "case" | "concept" | "news"
 * 필드: title(=label), body(=text), footer(=sub/source)
 */
function renderCallout(block, defaultStyle) {
  const style = block.style ?? defaultStyle;

  if (style === "news") {
    const tc = buildTextCutout(block);
    tc.classList.add("block");
    return tc;
  }

  const title  = block.title  ?? block.label ?? null;
  const body   = block.body   ?? block.text  ?? null;
  const footer = style === "concept" ? null : block.footer ?? block.sub ?? null;

  const div = document.createElement("div");
  div.className = `block callout ${style}`;

  let html = "";
  if (style === "concept") {
    if (title)         html += `<div class="concept__title">💡 ${escapeHtml(title)}</div>`;
    if (body)          html += `<div class="concept__body">${formatInline(body)}</div>`;
  } else {
    if (title)  html += `<div class="callout__label">${escapeHtml(title)}</div>`;
    if (body)   html += `<div class="case__text">${formatInline(body)}</div>`;
    if (footer) html += `<div class="case__sub">${formatInline(footer)}</div>`;
  }
  div.innerHTML = html;

  appendMaterials(div, block.materials, block.materialsLayout);
  if (block.answer) div.appendChild(buildAnswer(block.answer));
  return div;
}

function renderCase(block, blockIdx) {
  const div = renderCallout(block, "case");

  if (!block.comments) return div;

  const lessonId = app.lesson.id || app.lesson.title || "lesson";
  const sectionId = app.lesson.sections[app.currentIdx]?.id || `sec${app.currentIdx}`;
  const commentKey = `${lessonId}__${sectionId}__b${blockIdx ?? 0}__p0`;
  const wrapper = document.createElement("div");
  wrapper.className = "case-with-comments";
  div.classList.remove("block");
  wrapper.appendChild(div);
  appendCommentSection(wrapper, commentKey, "case");
  return wrapper;
}

function renderQuestion(block, blockIdx) {
  const lessonId = app.lesson.id || app.lesson.title || "lesson";
  const sectionId = app.lesson.sections[app.currentIdx]?.id || `sec${app.currentIdx}`;
  const bIdx = blockIdx ?? 0;

  const div = document.createElement("div");
  div.className = "block callout question";
  div.innerHTML = `<div class="callout__label">🗨️ 생각해볼 문제</div>`;

  const commentSections = [];

  block.prompts.forEach((pr, promptIdx) => {
    const p = document.createElement("div");
    p.className = "question__prompt";
    p.innerHTML = `Q. ${formatInline(pr.q)}`;
    if (pr.note) p.innerHTML += `<div class="question__note">${formatInline(pr.note)}</div>`;
    div.appendChild(p);
    appendMaterials(div, pr.materials, pr.materialsLayout);

    // answer는 항상 { text } 또는 { bullets } 객체
    if (pr.answer) div.appendChild(buildAnswer(pr.answer, "답 보기"));

    if (block.comments) {
      const commentKey = `${lessonId}__${sectionId}__b${bIdx}__p${promptIdx}`;
      commentSections.push({
        key: commentKey,
        label: block.prompts.length > 1
          ? `💬 Q${promptIdx + 1} 학생 답변 보기`
          : "💬 학생 답변 보기",
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

function renderConcept(block) {
  return renderCallout(block, "concept");
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
      <div class="concept__title">💡 ${escapeHtml(block.title || "")}</div>
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
 * media — 이미지·영상·텍스트박스 통합 블록
 *
 * kind: "row"   — 이미지 여러 장 가로 나열 (구 image-row)
 * kind: "image" — 캡션 있는 단독 이미지
 * kind: "video" — 유튜브 썸네일 링크 (구 video-link)
 * kind: "text"  — 신문기사 스타일 텍스트박스 (구 text: 접두사)
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
    let html = "<ul>";
    answer.forEach(b => { html += `<li>${formatInline(b)}</li>`; });
    html += "</ul>";
    content.innerHTML = html;
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
