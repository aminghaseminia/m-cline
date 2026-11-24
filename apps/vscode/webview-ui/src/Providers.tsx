import { HeroUIProvider } from "@heroui/react"
import { type ReactNode } from "react"
import { CustomPostHogProvider } from "./CustomPostHogProvider"
import { ClineAuthProvider } from "./context/ClineAuthContext"
import { ExtensionStateContextProvider } from "./context/ExtensionStateContext"
import { PlatformProvider } from "./context/PlatformContext"
import { ProfileProvider } from "./context/ProfileContext"

export function Providers({ children }: { children: ReactNode }) {
	return (
		<PlatformProvider>
			<ExtensionStateContextProvider>
				<ProfileProvider>
					<CustomPostHogProvider>
						<ClineAuthProvider>
							<HeroUIProvider>{children}</HeroUIProvider>
						</ClineAuthProvider>
					</CustomPostHogProvider>
				</ProfileProvider>
			</ExtensionStateContextProvider>
		</PlatformProvider>
	)
}
