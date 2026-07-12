import { useGetMe } from "@workspace/api-client-react";
import { useLocation } from "wouter";
import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { ChangePasswordDialog } from "@/components/ChangePasswordDialog";
import { passwordAgeDays, PASSWORD_MAX_AGE_DAYS } from "@/lib/password-age";

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { data: user, isLoading, isError } = useGetMe();
  const [, setLocation] = useLocation();
  const [mustChangePassword, setMustChangePassword] = useState(false);
  const [passwordStale, setPasswordStale] = useState(false);
  const [staleDismissed, setStaleDismissed] = useState(false);

  const refreshPasswordState = useCallback(async () => {
    const { data } = await supabase.auth.getUser();
    const authUser = data.user;
    if (!authUser) return;

    const forced = authUser.user_metadata?.must_change_password === true;
    setMustChangePassword(forced);
    if (forced) {
      setPasswordStale(false);
      return;
    }

    // Fall back to account creation time for users who have never recorded a
    // password change, so long-standing accounts are still reminded.
    const lastChangedRaw =
      authUser.user_metadata?.password_changed_at ?? authUser.created_at;
    const ageDays = passwordAgeDays(lastChangedRaw);
    setPasswordStale(ageDays !== null && ageDays >= PASSWORD_MAX_AGE_DAYS);
  }, []);

  useEffect(() => {
    if (isError) {
      setLocation("/login");
    }
  }, [isError, setLocation]);

  useEffect(() => {
    if (user) {
      void refreshPasswordState();
    }
  }, [user, refreshPasswordState]);

  if (isLoading) {
    return (
      <div className="flex h-screen w-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) return null;

  const showStale = passwordStale && !mustChangePassword && !staleDismissed;

  return (
    <>
      {children}
      <ChangePasswordDialog
        open={mustChangePassword || showStale}
        onOpenChange={(next) => {
          if (!next) setStaleDismissed(true);
        }}
        forced={mustChangePassword}
        stale={showStale}
        onChanged={() => {
          setMustChangePassword(false);
          setPasswordStale(false);
        }}
      />
    </>
  );
}
