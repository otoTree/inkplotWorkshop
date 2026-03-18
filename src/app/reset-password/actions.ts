'use server'

import { createClient } from '@/lib/supabase/server'

export type ResetPasswordState = {
  error?: string
  message?: string
}

export async function resetPassword(prevState: ResetPasswordState, formData: FormData): Promise<ResetPasswordState> {
  const password = (formData.get('password') as string)?.trim()
  const confirmPassword = (formData.get('confirmPassword') as string)?.trim()

  if (!password || !confirmPassword) {
    return { error: '请完整填写新密码和确认密码' }
  }

  if (password.length < 8) {
    return { error: '密码至少需要 8 位' }
  }

  if (password !== confirmPassword) {
    return { error: '两次输入的密码不一致' }
  }

  const supabase = await createClient()
  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (userError || !user) {
    return { error: '重置链接已失效，请返回登录页重新发送重置邮件' }
  }

  const { error } = await supabase.auth.updateUser({ password })
  if (error) {
    return { error: error.message }
  }

  return { message: '密码已重置成功，请返回登录页使用新密码登录' }
}
