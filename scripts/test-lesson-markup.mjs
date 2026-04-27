import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const source = readFileSync(new URL("../js/lesson-markup.js", import.meta.url), "utf8")
  .replace(/^export /gm, "");
const sandbox = {};
vm.runInNewContext(`${source}\nthis.parseLessonMarkup = parseLessonMarkup;`, sandbox);
const { parseLessonMarkup } = sandbox;
const assertJsonEqual = (actual, expected) => {
  assert.equal(JSON.stringify(actual), JSON.stringify(expected));
};

const sample = `
## 장 제목
### 절 제목
일반 문단 *강조*
%부연%

[[alpha]] ~ [[beta]]

[[https://example.com/article]]

{{인용 내용}}

{{인용 A}} ~ {{인용 B}}

[[alpha]] ~ {{혼합 인용}}

[사례
사례 본문
---
사례 두 번째 문단
%출처처럼 보이지만 통합 보조문%
[[case-img]]
{{사례 안 인용}}
[[https://example.com/block-link]]
자료 뒤 본문
<a>
정답 1
정답 2
</a>
<c>
</c>
]

[발문
질문입니다.
[[question-ref]]
<a>
답입니다.
</a>
]

>>
접어둘 내용
>>

\`\`\`
텍스트박스 내용
\`\`\`

<p>
250611[경제]
해설입니다.
</p>
`;

const parsed = parseLessonMarkup(sample);
assert.equal(parsed.errors.length, 0);

const paragraphWithBlankLine = parseLessonMarkup(`즉, 모든 영역에서 차별을 금지하는 것은,
다르게 말하면 네가 누구를 좋아하고 싫어하는 것도 국가가 규제한다는 말이다.
이런 것은 우리가 기대하는 정상적인 상태는 아닐 것이다.

그렇다고, 차별을 금지하지 않을 수 있을까?`);
assert.equal(paragraphWithBlankLine.blocks.length, 1);
assert.equal(paragraphWithBlankLine.blocks[0].type, "단락");
assert.equal(
  paragraphWithBlankLine.blocks[0].text,
  "즉, 모든 영역에서 차별을 금지하는 것은,\n다르게 말하면 네가 누구를 좋아하고 싫어하는 것도 국가가 규제한다는 말이다.\n이런 것은 우리가 기대하는 정상적인 상태는 아닐 것이다.\n\n그렇다고, 차별을 금지하지 않을 수 있을까?"
);

const explicitDivider = parseLessonMarkup(`문장 1

---

문장 2`);
assertJsonEqual(explicitDivider.blocks.map(block => block.type), ["단락", "구분선", "단락"]);

assert.equal(parsed.blocks[0].type, "소제목");
assert.equal(parsed.blocks[1].type, "절");
assertJsonEqual(parsed.blocks[2].asides, ["부연"]);
assertJsonEqual(parsed.blocks[3], {
  type: "미디어",
  layout: "row",
  items: ["alpha", "beta"],
});
assertJsonEqual(parsed.blocks[4], {
  type: "미디어",
  layout: "stack",
  items: ["https://example.com/article"],
});
assertJsonEqual(parsed.blocks[5], {
  type: "인용",
  body: "인용 내용",
});
assertJsonEqual(parsed.blocks[6], {
  type: "그룹",
  layout: "row",
  items: [
    { type: "인용", body: "인용 A" },
    { type: "인용", body: "인용 B" },
  ],
});
assertJsonEqual(parsed.blocks[7], {
  type: "그룹",
  layout: "row",
  items: [
    "alpha",
    { type: "인용", body: "혼합 인용" },
  ],
});

const caseBlock = parsed.blocks.find(block => block.type === "사례");
assert.equal(caseBlock.body, "사례 본문\n\n사례 두 번째 문단\n\n자료 뒤 본문");
assertJsonEqual(caseBlock.asides, ["출처처럼 보이지만 통합 보조문"]);
assertJsonEqual(caseBlock.materials, ["case-img", "https://example.com/block-link"]);
assertJsonEqual(caseBlock.flow.map(item => item.type), ["text", "divider", "text", "materials", "quote", "materials", "text", "answer"]);
assert.equal(caseBlock.flow[4].body, "사례 안 인용");
assertJsonEqual(caseBlock.flow[5].items, ["https://example.com/block-link"]);
assert.equal(caseBlock.flow[6].text, "자료 뒤 본문");
assertJsonEqual(caseBlock.flow[7].answer, ["정답 1", "정답 2"]);
assert.equal(caseBlock.materialsLayout, undefined);
assertJsonEqual(caseBlock.answer, ["정답 1", "정답 2"]);
assert.equal(caseBlock.comments, true);

const multiAnswerCase = parseLessonMarkup(`[사례
첫 번째 내용
<a>
첫 번째 답
</a>

두 번째 내용
<a>
두 번째 답
</a>
]`).blocks[0];
assertJsonEqual(multiAnswerCase.flow.map(item => item.type), ["text", "answer", "text", "answer"]);
assert.equal(multiAnswerCase.flow[1].answer, "첫 번째 답");
assert.equal(multiAnswerCase.flow[3].answer, "두 번째 답");

const question = parsed.blocks.find(block => block.type === "발문");
assert.equal(question.prompts[0].q, "질문입니다.");
assertJsonEqual(question.prompts[0].materials, ["question-ref"]);
assert.equal(question.prompts[0].answer, "답입니다.");

const multiAnswerQuestion = parseLessonMarkup(`[발문
1. 첫 번째 질문
<a>
첫 번째 답
</a>

2. 두 번째 질문
<a>
- 두 번째 답 1
- 두 번째 답 2
</a>
]`).blocks[0];
assert.equal(multiAnswerQuestion.prompts.length, 2);
assert.equal(multiAnswerQuestion.prompts[0].q, "1. 첫 번째 질문");
assert.equal(multiAnswerQuestion.prompts[0].answer, "첫 번째 답");
assert.equal(multiAnswerQuestion.prompts[1].q, "2. 두 번째 질문");
assertJsonEqual(multiAnswerQuestion.prompts[1].answer, ["- 두 번째 답 1", "- 두 번째 답 2"]);

assert.equal(parsed.blocks.find(block => block.type === "토글").body, "접어둘 내용");
assert.equal(parsed.blocks.find(block => block.type === "텍스트박스").body, "텍스트박스 내용");

const oldQuoteFence = parseLessonMarkup('"""\n옛 인용\n"""');
assert.equal(oldQuoteFence.blocks.some(block => block.type === "인용"), false);

const malformedQuote = parseLessonMarkup("{{닫히지 않은 인용");
assert.equal(malformedQuote.errors.length, 1);

const exam = parsed.blocks.find(block => block.type === "기출문제");
assert.equal(exam.items[0].image, "250611[경제]");
assert.equal(exam.items[0].answer, "해설입니다.");

const nested = parseLessonMarkup("[사례\n[개념\n본문\n]\n]");
assert.equal(nested.errors.length, 1);

const unclosed = parseLessonMarkup("[사례\n본문");
assert.equal(unclosed.errors.length, 0);
assert.equal(unclosed.warnings.length, 1);

console.log("lesson markup parser tests passed");
