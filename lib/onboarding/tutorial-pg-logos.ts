// 튜토리얼 가상 PG 워크스페이스의 정적 로고 — DB 아바타 라우트가 없는 id 라서 public 자산을 직접 가리킨다.
// 경로의 단일 출처는 lib/rfp/pg-wordmark.ts.
import type { TUTORIAL_PG_IDS } from './tutorial-fixtures';
import { PG_WORDMARKS } from '@/lib/rfp/pg-wordmark';

// 키를 TUTORIAL_PG_IDS 에서 파생해 새 PG 를 추가하고 로고를 빠뜨리면 컴파일이 깨진다(타입 전용 import — 번들에 픽스처가 딸려 오지 않는다).
export const TUTORIAL_PG_LOGO_SRC: Readonly<Record<(typeof TUTORIAL_PG_IDS)[number], string>> = {
  'tutorial-pg-a': PG_WORDMARKS.toss.src,
  'tutorial-pg-b': PG_WORDMARKS.hecto.src,
  'tutorial-pg-c': PG_WORDMARKS.kiwoom.src,
  'tutorial-pg-d': PG_WORDMARKS.inicis.src,
};

/** 튜토리얼 PG id 면 정적 로고 경로, 아니면 undefined — 상속 키(`constructor` 등)는 own-property 검사로 걸러낸다. */
export function tutorialPgLogoSrc(workspaceId: string | undefined): string | undefined {
  if (!workspaceId || !Object.hasOwn(TUTORIAL_PG_LOGO_SRC, workspaceId)) return undefined;
  return TUTORIAL_PG_LOGO_SRC[workspaceId as keyof typeof TUTORIAL_PG_LOGO_SRC];
}
