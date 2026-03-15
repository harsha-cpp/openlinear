"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Github, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useAuth } from "@/hooks/use-auth"
import {
  checkDesktopGitHubAuth,
  getLoginUrl,
  isDesktopRuntime,
  loginUser,
  loginWithDesktopGitHubAuth,
  pollGitHubDeviceLogin,
  registerUser,
  startGitHubDeviceLogin,
  type GitHubDeviceStartResponse,
} from "@/lib/api"
import { openExternal } from "@/lib/utils"

async function storeGitHubAccessToken(accessToken?: string) {
  if (!accessToken || typeof window === "undefined" || !("__TAURI_INTERNALS__" in window)) {
    return
  }

  try {
    const { invoke } = await import("@tauri-apps/api/core")
    await invoke("store_secret", { key: "github_token", value: accessToken })
  } catch (error) {
    console.error("Failed to store GitHub token:", error)
  }
}

export default function LoginPage() {
  const router = useRouter()
  const { isAuthenticated, isLoading: authLoading } = useAuth()
  const [desktopRuntime, setDesktopRuntime] = useState(false)
  const [localAuthAvailable, setLocalAuthAvailable] = useState<boolean | null>(null)
  const [localAuthSource, setLocalAuthSource] = useState<string | null>(null)
  const [deviceLogin, setDeviceLogin] = useState<GitHubDeviceStartResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [showCredentials, setShowCredentials] = useState(false)
  const [isRegister, setIsRegister] = useState(false)
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")

  const finishLogin = async (token: string, accessToken?: string) => {
    await storeGitHubAccessToken(accessToken)
    localStorage.setItem("token", token)
    window.location.assign("/")
  }

  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

  const startDesktopDeviceFlow = async () => {
    const device = await startGitHubDeviceLogin()
    setDeviceLogin(device)

    await openExternal(device.verification_uri_complete ?? device.verification_uri)

    let retryAfterSeconds = device.interval ?? 5
    const expiresAt = Date.now() + device.expires_in * 1000

    while (Date.now() < expiresAt) {
      await sleep(retryAfterSeconds * 1000)

      const result = await pollGitHubDeviceLogin(device.device_code)
      if (result.status === "complete") {
        await finishLogin(result.token, result.githubAccessToken)
        return
      }

      retryAfterSeconds = result.retryAfterSeconds ?? device.interval ?? 5
    }

    throw new Error("GitHub device login timed out. Start again.")
  }

  const handleGitHubLogin = async () => {
    setIsLoading(true)
    setError(null)
    setDeviceLogin(null)

    try {
      if (isDesktopRuntime()) {
        try {
          const result = await loginWithDesktopGitHubAuth()
          await finishLogin(result.token, result.githubAccessToken)
          return
        } catch {
          await startDesktopDeviceFlow()
          return
        }
      }

      window.location.assign(getLoginUrl())
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : "Failed to start GitHub login")
    } finally {
      setIsLoading(false)
    }
  }

  const handleCredentialSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!username.trim() || !password.trim()) return

    setIsLoading(true)
    setError(null)

    try {
      const result = isRegister
        ? await registerUser(username.trim(), password)
        : await loginUser(username.trim(), password)
      localStorage.setItem("token", result.token)
      window.location.assign("/")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Authentication failed")
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    const isDesktop = isDesktopRuntime()
    setDesktopRuntime(isDesktop)

    if (isDesktop) {
      checkDesktopGitHubAuth().then(({ available, source }) => {
        setLocalAuthAvailable(available)
        setLocalAuthSource(source)
      })
    }
  }, [])

  useEffect(() => {
    if (!authLoading && isAuthenticated) {
      router.replace("/")
    }
  }, [authLoading, isAuthenticated, router])

  return (
    <div className="min-h-screen bg-linear-bg flex items-center justify-center p-4">
      <div className="w-full max-w-md">
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

        <div className="bg-linear-bg-secondary border border-linear-border rounded-lg p-6">
          <div className="space-y-4">
            <p className="text-sm text-linear-text-secondary text-center">
              {desktopRuntime && localAuthAvailable
                ? `Sign in with local GitHub auth (${localAuthSource === "gh" ? "gh CLI" : ".env token"})`
                : desktopRuntime
                  ? "Sign in with GitHub. If no local token is available, OpenLinear will open GitHub device login in your browser."
                  : "Sign in with your GitHub account to access OpenLinear"}
            </p>

            {error && (
              <div className="p-3 rounded-md bg-destructive/10 border border-destructive/20">
                <p className="text-sm text-destructive">{error}</p>
              </div>
            )}

            {deviceLogin && (
              <div className="space-y-3 rounded-md border border-linear-border bg-linear-bg p-4">
                <div>
                  <p className="text-xs uppercase tracking-wide text-linear-text-tertiary">GitHub device code</p>
                  <p className="mt-1 font-mono text-xl text-linear-text-primary">{deviceLogin.user_code}</p>
                </div>
                <p className="text-xs text-linear-text-secondary">
                  Approve the login in GitHub, then this window will finish signing you in automatically.
                </p>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  onClick={() => void openExternal(deviceLogin.verification_uri_complete ?? deviceLogin.verification_uri)}
                >
                  Open GitHub verification page
                </Button>
              </div>
            )}

            <Button
              onClick={handleGitHubLogin}
              disabled={isLoading && !showCredentials}
              className="w-full bg-[#24292e] hover:bg-[#1b1f23] text-white disabled:opacity-70"
            >
              {isLoading && !showCredentials ? (
                <>
                  <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                  {deviceLogin
                    ? "Waiting for GitHub approval..."
                    : desktopRuntime && localAuthAvailable
                      ? "Importing GitHub auth..."
                      : desktopRuntime
                        ? "Starting GitHub device login..."
                        : "Redirecting to GitHub..."}
                </>
              ) : (
                <>
                  <Github className="w-5 h-5 mr-2" />
                  Sign in with GitHub
                </>
              )}
            </Button>

            {showCredentials ? (
              <>
                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t border-linear-border" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-linear-bg-secondary px-2 text-linear-text-tertiary">
                      {isRegister ? "create account" : "or sign in with credentials"}
                    </span>
                  </div>
                </div>

                <form onSubmit={handleCredentialSubmit} className="space-y-3">
                  <input
                    type="text"
                    placeholder="Username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="w-full rounded-md border border-linear-border bg-linear-bg px-3 py-2 text-sm text-linear-text-primary placeholder:text-linear-text-tertiary focus:outline-none focus:ring-1 focus:ring-linear-accent"
                    autoComplete="username"
                  />
                  <input
                    type="password"
                    placeholder="Password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full rounded-md border border-linear-border bg-linear-bg px-3 py-2 text-sm text-linear-text-primary placeholder:text-linear-text-tertiary focus:outline-none focus:ring-1 focus:ring-linear-accent"
                    autoComplete={isRegister ? "new-password" : "current-password"}
                  />
                  <Button
                    type="submit"
                    disabled={isLoading || !username.trim() || !password.trim()}
                    className="w-full"
                  >
                    {isLoading ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : null}
                    {isRegister ? "Create account" : "Sign in"}
                  </Button>
                </form>

                <p className="text-center text-xs text-linear-text-tertiary">
                  {isRegister ? (
                    <>Already have an account?{" "}
                      <button type="button" onClick={() => { setIsRegister(false); setError(null) }} className="text-linear-text-secondary hover:text-linear-text-primary underline">
                        Sign in
                      </button>
                    </>
                  ) : (
                    <>No account?{" "}
                      <button type="button" onClick={() => { setIsRegister(true); setError(null) }} className="text-linear-text-secondary hover:text-linear-text-primary underline">
                        Create one
                      </button>
                    </>
                  )}
                </p>
              </>
            ) : (
              <p className="text-center text-xs text-linear-text-tertiary">
                <button
                  type="button"
                  onClick={() => setShowCredentials(true)}
                  className="text-linear-text-secondary hover:text-linear-text-primary underline"
                >
                  Sign in without GitHub
                </button>
              </p>
            )}
          </div>
        </div>

        <p className="text-center text-xs text-linear-text-tertiary mt-6">
          By signing in, you agree to our Terms of Service and Privacy Policy
        </p>
      </div>
    </div>
  )
}
