import { ProfilesState, SaveProfileRequest } from "@shared/proto/cline/profile"
import { Logger } from "@/shared/services/Logger"
import { Controller } from "../index"
import { buildProfilesState, createProfileFromCurrentConfiguration } from "./profile-store"

/**
 * Saves the current provider configuration (provider, model, API key, endpoints)
 * as a new named profile and activates it.
 */
export async function saveProfile(controller: Controller, request: SaveProfileRequest): Promise<ProfilesState> {
	const name = request.name.trim()
	if (!name) {
		throw new Error("Profile name is required")
	}
	try {
		createProfileFromCurrentConfiguration(controller.stateManager, name)
		await controller.postStateToWebview()
		return buildProfilesState(controller.stateManager)
	} catch (error) {
		Logger.error("[Profiles] Failed to save profile:", error)
		throw error
	}
}
