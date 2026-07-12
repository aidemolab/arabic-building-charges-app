import { useGetMe } from "@workspace/api-client-react";

/**
 * Role matrix for the client UI (mirrors the API-side requireRole guards):
 * - admin: full access
 * - accountant: charges/payments + Excel import/export, no structure (buildings/units/persons) or user management
 * - viewer: read-only everywhere
 */
export function usePermissions() {
  const { data: user } = useGetMe();
  const role = user?.role;

  const isAdmin = role === "admin";
  const isAccountant = role === "accountant";

  return {
    role,
    isAdmin,
    isAccountant,
    /** Manage buildings / units / persons structure — admin only. */
    canManageStructure: isAdmin,
    /** Create / edit / cancel charges and payments — admin + accountant. */
    canManageCharges: isAdmin || isAccountant,
    /** Excel import (preview/commit) — admin + accountant. */
    canImport: isAdmin || isAccountant,
    /** Manage team accounts — admin only. */
    canManageUsers: isAdmin,
  };
}
