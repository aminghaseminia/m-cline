import { StringRequest } from "@shared/proto/cline/common"
import { ProfilesState } from "@shared/proto/cline/profile"
import { Logger } from "@/shared/services/Logger"
import { Controller } from "../index"
import {
	buildProfilesState,
	deleteProfileSecrets,
	getActiveProfileId,
	readProfiles,
	setActiveProfileId,
	writeProfiles,
} from "./profile-store"

/**
 * Deletes a saved profile. If it was active, the live provider configuration is
 * left untouched and simply no longer points at a profile.
 */
export async function deleteProfile(controller: Controller, request: StringRequest): Promise<ProfilesState> {
	const profileId = request.value
	try {
		const profiles = readProfiles(controller.stateManager)
		const remaining = profiles.filter((profile) => profile.id !== profileId)
		if (remaining.length !== profiles.length) {
			writeProfiles(controller.stateManager, remaining)
			deleteProfileSecrets(controller.stateManager, profileId)
			if (getActiveProfileId(controller.stateManager) === profileId) {
				setActiveProfileId(controller.stateManager, "")
			}
		}
		return buildProfilesState(controller.stateManager)
	} catch (error) {
		Logger.error(`[Profiles] Failed to delete profile ${profileId}:`, error)
		throw error
	}
}
