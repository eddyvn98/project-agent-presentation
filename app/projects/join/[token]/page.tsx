import type { Metadata } from "next";
import { ProjectJoinPage } from "./project-join-page";

export const metadata: Metadata = {
	title: "Join Project",
	robots: { index: false, follow: false },
	referrer: "no-referrer",
};

export default function Page({ params }: { params: { token: string } }) {
	return <ProjectJoinPage token={params.token} />;
}
