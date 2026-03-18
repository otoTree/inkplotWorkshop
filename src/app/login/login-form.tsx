'use client'

import { useActionState } from 'react'
import { forgotPassword, login, signup, type AuthState } from './actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

const initialState: AuthState = {
  message: '',
  error: '',
}

export function LoginForm() {
  const [loginState, loginAction, isLoginPending] = useActionState(login, initialState)
  const [signupState, signupAction, isSignupPending] = useActionState(signup, initialState)
  const [forgotState, forgotAction, isForgotPending] = useActionState(forgotPassword, initialState)

  return (
    <div className="w-full">
      <Tabs defaultValue="login" className="w-full">
        <TabsList className="grid w-full grid-cols-2 bg-black/[0.03] p-1 rounded-full mb-8">
          <TabsTrigger 
            value="login" 
            className="rounded-full data-[state=active]:bg-white data-[state=active]:text-black data-[state=active]:shadow-sm text-black/40 transition-all duration-300 font-medium"
          >
            登录
          </TabsTrigger>
          <TabsTrigger 
            value="register" 
            className="rounded-full data-[state=active]:bg-white data-[state=active]:text-black data-[state=active]:shadow-sm text-black/40 transition-all duration-300 font-medium"
          >
            注册
          </TabsTrigger>
        </TabsList>
      
        <TabsContent value="login" className="mt-0">
          <Card className="border-none shadow-xl shadow-black/[0.03] bg-white/80 backdrop-blur-sm rounded-3xl overflow-hidden">
            <CardHeader className="text-center pb-2 pt-8">
              <CardTitle className="text-2xl font-serif font-normal text-black/80">欢迎回来</CardTitle>
              <CardDescription className="text-black/40 font-light">
                继续您的创作之旅
              </CardDescription>
            </CardHeader>
            <form action={loginAction}>
              <CardContent className="space-y-6 pt-6">
                <div className="space-y-2">
                  <Label htmlFor="email" className="text-xs uppercase tracking-wider text-black/40 font-medium pl-1">邮箱</Label>
                  <Input 
                    id="email" 
                    name="email" 
                    type="email" 
                    placeholder="name@example.com" 
                    required 
                    className="h-12 bg-black/[0.02] border-transparent focus:bg-white focus:border-black/10 rounded-xl transition-all duration-300 text-black/80 placeholder:text-black/20"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password" className="text-xs uppercase tracking-wider text-black/40 font-medium pl-1">密码</Label>
                  <Input 
                    id="password" 
                    name="password" 
                    type="password" 
                    required 
                    className="h-12 bg-black/[0.02] border-transparent focus:bg-white focus:border-black/10 rounded-xl transition-all duration-300 text-black/80"
                  />
                </div>
                {loginState?.error && (
                  <div className="text-sm text-red-600 bg-red-50/50 p-3 rounded-lg border border-red-100 flex items-center justify-center">
                    {loginState.error}
                  </div>
                )}
                {loginState?.message && (
                  <div className="text-sm text-emerald-600 bg-emerald-50/50 p-3 rounded-lg border border-emerald-100 flex items-center justify-center">
                    {loginState.message}
                  </div>
                )}
              </CardContent>
              <CardFooter className="pb-8 pt-2">
                <Button 
                  type="submit" 
                  className="w-full h-12 rounded-xl bg-black text-white hover:bg-black/80 transition-all duration-300 font-medium text-base shadow-lg shadow-black/5" 
                  disabled={isLoginPending}
                >
                  {isLoginPending ? '登录中...' : '开始创作'}
                </Button>
              </CardFooter>
            </form>
            <form action={forgotAction}>
              <CardContent className="space-y-3 pt-0 pb-8">
                <Label htmlFor="forgot-email" className="text-xs uppercase tracking-wider text-black/40 font-medium pl-1">忘记密码</Label>
                <div className="flex gap-2">
                  <Input
                    id="forgot-email"
                    name="email"
                    type="email"
                    placeholder="输入注册邮箱"
                    required
                    className="h-10 bg-black/[0.02] border-transparent focus:bg-white focus:border-black/10 rounded-xl transition-all duration-300 text-black/80 placeholder:text-black/20"
                  />
                  <Button
                    type="submit"
                    variant="outline"
                    className="h-10 rounded-xl border-black/10 text-black/70 hover:text-black hover:bg-black/[0.03]"
                    disabled={isForgotPending}
                  >
                    {isForgotPending ? '发送中' : '发送重置'}
                  </Button>
                </div>
                {forgotState?.error && (
                  <div className="text-sm text-red-600 bg-red-50/50 p-3 rounded-lg border border-red-100 flex items-center justify-center">
                    {forgotState.error}
                  </div>
                )}
                {forgotState?.message && (
                  <div className="text-sm text-emerald-600 bg-emerald-50/50 p-3 rounded-lg border border-emerald-100 flex items-center justify-center">
                    {forgotState.message}
                  </div>
                )}
              </CardContent>
            </form>
          </Card>
        </TabsContent>

        <TabsContent value="register" className="mt-0">
          <Card className="border-none shadow-xl shadow-black/[0.03] bg-white/80 backdrop-blur-sm rounded-3xl overflow-hidden">
            <CardHeader className="text-center pb-2 pt-8">
              <CardTitle className="text-2xl font-serif font-normal text-black/80">创建账号</CardTitle>
              <CardDescription className="text-black/40 font-light">
                开启您的故事工坊
              </CardDescription>
            </CardHeader>
            <form action={signupAction}>
              <CardContent className="space-y-6 pt-6">
                <div className="space-y-2">
                  <Label htmlFor="register-email" className="text-xs uppercase tracking-wider text-black/40 font-medium pl-1">邮箱</Label>
                  <Input 
                    id="register-email" 
                    name="email" 
                    type="email" 
                    placeholder="name@example.com" 
                    required 
                    className="h-12 bg-black/[0.02] border-transparent focus:bg-white focus:border-black/10 rounded-xl transition-all duration-300 text-black/80 placeholder:text-black/20"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="register-password" className="text-xs uppercase tracking-wider text-black/40 font-medium pl-1">密码</Label>
                  <Input 
                    id="register-password" 
                    name="password" 
                    type="password" 
                    required 
                    className="h-12 bg-black/[0.02] border-transparent focus:bg-white focus:border-black/10 rounded-xl transition-all duration-300 text-black/80"
                  />
                </div>
                {signupState?.error && (
                  <div className="text-sm text-red-600 bg-red-50/50 p-3 rounded-lg border border-red-100 flex items-center justify-center">
                    {signupState.error}
                  </div>
                )}
                {signupState?.message && (
                  <div className="text-sm text-emerald-600 bg-emerald-50/50 p-3 rounded-lg border border-emerald-100 flex items-center justify-center">
                    {signupState.message}
                  </div>
                )}
              </CardContent>
              <CardFooter className="pb-8 pt-2">
                <Button 
                  type="submit" 
                  className="w-full h-12 rounded-xl bg-black text-white hover:bg-black/80 transition-all duration-300 font-medium text-base shadow-lg shadow-black/5" 
                  disabled={isSignupPending}
                >
                  {isSignupPending ? '注册中...' : '立即加入'}
                </Button>
              </CardFooter>
            </form>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
