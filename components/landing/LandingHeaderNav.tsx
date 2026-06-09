import { auth } from '@/auth';
import { LandingNav } from '@/components/landing/LandingNav';

export async function LandingHeaderNav() {
  const session = await auth();
  return <LandingNav authed={!!session} />;
}
