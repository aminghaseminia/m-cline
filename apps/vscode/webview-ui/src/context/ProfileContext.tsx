import { EmptyRequest, StringRequest } from "@shared/proto/cline/common"
import { type ProfileSummary, type ProfilesState, RenameProfileRequest, SaveProfileRequest } from "@shared/proto/cline/profile"
import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from "react"
import { ProfileServiceClient } from "@/services/grpc-client"
import { useExtensionState } from "./ExtensionStateContext"

interface ProfileContextValue {
	profiles: ProfileSummary[]
	activeProfileId: string
	activeProfile: ProfileSummary | undefined
	loading: boolean
	error: string | null
	refresh: () => Promise<void>
	saveCurrent: (name: string) => Promise<void>
	activate: (id: string) => Promise<void>
	rename: (id: string, name: string) => Promise<void>
	remove: (id: string) => Promise<void>
	clearError: () => void
}

const noop = async () => {}

/**
 * Default used when a component renders outside ProfileProvider (tests,
 * storybook). Keeps those renders working instead of throwing.
 */
const EMPTY_PROFILE_STATE: ProfileContextValue = {
	profiles: [],
	activeProfileId: "",
	activeProfile: undefined,
	loading: false,
	error: null,
	refresh: noop,
	saveCurrent: noop,
	activate: noop,
	rename: noop,
	remove: noop,
	clearError: () => {},
}

const ProfileContext = createContext<ProfileContextValue>(EMPTY_PROFILE_STATE)

/**
 * M-Cline profiles: host-side snapshots of the provider configuration
 * (provider, model, API key, endpoints) that can be switched with one click.
 */
export const ProfileProvider = ({ children }: { children: ReactNode }) => {
	const { didHydrateState } = useExtensionState()
	const [profiles, setProfiles] = useState<ProfileSummary[]>([])
	const [activeProfileId, setActiveProfileId] = useState("")
	const [loading, setLoading] = useState(true)
	const [error, setError] = useState<string | null>(null)

	const apply = useCallback((state: ProfilesState) => {
		setProfiles(state.profiles)
		setActiveProfileId(state.activeProfileId)
	}, [])

	const run = useCallback(
		async (operation: () => Promise<ProfilesState>) => {
			try {
				setError(null)
				apply(await operation())
			} catch (caught) {
				const message = caught instanceof Error ? caught.message : String(caught)
				setError(message)
				throw caught
			}
		},
		[apply],
	)

	const refresh = useCallback(async () => {
		try {
			setError(null)
			apply(await ProfileServiceClient.getProfiles(EmptyRequest.create({})))
		} catch (caught) {
			// The gRPC bridge may not be up yet during startup; stay quiet then.
			setError(caught instanceof Error ? caught.message : String(caught))
		} finally {
			setLoading(false)
		}
	}, [apply])

	useEffect(() => {
		if (didHydrateState) {
			void refresh()
		}
	}, [didHydrateState, refresh])

	const saveCurrent = useCallback(
		async (name: string) => {
			await run(() => ProfileServiceClient.saveProfile(SaveProfileRequest.create({ name })))
		},
		[run],
	)

	const activate = useCallback(
		async (id: string) => {
			await run(() => ProfileServiceClient.activateProfile(StringRequest.create({ value: id })))
		},
		[run],
	)

	const rename = useCallback(
		async (id: string, name: string) => {
			await run(() => ProfileServiceClient.renameProfile(RenameProfileRequest.create({ id, name })))
		},
		[run],
	)

	const remove = useCallback(
		async (id: string) => {
			await run(() => ProfileServiceClient.deleteProfile(StringRequest.create({ value: id })))
		},
		[run],
	)

	const activeProfile = useMemo(() => profiles.find((profile) => profile.id === activeProfileId), [profiles, activeProfileId])

	const value = useMemo<ProfileContextValue>(
		() => ({
			profiles,
			activeProfileId,
			activeProfile,
			loading,
			error,
			refresh,
			saveCurrent,
			activate,
			rename,
			remove,
			clearError: () => setError(null),
		}),
		[profiles, activeProfileId, activeProfile, loading, error, refresh, saveCurrent, activate, rename, remove],
	)

	return <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>
}

export const useProfiles = () => useContext(ProfileContext)
