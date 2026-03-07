"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Github, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useAuth } from "@/hooks/use-auth"
import { openExternal } from "@/lib/utils"
import { getLoginUrl } from "@/lib/api"

export default function LoginPage() {
  const router = useRouter()
  const { isAuthenticated, isLoading: authLoading } = useAuth()
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  const handleGitHubLogin = async () => {
    setIsLoading(true)
    setError(null)
    try {
      await openExternal(getLoginUrl())
    } catch {
      setError("Failed to open browser for GitHub login")
    }
  }

  useEffect(() => {
    if (!authLoading && isAuthenticated) {
      router.replace("/")
    }
  }, [authLoading, isAuthenticated, router])

  return (
    <div className="min-h-screen bg-linear-bg flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo / Header */}
        <div className="text-center mb-8">
          <img
            src="/logo.png"
            alt="OpenLinear"
            className="h-12 mx-auto mb-4"
          />
          <p className="text-sm text-linear-text-secondary">
            Sign in to continue
          </p>
        </div>

        {/* Card */}
        <div className="bg-linear-bg-secondary border border-linear-border rounded-lg p-6">
          <div className="space-y-4">
            <p className="text-sm text-linear-text-secondary text-center">
              Sign in with your GitHub account to access OpenLinear
            </p>

            {error && (
              <div className="p-3 rounded-md bg-destructive/10 border border-destructive/20">
                <p className="text-sm text-destructive">{error}</p>
              </div>
            )}

            <Button
              onClick={handleGitHubLogin}
              disabled={isLoading}
              className="w-full bg-[#24292e] hover:bg-[#1b1f23] text-white disabled:opacity-70"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                  Waiting for GitHub...
                </>
              ) : (
                <>
                  <Github className="w-5 h-5 mr-2" />
                  Sign in with GitHub
                </>
              )}
            </Button>
          </div>
        </div>

        {/* Footer */}
        <p className="text-center text-xs text-linear-text-tertiary mt-6">
          By signing in, you agree to our Terms of Service and Privacy Policy
        </p>
      </div>
    </div>
  )
}
