import { Check, ChevronsUpDown, Settings2, UserRound } from "lucide-react"
import { useState } from "react"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { useExtensionState } from "@/context/ExtensionStateContext"
import { useProfiles } from "@/context/ProfileContext"
import { cn } from "@/lib/utils"
import { providerLabel } from "../settings/sections/ProfilesSection"

/**
 * Compact profile switcher for the chat input toolbar: one click to swap the
 * whole provider setup (provider, model, API key, endpoints).
 */
const ProfileQuickSwitcher = () => {
	const { profiles, activeProfileId, activeProfile, activate } = useProfiles()
	const { navigateToSettingsModelPicker } = useExtensionState()
	const [open, setOpen] = useState(false)
	const [switchingId, setSwitchingId] = useState<string | null>(null)

	const label = activeProfile?.name ?? "No profile"

	const handleActivate = async (id: string) => {
		if (id === activeProfileId) {
			setOpen(false)
			return
		}
		setSwitchingId(id)
		try {
			await activate(id)
			setOpen(false)
		} catch {
			// The settings section shows the error; keep the menu open.
		} finally {
			setSwitchingId(null)
		}
	}

	return (
		<Popover onOpenChange={setOpen} open={open}>
			<PopoverTrigger asChild>
				<button
					aria-label={`Agent profile: ${label}`}
					className={cn(
						"flex h-5 min-w-0 max-w-[9rem] cursor-pointer items-center gap-1 rounded border-0 bg-transparent px-1 text-xs",
						activeProfile ? "text-foreground/90" : "text-description",
						"hover:bg-[var(--vscode-toolbar-hoverBackground)]",
					)}
					data-testid="profile-quick-switcher"
					title={activeProfile ? `Profile: ${activeProfile.name}` : "Switch provider profile"}
					type="button">
					<UserRound className="size-3 shrink-0" />
					<span className="truncate text-[10px]">{label}</span>
					<ChevronsUpDown className="size-2.5 shrink-0 opacity-70" />
				</button>
			</PopoverTrigger>
			<PopoverContent align="start" className="w-72 p-1" side="top">
				<div className="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-description">Profiles</div>
				{profiles.length === 0 ? (
					<p className="m-0 px-2 py-1 text-xs text-description">
						No profiles yet. Save your current provider setup in Settings → API Configuration.
					</p>
				) : (
					<div className="flex max-h-64 flex-col overflow-y-auto">
						{profiles.map((profile) => (
							<button
								className="flex w-full cursor-pointer items-center gap-2 rounded border-0 bg-transparent px-2 py-1.5 text-left text-xs hover:bg-[var(--vscode-list-hoverBackground)]"
								disabled={switchingId !== null}
								key={profile.id}
								onClick={() => void handleActivate(profile.id)}
								type="button">
								<span className="min-w-0 flex-1">
									<span className="block truncate">{profile.name}</span>
									<span className="block truncate text-[10px] text-description">
										{providerLabel(profile.provider)}
										{profile.modelId ? ` · ${profile.modelId}` : ""}
									</span>
								</span>
								{profile.id === activeProfileId ? <Check className="size-3 shrink-0" /> : null}
							</button>
						))}
					</div>
				)}
				<button
					className="mt-1 flex w-full cursor-pointer items-center gap-2 rounded border-0 border-t border-t-menu-foreground/10 bg-transparent px-2 py-1.5 text-left text-xs hover:bg-[var(--vscode-list-hoverBackground)]"
					onClick={() => {
						setOpen(false)
						navigateToSettingsModelPicker({ targetSection: "api-config" })
					}}
					type="button">
					<Settings2 className="size-3" />
					Manage profiles…
				</button>
			</PopoverContent>
		</Popover>
	)
}

export default ProfileQuickSwitcher
