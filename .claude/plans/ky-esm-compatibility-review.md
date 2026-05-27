# KY (ESM-only) 도입 사전 검토 - bidit 프로젝트

## 프로젝트 현황 요약
- **프로젝트**: Next.js 16.2.4 + React 19.2.4
- **패키지 매니저**: pnpm
- **빌드 도구**: Next.js (Turbopack 미사용)
- **테스트 프레임워크**: Vitest 4.1.5 (jsdom + node 환경 분리)

---

## 1. `next.config.ts` 검토

### 현재 설정
```typescript
const nextConfig: NextConfig = {
  serverExternalPackages: ["pino", "pino-pretty"],
};
```

### ✅ 평가: 양호
- `transpilePackages` 미설정 (기본값 = []): 번들러가 기본적으로 ESM 패키지 처리
- `serverExternalPackages`: pino만 외부화 (올바른 설정)
- `experimental` 설정 없음 (새로운 기능으로 인한 충돌 위험 낮음)
- Turbopack 비사용 → webpack 기반 빌드 (안정적)

### ⚠️ KY 도입 시 고려사항
- **KY는 CSR(클라이언트 사이드 렌더링) 패키지**이므로 `serverExternalPackages`에 추가할 필요 없음
- 만약 API 라우트나 서버 액션에서 KY 사용 시 → 수동으로 `serverExternalPackages` 추가 검토 (현재는 불필요)

### 권장사항
```typescript
// 현재 설정 유지
// KY 추가 필요 없음 (클라이언트 패키지)
const nextConfig: NextConfig = {
  serverExternalPackages: ["pino", "pino-pretty"],
  // transpilePackages: [] // 기본값, ESM 패키지 처리 가능
};
```

---

## 2. `package.json` 검토

### 현재 설정
- **`"type"` 필드**: **없음** (기본값 = CommonJS)
- **`moduleResolution`**: tsconfig.json에서만 설정 (CJS 패키지로 간주)

### ⚠️ **중대 발견: ESM 패키지 처리 방식**

현재 프로젝트는 **CJS 패키지**(type 미설정)이지만, KY는 **ESM-only 패키지**입니다:
- Node.js는 `.mjs` 또는 `"type": "module"` 설정된 프로젝트에서만 ESM import 가능
- CJS 프로젝트에서 ESM 패키지 import 시 제약 있을 수 있음

#### 현재 상황 분석
1. **Next.js 빌드 타임**: 번들러가 KY의 ESM 코드를 처리 (문제 없음)
2. **런타임 (Node.js 직접 실행 시)**: CJS → ESM 동적 import 필요

### 현재 의존성 구조
```json
{
  "dependencies": {
    "next": "16.2.4",      // ESM 지원
    "react": "19.2.4",     // ESM 포함
    "drizzle-orm": "^0.45.0" // ESM 지원
    // ... 기타 모던 패키지들 (대부분 ESM 호환)
  }
}
```

### ✅ 평가: ESM 호환성 양호
- Next.js 16.2.4: ESM 완벽 지원
- 기존 의존성들도 대부분 ESM 호환
- pnpm: ESM 패키지 해석 능력 우수

### 권장사항
```json
{
  // 옵션 1: 현재 유지 (권장 - 대부분의 경우 작동)
  // → Next.js 빌드 시 번들러가 처리, 런타임 import도 pnpm이 자동 해석
  
  // 옵션 2: 명시적 "type": "module" 설정
  // "type": "module"
  // → 더 명확하지만, 기존 CJS 스크립트 재작성 필요
}
```

---

## 3. `tsconfig.json` 검토

### 현재 설정
```json
{
  "compilerOptions": {
    "target": "ES2017",              // ✅ ES2017 이상 (import 문법 지원)
    "module": "esnext",              // ✅ ESNext (ES 모듈)
    "moduleResolution": "bundler",   // ✅ 번들러 최적화 (Next.js 권장)
    "esModuleInterop": true,         // ✅ CJS ↔ ESM 호환성
    "isolatedModules": true          // ✅ 파일별 독립 컴파일
  }
}
```

### ✅ 평가: 완벽
- **`module: "esnext"`**: ESM 타입스크립트 컴파일 (KY 호환)
- **`moduleResolution: "bundler"`**: Next.js 스타일 (최신 표준)
- **`target: ES2017`**: 모던 JavaScript (import 지원)
- **`esModuleInterop: true`**: CJS/ESM 상호 운영성

### KY 도입 영향
- **없음**: TypeScript는 KY의 ESM 타입 자동 인식 가능

---

## 4. `vitest.config.ts` 검토

### 현재 설정
```typescript
export default defineConfig({
  test: {
    projects: [
      {
        name: "unit-node",
        environment: "node",
        setupFiles: ["./vitest.setup.ts"],
        // ❌ transformIgnorePatterns 미설정
      },
      {
        name: "unit-jsdom",
        environment: "jsdom",
        setupFiles: ["./vitest.setup.ts"],
        // ❌ transformIgnorePatterns 미설정
      }
    ]
  }
});
```

### ⚠️ **중대 발견: transformIgnorePatterns 미설정**

#### 문제점
1. Vitest 기본값: `transformIgnorePatterns: ['/node_modules/']`
2. KY는 `/node_modules/ky/` 아래 ESM 코드 → **변환 스킵됨**
3. 테스트 런타임에서 ESM 구문 인식 불가능

#### 구체적 시나리오
```typescript
// 테스트 파일
import ky from 'ky'; // ❌ vitest가 변환 스킵 → 구문 오류
```

### ✅ 해결 방안

#### 권장안: `transformIgnorePatterns` 명시적 설정
```typescript
export default defineConfig({
  test: {
    projects: [
      {
        name: "unit-node",
        environment: "node",
        transformIgnorePatterns: [
          '/node_modules/(?!ky)/', // ✅ ky만 변환, 나머지는 스킵
        ],
        setupFiles: ["./vitest.setup.ts"],
      },
      {
        name: "unit-jsdom",
        environment: "jsdom",
        transformIgnorePatterns: [
          '/node_modules/(?!ky)/', // ✅ ky만 변환, 나머지는 스킵
        ],
        setupFiles: ["./vitest.setup.ts"],
      }
    ]
  }
});
```

#### 대안: Node.js 18.17+ 네이티브 ESM 테스트
```typescript
// Node.js 18.17+ 사용 시
export default defineConfig({
  test: {
    pool: "forks",         // Node 네이티브 ESM 풀 사용
    poolOptions: {
      forks: {
        singleFork: true,  // ESM 안정성
      }
    }
  }
});
```

---

## 5. 워크스페이스 설정 검토

### 현재 상황
- **pnpm-workspace.yaml**: 없음 (단일 패키지 프로젝트)
- **.npmrc/.pnpmrc**: 없음 (기본 설정 사용)

### ✅ 평가: 양호
- 단일 프로젝트 구조 → 워크스페이스 호환성 문제 없음
- pnpm 기본값으로 ESM 패키지 자동 처리 가능

---

## 종합 평가: KY 도입 준비도

### 🟢 문제 없음 (3가지)
1. ✅ **next.config.ts**: ESM 빌드 완전 지원
2. ✅ **tsconfig.json**: 최적화된 ESM 설정
3. ✅ **package.json (번들 타임)**: Next.js가 ESM 처리

### 🟡 주의 필요 (1가지)
1. ⚠️ **vitest.config.ts**: `transformIgnorePatterns` 명시적 설정 권장

---

## 즉시 조치 사항

### 필수
```typescript
// vitest.config.ts - 양쪽 프로젝트에 transformIgnorePatterns 추가
{
  name: "unit-node",
  transformIgnorePatterns: ['/node_modules/(?!ky)/'],
  // ...
},
{
  name: "unit-jsdom",
  transformIgnorePatterns: ['/node_modules/(?!ky)/'],
  // ...
}
```

### 선택 (향후 검토)
- Node.js 버전 확인 후 `pool: "forks"` 고려
- `package.json`에 `"type": "module"` 추가 (더 명시적)

---

## KY 사용 시 예상 동작

### 1️⃣ 번들 타임 (Next.js Build)
```
KY ESM 코드 → Next.js 번들러 → JS 번들 (CJS/ESM 혼합)
✅ 문제 없음
```

### 2️⃣ 테스트 타임 (Vitest)
```
테스트 파일 → Vitest transformIgnorePatterns 확인
  → ky 패턴 일치 → 변환 수행
  → ESM 구문 인식 가능
✅ 설정 추가 후 정상 작동
```

### 3️⃣ 런타임 (Node.js)
```
CJS 파일 → dynamic import('ky')
또는
KY 사용 코드 Next.js SSR → 번들러가 처리
✅ pnpm + Next.js 조합으로 자동 처리
```

---

## 최종 결론

**KY 도입 가능 난이도: 🟢 낮음**

- 현재 프로젝트 설정이 ESM 호환성 우수
- **1개 파일만 수정 필요**: `vitest.config.ts`
- Next.js, TypeScript, pnpm 모두 ESM 패키지 처리 가능

---

## 체크리스트

- [ ] `vitest.config.ts`의 양쪽 프로젝트에 `transformIgnorePatterns: ['/node_modules/(?!ky)/']` 추가
- [ ] KY 의존성 설치: `pnpm add ky`
- [ ] 간단한 KY 사용 테스트 작성 및 `pnpm test` 실행 확인
- [ ] Next.js 빌드: `pnpm build` 확인
- [ ] 런타임 테스트: `pnpm dev` 및 실제 요청 확인
