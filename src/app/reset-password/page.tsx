'use client'

import Link from 'next/link'
import { useActionState } from 'react'
import { resetPassword, type ResetPasswordState } from './actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card'

const initialState: ResetPasswordState = {
  message: '',
  error: '',
}

export default function ResetPasswordPage() {
  const [state, action, isPending] = useActionState(resetPassword, initialState)

  return (
    <div className="flex min-h-screen w-full flex-col items-center justify-center bg-[#FAFAF9] p-4 relative overflow-hidden">
      <div className="absolute top-[-20%] right-[-10%] w-[600px] h-[600px] bg-stone-200/30 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-20%] left-[-10%] w-[500px] h-[500px] bg-stone-200/20 rounded-full blur-[100px] pointer-events-none" />

      <div className="w-full max-w-[400px] z-10 flex flex-col gap-8">
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-serif font-medium tracking-tight text-black/90">
            重置密码
          </h1>
          <p className="text-sm text-black/40 tracking-widest uppercase font-light">
            Inkplot Workshop
          </p>
        </div>

        <Card className="border-none shadow-xl shadow-black/[0.03] bg-white/80 backdrop-blur-sm rounded-3xl overflow-hidden">
          <CardHeader className="text-center pb-2 pt-8">
            <CardTitle className="text-2xl font-serif font-normal text-black/80">设置新密码</CardTitle>
            <CardDescription className="text-black/40 font-light">
              输入新密码后即可完成重置
            </CardDescription>
          </CardHeader>
          <form action={action}>
            <CardContent className="space-y-6 pt-6">
              <div className="space-y-2">
                <Label htmlFor="password" className="text-xs uppercase tracking-wider text-black/40 font-medium pl-1">新密码</Label>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  required
                  className="h-12 bg-black/[0.02] border-transparent focus:bg-white focus:border-black/10 rounded-xl transition-all duration-300 text-black/80"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirmPassword" className="text-xs uppercase tracking-wider text-black/40 font-medium pl-1">确认密码</Label>
                <Input
                  id="confirmPassword"
                  name="confirmPassword"
                  type="password"
                  required
                  className="h-12 bg-black/[0.02] border-transparent focus:bg-white focus:border-black/10 rounded-xl transition-all duration-300 text-black/80"
                />
              </div>
              {state?.error && (
                <div className="text-sm text-red-600 bg-red-50/50 p-3 rounded-lg border border-red-100 flex items-center justify-center">
                  {state.error}
                </div>
              )}
              {state?.message && (
                <div className="text-sm text-emerald-600 bg-emerald-50/50 p-3 rounded-lg border border-emerald-100 flex items-center justify-center">
                  {state.message}
                </div>
              )}
            </CardContent>
            <CardFooter className="pb-8 pt-2 flex flex-col gap-3">
              <Button
                type="submit"
                className="w-full h-12 rounded-xl bg-black text-white hover:bg-black/80 transition-all duration-300 font-medium text-base shadow-lg shadow-black/5"
                disabled={isPending}
              >
                {isPending ? '提交中...' : '更新密码'}
              </Button>
              <Link href="/login" className="text-sm text-black/50 hover:text-black/80 transition-colors">
                返回登录
              </Link>
            </CardFooter>
          </form>
        </Card>
      </div>
    </div>
  )
}
