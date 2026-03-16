"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Github, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useAuth } from "@/hooks/use-auth"
import {
  checkDesktopGitHubAuth,
  createLocalSession,
  getLoginUrl,
  isDesktopRuntime,
  loginWithDesktopGitHubAuth,
  pollGitHubDeviceLogin,
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
  const [activeAction, setActiveAction] = useState<"github" | "local" | null>(null)

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
    setActiveAction("github")
    setError(null)
    setDeviceLogin(null)

    if (!isDesktopRuntime()) {
      window.location.assign(getLoginUrl())
      return
    }

    try {
      const shouldTryLocalAuth = localAuthAvailable !== false

      if (shouldTryLocalAuth) {
        const result = await loginWithDesktopGitHubAuth()
        await finishLogin(result.token, result.githubAccessToken)
        return
      }

      await startDesktopDeviceFlow()
      return
    } catch (loginError) {
      const message = loginError instanceof Error ? loginError.message : "Failed to start GitHub login"

      if (
        message.includes("No local GitHub auth found")
      ) {
        try {
          await startDesktopDeviceFlow()
          return
        } catch (deviceError) {
          setError(deviceError instanceof Error ? deviceError.message : "Failed to start GitHub login")
          return
        }
      }

      setError(message)
    } finally {
      setActiveAction(null)
    }
  }

  const handleLocalContinue = async () => {
    setActiveAction("local")
    setError(null)

    try {
      const result = await createLocalSession()
      await finishLogin(result.token)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to continue without GitHub")
    } finally {
      setActiveAction(null)
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
              disabled={activeAction !== null}
              className="w-full bg-[#24292e] hover:bg-[#1b1f23] text-white disabled:opacity-70"
            >
              {activeAction === "github" ? (
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

            {desktopRuntime && (
              <Button
                type="button"
                variant="outline"
                onClick={handleLocalContinue}
                disabled={activeAction !== null}
                className="w-full"
              >
                {activeAction === "local" ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Starting local workspace...
                  </>
                ) : (
                  "Continue without GitHub"
                )}
              </Button>
            )}

            {desktopRuntime && (
              <p className="text-center text-xs text-linear-text-tertiary">
                You can connect GitHub later to import private repositories.
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
