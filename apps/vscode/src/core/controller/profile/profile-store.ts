import type { ApiConfiguration } from "@shared/api"
import { toLegacyApiProvider } from "@shared/model-catalog/provider-helpers"
import { ProfileSummary, ProfilesState } from "@shared/proto/cline/profile"
import { isSecretKey, type Secrets } from "@shared/storage/state-keys"
import type { StateManager } from "@/core/storage/StateManager"
import { Logger } from "@/shared/services/Logger"
import { resolveActiveModelIdFromApiConfiguration } from "../models/taskApiModel"

/**
 * M-Cline profiles.
 *
 * A profile is a snapshot of the provider configuration: provider id, model ids,
 * API key and endpoint/region settings. It is stored as two pieces so the keys
 * keep living in the secrets store (0600) instead of the general settings file:
 *
 *  - `mclineProfiles` global state: JSON array of `StoredProfile` (no secrets)
 *  - `mclineProfileSecrets` secret: JSON map of profileId -> { secretKey: value }
 *
 * Switching a profile simply writes the snapshot back through the regular
 * `StateManager.setApiConfiguration()` path, so every existing provider/session
 * code path keeps working unchanged.
 */

export interface StoredProfile {
	id: string
	name: string
	/** Provider id shown in the UI (act mode provider, falling back to plan mode). */
	provider: string
	/** Model id shown in the UI. */
	modelId: string
	createdAt: string
	updatedAt: string
	/** Non-secret ApiConfiguration entries (model ids, base urls, budgets, ...). */
	settings: Record<string, unknown>
}

type ProfileSecretMap = Record<string, Record<string, string>>

const PROFILES_KEY = "mclineProfiles"
const ACTIVE_PROFILE_KEY = "mclineActiveProfileId"
const PROFILE_SECRETS_KEY = "mclineProfileSecrets"

function safeParse<T>(raw: string | undefined, fallback: T): T {
	if (!raw) {
		return fallback
	}
	try {
		return JSON.parse(raw) as T
	} catch (error) {
		Logger.error("[Profiles] Failed to parse stored profiles:", error)
		return fallback
	}
}

function isStoredProfile(value: unknown): value is StoredProfile {
	if (!value || typeof value !== "object") {
		return false
	}
	const candidate = value as Partial<StoredProfile>
	return (
		typeof candidate.id === "string" &&
		typeof candidate.name === "string" &&
		typeof candidate.settings === "object" &&
		candidate.settings !== null
	)
}

export function readProfiles(stateManager: StateManager): StoredProfile[] {
	const parsed = safeParse<unknown>(stateManager.getGlobalStateKey(PROFILES_KEY), [])
	return Array.isArray(parsed) ? parsed.filter(isStoredProfile) : []
}

export function writeProfiles(stateManager: StateManager, profiles: StoredProfile[]): void {
	stateManager.setGlobalState(PROFILES_KEY, JSON.stringify(profiles))
}

export function getActiveProfileId(stateManager: StateManager): string {
	return stateManager.getGlobalStateKey(ACTIVE_PROFILE_KEY) || ""
}

export function setActiveProfileId(stateManager: StateManager, id: string): void {
	stateManager.setGlobalState(ACTIVE_PROFILE_KEY, id)
}

function readProfileSecrets(stateManager: StateManager): ProfileSecretMap {
	const parsed = safeParse<unknown>(stateManager.getSecretKey(PROFILE_SECRETS_KEY), {})
	return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as ProfileSecretMap) : {}
}

function writeProfileSecrets(stateManager: StateManager, secrets: ProfileSecretMap): void {
	stateManager.setSecretsBatch({ [PROFILE_SECRETS_KEY]: JSON.stringify(secrets) } as Partial<Secrets>)
}

export function deleteProfileSecrets(stateManager: StateManager, profileId: string): void {
	const secrets = readProfileSecrets(stateManager)
	if (profileId in secrets) {
		delete secrets[profileId]
		writeProfileSecrets(stateManager, secrets)
	}
}

export interface ConfigurationSnapshot {
	settings: Record<string, unknown>
	secrets: Record<string, string>
}

/**
 * Splits the live provider configuration into non-secret settings and secrets.
 * Empty values are dropped so a switch never blanks out unrelated providers.
 */
export function snapshotConfiguration(apiConfiguration: ApiConfiguration): ConfigurationSnapshot {
	const settings: Record<string, unknown> = {}
	const secrets: Record<string, string> = {}

	for (const [key, value] of Object.entries(apiConfiguration)) {
		if (value === undefined || value === null) {
			continue
		}
		if (isSecretKey(key)) {
			// `mclineProfileSecrets` is bookkeeping, never a provider key.
			if (key === PROFILE_SECRETS_KEY) {
				continue
			}
			if (typeof value === "string" && value !== "") {
				secrets[key] = value
			}
			continue
		}
		settings[key] = value
	}

	return { settings, secrets }
}

export function summarizeProfile(profile: StoredProfile): Pick<StoredProfile, "provider" | "modelId"> {
	const config = profile.settings as ApiConfiguration
	const rawProvider = (config.actModeApiProvider ?? config.planModeApiProvider ?? "") as string
	const provider = rawProvider ? String(toLegacyApiProvider(rawProvider)) : ""
	const mode = config.actModeApiProvider ? "act" : "plan"
	const modelId = provider ? resolveActiveModelIdFromApiConfiguration(config, mode) : ""
	return {
		provider,
		modelId: modelId === "unknown" ? "" : modelId,
	}
}

function stableJson(value: unknown): string {
	return JSON.stringify(value ?? null)
}

/** True when the stored snapshot still matches the live provider configuration. */
export function isProfileApplied(stateManager: StateManager, profile: StoredProfile): boolean {
	const current = snapshotConfiguration(stateManager.getApiConfiguration())
	if (stableJson(current.settings) !== stableJson(profile.settings)) {
		return false
	}
	const storedSecrets = readProfileSecrets(stateManager)[profile.id] ?? {}
	return JSON.stringify(current.secrets) === JSON.stringify(storedSecrets)
}

export function buildProfilesState(stateManager: StateManager): ProfilesState {
	const activeProfileId = getActiveProfileId(stateManager)
	const profiles = readProfiles(stateManager).map((profile) => {
		const summary = summarizeProfile(profile)
		return ProfileSummary.create({
			id: profile.id,
			name: profile.name,
			provider: summary.provider,
			modelId: summary.modelId,
			createdAt: profile.createdAt,
			updatedAt: profile.updatedAt,
			modified: profile.id === activeProfileId ? !isProfileApplied(stateManager, profile) : false,
		})
	})
	return ProfilesState.create({ profiles, activeProfileId })
}

function newProfileId(): string {
	const cryptoApi = globalThis.crypto
	if (cryptoApi && typeof cryptoApi.randomUUID === "function") {
		return cryptoApi.randomUUID()
	}
	return `profile-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

function uniqueName(profiles: StoredProfile[], desired: string, ignoreId?: string): string {
	const base = desired.trim() || "Profile"
	const taken = new Set(
		profiles.filter((profile) => profile.id !== ignoreId).map((profile) => profile.name.trim().toLowerCase()),
	)
	if (!taken.has(base.toLowerCase())) {
		return base
	}
	let index = 2
	while (taken.has(`${base} (${index})`.toLowerCase())) {
		index++
	}
	return `${base} (${index})`
}

/**
 * Saves the live provider configuration as a new profile and makes it active.
 */
export function createProfileFromCurrentConfiguration(stateManager: StateManager, name: string): StoredProfile {
	const profiles = readProfiles(stateManager)
	const snapshot = snapshotConfiguration(stateManager.getApiConfiguration())
	const now = new Date().toISOString()
	const profile: StoredProfile = {
		id: newProfileId(),
		name: uniqueName(profiles, name),
		provider: "",
		modelId: "",
		createdAt: now,
		updatedAt: now,
		settings: snapshot.settings,
	}
	const { provider, modelId } = summarizeProfile(profile)
	profile.provider = provider
	profile.modelId = modelId

	const secrets = readProfileSecrets(stateManager)
	secrets[profile.id] = snapshot.secrets

	writeProfiles(stateManager, [...profiles, profile])
	writeProfileSecrets(stateManager, secrets)
	setActiveProfileId(stateManager, profile.id)
	return profile
}

/**
 * Applies a stored profile to the live state.
 * Returns the previous configuration so callers can notify the controller.
 */
export function applyProfile(stateManager: StateManager, profile: StoredProfile): ApiConfiguration {
	const previous = stateManager.getApiConfiguration()
	const secrets = readProfileSecrets(stateManager)[profile.id] ?? {}

	stateManager.setApiConfiguration(profile.settings as ApiConfiguration)
	stateManager.setSecretsBatch(secrets as Partial<Secrets>)
	setActiveProfileId(stateManager, profile.id)
	return previous
}

/**
 * Keeps the active profile in sync with manual edits made through the settings
 * UI, so a profile always represents "what I last used with this provider".
 */
export function syncActiveProfileFromCurrentConfiguration(stateManager: StateManager): void {
	const activeId = getActiveProfileId(stateManager)
	if (!activeId) {
		return
	}
	const profiles = readProfiles(stateManager)
	const index = profiles.findIndex((profile) => profile.id === activeId)
	if (index === -1) {
		// The active profile was deleted elsewhere; drop the dangling reference.
		setActiveProfileId(stateManager, "")
		return
	}
	const profile = profiles[index]
	const snapshot = snapshotConfiguration(stateManager.getApiConfiguration())
	const storedSecrets = readProfileSecrets(stateManager)[profile.id] ?? {}
	const settingsChanged = stableJson(snapshot.settings) !== stableJson(profile.settings)
	const secretsChanged = JSON.stringify(snapshot.secrets) !== JSON.stringify(storedSecrets)
	if (!settingsChanged && !secretsChanged) {
		return
	}
	const { provider, modelId } = summarizeProfile({ ...profile, settings: snapshot.settings })
	profiles[index] = {
		...profile,
		provider,
		modelId,
		settings: snapshot.settings,
		updatedAt: new Date().toISOString(),
	}
	writeProfiles(stateManager, profiles)

	if (secretsChanged) {
		const secrets = readProfileSecrets(stateManager)
		secrets[profile.id] = snapshot.secrets
		writeProfileSecrets(stateManager, secrets)
	}
}
