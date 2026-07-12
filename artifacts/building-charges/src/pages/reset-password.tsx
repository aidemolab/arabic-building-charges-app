import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Building2, Loader2 } from "lucide-react";

const MIN_PASSWORD_LENGTH = 8;

type Status = "checking" | "ready" | "invalid";

function hashHasError(): boolean {
  const hash = window.location.hash.replace(/^#/, "");
  const params = new URLSearchParams(hash);
  return params.has("error") || params.has("error_code");
}

export default function ResetPasswordPage() {
  const [status, setStatus] = useState<Status>("checking");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  useEffect(() => {
    let cancelled = false;

    if (hashHasError()) {
      setStatus("invalid");
      return;
    }

    const { data: subscription } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        if (!cancelled && session) {
          setStatus("ready");
        }
      },
    );

    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      if (data.session) {
        setStatus("ready");
      } else {
        // Give supabase-js a moment to process the recovery hash in the URL
        setTimeout(() => {
          if (!cancelled) {
            setStatus((prev) => (prev === "checking" ? "invalid" : prev));
          }
        }, 4000);
      }
    });

    return () => {
      cancelled = true;
      subscription.subscription.unsubscribe();
    };
  }, []);

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
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setSubmitting(false);

    if (error) {
      const description =
        error.message ===
        "New password should be different from the old password."
          ? "يجب أن تكون كلمة المرور الجديدة مختلفة عن كلمة المرور الحالية"
          : "حدث خطأ أثناء تحديث كلمة المرور. يرجى المحاولة مرة أخرى أو طلب رابط جديد";
      toast({
        variant: "destructive",
        title: "تعذر إعادة تعيين كلمة المرور",
        description,
      });
      return;
    }

    toast({
      title: "تم إعادة تعيين كلمة المرور",
      description: "تم تحديث كلمة المرور بنجاح. استخدمها في تسجيل الدخول القادم",
    });
    queryClient.invalidateQueries();
    setLocation("/");
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
              <Building2 className="h-8 w-8 text-primary-foreground" />
            </div>
          </div>
          <CardTitle className="text-2xl font-bold">نظام إدارة كمبوند الصفوة</CardTitle>
          <p className="text-sm text-muted-foreground mt-1">
            إعادة تعيين كلمة المرور
          </p>
        </CardHeader>
        <CardContent>
          {status === "checking" && (
            <div className="flex flex-col items-center gap-3 py-8">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">
                جارٍ التحقق من الرابط...
              </p>
            </div>
          )}
          {status === "invalid" && (
            <div className="space-y-4 py-4 text-center">
              <p className="text-sm text-destructive">
                رابط إعادة التعيين غير صالح أو منتهي الصلاحية
              </p>
              <p className="text-sm text-muted-foreground">
                يرجى طلب رابط جديد من صفحة تسجيل الدخول عبر «نسيت كلمة المرور؟»
              </p>
              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={() => setLocation("/login")}
              >
                العودة إلى تسجيل الدخول
              </Button>
            </div>
          )}
          {status === "ready" && (
            <form onSubmit={handleSubmit} className="space-y-4 mt-4">
              <p className="text-sm text-muted-foreground">
                اختر كلمة مرور قوية جديدة لحسابك ({MIN_PASSWORD_LENGTH} أحرف على
                الأقل)
              </p>
              <div className="space-y-1.5">
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
              <Button type="submit" className="w-full" disabled={submitting}>
                {submitting && <Loader2 className="h-4 w-4 ml-2 animate-spin" />}
                حفظ كلمة المرور
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
