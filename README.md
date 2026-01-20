# 💰 커플 가계부 (Expense Tracker)

급여일 정산 기준(21일~20일) 커플 지출 관리 웹 애플리케이션

![Firebase](https://img.shields.io/badge/Firebase-FFCA28?style=for-the-badge&logo=firebase&logoColor=black)
![React](https://img.shields.io/badge/React-61DAFB?style=for-the-badge&logo=react&logoColor=black)

## ✨ 주요 기능

- 📝 **지출 입력 및 관리** - 간편한 지출 기록
- 💵 **자동 정산 계산** - 두 사람의 지출을 자동으로 정산
- 📊 **카테고리별 통계** - 막대 그래프와 파이 차트로 시각화
- 📈 **월별 지출 추이** - 6개월간의 지출 패턴 분석
- 🕒 **활동 이력 추적** - 모든 추가/삭제 기록 보관
- 🔥 **Firebase 실시간 동기화** - 두 사람이 동시에 사용 가능
- 🎨 **담당자/카테고리별 색상** - 직관적인 색상 구분

## 🚀 시작하기

### 사전 요구사항

- Node.js v20 이상
- Firebase 프로젝트 (Realtime Database 활성화)

### 설치 방법

1. **저장소 클론**
```bash
git clone https://github.com/your-username/expense-tracker.git
cd expense-tracker
```

2. **의존성 설치**
```bash
npm install
```

3. **Firebase 설정**

`.env.example` 파일을 복사하여 `.env` 파일을 생성:
```bash
cp .env.example .env
```

`.env` 파일을 열어서 Firebase 설정 정보 입력:
```env
REACT_APP_FIREBASE_API_KEY=your-actual-api-key
REACT_APP_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
REACT_APP_FIREBASE_DATABASE_URL=https://your-project-default-rtdb.firebaseio.com
REACT_APP_FIREBASE_PROJECT_ID=your-project-id
REACT_APP_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
REACT_APP_FIREBASE_MESSAGING_SENDER_ID=123456789012
REACT_APP_FIREBASE_APP_ID=1:123456789012:web:abcdef1234567890
```

4. **실행**
```bash
npm start
```

## 📅 급여일 정산 기준

- **매월 21일 ~ 다음달 20일**을 1개월로 집계
- 예: 1月給料日精算 = 12/21 ~ 1/20

## 🎯 사용 방법

### 로그인
- 비밀번호: `azuhimo`

### 화면 구성
- 📝 **リスト**: 지출 목록
- 📊 **グラフ**: 카테고리별 그래프
- 💵 **精算**: 자동 정산
- 📈 **推移**: 월별 추이
- 🕒 **履歴**: 활동 이력

## 🛠️ 기술 스택

- **React** 18.2.0
- **Firebase Realtime Database**
- **Recharts** 2.10.3

## 🌐 배포

```bash
npm run build
firebase deploy --only hosting
```

## 📄 라이선스

Private Use Only

---

**Made with ❤️ by ひも & あづ**
