import { useState } from "react";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { useMasterRecovery, ApiError } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ShieldCheck, Loader2, ArrowRight } from "lucide-react";

const MIN_PASSWORD_LENGTH = 8;

function messageFromError(err: unknown): string {
  if (err instanceof ApiError) {
    const data = err.data as
      | { error?: string; remainingAttempts?: number; retryAfterSeconds?: number }
      | null;
    if (err.status === 401) {
      const remaining = data?.remainingAttempts;
      const base = data?.error ?? "رمز الاستعادة غير صحيح.";
      return typeof remaining === "number"
        ? `${base} المحاولات المتبقية: ${remaining}`
        : base;
    }
    if (err.status === 429) {
      const secs = data?.retryAfterSeconds;
      const mins = typeof secs === "number" ? Math.ceil(secs / 60) : null;
      return mins
        ? `تم إيقاف الاستعادة مؤقتاً بسبب محاولات فاشلة متكررة. حاول بعد حوالي ${mins} دقيقة.`
        : data?.error ?? "تم إيقاف الاستعادة مؤقتاً. حاول لاحقاً.";
    }
    if (data?.error) return data.error;
  }
  return "حدث خطأ أثناء الاستعادة. يرجى المحاولة مرة أخرى.";
}

export default function MasterRecoveryPage() {
  const [recoveryCode, setRecoveryCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { mutateAsync, isPending } = useMasterRecovery();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (recoveryCode.trim().length === 0) {
      toast({
        variant: "destructive",
        title: "رمز الاستعادة مطلوب",
        description: "أدخل رمز الاستعادة الخاص بمالك النظام",
      });
      return;
    }
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
        description: "يرجى التأكد من تطابق كلمة المرور مع التأكيد",
      });
      return;
    }

    try {
      await mutateAsync({ data: { recoveryCode: recoveryCode.trim(), newPassword } });
      toast({
        title: "تمت استعادة حساب المسؤول",
        description:
          "تم تعيين كلمة المرور الجديدة بشكل دائم. سجّل الدخول بها الآن مباشرة.",
      });
      setLocation("/login");
    } catch (err) {
      toast({
        variant: "destructive",
        title: "تعذّرت الاستعادة",
        description: messageFromError(err),
      });
    }
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/10 to-background"
      dir="rtl"
    >
      <Card className="w-full max-w-sm shadow-xl">
        <CardHeader className="text-center pb-2">
          <div className="flex justify-center mb-4">
            <div className="bg-primary rounded-xl p-3">
              <ShieldCheck className="h-8 w-8 text-primary-foreground" />
            </div>
          </div>
          <CardTitle className="text-2xl font-bold">استعادة حساب المسؤول</CardTitle>
          <p className="text-sm text-muted-foreground mt-1">
            خاص بحساب المسؤول الرئيسي فقط
          </p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4 mt-4">
            <p className="text-xs text-muted-foreground leading-relaxed">
              أدخل رمز الاستعادة الذي يحتفظ به مالك النظام، ثم اختر كلمة المرور
              الدائمة الجديدة. ستتمكن من تسجيل الدخول بها مباشرة.
            </p>
            <div className="space-y-1.5">
              <Label htmlFor="recovery-code">رمز الاستعادة</Label>
              <Input
                id="recovery-code"
                type="password"
                dir="ltr"
                autoComplete="off"
                value={recoveryCode}
                onChange={(e) => setRecoveryCode(e.target.value)}
                placeholder="أدخل رمز الاستعادة"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="new-password">كلمة المرور الدائمة الجديدة</Label>
              <Input
                id="new-password"
                type="password"
                dir="ltr"
                autoComplete="new-password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder={`${MIN_PASSWORD_LENGTH} أحرف على الأقل`}
                required
              />
            </div>
            <div className="space-y-1.5">
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
            <Button type="submit" className="w-full" disabled={isPending}>
              {isPending ? <Loader2 className="h-4 w-4 animate-spin ml-2" /> : null}
              استعادة الحساب
            </Button>
            <button
              type="button"
              className="w-full text-sm text-muted-foreground hover:underline text-center flex items-center justify-center gap-1"
              onClick={() => setLocation("/login")}
            >
              <ArrowRight className="h-3.5 w-3.5" />
              العودة إلى تسجيل الدخول
            </button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
