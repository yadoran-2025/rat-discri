/**
 * Firebase key 정규화
 * Firebase path 금지문자: . # $ [ ] / 및 공백
 */
export function toFbKey(str) {
  if (!str) return "_empty_";
  return String(str).replace(/[.#$[\]\/\s]/g, "_");
}

/**
 * 시험문제 파일명 파싱
 * 예: 250611[사문] -> 2025학년도 6월 11번 [사문]
 */
export function parseExamTitle(filename) {
  const regex = /^(\d{2})(\d{2})(\d{2})\[(.*)\]$/;
  const match = filename.match(regex);
  if (!match) return filename;

  const [_, yy, mm, nn, subject] = match;
  const year = `20${yy}학년도`;
  const month = `${parseInt(mm, 10)}월`;
  const num = `${parseInt(nn, 10)}번`;
  return `${year} ${month} ${num} [${subject}]`;
}

/**
 * YouTube URL에서 비디오 ID 추출
 */
export function extractYouTubeId(url) {
  try {
    const u = new URL(url);
    if (u.searchParams.has("v")) return u.searchParams.get("v");
    if (u.hostname === "youtu.be") return u.pathname.slice(1);
    const m = u.pathname.match(/^\/embed\/([^/?]+)/);
    if (m) return m[1];
  } catch (_) { }
  return null;
}

/**
 * 인라인 텍스트 포맷팅 (강조, 줄바꿈, 마크다운 불릿)
 * - **굵게** → <strong>
 * - \n → <br>
 * - "- " 로 시작하는 줄 → <ul class="md-list"><li>
 * - "  - " (스페이스 2칸) 로 시작하는 줄 → 중첩 <ul> (1단 깊이)
 */
export function formatInline(text) {
  if (!text) return "";

  const lines = text.split("\n");
  const inline = s => escapeHtml(s).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");

  let out = "";
  let inUl = false;
  let topLiOpen = false;
  let inSubUl = false;

  const closeSubUl  = () => { if (inSubUl)   { out += "</ul>";  inSubUl   = false; } };
  const closeTopLi  = () => { closeSubUl();    if (topLiOpen) { out += "</li>"; topLiOpen = false; } };
  const closeOuterUl = () => { closeTopLi();   if (inUl)      { out += "</ul>"; inUl      = false; } };

  for (const line of lines) {
    const subMatch = line.match(/^ {2}- (.*)/);
    const topMatch = !subMatch && line.match(/^- (.*)/);

    if (topMatch) {
      closeTopLi();
      if (!inUl) { if (out) out += "<br>"; out += '<ul class="md-list">'; inUl = true; }
      out += `<li>${inline(topMatch[1])}`;
      topLiOpen = true;
    } else if (subMatch) {
      if (!inUl) { if (out) out += "<br>"; out += '<ul class="md-list">'; inUl = true; }
      if (!inSubUl) { out += '<ul class="md-list">'; inSubUl = true; }
      out += `<li>${inline(subMatch[1])}</li>`;
    } else {
      closeOuterUl();
      out += (out ? "<br>" : "") + inline(line);
    }
  }
  closeOuterUl();
  return out;
}

/**
 * HTML 이스케이프
 */
export function escapeHtml(s) {
  if (s == null) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
