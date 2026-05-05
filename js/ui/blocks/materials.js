import { app } from "../../state.js";
import { escapeHtml, extractYouTubeId, formatInline, inferMaterialKind, parseTextCutoutContent, stripTextMarker } from "../../utils.js";
import { buildImage, buildVideoThumb } from "./media.js";
import { asArray, normalizeLayout } from "./shared.js";

const linkPreviewCache = new Map();
export function appendMaterials(parent, materials, layout = "stack") {
  if (!materials || !asArray(materials).length) return;
  parent.appendChild(buildMaterials(materials, layout, "materials--embedded"));
}

export function buildMaterials(materials, layout = "stack", extraClass = "") {
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

export function isVisualMaterial(material) {
  return material.kind === "image" || material.kind === "video";
}

export function prepareBalancedMaterial(el, material, wrap) {
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

export function setMaterialAspect(el, aspect, wrap) {
  el.style.setProperty("--material-aspect", String(aspect));
  updateBalancedMaterialColumns(wrap);
}

export function updateBalancedMaterialColumns(wrap) {
  const columns = [...wrap.children].map(child => {
    const aspect = Number.parseFloat(child.style.getPropertyValue("--material-aspect"));
    return `${Number.isFinite(aspect) && aspect > 0 ? aspect : 1}fr`;
  });
  if (columns.length) wrap.style.gridTemplateColumns = columns.join(" ");
}

export function buildMaterial(material) {
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
    return buildLinkMaterial(material.url || material.src || material.value || material.key, {
      title: material.title || material.key || "",
      caption: material.caption || "",
    });
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

export function buildLinkMaterial(url, options = {}) {
  const href = String(url || "").trim();
  const config = typeof options === "string"
    ? { title: options, caption: "" }
    : options || {};
  const canEmbed = /^https?:\/\//i.test(href);
  const article = document.createElement("article");
  article.className = "material material--link-card material--link-embed";
  article.dataset.url = href;

  let host = href;
  try {
    host = new URL(href).hostname.replace(/^www\./, "");
  } catch { }
  const title = config.title || host || href;
  const caption = config.caption || "";

  article.innerHTML = `
    ${canEmbed ? `
      <div class="material-link-card__embed" aria-label="${escapeHtml(title)} 미리보기">
        <iframe
          class="material-link-card__iframe"
          src="${escapeHtml(href)}"
          title="${escapeHtml(title)}"
          loading="lazy"
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-top-navigation-by-user-activation"
          referrerpolicy="no-referrer-when-downgrade"
        ></iframe>
        <div class="material-link-card__fallback">
          <span>이 자료는 현재 화면에서 바로 열리지 않을 수 있습니다.</span>
        </div>
      </div>
    ` : ""}
    <a class="material-link-card__anchor" href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">
      <span class="material-link-card__body">
        <span class="material-link-card__title">${escapeHtml(title)}</span>
        <span class="material-link-card__desc">${escapeHtml(host || "")}</span>
        <span class="material-link-card__url">${escapeHtml(href)}</span>
      </span>
      <span class="material-link-card__thumb" hidden></span>
      <span class="material-link-card__footer">
        ${caption ? `<span class="material-link-card__caption">${escapeHtml(caption)}</span>` : ""}
        <span class="material-link-card__action">새 창으로 열기</span>
      </span>
    </a>
  `;
  const iframe = article.querySelector(".material-link-card__iframe");
  if (iframe) {
    const fallbackTimer = globalThis.setTimeout(() => {
      if (!article.classList.contains("is-embed-loaded")) article.classList.add("is-embed-fallback");
    }, 3500);
    iframe.addEventListener("load", () => {
      globalThis.clearTimeout(fallbackTimer);
      article.classList.add("is-embed-loaded");
      article.classList.remove("is-embed-fallback");
    }, { once: true });
    iframe.addEventListener("error", () => {
      globalThis.clearTimeout(fallbackTimer);
      article.classList.add("is-embed-fallback");
    }, { once: true });
  }
  hydrateLinkPreview(article, href, config.title || "");
  return article;
}

export function hydrateLinkPreview(card, href, label = "") {
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

export function getLinkPreview(href) {
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

export function buildVideoMaterial(url, caption = "") {
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

export function buildTextCutout(block) {
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

export function resolveMaterial(ref, alt = "", defaultKind = "") {
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
