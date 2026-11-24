import { VSCodeButton, VSCodeTextField } from "@vscode/webview-ui-toolkit/react"
import { Check, Pencil, Trash2, UserRound } from "lucide-react"
import { type FormEvent, useState } from "react"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useProfiles } from "@/context/ProfileContext"

const PROVIDER_LABELS: Record<string, string> = {
	anthropic: "Anthropic",
	openrouter: "OpenRouter",
	cline: "Cline",
	openai: "OpenAI compatible",
	"openai-compatible": "OpenAI compatible",
	"openai-native": "OpenAI",
	gemini: "Gemini",
	deepseek: "DeepSeek",
	ollama: "Ollama",
	lmstudio: "LM Studio",
	litellm: "LiteLLM",
	requesty: "Requesty",
	together: "Together",
	fireworks: "Fireworks",
	groq: "Groq",
	xai: "xAI",
	bedrock: "AWS Bedrock",
	vertex: "Google Vertex",
	qwen: "Qwen",
	mistral: "Mistral",
	moonshot: "Moonshot",
	zai: "Z.ai",
	vercel: "Vercel AI Gateway",
	hicap: "Hicap",
	baseten: "Baseten",
	oca: "Oracle Code Assist",
	sapaicore: "SAP AI Core",
}

export function providerLabel(providerId: string): string {
	if (!providerId) {
		return "Default provider"
	}
	return PROVIDER_LABELS[providerId] ?? providerId.charAt(0).toUpperCase() + providerId.slice(1)
}

/**
 * Profile manager shown at the top of API Configuration: create a profile from
 * the current setup, switch between profiles, rename and delete them.
 */
const ProfilesSection = () => {
	const { profiles, activeProfileId, activeProfile, saveCurrent, activate, rename, remove, error, clearError } = useProfiles()
	const [editor, setEditor] = useState<"create" | "rename" | null>(null)
	const [nameInput, setNameInput] = useState("")
	const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)
	const [busy, setBusy] = useState(false)

	const startCreate = () => {
		clearError()
		setPendingDeleteId(null)
		setNameInput(activeProfile ? `${activeProfile.name} copy` : "")
		setEditor("create")
	}

	const startRename = () => {
		if (!activeProfile) {
			return
		}
		clearError()
		setPendingDeleteId(null)
		setNameInput(activeProfile.name)
		setEditor("rename")
	}

	const cancelEditor = () => {
		setEditor(null)
		setNameInput("")
	}

	const submitEditor = async (event?: FormEvent) => {
		event?.preventDefault()
		const name = nameInput.trim()
		if (!name || busy) {
			return
		}
		setBusy(true)
		try {
			if (editor === "create") {
				await saveCurrent(name)
			} else if (editor === "rename" && activeProfile) {
				await rename(activeProfile.id, name)
			}
			cancelEditor()
		} catch {
			// Error surfaced through the shared `error` state.
		} finally {
			setBusy(false)
		}
	}

	const handleActivate = async (id: string) => {
		if (id === activeProfileId) {
			return
		}
		try {
			await activate(id)
		} catch {
			// Error surfaced through the shared `error` state.
		}
	}

	const confirmDelete = async () => {
		if (!pendingDeleteId || busy) {
			return
		}
		setBusy(true)
		try {
			await remove(pendingDeleteId)
			setPendingDeleteId(null)
		} catch {
			// Error surfaced through the shared `error` state.
		} finally {
			setBusy(false)
		}
	}

	const pendingDeleteProfile = profiles.find((profile) => profile.id === pendingDeleteId)

	return (
		<div
			className="flex flex-col gap-2 rounded-md border border-editor-group-border px-3 py-2.5"
			data-testid="profiles-section">
			<div className="flex flex-col gap-0.5">
				<div className="flex items-center gap-2 text-sm font-semibold">
					<UserRound className="size-4" />
					<span>Profiles</span>
				</div>
				<span className="text-xs text-description">Provider, model, key and endpoints in one click.</span>
			</div>

			{profiles.length === 0 ? (
				<>
					<p className="m-0 text-xs text-description">
						Save your current provider setup as a profile. Any provider, model, API key, base URL, region or thinking
						budget is captured, so you can jump between setups without retyping keys.
					</p>
					<div>
						<VSCodeButton appearance="primary" onClick={startCreate}>
							Save current setup as profile
						</VSCodeButton>
					</div>
				</>
			) : (
				<>
					<Select onValueChange={(value) => void handleActivate(value)} value={activeProfileId || undefined}>
						<SelectTrigger aria-label="Active profile" className="w-full" size="sm">
							<SelectValue placeholder="No profile active" />
						</SelectTrigger>
						<SelectContent>
							{profiles.map((profile) => (
								<SelectItem key={profile.id} value={profile.id}>
									{profile.name}
								</SelectItem>
							))}
						</SelectContent>
					</Select>

					<div className="flex flex-wrap items-center gap-1.5">
						<VSCodeButton appearance="primary" onClick={startCreate}>
							Save current as new
						</VSCodeButton>
						{activeProfile ? (
							<>
								<VSCodeButton appearance="secondary" onClick={startRename}>
									<Pencil className="size-3" /> Rename
								</VSCodeButton>
								<VSCodeButton appearance="secondary" onClick={() => setPendingDeleteId(activeProfile.id)}>
									<Trash2 className="size-3" /> Delete
								</VSCodeButton>
							</>
						) : null}
					</div>
				</>
			)}

			{activeProfile ? (
				<div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-description">
					<Check className="size-3 text-[var(--vscode-testing-iconPassed)]" />
					<span className="font-medium text-foreground">{activeProfile.name}</span>
					<span>·</span>
					<span>{providerLabel(activeProfile.provider)}</span>
					{activeProfile.modelId ? (
						<>
							<span>·</span>
							<span className="truncate">{activeProfile.modelId}</span>
						</>
					) : null}
					{activeProfile.modified ? (
						<span
							className="text-[var(--vscode-editorWarning-foreground)]"
							title="Live settings differ from the saved profile">
							· modified
						</span>
					) : null}
				</div>
			) : null}

			{editor ? (
				<form className="flex flex-wrap items-center gap-2" onSubmit={(event) => void submitEditor(event)}>
					<VSCodeTextField
						aria-label="Profile name"
						className="min-w-[13rem] flex-1"
						onInput={(event) => setNameInput((event.target as HTMLInputElement).value)}
						placeholder="Profile name, e.g. Work – Claude"
						value={nameInput}
					/>
					<VSCodeButton disabled={!nameInput.trim() || busy} type="submit">
						{editor === "create" ? "Create profile" : "Rename"}
					</VSCodeButton>
					<VSCodeButton appearance="secondary" onClick={cancelEditor} type="button">
						Cancel
					</VSCodeButton>
				</form>
			) : null}

			{pendingDeleteProfile ? (
				<div className="flex flex-wrap items-center gap-2 text-xs">
					<span>
						Delete profile <span className="font-medium">{pendingDeleteProfile.name}</span>? The current provider
						settings stay as they are.
					</span>
					<VSCodeButton appearance="primary" disabled={busy} onClick={() => void confirmDelete()}>
						Delete
					</VSCodeButton>
					<VSCodeButton appearance="secondary" onClick={() => setPendingDeleteId(null)}>
						Cancel
					</VSCodeButton>
				</div>
			) : null}

			{error ? (
				<p className="m-0 text-xs text-[var(--vscode-errorForeground)]" role="alert">
					{error}
				</p>
			) : null}
		</div>
	)
}

export default ProfilesSection
