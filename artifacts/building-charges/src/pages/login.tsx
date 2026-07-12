import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Building2, Loader2, PhoneCall, ShieldCheck } from "lucide-react";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isPending, setIsPending] = useState(false);
  const [mode, setMode] = useState<"login" | "forgot">("login");
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsPending(true);
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    setIsPending(false);
    if (signInError) {
      setError("البريد الإلكتروني أو كلمة المرور غير صحيحة");
      return;
    }
    queryClient.invalidateQueries();
    setLocation("/");
  };


  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/10 to-background" dir="rtl">
      <Card className="w-full max-w-sm shadow-xl">
        <CardHeader className="text-center pb-2">
          <div className="flex justify-center mb-4">
            <div className="bg-primary rounded-xl p-3">
              <Building2 className="h-8 w-8 text-primary-foreground" />
            </div>
          </div>
          <CardTitle className="text-2xl font-bold">نظام إدارة كمبوند الصفوة</CardTitle>
          <p className="text-sm text-muted-foreground mt-1">
            {mode === "login" ? "إدارة الرسوم والمدفوعات" : "استعادة كلمة المرور"}
          </p>
        </CardHeader>
        <CardContent>
          {mode === "login" ? (
            <form onSubmit={handleSubmit} className="space-y-4 mt-4">
              <div className="space-y-1.5">
                <Label htmlFor="email">البريد الإلكتروني</Label>
                <Input
                  id="email"
                  type="email"
                  dir="ltr"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="أدخل البريد الإلكتروني"
                  required
                  autoComplete="email"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="password">كلمة المرور</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="أدخل كلمة المرور"
                  required
                  autoComplete="current-password"
                />
              </div>
              {error && (
                <p className="text-sm text-destructive text-center">{error}</p>
              )}
              <Button type="submit" className="w-full" disabled={isPending}>
                {isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin ml-2" />
                ) : null}
                تسجيل الدخول
              </Button>
              <div className="text-center">
                <button
                  type="button"
                  className="text-sm text-primary hover:underline"
                  onClick={() => {
                    setError("");
                    setMode("forgot");
                  }}
                >
                  نسيت كلمة المرور؟
                </button>
              </div>
            </form>
          ) : (
            <div className="space-y-5 mt-4">
              <div className="flex flex-col items-center gap-3 py-2 text-center">
                <div className="bg-muted rounded-full p-3">
                  <PhoneCall className="h-6 w-6 text-muted-foreground" />
                </div>
                <p className="text-sm font-medium">
                  لاستعادة كلمة المرور، يرجى التواصل مع مالك النظام
                </p>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  لا يتوفر إرسال بريد إلكتروني تلقائي. سيقوم المسؤول بتعيين كلمة مرور مؤقتة لك وستُطلب منك تغييرها عند تسجيل الدخول.
                </p>
              </div>
              <div className="border-t pt-4">
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  onClick={() => setLocation("/master-recovery")}
                >
                  <ShieldCheck className="h-4 w-4 ml-2" />
                  استعادة حساب المسؤول الرئيسي
                </Button>
                <p className="text-xs text-muted-foreground text-center mt-2 leading-relaxed">
                  للمسؤول الرئيسي فقط باستخدام رمز الاستعادة
                </p>
              </div>
              <button
                type="button"
                className="w-full text-sm text-muted-foreground hover:underline text-center block"
                onClick={() => setMode("login")}
              >
                العودة إلى تسجيل الدخول
              </button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
