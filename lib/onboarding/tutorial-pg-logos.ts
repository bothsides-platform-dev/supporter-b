// 튜토리얼 가상 PG 워크스페이스의 정적 로고 — DB 아바타 라우트가 없는 id 라서 public 자산을 직접 가리킨다.
// 출처는 public/images/pg-logos/SOURCES.md.
import type { TUTORIAL_PG_IDS } from './tutorial-fixtures';

// 키를 TUTORIAL_PG_IDS 에서 파생해 새 PG 를 추가하고 로고를 빠뜨리면 컴파일이 깨진다(타입 전용 import — 번들에 픽스처가 딸려 오지 않는다).
export const TUTORIAL_PG_LOGO_SRC: Readonly<Record<(typeof TUTORIAL_PG_IDS)[number], string>> = {
  'tutorial-pg-a': '/images/pg-logos/toss.png',
  'tutorial-pg-b': '/images/pg-logos/hecto.svg',
  'tutorial-pg-c': '/images/pg-logos/kiwoom.svg',
  'tutorial-pg-d': '/images/pg-logos/inicis.png',
};

/** 튜토리얼 PG id 면 정적 로고 경로, 아니면 undefined — 상속 키(`constructor` 등)는 own-property 검사로 걸러낸다. */
export function tutorialPgLogoSrc(workspaceId: string | undefined): string | undefined {
  if (!workspaceId || !Object.hasOwn(TUTORIAL_PG_LOGO_SRC, workspaceId)) return undefined;
  return TUTORIAL_PG_LOGO_SRC[workspaceId as keyof typeof TUTORIAL_PG_LOGO_SRC];
}
