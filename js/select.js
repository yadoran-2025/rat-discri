const SHEET_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQYkmQF4OJAcQN2FXGrmjYZP1Kr4geSX3t3O2ArB0_ntOqbvfgRzuoRwKSG--c3czenNUzyBVpW_f1R/pub?output=csv';

let allKeys = [];
const selected = new Set();
const keyDataMap = {}; // 키별 메타데이터 저장용

document.addEventListener('DOMContentLoaded', async () => {
    const listEl = document.getElementById('key-list');

    try {
        const csvText = await fetch(SHEET_URL).then(r => {
            if (!r.ok) throw new Error('시트를 불러오지 못했습니다 (' + r.status + ')');
            return r.text();
        });
        allKeys = parseSheetKeys(csvText);
        if (allKeys.length === 0) {
            listEl.innerHTML = '<div class="sel-no-results">시트에 표시할 문제가 없습니다.</div>';
            renderToc({});
            return;
        }
        renderList(allKeys);
    } catch (e) {
        listEl.innerHTML = '<div class="sel-no-results">불러오기 실패: ' + e.message + '</div>';
        renderToc({});
        return;
    }

    document.getElementById('search').addEventListener('input', () => renderList(getFilteredKeys()));
    document.getElementById('btn-select-all').addEventListener('click', () => {
        getFilteredKeys().forEach(k => selected.add(k));
        renderList(getFilteredKeys());
        updateBar();
    });
    document.getElementById('btn-deselect-all').addEventListener('click', () => {
        getFilteredKeys().forEach(k => selected.delete(k));
        renderList(getFilteredKeys());
        updateBar();
    });
    document.getElementById('btn-clear-selected').addEventListener('click', () => {
        selected.clear();
        renderList(getFilteredKeys());
        updateBar();
    });
    document.getElementById('btn-print').addEventListener('click', goPrint);
    updateBar();
});

/* ── CSV 파싱 ── */
function parseSheetKeys(csvText) {
    const keys = [];
    const lines = csvText.split(/\r?\n/);
    lines.forEach((line, idx) => {
        if (idx === 0 || !line.trim()) return;
        const cells = parseCsvLine(line);
        const key = cells[0] ? cells[0].replace(/^"|"$/g, '').trim() : '';
        const url = cells[1] ? cells[1].replace(/^"|"$/g, '').trim() : '';
        const kwRaw = cells[2] ? cells[2].replace(/^"|"$/g, '').trim() : '';
        const keywords = kwRaw.split(',').map(s => s.trim()).filter(Boolean);

        if (key && url) {
            keys.push(key);
            keyDataMap[key] = { keywords };
        }
    });
    return keys;
}

function parseCsvLine(line) {
    const cells = [];
    let curr = '', inQ = false;
    for (let i = 0; i < line.length; i++) {
        const c = line[i];
        if (c === '"') { inQ = !inQ; }
        else if (c === ',' && !inQ) { cells.push(curr.trim()); curr = ''; }
        else { curr += c; }
    }
    cells.push(curr.trim());
    return cells;
}

/* ── 키 메타 파싱 ── */
function parseKeyMeta(key) {
    const tagMatch    = key.match(/[\[(（]\s*([^\]\)）]+?)\s*[\])）]/);
    const prefixMatch = key.match(/^(\d{4})/); // 앞 4자리 = YYMM
    return {
        tag:    tagMatch    ? tagMatch[1]    : '기타',
        prefix: prefixMatch ? prefixMatch[1] : '기타',
    };
}

function formatPrefix(prefix) {
    if (prefix === '기타') return '기타';
    const yy = prefix.slice(0, 2);
    const mm = parseInt(prefix.slice(2, 4), 10);
    return "'" + yy + '년 ' + mm + '월';
}

/* ── 그룹핑: { tag: { prefix: [keys] } } ── */
function groupKeys(keys) {
    const groups = {};
    keys.forEach(key => {
        const { tag, prefix } = parseKeyMeta(key);
        if (!groups[tag]) groups[tag] = {};
        if (!groups[tag][prefix]) groups[tag][prefix] = [];
        groups[tag][prefix].push(key);
    });
    Object.values(groups).forEach(subGroups =>
        Object.values(subGroups).forEach(arr => arr.sort())
    );
    return groups;
}

/* ── 렌더링 ── */
function renderList(keys) {
    const container = document.getElementById('key-list');
    const groups = groupKeys(keys);
    renderToc(groups);

    if (Object.keys(groups).length === 0) {
        container.innerHTML = '<div class="sel-no-results">검색 결과가 없습니다.</div>';
        return;
    }

    container.innerHTML = '';

    for (const [groupName, subGroups] of Object.entries(groups)) {
        const allGroupKeys = Object.values(subGroups).flat();
        const groupEl = document.createElement('div');
        groupEl.className = 'sel-group';
        groupEl.id = 'sel-group-' + encodeId(groupName);

        // 메인 그룹 헤드
        const gcId = 'gc-' + encodeId(groupName);
        const head = document.createElement('div');
        head.className = 'sel-group__head';
        const groupCountClass = allGroupKeys.some(k => selected.has(k)) ? 'sel-group__count' : 'sel-group__count is-empty';
        head.innerHTML =
            '<span class="sel-group__label">' +
                '<span class="sel-group__dot" style="background:' + groupColor(groupName) + '"></span>' +
                '<span class="sel-group__name">' + escHtml(groupName) + '</span>' +
                '<span class="' + groupCountClass + '" id="' + gcId + '">' + countText(allGroupKeys) + '</span>' +
            '</span>' +
            '<span class="sel-group__chevron">▼</span>';
        head.addEventListener('click', () => groupEl.classList.toggle('collapsed'));

        // 메인 그룹 바디 (서브그룹 컨테이너)
        const body = document.createElement('div');
        body.className = 'sel-group__body';

        for (const [prefix, subKeys] of Object.entries(subGroups)) {
            const subEl = document.createElement('div');
            subEl.className = 'sel-subgroup';
            subEl.id = groupEl.id + '-' + encodeId(prefix);

            const sgcId = gcId + '-' + encodeId(prefix);
            const subHead = document.createElement('div');
            subHead.className = 'sel-subgroup__head';
            subHead.innerHTML =
                '<span class="sel-subgroup__label">' +
                    formatPrefix(prefix) +
                    '<span class="sel-subgroup__count" id="' + sgcId + '">' + countText(subKeys) + '</span>' +
                '</span>' +
                '<span class="sel-subgroup__chevron">▼</span>';
            subHead.addEventListener('click', () => subEl.classList.toggle('collapsed'));

            const subBody = document.createElement('div');
            subBody.className = 'sel-subgroup__body';

            subKeys.forEach(key => {
                const item = document.createElement('label');
                item.className = 'sel-item' + (selected.has(key) ? ' selected' : '');

                const cb = document.createElement('input');
                cb.type = 'checkbox';
                cb.value = key;
                cb.checked = selected.has(key);

                const info = document.createElement('span');
                let keyHtml = '<div class="sel-item__key">' + escHtml(key);
                
                const data = keyDataMap[key];
                if (data && data.keywords && data.keywords.length > 0) {
                    data.keywords.forEach(kw => {
                        keyHtml += '<span class="tag-badge">' + escHtml(kw) + '</span>';
                    });
                }
                keyHtml += '</div>';
                info.innerHTML = keyHtml;

                cb.addEventListener('change', () => {
                    if (cb.checked) selected.add(key); else selected.delete(key);
                    item.classList.toggle('selected', cb.checked);
                    updateBar();
                    refreshCount(sgcId, subKeys);
                    refreshCount(gcId, allGroupKeys);
                });

                item.appendChild(cb);
                item.appendChild(info);
                subBody.appendChild(item);
            });

            subEl.appendChild(subHead);
            subEl.appendChild(subBody);
            body.appendChild(subEl);
        }

        groupEl.appendChild(head);
        groupEl.appendChild(body);
        container.appendChild(groupEl);
    }
}

function renderToc(groups) {
    const toc = document.getElementById('sel-toc');
    if (!toc) return;

    const entries = Object.entries(groups);
    if (!entries.length) {
        toc.innerHTML = '<span class="sel-toc__empty">표시할 목차 없음</span>';
        return;
    }

    toc.innerHTML = entries.map(([groupName, subGroups]) => {
        const groupId = 'sel-group-' + encodeId(groupName);
        const groupCount = Object.values(subGroups).flat().length;
        const subItems = Object.entries(subGroups).map(([prefix, subKeys]) => {
            const subId = groupId + '-' + encodeId(prefix);
            return '' +
                '<button class="sel-toc__subitem" type="button" data-scroll-target="' + escHtml(subId) + '">' +
                    '<span>' + escHtml(formatPrefix(prefix)) + '</span>' +
                    '<em>' + subKeys.length + '</em>' +
                '</button>';
        }).join('');

        return '' +
            '<div class="sel-toc__group">' +
                '<button class="sel-toc__item" type="button" data-scroll-target="' + escHtml(groupId) + '">' +
                    '<span>' + escHtml(groupName) + '</span>' +
                    '<em>' + groupCount + '</em>' +
                '</button>' +
                subItems +
            '</div>';
    }).join('');

    toc.querySelectorAll('[data-scroll-target]').forEach(button => {
        button.addEventListener('click', () => {
            const target = document.getElementById(button.dataset.scrollTarget);
            if (!target) return;
            toc.querySelectorAll('.sel-toc__item').forEach(item => item.classList.remove('active'));
            const groupButton = button.closest('.sel-toc__group')?.querySelector('.sel-toc__item');
            if (groupButton) groupButton.classList.add('active');
            target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
    });

    const firstItem = toc.querySelector('.sel-toc__item');
    if (firstItem) firstItem.classList.add('active');
}

/* ── 카운트 ── */
function countText(keys) {
    const sel = keys.filter(k => selected.has(k)).length;
    return (sel > 0 ? sel + '/' : '') + keys.length + '개';
}

function refreshCount(id, keys) {
    const el = document.getElementById(id);
    if (el) {
        el.textContent = countText(keys);
        el.classList.toggle('is-empty', keys.every(k => !selected.has(k)));
    }
}

/* ── 유틸 ── */
function getFilteredKeys() {
    const q = document.getElementById('search').value.toLowerCase().trim();
    return q ? allKeys.filter(k => k.toLowerCase().includes(q)) : allKeys;
}

function updateBar() {
    const n = selected.size;
    document.getElementById('sel-count').innerHTML = '<strong>' + n + '개</strong> 선택됨';
    document.getElementById('btn-print').disabled = n === 0;
    renderSelectionChips();
}

function encodeId(str) {
    return str.replace(/[^a-zA-Z0-9가-힣]/g, '_');
}

function escHtml(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function renderSelectionChips() {
    const selectionBar = document.getElementById('sel-selection');
    const chipCount = document.getElementById('sel-chip-count');
    const chips = document.getElementById('sel-chips');
    if (!selectionBar || !chipCount || !chips) return;

    const ordered = allKeys.filter(k => selected.has(k));
    selectionBar.hidden = ordered.length === 0;
    chipCount.textContent = ordered.length + '개 선택됨';
    chips.innerHTML = ordered.map(key => (
        '<button class="sel-selection__chip" type="button" data-key="' + escHtml(key) + '" title="' + escHtml(key) + '">' +
            '<span>' + escHtml(key) + '</span><em>×</em>' +
        '</button>'
    )).join('');

    chips.querySelectorAll('[data-key]').forEach(button => {
        button.addEventListener('click', () => {
            selected.delete(button.dataset.key);
            renderList(getFilteredKeys());
            updateBar();
        });
    });
}

function groupColor(groupName) {
    const colors = ['#1D9E75', '#534AB7', '#D85A30', '#0E78C7', '#A8477D', '#6A7A22'];
    let hash = 0;
    for (let i = 0; i < groupName.length; i++) hash = (hash + groupName.charCodeAt(i) * (i + 1)) % colors.length;
    return colors[hash];
}

/* ── 인쇄 이동 ── */
function goPrint() {
    if (selected.size === 0) return;
    const ordered = allKeys.filter(k => selected.has(k));
    const header  = document.getElementById('header-input').value.trim();
    const params  = new URLSearchParams();
    params.set('keys', ordered.join(','));
    if (header) params.set('header', header);
    window.location.href = 'print.html?' + params.toString();
}
