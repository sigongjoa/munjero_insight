# 🎥 유튜브 채널 벤치마킹 & 인사이트 플랫폼 설계 명세서

---

## 1. 📌 프로젝트 개요
이 플랫폼은 **채널별 프로젝트 단위 관리**를 통해, 각 채널의 업로드 영상에 대한 **정량 지표(조회수, 좋아요 등)**와 **정성 지표(대본, 편집 패턴 등)**를 체계적으로 축적하고 분석할 수 있도록 설계된다.

이를 통해 사용자는 **내 채널 vs 경쟁 채널** 비교, **성공 패턴 도출**, **LLM + RAG 기반 인사이트 탐색**이 가능하다.

---

## 2. 🗂 시스템 구조 개요

### (1) 프로젝트 단위
- **Project = YouTube Channel**
- 관리 요소:
  - `channel_id`
  - `channel_name`
  - `subscriber_count`
  - `category`, `language`, `region`
  - `created_at`
  - `videos[]`

### (2) 영상 단위
각 영상은 하나의 객체로 저장되며, `metadata`, `metrics`, `analysis`로 구분된다.

- **Metadata**
  - `video_id`
  - `title`
  - `description`
  - `tags[]`
  - `upload_time`
  - `duration`

- **Metrics (정량 데이터)**
  - `views`
  - `likes`
  - `dislikes`
  - `comments_count`
  - `impressions`
  - `ctr`
  - `avg_watch_time`
  - `retention_curve[]`

- **Analysis (정성 데이터)**
  - `hook_length`
  - `cta_position`
  - `scene_cuts[]` (컷 개수, 길이)
  - `script_segments[]` (문장별 대본)
  - `subtitle_text` (OCR 추출 자막)
  - `editing_pattern` (예: 빠른컷, 자막 강조, 배경음악 등)

---

## 3. 🔄 데이터 수집 및 전처리

### (1) API 기반 수집
- **YouTube Data API**: 기본 메타데이터, 조회수, 좋아요, 댓글 등 수집
- **비공식 스크레이핑**: Retention curve, 상세 사용자 반응 확보

### (2) 비디오 분석
- **OpenCV / PySceneDetect**: 컷 분리 및 편집 패턴 추출
- **Whisper / STT**: 대본 추출
- **OCR**: 영상 자막 추출
- **LLM 분석**: CTA 위치, 편집 스타일 요약

### (3) 데이터 저장
- **DB 구조**: `projects → videos → analysis`
- **Vector DB**: 제목, 대본, 자막을 임베딩 → RAG 기반 질의 가능

---

## 4. 📊 분석 및 인사이트 활용

### (1) 내부 분석
- 채널별 업로드 주기 vs 성장 곡선
- 특정 편집 패턴 vs 조회수 상관관계

### (2) 외부 비교
- 내 채널 vs 경쟁 채널 CTR, Retention 비교
- 동일 주제의 다른 편집 스타일 효과 측정

### (3) LLM + RAG 활용
- “구독자 10만 이상 채널의 평균 훅 길이?”
- “조회수 100만 이상 영상의 공통된 CTA 전략은?”
- “내 채널 스크립트와 유사한 성공 사례 찾기”

---

## 5. 🤔 리스크 및 반대 시각
- **과도한 데이터**: 초기에는 핵심 feature set만 선정 (예: views, CTR, hook_length)
- **모방의 함정**: 단순 복제 대신 차별화 포인트 도출 필요
- **데이터 품질**: OCR/STT 정확도 보정 필요

---

## 6. 🌱 확장 아이디어
- **실패 사례 DB 구축**: 조회수 저조 영상 패턴 학습
- **편집 DNA 시스템**: 컷/자막/훅/CTA 패턴을 코드화
- **인사이트 맵 시각화**: 채널별 전략을 지도로 표현

---

## 7. ✅ 실행 단계
1. **DB 스키마 설계** (`project → videos → analysis`)
2. **API + 크롤러**로 데이터 확보
3. **전처리 파이프라인** (컷 분리, OCR, 대본 추출)
4. **LLM + RAG 연동**
5. **인사이트 리포트 자동 생성**

---

👉 이 계획서를 기반으로, 누구든 쉽게 **채널 벤치마킹 프로젝트를 생성하고 분석**을 진행할 수 있다.

