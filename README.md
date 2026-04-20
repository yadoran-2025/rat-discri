# 수업용 프리젠터

Notion 지도안을 기반으로 한 수업용 웹 프리젠터.
교실 빔프로젝터에 띄워놓고 키보드로 진행하며, 답은 숨김 처리되어 교사가 원할 때 공개합니다.

## 구조

```
teaching-materials/
├── index.html                  # 셸 (레이아웃)
├── style.css                   # 디자인 시스템
├── app.js                      # 렌더링 + 인터랙션
├── lessons/
│   ├── rat-disc-1.json         # 합리적 차별 금지 1차시
│   └── rat-disc-2.json         # 합리적 차별 금지 2차시
├── assets/
│   └── images/
│       └── rational-discrimination/
└── README.md
```

**한 파일 = 한 차시**. 같은 주제의 차시들은 `lessonGroup` 필드로 묶이고, `prev`/`next`로 연결됩니다.

## 로컬 실행

```bash
python3 -m http.server 8000
```

브라우저에서 `http://localhost:8000` 접속 (기본 `rat-disc-1` 로드).

## GitHub Pages 배포

1. 이 폴더를 GitHub 저장소로 push (파일들이 저장소 루트에 있어야 함)
2. 저장소 Settings → Pages → Source: `main` 브랜치 `/ (root)`
3. 몇 분 뒤 `https://[계정명].github.io/[저장소명]/`로 접속

## URL 파라미터

- `?lesson=rat-disc-1` — 1차시 (기본)
- `?lesson=rat-disc-2` — 2차시
- `#1-3` — 특정 섹션으로 바로 점프

예: `https://yadoran-2025.github.io/rat-disc/?lesson=rat-disc-2#2-1`

## 조작법

- `←` `→` 또는 `PageUp` `PageDown`: 섹션 이동
- `Space` 또는 `Enter`: 현재 화면의 답 토글
- 답 박스 클릭: 해당 답만 토글
- 좌측 목차 클릭: 해당 섹션으로 점프
- 사이드바 하단 "다음 차시 →": 다음 차시로 이동

## 이미지 배치

파일명은 `assets/images/rational-discrimination/` 아래에:

**1차시**
| 파일명 | 용도 |
|---|---|
| `1-1-math-a.jpg` / `1-1-math-b.jpg` | 수학문제 Q |
| `1-1-vocal-a.webp` / `1-1-vocal-b.jpg` | 보컬 Q |
| `1-1-appearance-a.png` / `1-1-appearance-b.png` | 지적 능력 Q |
| `1-1-allport.jpg` | 올포트 초상 |
| `1-3-dworkin.jpg` | 드워킨 초상 (1-3, 1-4 재사용) |
| `1-4-constitution.png` | 헌법 차별금지영역 |
| `1-4-nhrc-law.png` | 국가인권위원회법 |

**2차시**
| 파일명 | 용도 |
|---|---|
| `2-1-objection.png` | 학생 반문 이미지 |
| `2-2-minority-a.jpg` / `b.jpg` / `c.jpg` | 사회적 소수자 관련 |

이미지가 없으면 "이미지: 파일명" 플레이스홀더가 표시됩니다.

## 새 수업 추가하기

**같은 주제의 다른 차시**: `lessons/rat-disc-3.json` 같은 파일 만들고 `prev`/`next` 체인에 연결.

**새 주제의 수업**: `lessons/new-topic.json` 만들고 이미지 폴더도 별도 추가. URL은 `?lesson=new-topic`.

JSON 최상위 필드:

```json
{
  "id": "파일명과 동일",
  "lessonGroup": "상위 수업 그룹명 (선택)",
  "title": "1차시: 제목",
  "subtitle": "부제목",
  "imageBase": "assets/images/폴더명/",
  "prev": "이전_차시_id 또는 null",
  "next": "다음_차시_id 또는 null",
  "sections": [...]
}
```

## 블록 타입

- `paragraph` — 일반 단락
- `heading` — 섹션 내부 소제목
- `case` — 🟩 초록 사례 박스 (답 토글 가능)
- `question` — 🗨️ 파란 질문 박스 (여러 하위 질문, 이미지쌍, 결론)
- `concept` — 💡 회색 개념 정의 (제목, 본문, 불릿, 이미지)
- `figure-concept` — 인물 사진 + 개념 정의
- `figure-quote` — 인물 사진 + 인용문
- `image-row` — 이미지 여러 개 가로 나열
- `expandable` — 접어둘 수 있는 하위 블록 모음
- `summary` — 차시 요약 (번호 목록)

본문에서 `**볼드**`는 강조로, 줄바꿈은 그대로 렌더됩니다.
