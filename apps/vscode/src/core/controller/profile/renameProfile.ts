import { ProfilesState, RenameProfileRequest } from "@shared/proto/cline/profile"
import { Logger } from "@/shared/services/Logger"
import { Controller } from "../index"
import { buildProfilesState, readProfiles, writeProfiles } from "./profile-store"

/**
 * Renames a saved profile.
 */
export async function renameProfile(controller: Controller, request: RenameProfileRequest): Promise<ProfilesState> {
	const name = request.name.trim()
	if (!name) {
		throw new Error("Profile name is required")
	}
	const profiles = readProfiles(controller.stateManager)
	const index = profiles.findIndex((profile) => profile.id === request.id)
	if (index === -1) {
		throw new Error(`Profile not found: ${request.id}`)
	}
	const duplicate = profiles.some(
		(profile) => profile.id !== request.id && profile.name.trim().toLowerCase() === name.toLowerCase(),
	)
	if (duplicate) {
		throw new Error(`A profile named "${name}" already exists`)
	}
	try {
		profiles[index] = { ...profiles[index], name, updatedAt: new Date().toISOString() }
		writeProfiles(controller.stateManager, profiles)
		return buildProfilesState(controller.stateManager)
	} catch (error) {
		Logger.error(`[Profiles] Failed to rename profile ${request.id}:`, error)
		throw error
	}
}
