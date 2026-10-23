import type { ElementType, ReactNode } from "react";

export function ProjectPanelSection({
	label,
	privacyLabel,
	privacyIcon: PrivacyIcon,
	action,
	children,
}: {
	label: string;
	privacyLabel: string;
	privacyIcon: ElementType;
	action?: ReactNode;
	children: ReactNode;
}) {
	return (
		<div className="px-4 py-4 border-b border-gray-100 dark:border-gray-800/80">
			<div className="flex items-center justify-between mb-3">
				<span className="text-sm font-semibold text-gray-800 dark:text-gray-200">{label}</span>
				<div className="flex items-center gap-1.5">
					<PrivacyIcon className="w-3 h-3 text-gray-400" />
					<span className="text-xs text-gray-400">{privacyLabel}</span>{action}
				</div>
			</div>
			{children}
		</div>
	);
}
