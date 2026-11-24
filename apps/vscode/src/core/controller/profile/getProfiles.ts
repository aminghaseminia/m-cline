import { EmptyRequest } from "@shared/proto/cline/common"
import { ProfilesState } from "@shared/proto/cline/profile"
import { Controller } from "../index"
import { buildProfilesState } from "./profile-store"

/**
 * Returns all saved M-Cline profiles plus the active profile id.
 */
export async function getProfiles(controller: Controller, _request: EmptyRequest): Promise<ProfilesState> {
	return buildProfilesState(controller.stateManager)
}
