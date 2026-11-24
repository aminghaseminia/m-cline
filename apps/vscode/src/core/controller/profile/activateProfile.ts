import { StringRequest } from "@shared/proto/cline/common"
import { ProfilesState } from "@shared/proto/cline/profile"
import { Logger } from "@/shared/services/Logger"
import { Controller } from "../index"
import { createTaskApiModelShim, resolveActiveModelIdFromApiConfiguration } from "../models/taskApiModel"
import { applyProfile, buildProfilesState, readProfiles } from "./profile-store"

/**
 * Switches the active provider configuration to a saved profile.
 * Applies provider settings and secrets, then restarts the active session if
 * the provider actually changed (same behavior as editing settings manually).
 */
export async function activateProfile(controller: Controller, request: StringRequest): Promise<ProfilesState> {
	const profileId = request.value
	const profile = readProfiles(controller.stateManager).find((candidate) => candidate.id === profileId)
	if (!profile) {
		throw new Error(`Profile not found: ${profileId}`)
	}
	try {
		const previous = applyProfile(controller.stateManager, profile)
		const current = controller.stateManager.getApiConfiguration()

		if (controller.task) {
			const mode = controller.stateManager.getGlobalSettingsKey("mode")
			controller.task.api = createTaskApiModelShim(resolveActiveModelIdFromApiConfiguration(current, mode))
		}
		controller.handleApiConfigurationChanged(previous, current)

		await controller.postStateToWebview()
		return buildProfilesState(controller.stateManager)
	} catch (error) {
		Logger.error(`[Profiles] Failed to activate profile ${profileId}:`, error)
		throw error
	}
}
