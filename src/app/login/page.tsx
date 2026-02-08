import { LoginForm } from './login-form'

export default function LoginPage() {
  return (
    <div className="flex min-h-screen w-full flex-col items-center justify-center bg-[#FAFAF9] p-4 relative overflow-hidden">
      {/* Background Ambience */}
      <div className="absolute top-[-20%] right-[-10%] w-[600px] h-[600px] bg-stone-200/30 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-20%] left-[-10%] w-[500px] h-[500px] bg-stone-200/20 rounded-full blur-[100px] pointer-events-none" />

      <div className="w-full max-w-[400px] z-10 flex flex-col gap-8">
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-serif font-medium tracking-tight text-black/90">
            Inkplot Workshop
          </h1>
          <p className="text-sm text-black/40 tracking-widest uppercase font-light">
            Creation & Solitude
          </p>
        </div>
        
        <LoginForm />
        
        <footer className="text-center text-xs text-black/20 font-light">
          © 2026 Inkplot Workshop. All rights reserved.
        </footer>
      </div>
    </div>
  )
}
