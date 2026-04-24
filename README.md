# 🛵 사회교육플랫폼 BOOONG (Classroom Presenter)

Notion 지도안을 기반으로 한 수업용 웹 프리젠터입니다. 
교실 빔프로젝터에 최적화된 UI를 제공하며, 실시간 답변 공유 및 인터랙티브한 수업 진행을 지원합니다.

## 주요 특징
- **대시보드 메인**: 모든 수업 목록과 도구를 한눈에 관리하는 대시보드 제공.
- **실시간 피드백**: Firebase를 연동하여 학생들의 답변을 실시간으로 수집 및 공유.
- **모듈화된 디자인**: 스타일시트를 기능별로 분리하여 유지보수성 극대화.
- **멀티 미디어 지원**: 이미지, 유튜브 영상, 신문 기사 스타일의 텍스트 박스(Text-cutout) 지원.
- **인쇄 최적화**: 구글 스프레드시트 자료를 A4 레이아웃에 맞춰 자동 배치하여 출력.

---

## 📂 프로젝트 구조

```
rat-discri/
├── index.html          # 앱 메인 셸 및 대시보드
├── print.html          # 인쇄용 전용 페이지
├── css/                # 모듈화된 스타일시트
│   ├── base.css        # 디자인 토큰 및 리셋
│   ├── layout.css      # 메인 구조 및 사이드바
│   ├── components.css  # 공통 UI 컴포넌트
│   ├── features.css    # 특수 기능(포커스, 댓글 등)
│   └── dashboard.css   # 대시보드 전용 스타일
├── js/
│   ├── app.js          # 메인 앱 로직 및 대시보드 제어
│   └── print.js        # 인쇄 페이지 렌더링 로직
├── lessons/
│   ├── block-guide.json # 모든 블록 타입 가이드 (추천)
│   ├── rat-disc-1.json  # 수업 데이터 예시
│   └── ...
└── assets/             # 이미지 및 미디어 에셋
```

---

## 🚀 시작하기

### 로컬 실행
```bash
# 별도의 빌드 과정 없이 정적 서버로 바로 실행 가능합니다.
python -m http.server 8000
```
브라우저에서 `http://localhost:8000` 접속 시 세련된 **대시보드**가 나타납니다.

### URL 파라미터
- **대시보드**: `index.html` (파라미터 없음)
- **특정 수업 진입**: `?lesson=파일명` (예: `?lesson=rat-disc-1`)
- **섹션 바로가기**: `?lesson=파일명#섹션ID` (예: `#1-2`)
- **인쇄 페이지**: `print.html?lesson=파일명`

---

## 🛠️ 블록 타입 및 기능

상세한 블록 예시는 **[블록 가이드 갤러리](?lesson=block-guide)**에서 직접 확인할 수 있습니다.

### 주요 블록
- `paragraph`, `heading`: 기본 텍스트 및 소제목
- `case`, `question`: 🟩사례 및 🗨️질문 박스 (실시간 댓글 지원)
- `concept`: 💡핵심 개념 정리 박스
- `figure-concept`, `figure-quote`: 인물 사진 기반 레이아웃
- `quiz-accordion`: 기출문제 및 해설 접이식 목록

### 특수 입력 포맷
이미지 키 위치에 아래 형식을 사용하면 더 풍부한 화면을 구성할 수 있습니다.
- **텍스트 컷아웃**: `text:##제목\n내용\n---\n출처` 형식으로 입력 시 신문 기사 스타일 렌더링.
- **유튜브**: 유튜브 URL 입력 시 자동으로 썸네일 생성 및 재생 링크 연결.
- **구글 드라이브**: 공유 링크 입력 시 자동으로 이미지 URL로 변환하여 로드.

---

## ⌨️ 조작법
- `←` `→` / `PageUp` `PageDown`: 섹션 이동
- `Space` / `Enter`: 현재 화면의 첫 번째 답안 토글
- `Esc`: 확대(Focus) 모드 또는 라이트박스 닫기
- `📺 버튼 (Hover)`: 특정 블록만 화면에 꽉 차게 확대하여 집중

---

## 📝 수업 자료 추가 가이드
1. `lessons/` 폴더에 새로운 `.json` 파일을 생성합니다.
2. `js/app.js`의 `showDashboard()` 함수 내 `lessons` 배열에 새 수업 정보를 추가하면 대시보드에 자동으로 노출됩니다.
3. 구글 스프레드시트와 연동하여 에셋(이미지, 텍스트)을 관리하려면 `app.js`의 `SHEET_URLS`를 수정하세요.

JSON 최상위 필드 예시:

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
- `media` — 영상 링크 또는 독립 이미지 (하위 `kind` 필드로 구분)
  - `kind: "video-link"` — YouTube 썸네일 + 클릭 시 새 탭으로 영상 열림
    ```json
    {
      "type": "media",
      "kind": "video-link",
      "url": "https://www.youtube.com/watch?v=VIDEO_ID",
      "caption": "영상 설명 (선택)"
    }
    ```
    지원 URL 형식: `youtube.com/watch?v=`, `youtu.be/`, `youtube.com/embed/`
  - `kind: "image"` — 단독 이미지 + 캡션
    ```json
    {
      "type": "media",
      "kind": "image",
      "src": "파일명.jpg",
      "caption": "이미지 설명 (선택)"
    }
    ```

본문에서 `**볼드**`는 강조로, 줄바꿈은 그대로 렌더됩니다.
