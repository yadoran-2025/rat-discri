import { root } from "./state.js";

export function renderShell() {
  root.innerHTML = `
    <div class="author">
      <header class="author__topbar">
        <div class="author__brand">
          <a class="author__back" href="index.html" aria-label="대시보드로 이동">←</a>
          <div>
            <h1 class="author__title">BNG LANG 에디터</h1>
            <div class="author__subtitle">BNG LANG(붕랭) 문법으로 수업 정보, 섹션, 블록을 구성하고 발표용 JSON을 생성합니다.</div>
          </div>
        </div>
        <div class="author__actions">
          <label class="save-slot-picker">
            <span>저장칸</span>
            <select id="save-slot-select">
            </select>
          </label>
          <button class="btn" type="button" data-action="save-local">작업 저장</button>
          <details class="save-slot-menu">
            <summary class="btn">저장본 불러오기</summary>
            <div class="save-slot-menu__list" id="saved-slot-list"></div>
          </details>
        </div>
      </header>

      <div class="author__layout">
        <div class="author__panel">
          <section class="panel">
            <div class="panel__head">
              <h2 class="panel__title">수업 정보</h2>
            </div>
            <div class="panel__body">
              <div id="meta-editor"></div>
            </div>
          </section>

          <section class="panel">
            <div class="panel__head">
              <h2 class="panel__title">섹션과 블록</h2>
              <div class="inline-tools">
                <button class="btn btn--sm" type="button" data-action="add-section">섹션 추가</button>
              </div>
            </div>
            <div class="panel__body">
              <div id="section-editor"></div>
            </div>
          </section>

          <section class="panel">
            <div class="panel__head">
              <h2 class="panel__title">생성된 JSON</h2>
            </div>
            <div class="panel__body">
              <textarea id="json-output" class="json-output" readonly spellcheck="false"></textarea>
            </div>
          </section>
        </div>

        <aside class="author__preview">
          <section class="panel">
            <div class="preview-toolbar">
              <h2 class="panel__title">실시간 미리보기</h2>
            </div>
            <div class="preview-stage">
              <div id="preview-errors"></div>
              <div id="main-content"></div>
            </div>
          </section>
        </aside>
      </div>

      <section class="panel asset-search" id="asset-search">
        <div class="panel__head">
          <h2 class="panel__title">외부 자료 목록</h2>
          <button class="btn btn--sm" type="button" data-action="close-assets">닫기</button>
        </div>
        <div class="asset-search__body">
          <div class="asset-target-note" id="asset-target-note"></div>
          <div class="asset-source-tabs" id="asset-source-tabs"></div>
          <input class="asset-search__input" id="asset-query" type="search" placeholder="키, 설명, 키워드로 검색" autocomplete="off">
          <div class="asset-search__bar" id="asset-search-bar"></div>
          <div class="asset-filter-toolbar" id="asset-filter-toolbar"></div>
          <div id="asset-upload-panel"></div>
          <div class="asset-results" id="asset-results"></div>
        </div>
      </section>
    </div>
  `;
}
