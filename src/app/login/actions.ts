'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { headers } from 'next/headers'

export type AuthState = {
  error?: string
  message?: string
}

function resolveAuthErrorMessage(error: unknown): string {
  if (typeof error === 'object' && error !== null) {
    const err = error as { message?: string; cause?: { code?: string; hostname?: string } }
    const code = err.cause?.code
    if (code === 'ENOTFOUND') {
      const host = err.cause?.hostname || 'Supabase'
      return `网络解析失败，暂时无法连接 ${host}，请检查 DNS 或代理设置后重试`
    }
    if (typeof err.message === 'string' && err.message.trim()) {
      return err.message
    }
  }
  return '请求失败，请稍后重试'
}

export async function login(prevState: AuthState, formData: FormData): Promise<AuthState> {
  const supabase = await createClient()

  const email = formData.get('email') as string
  const password = formData.get('password') as string

  let error: { message: string } | null = null
  try {
    const result = await supabase.auth.signInWithPassword({
      email,
      password,
    })
    error = result.error
  } catch (err) {
    return { error: resolveAuthErrorMessage(err) }
  }

  if (error) {
    return { error: error.message }
  }

  revalidatePath('/', 'layout')
  redirect('/')
}

export async function signup(prevState: AuthState, formData: FormData): Promise<AuthState> {
  const supabase = await createClient()
  const origin = (await headers()).get('origin')

  const email = formData.get('email') as string
  const password = formData.get('password') as string

  let data: { user: { identities?: unknown[] } | null } = { user: null }
  let error: { message: string } | null = null
  try {
    const result = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${origin}/auth/callback`,
      },
    })
    data = {
      user: result.data.user ? { identities: result.data.user.identities } : null,
    }
    error = result.error
  } catch (err) {
    return { error: resolveAuthErrorMessage(err) }
  }

  if (error) {
    return { error: error.message }
  }

  const isDuplicateEmail = Boolean(data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0)
  if (isDuplicateEmail) {
    return { error: '该邮箱已注册，请直接登录或使用忘记密码。' }
  }

  revalidatePath('/', 'layout')
  return { message: '请检查您的邮箱以完成注册验证' }
}

export async function forgotPassword(prevState: AuthState, formData: FormData): Promise<AuthState> {
  const supabase = await createClient()
  const origin = (await headers()).get('origin')
  const email = (formData.get('email') as string)?.trim()

  if (!email) {
    return { error: '请输入邮箱地址' }
  }

  let error: { message: string } | null = null
  try {
    const result = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${origin}/auth/callback?next=/reset-password`,
    })
    error = result.error
  } catch (err) {
    return { error: resolveAuthErrorMessage(err) }
  }

  if (error) {
    return { error: error.message }
  }

  return { message: '已发送重置密码邮件，请检查收件箱和垃圾邮件。' }
}
