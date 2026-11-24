import { beforeEach, describe, expect, it } from "bun:test"
import type { ApiConfiguration } from "@shared/api"
import type { StateManager } from "@/core/storage/StateManager"
import {
	applyProfile,
	buildProfilesState,
	createProfileFromCurrentConfiguration,
	getActiveProfileId,
	readProfiles,
	syncActiveProfileFromCurrentConfiguration,
} from "./profile-store"

/**
 * Minimal in-memory stand-in for StateManager: only the methods the profile
 * store relies on. Settings and secrets are kept apart like the real thing.
 */
class FakeStateManager {
	global: Record<string, unknown> = {}
	secrets: Record<string, unknown> = {}
	config: Record<string, unknown> = {}

	getGlobalStateKey(key: string) {
		return this.global[key] as never
	}
	setGlobalState(key: string, value: unknown) {
		this.global[key] = value
	}
	getSecretKey(key: string) {
		return this.secrets[key] as never
	}
	setSecretsBatch(updates: Record<string, unknown>) {
		Object.assign(this.secrets, updates)
	}
	getApiConfiguration() {
		return this.config as ApiConfiguration
	}
	setApiConfiguration(config: ApiConfiguration) {
		for (const [key, value] of Object.entries(config)) {
			if (value !== undefined) {
				this.config[key] = value
			}
		}
	}
}

const asStateManager = (fake: FakeStateManager) => fake as unknown as StateManager

describe("profile store", () => {
	let fake: FakeStateManager
	let stateManager: StateManager

	beforeEach(() => {
		fake = new FakeStateManager()
		fake.config = {
			actModeApiProvider: "anthropic",
			actModeApiModelId: "claude-sonnet-4-5",
			planModeApiProvider: "anthropic",
			planModeApiModelId: "claude-opus-4-1",
			apiKey: "sk-ant-123",
			anthropicBaseUrl: "",
			requestTimeoutMs: 30000,
		}
		stateManager = asStateManager(fake)
	})

	it("saves the current configuration with keys in the secret blob", () => {
		const profile = createProfileFromCurrentConfiguration(stateManager, "Work")

		expect(profile.name).toBe("Work")
		expect(profile.provider).toBe("anthropic")
		expect(profile.modelId).toBe("claude-sonnet-4-5")
		expect(profile.settings).not.toHaveProperty("apiKey")
		expect(profile.settings.requestTimeoutMs).toBe(30000)

		const storedSecrets = JSON.parse(fake.secrets.mclineProfileSecrets as string)
		expect(storedSecrets[profile.id].apiKey).toBe("sk-ant-123")

		expect(getActiveProfileId(stateManager)).toBe(profile.id)
		expect(readProfiles(stateManager)).toHaveLength(1)
	})

	it("de-duplicates profile names", () => {
		createProfileFromCurrentConfiguration(stateManager, "Work")
		const second = createProfileFromCurrentConfiguration(stateManager, "Work")
		expect(second.name).toBe("Work (2)")
	})

	it("switches provider, model and keys when a profile is applied", () => {
		const work = createProfileFromCurrentConfiguration(stateManager, "Work")

		fake.config = {
			...fake.config,
			actModeApiProvider: "openrouter",
			actModeApiModelId: "anthropic/claude-sonnet-4.5",
			apiKey: "sk-or-999",
		}
		const other = createProfileFromCurrentConfiguration(stateManager, "OpenRouter")
		expect(getActiveProfileId(stateManager)).toBe(other.id)

		applyProfile(stateManager, work)

		expect(getActiveProfileId(stateManager)).toBe(work.id)
		expect(fake.config.actModeApiProvider).toBe("anthropic")
		expect(fake.config.actModeApiModelId).toBe("claude-sonnet-4-5")
		expect(fake.secrets.apiKey).toBe("sk-ant-123")
	})

	it("keeps the active profile in sync with manual edits", () => {
		const profile = createProfileFromCurrentConfiguration(stateManager, "Work")

		fake.config = { ...fake.config, actModeApiModelId: "claude-opus-4-5" }
		syncActiveProfileFromCurrentConfiguration(stateManager)

		const [updated] = readProfiles(stateManager)
		expect(updated.id).toBe(profile.id)
		expect(updated.modelId).toBe("claude-opus-4-5")
		expect(buildProfilesState(stateManager).profiles[0].modified).toBe(false)
	})

	it("reports a modified flag when the live config drifts without sync", () => {
		createProfileFromCurrentConfiguration(stateManager, "Work")
		fake.config = { ...fake.config, actModeApiModelId: "claude-haiku-4-5" }

		expect(buildProfilesState(stateManager).profiles[0].modified).toBe(true)
	})
})
