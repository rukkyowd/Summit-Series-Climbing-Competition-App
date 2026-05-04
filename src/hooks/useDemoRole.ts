"use client";

import { useCallback, useEffect, useState } from "react";

export type DemoRole = "admin" | "judge" | "public";

const DEMO_ROLE_STORAGE_KEY = "scorecard.demo.role";

export const DEMO_ROLE_LABELS: Record<DemoRole, string> = {
  admin: "Admin View",
  judge: "Judge View",
  public: "Public View",
};

function isDemoRole(value: unknown): value is DemoRole {
  return value === "admin" || value === "judge" || value === "public";
}

export function useDemoRole(initialRole: DemoRole = "admin") {
  const [role, setRoleState] = useState<DemoRole>(initialRole);

  useEffect(() => {
    try {
      const storedRole = window.localStorage.getItem(DEMO_ROLE_STORAGE_KEY);
      if (isDemoRole(storedRole)) {
        setRoleState(storedRole);
      }
    } catch {
      // Local storage is a convenience only; the role override still works without it.
    }
  }, []);

  const setRole = useCallback((nextRole: DemoRole) => {
    setRoleState(nextRole);
    try {
      window.localStorage.setItem(DEMO_ROLE_STORAGE_KEY, nextRole);
    } catch {
      // Ignore storage failures so role switching stays local and reliable.
    }
  }, []);

  return { role, setRole, roleLabel: DEMO_ROLE_LABELS[role] };
}
