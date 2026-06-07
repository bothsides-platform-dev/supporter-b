import { GoogleAnalytics } from '@next/third-parties/google';

type Props = {
  gaId?: string;
};

/**
 * GA4 게이팅 래퍼 — measurement ID(NEXT_PUBLIC_GA_MEASUREMENT_ID)가 있을 때만
 * GoogleAnalytics를 마운트한다. ChannelTalk와 동일한 env-키 게이팅 패턴.
 */
export function Analytics({ gaId }: Props) {
  if (!gaId) return null;
  return <GoogleAnalytics gaId={gaId} />;
}
