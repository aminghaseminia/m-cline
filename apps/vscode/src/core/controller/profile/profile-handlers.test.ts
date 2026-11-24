import { beforeEach, describe, expect, it } from "bun:test"
import type { ApiConfiguration } from "@shared/api"
import { StringRequest } from "@shared/proto/cline/common"
import { RenameProfileRequest, SaveProfileRequest } from "@shared/proto/cline/profile"
import type { Controller } from "../index"
import { activateProfile } from "./activateProfile"
import { deleteProfile } from "./deleteProfile"
import { getProfiles } from "./getProfiles"
import { renameProfile } from "./renameProfile"
import { saveProfile } from "./saveProfile"

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
	getGlobalSettingsKey(key: string) {
		return this.global[key] as never
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

function createController() {
	const stateManager = new FakeStateManager()
	stateManager.config = {
		actModeApiProvider: "anthropic",
		actModeApiModelId: "claude-sonnet-4-5",
		planModeApiProvider: "anthropic",
		planModeApiModelId: "claude-sonnet-4-5",
		apiKey: "sk-ant-1",
	}
	const providerChanges: Array<{ previous: unknown; next: unknown }> = []
	let posts = 0
	const controller = {
		stateManager,
		task: undefined,
		handleApiConfigurationChanged: (previous: unknown, next: unknown) => providerChanges.push({ previous, next }),
		postStateToWebview: async () => {
			posts++
		},
	} as unknown as Controller
	return {
		controller,
		stateManager,
		providerChanges,
		posts: () => posts,
	}
}

describe("profile gRPC handlers", () => {
	let harness: ReturnType<typeof createController>

	beforeEach(() => {
		harness = createController()
	})

	it("starts empty", async () => {
		const state = await getProfiles(harness.controller, {})
		expect(state.profiles).toHaveLength(0)
		expect(state.activeProfileId).toBe("")
	})

	it("saves, renames, switches and deletes profiles", async () => {
		const saved = await saveProfile(harness.controller, SaveProfileRequest.create({ name: "Work" }))
		expect(saved.profiles).toHaveLength(1)
		const workId = saved.profiles[0].id
		expect(saved.activeProfileId).toBe(workId)
		expect(saved.profiles[0].provider).toBe("anthropic")

		harness.stateManager.config = {
			...harness.stateManager.config,
			actModeApiProvider: "openrouter",
			actModeApiModelId: "anthropic/claude-sonnet-4.5",
			apiKey: "sk-or-1",
		}
		const second = await saveProfile(harness.controller, SaveProfileRequest.create({ name: "Personal" }))
		expect(second.profiles).toHaveLength(2)
		const personalId = second.profiles[1].id
		expect(second.activeProfileId).toBe(personalId)

		const switched = await activateProfile(harness.controller, StringRequest.create({ value: workId }))
		expect(switched.activeProfileId).toBe(workId)
		expect(harness.stateManager.config.actModeApiProvider).toBe("anthropic")
		expect(harness.stateManager.secrets.apiKey).toBe("sk-ant-1")
		expect(harness.providerChanges).toHaveLength(1)
		expect(harness.posts()).toBeGreaterThan(0)

		const renamed = await renameProfile(harness.controller, RenameProfileRequest.create({ id: workId, name: "Client A" }))
		expect(renamed.profiles.find((profile) => profile.id === workId)?.name).toBe("Client A")

		const afterDelete = await deleteProfile(harness.controller, StringRequest.create({ value: personalId }))
		expect(afterDelete.profiles).toHaveLength(1)
		expect(afterDelete.profiles[0].id).toBe(workId)
	})

	it("rejects empty names and unknown ids", async () => {
		await expect(saveProfile(harness.controller, SaveProfileRequest.create({ name: "   " }))).rejects.toThrow(
			"Profile name is required",
		)
		await expect(activateProfile(harness.controller, StringRequest.create({ value: "missing" }))).rejects.toThrow(
			"Profile not found",
		)
	})

	it("rejects duplicate names on rename", async () => {
		await saveProfile(harness.controller, SaveProfileRequest.create({ name: "One" }))
		const state = await saveProfile(harness.controller, SaveProfileRequest.create({ name: "Two" }))
		const twoId = state.profiles.find((profile) => profile.name === "Two")?.id as string
		await expect(renameProfile(harness.controller, RenameProfileRequest.create({ id: twoId, name: "one" }))).rejects.toThrow(
			"already exists",
		)
	})
})
