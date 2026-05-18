import type { Role } from '@/lib/types/user';

type PermissionGateProps = {
  role: Role;
  requiredRole: Role;
  children: React.ReactNode;
  fallback?: React.ReactNode;
};

const roleRank: Record<Role, number> = { admin: 2, member: 1 };

export function PermissionGate({ role, requiredRole, children, fallback = null }: PermissionGateProps) {
  if (roleRank[role] >= roleRank[requiredRole]) {
    return <>{children}</>;
  }
  return <>{fallback}</>;
}
