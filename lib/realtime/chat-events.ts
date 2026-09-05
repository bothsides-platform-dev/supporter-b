export type ChatReadEvent = {
  type: 'read';
  userId: string;
  workspaceId: string;
  readAt: string;
  [k: string]: unknown;
};

export function isChatReadEvent(value: unknown): value is ChatReadEvent {
  if (typeof value !== 'object' || value == null) return false;
  const event = value as Record<string, unknown>;
  return (
    event.type === 'read' &&
    typeof event.userId === 'string' &&
    event.userId.length > 0 &&
    typeof event.workspaceId === 'string' &&
    event.workspaceId.length > 0 &&
    typeof event.readAt === 'string' &&
    Number.isFinite(Date.parse(event.readAt))
  );
}
