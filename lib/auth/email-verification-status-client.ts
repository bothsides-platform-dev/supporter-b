"use client";

export async function checkEmailVerificationStatus(email: string): Promise<{ verified: boolean; reauthenticate?: boolean; next?: string }> {
  const response = await fetch('/api/auth/email-verification', {
    method: 'POST', cache: 'no-store', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }),
  });
  if (!response.ok) throw new Error('EMAIL_VERIFICATION_STATUS_UNAVAILABLE');
  return response.json();
}
