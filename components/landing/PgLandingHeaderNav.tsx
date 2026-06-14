import { auth } from '@/auth';
import { PgLandingNav } from '@/components/landing/PgLandingNav';

export async function PgLandingHeaderNav() {
  const session = await auth();
  return <PgLandingNav authed={!!session} />;
}
