import { useState } from "react";
import {
  useGetMe, useListUsers, useCreateUser, useUpdateUser, useDeleteUser, useResetUserPassword,
} from "@workspace/api-client-react";
import type { ManagedUser, UserCreateInput, ManagedUserRole } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { UserCog, Plus, Loader2, Ban, CircleCheck, Trash2, ShieldAlert, KeyRound, AlertTriangle } from "lucide-react";
import { passwordAgeDays, isPasswordOverdue, PASSWORD_MAX_AGE_DAYS } from "@/lib/password-age";

const ROLE_LABELS: Record<string, string> = {
  admin: "مدير",
  accountant: "محاسب",
  viewer: "مشاهد",
};

function roleLabel(role: string) {
  return ROLE_LABELS[role] ?? role;
}

function generateTempPassword(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  const arr = new Uint32Array(12);
  crypto.getRandomValues(arr);
  return Array.from(arr, (n) => chars[n % chars.length]).join("");
}

function passwordAgeLabel(days: number): string {
  if (days <= 0) return "اليوم";
  if (days === 1) return "منذ يوم";
  if (days === 2) return "منذ يومين";
  if (days <= 10) return `منذ ${days} أيام`;
  return `منذ ${days} يوماً`;
}

function errorMessage(err: unknown): string {
  if (err && typeof err === "object" && "error" in err && typeof (err as any).error === "string") {
    return (err as any).error;
  }
  return "حدث خطأ غير متوقع";
}

export default function UsersPage() {
  const { data: me } = useGetMe();
  const queryClient = useQueryClient();
  const { data: users, isLoading } = useListUsers();
  const createMutation = useCreateUser();
  const updateMutation = useUpdateUser();
  const deleteMutation = useDeleteUser();
  const { toast } = useToast();

  const resetPasswordMutation = useResetUserPassword();

  const [showCreate, setShowCreate] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<ManagedUserRole>("viewer");
  const [deleting, setDeleting] = useState<ManagedUser | null>(null);
  const [resetting, setResetting] = useState<ManagedUser | null>(null);
  const [resetPassword, setResetPassword] = useState("");

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["/api/users"] });

  if (me && me.role !== "admin") {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-muted-foreground gap-3">
        <ShieldAlert className="h-10 w-10" />
        <p>هذه الصفحة متاحة للمدير فقط</p>
      </div>
    );
  }

  const resetForm = () => {
    setEmail("");
    setPassword("");
    setRole("viewer");
  };

  const handleCreate = () => {
    const data: UserCreateInput = { email: email.trim(), password, role };
    createMutation.mutate({ data }, {
      onSuccess: () => {
        invalidate();
        setShowCreate(false);
        resetForm();
        toast({ title: "تم إنشاء الحساب", description: `تمت إضافة ${data.email} بنجاح` });
      },
      onError: (err) => toast({ variant: "destructive", title: "فشل إنشاء الحساب", description: errorMessage(err) }),
    });
  };

  const handleRoleChange = (u: ManagedUser, newRole: string) => {
    updateMutation.mutate({ id: u.id, data: { role: newRole as ManagedUserRole } }, {
      onSuccess: invalidate,
      onError: (err) => toast({ variant: "destructive", title: "فشل تغيير الدور", description: errorMessage(err) }),
    });
  };

  const handleToggleDisabled = (u: ManagedUser) => {
    updateMutation.mutate({ id: u.id, data: { disabled: !u.disabled } }, {
      onSuccess: () => {
        invalidate();
        toast({ title: u.disabled ? "تم تفعيل الحساب" : "تم تعطيل الحساب" });
      },
      onError: (err) => toast({ variant: "destructive", title: "فشل تحديث الحساب", description: errorMessage(err) }),
    });
  };

  const handleResetPassword = () => {
    if (!resetting) return;
    if (resetPassword.length < 6) {
      toast({ variant: "destructive", title: "كلمة المرور قصيرة", description: "6 أحرف على الأقل" });
      return;
    }
    resetPasswordMutation.mutate({ id: resetting.id, data: { password: resetPassword } }, {
      onSuccess: () => {
        invalidate();
        toast({ title: "تمت إعادة تعيين كلمة المرور", description: `سيُطلب من ${resetting.email} تغييرها عند الدخول` });
        setResetting(null);
        setResetPassword("");
      },
      onError: (err) => toast({ variant: "destructive", title: "فشل إعادة التعيين", description: errorMessage(err) }),
    });
  };

  const handleDelete = () => {
    if (!deleting) return;
    deleteMutation.mutate({ id: deleting.id }, {
      onSuccess: () => {
        invalidate();
        toast({ title: "تم حذف الحساب", description: `تم حذف ${deleting.email}` });
        setDeleting(null);
      },
      onError: (err) => {
        toast({ variant: "destructive", title: "فشل حذف الحساب", description: errorMessage(err) });
        setDeleting(null);
      },
    });
  };

  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const canSubmit = emailValid && password.length >= 6 && !createMutation.isPending;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <UserCog className="h-6 w-6" /> المستخدمون
        </h1>
        <Button onClick={() => setShowCreate(true)}>
          <Plus className="h-4 w-4 ml-2" /> إضافة مستخدم
        </Button>
      </div>

      <Card>
        <CardContent className="pt-6">
          {isLoading ? (
            <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-right">البريد الإلكتروني</TableHead>
                  <TableHead className="text-right">الدور</TableHead>
                  <TableHead className="text-right">الحالة</TableHead>
                  <TableHead className="text-right">كلمة المرور</TableHead>
                  <TableHead className="text-right">إجراءات</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users?.map((u) => {
                  const isSelf = me?.id === u.id;
                  const ageDays = passwordAgeDays(u.passwordChangedAt);
                  const overdue = isPasswordOverdue(u.passwordChangedAt);
                  return (
                    <TableRow
                      key={u.id}
                      className={[
                        u.disabled ? "opacity-60" : "",
                        overdue && !u.disabled ? "bg-destructive/5" : "",
                      ].filter(Boolean).join(" ") || undefined}
                    >
                      <TableCell dir="ltr" className="text-right font-medium">
                        {u.email}
                        {isSelf && <Badge variant="secondary" className="mr-2 text-xs">أنت</Badge>}
                      </TableCell>
                      <TableCell>
                        {isSelf ? (
                          <Badge>{roleLabel(u.role)}</Badge>
                        ) : (
                          <Select value={u.role} onValueChange={(v) => handleRoleChange(u, v)}>
                            <SelectTrigger className="w-28 h-8">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="admin">مدير</SelectItem>
                              <SelectItem value="accountant">محاسب</SelectItem>
                              <SelectItem value="viewer">مشاهد</SelectItem>
                            </SelectContent>
                          </Select>
                        )}
                      </TableCell>
                      <TableCell>
                        {u.disabled ? (
                          <Badge variant="destructive">معطّل</Badge>
                        ) : (
                          <Badge variant="outline" className="text-green-700 border-green-300">نشط</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        {ageDays === null ? (
                          <span className="text-muted-foreground text-sm">غير معروف</span>
                        ) : overdue ? (
                          isSelf ? (
                            <Badge variant="destructive" className="gap-1 font-normal">
                              <AlertTriangle className="h-3.5 w-3.5" />
                              متأخرة — {passwordAgeLabel(ageDays)}
                            </Badge>
                          ) : (
                            <button
                              type="button"
                              title="فرض إعادة تعيين كلمة المرور"
                              onClick={() => { setResetting(u); setResetPassword(generateTempPassword()); }}
                              disabled={resetPasswordMutation.isPending}
                              className="inline-flex items-center gap-1 rounded-md bg-destructive px-2 py-1 text-xs font-normal text-destructive-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
                            >
                              <AlertTriangle className="h-3.5 w-3.5" />
                              متأخرة — {passwordAgeLabel(ageDays)}
                              <KeyRound className="h-3.5 w-3.5" />
                            </button>
                          )
                        ) : (
                          <span
                            className={
                              ageDays >= PASSWORD_MAX_AGE_DAYS - 14
                                ? "text-amber-600 text-sm"
                                : "text-muted-foreground text-sm"
                            }
                          >
                            {passwordAgeLabel(ageDays)}
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        {!isSelf && (
                          <div className="flex gap-1.5 flex-wrap">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleToggleDisabled(u)}
                              disabled={updateMutation.isPending}
                            >
                              {u.disabled ? (
                                <><CircleCheck className="h-3.5 w-3.5 ml-1.5" /> تفعيل</>
                              ) : (
                                <><Ban className="h-3.5 w-3.5 ml-1.5" /> تعطيل</>
                              )}
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-muted-foreground"
                              onClick={() => { setResetting(u); setResetPassword(""); }}
                              disabled={resetPasswordMutation.isPending}
                            >
                              <KeyRound className="h-3.5 w-3.5 ml-1.5" /> إعادة تعيين
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-muted-foreground hover:text-destructive"
                              onClick={() => setDeleting(u)}
                              disabled={deleteMutation.isPending}
                            >
                              <Trash2 className="h-3.5 w-3.5 ml-1.5" /> حذف
                            </Button>
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
                {users?.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                      لا يوجد مستخدمون
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={showCreate} onOpenChange={(open) => { setShowCreate(open); if (!open) resetForm(); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>إضافة مستخدم جديد</DialogTitle>
            <DialogDescription>
              أنشئ حساباً جديداً بكلمة مرور مؤقتة، ويمكن للمستخدم تغييرها لاحقاً من داخل التطبيق
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>البريد الإلكتروني</Label>
              <Input
                type="email"
                dir="ltr"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="user@example.com"
              />
            </div>
            <div className="space-y-1.5">
              <Label>كلمة المرور المؤقتة</Label>
              <Input
                type="text"
                dir="ltr"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="6 أحرف على الأقل"
              />
            </div>
            <div className="space-y-1.5">
              <Label>الدور</Label>
              <Select value={role} onValueChange={(v) => setRole(v as ManagedUserRole)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">مدير — كل الصلاحيات</SelectItem>
                  <SelectItem value="accountant">محاسب — إدارة الرسوم والمدفوعات</SelectItem>
                  <SelectItem value="viewer">مشاهد — عرض فقط</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <DialogFooter className="mt-4 gap-2">
              <Button variant="outline" onClick={() => { setShowCreate(false); resetForm(); }}>إلغاء</Button>
              <Button onClick={handleCreate} disabled={!canSubmit}>
                {createMutation.isPending && <Loader2 className="h-4 w-4 animate-spin ml-2" />}
                إنشاء الحساب
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!resetting} onOpenChange={(open) => { if (!open) { setResetting(null); setResetPassword(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>إعادة تعيين كلمة المرور</DialogTitle>
            <DialogDescription>
              أدخل كلمة مرور مؤقتة جديدة لـ {resetting?.email}. سيُطلب منه تغييرها فور تسجيل الدخول.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>كلمة المرور المؤقتة الجديدة</Label>
              <Input
                type="text"
                dir="ltr"
                value={resetPassword}
                onChange={(e) => setResetPassword(e.target.value)}
                placeholder="6 أحرف على الأقل"
                autoComplete="off"
              />
            </div>
            <DialogFooter className="mt-4 gap-2">
              <Button variant="outline" onClick={() => { setResetting(null); setResetPassword(""); }}>إلغاء</Button>
              <Button
                onClick={handleResetPassword}
                disabled={resetPassword.length < 6 || resetPasswordMutation.isPending}
              >
                {resetPasswordMutation.isPending && <Loader2 className="h-4 w-4 animate-spin ml-2" />}
                تعيين كلمة المرور
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleting} onOpenChange={(open) => { if (!open) setDeleting(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>حذف الحساب</AlertDialogTitle>
            <AlertDialogDescription>
              هل أنت متأكد من حذف حساب {deleting?.email}؟ لن يتمكن من تسجيل الدخول بعد الحذف. سيبقى سجل التدقيق محفوظاً.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {deleteMutation.isPending && <Loader2 className="h-4 w-4 animate-spin ml-2" />}
              حذف
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
