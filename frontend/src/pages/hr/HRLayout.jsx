import { ModuleLayout } from "@/components/kit";

export const HR_TABS = [
  { name: "Overview", path: "/hr", exact: true, perm: "hr" },
  { name: "People", path: "/hr/people", perm: "hr" },
  { name: "Payroll", path: "/hr/payroll", perm: "payroll" },
  { name: "Incentives & bonus", path: "/hr/incentives", perm: "payroll" },
  { name: "Onboarding", path: "/hr/onboarding", perm: "hr" },
  { name: "Offboarding", path: "/hr/offboarding", perm: "hr" },
  { name: "Skills & training", path: "/hr/skills", perm: "hr" },
  { name: "Knowledge transfer", path: "/hr/kt", perm: "hr" },
];

export default function HRLayout({ title, subtitle, actions, children }) {
  return <ModuleLayout kicker="HR" title={title} subtitle={subtitle} tabs={HR_TABS} actions={actions} testid="hr-layout">{children}</ModuleLayout>;
}
