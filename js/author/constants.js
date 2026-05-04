export { ASSET_UPLOAD_ENDPOINT, EXTERNAL_ASSETS_CACHE_KEY } from "../asset-config.js";
export const BLOCK_TYPE_GROUPS = [
  ["기본", ["소제목", "단락"]],
  ["활동", ["사례", "발문", "개념", "댓글"]],
  ["자료·문제", ["미디어", "기출문제"]],
];
export const BLOCK_TYPES = BLOCK_TYPE_GROUPS.flatMap(([, types]) => types);
export const LEGACY_BLOCK_TYPES = ["이미지곁글"];
export const LOCAL_CACHE_KEY = "lessonAuthorDraft_v2";
export const LOCAL_SLOT_CACHE_KEY = "lessonAuthorDraftSlots_v1";
export const LOCAL_SAVE_SLOTS = [
  ["slot-1", "저장칸 1"],
  ["slot-2", "저장칸 2"],
  ["slot-3", "저장칸 3"],
  ["slot-4", "저장칸 4"],
  ["slot-5", "저장칸 5"],
];
export const LAYOUT_OPTIONS = [["stack", "아래로 나열"], ["row", "옆으로 나열"], ["figure", "사진+인용"]];
export const TEXT_FORMAT_HINT = "`### 절`은 작은 제목으로, `*굵게*`와 `%기울임%`은 보편 문법으로 표시됩니다.";
export const MARKUP_GUIDE_TEXT = `## 장 제목
### 절 제목

일반 문단은 그대로 씁니다.
- 불릿
  - 2단 불릿
*굵게*
%기울임체%

[사례
사례 본문
[[자료키]]
[[자료키==캡션]]
{{텍스트 박스;;둘째 줄}}
<답>
답 보기 내용
</답>
]

[발문
질문 내용
<댓>
]

[개념
개념 설명
[[자료1]] ~ [[자료2]]
]

[문제
문제이미지키
<답>
해설 내용
</답>
]

---
구분선`;
