import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";

const MIN_PASSWORD_LENGTH = 8;

export function ChangePasswordDialog({
  open,
  onOpenChange,
  forced = false,
  stale = false,
  onChanged,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** When true, the dialog cannot be dismissed until a new password is saved. */
  forced?: boolean;
  /** When true (and not forced), shows a soft "your password is old" reminder that can be dismissed. */
  stale?: boolean;
  /** Called after the password is successfully changed. */
  onChanged?: () => void;
}) {
  const { toast } = useToast();
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const reset = () => {
    setNewPassword("");
    setConfirmPassword("");
    setSubmitting(false);
  };

  const handleOpenChange = (next: boolean) => {
    // In forced mode the user must set a new password before leaving.
    if (forced && !next) return;
    if (!next) reset();
    onOpenChange(next);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      toast({
        variant: "destructive",
        title: "كلمة المرور قصيرة",
        description: `يجب أن تتكون كلمة المرور من ${MIN_PASSWORD_LENGTH} أحرف على الأقل`,
      });
      return;
    }

    if (newPassword !== confirmPassword) {
      toast({
        variant: "destructive",
        title: "كلمتا المرور غير متطابقتين",
        description: "يرجى التأكد من تطابق كلمة المرور الجديدة مع التأكيد",
      });
      return;
    }

    setSubmitting(true);
    const { error } = await supabase.auth.updateUser({
      password: newPassword,
      data: {
        must_change_password: false,
        password_changed_at: new Date().toISOString(),
      },
    });
    setSubmitting(false);

    if (error) {
      const description =
        error.message === "New password should be different from the old password."
          ? "يجب أن تكون كلمة المرور الجديدة مختلفة عن كلمة المرور الحالية"
          : error.message;
      toast({
        variant: "destructive",
        title: "تعذر تغيير كلمة المرور",
        description,
      });
      return;
    }

    toast({
      title: "تم تغيير كلمة المرور",
      description: "تم تحديث كلمة المرور بنجاح. استخدمها في تسجيل الدخول القادم",
    });
    onChanged?.();
    reset();
    if (!forced) onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        dir="rtl"
        className="sm:max-w-md"
        hideCloseButton={forced}
        onEscapeKeyDown={(e) => forced && e.preventDefault()}
        onPointerDownOutside={(e) => forced && e.preventDefault()}
        onInteractOutside={(e) => forced && e.preventDefault()}
      >
        <DialogHeader className="text-right sm:text-right">
          <DialogTitle>
            {forced
              ? "قم بتعيين كلمة مرور جديدة"
              : stale
                ? "حان وقت تحديث كلمة المرور"
                : "تغيير كلمة المرور"}
          </DialogTitle>
          <DialogDescription>
            {forced
              ? `لحماية حسابك، يجب تغيير كلمة المرور المؤقتة قبل المتابعة (${MIN_PASSWORD_LENGTH} أحرف على الأقل)`
              : stale
                ? `لم يتم تغيير كلمة المرور منذ فترة طويلة. لحماية حسابك، يُنصح بتعيين كلمة مرور جديدة (${MIN_PASSWORD_LENGTH} أحرف على الأقل)`
                : `اختر كلمة مرور قوية جديدة لحسابك (${MIN_PASSWORD_LENGTH} أحرف على الأقل)`}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="new-password">كلمة المرور الجديدة</Label>
            <Input
              id="new-password"
              type="password"
              dir="ltr"
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirm-password">تأكيد كلمة المرور</Label>
            <Input
              id="confirm-password"
              type="password"
              dir="ltr"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
            />
          </div>
          <DialogFooter className="gap-2 sm:justify-start">
            <Button type="submit" disabled={submitting}>
              {submitting && <Loader2 className="h-4 w-4 ml-2 animate-spin" />}
              حفظ كلمة المرور
            </Button>
            {!forced && (
              <Button
                type="button"
                variant="outline"
                onClick={() => handleOpenChange(false)}
                disabled={submitting}
              >
                {stale ? "تذكيرني لاحقاً" : "إلغاء"}
              </Button>
            )}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
