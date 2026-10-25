export type GuestRequestStatus = {
  id: string;
  status:
    | "unbound"
    | "waiting"
    | "submitted"
    | "needs_action"
    | "canceled"
    | "expired";
  pgName: string;
  rfpCode: string | null;
  deadline: string | null;
  effectSeen: boolean;
  days?: number;
  error?: string | null;
};
export async function guestRequest<T>(
  input: Record<string, unknown>,
): Promise<T> {
  const response = await fetch("/api/guest-rfp/requests", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
    cache: "no-store",
  });
  if (!response.ok)
    throw new Error(
      "요청 상태를 확인하지 못했어요. 입력한 내용은 보관하고 있으니 다시 시도해요.",
    );
  return response.json();
}
