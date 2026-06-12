/**
 * Matter templates (PRD CM-07/FM-03/WA-04) — pre-configured checklists for
 * common matter types. Kept as code (like builtinWorkflows) so templates
 * are versioned in git and need no admin UI; project_tasks.template_id
 * records which template seeded a task.
 */

export type MatterTemplate = {
  id: string;
  name: string;
  description: string;
  tasks: string[];
};

export const MATTER_TEMPLATES: MatterTemplate[] = [
  {
    id: "tpl-ma-diligence",
    name: "M&A Due Diligence",
    description:
      "Standard buy-side due diligence workflow for an acquisition.",
    tasks: [
      "Run conflict check on target, sellers, and key counterparties",
      "Prepare and send due diligence request list",
      "Set up data room access and document index",
      "Review corporate records and capitalization",
      "Review material contracts and change-of-control clauses",
      "Review financing arrangements and security interests",
      "Review employment and benefit arrangements",
      "Review IP ownership and licenses",
      "Review litigation, disputes, and regulatory matters",
      "Prepare red-flag due diligence report",
      "Draft disclosure schedule comments",
      "Track conditions precedent through closing",
    ],
  },
  {
    id: "tpl-nda-review",
    name: "NDA Review",
    description: "Fast-turnaround review of a non-disclosure agreement.",
    tasks: [
      "Run conflict check on counterparty",
      "Confirm mutual vs. one-way structure matches the deal",
      "Review definition and scope of confidential information",
      "Check term, survival, and return/destruction obligations",
      "Check permitted disclosures and residuals language",
      "Review remedies, governing law, and jurisdiction",
      "Prepare markup and summary of key changes",
      "Circulate for signature and calendar expiry",
    ],
  },
  {
    id: "tpl-litigation",
    name: "Litigation",
    description: "Core workflow for a new contentious matter.",
    tasks: [
      "Run conflict check on all parties and related entities",
      "Issue litigation hold and preserve documents",
      "Collect key documents and build chronology",
      "Assess limitation periods and calendar critical deadlines",
      "Evaluate claims, defences, and preliminary strategy",
      "Prepare initial pleading or response",
      "Plan discovery / disclosure approach",
      "Consider settlement and ADR options",
      "Prepare witness list and evidence plan",
    ],
  },
  {
    id: "tpl-lease-analysis",
    name: "Lease Analysis",
    description: "Commercial lease review and negotiation checklist.",
    tasks: [
      "Run conflict check on landlord and guarantors",
      "Confirm premises, term, and renewal options",
      "Review rent, escalations, and operating expense pass-throughs",
      "Review assignment, subletting, and change-of-control provisions",
      "Check repair, maintenance, and reinstatement obligations",
      "Review insurance and indemnity allocation",
      "Check default, termination, and remedies provisions",
      "Summarize key terms and negotiation points for client",
    ],
  },
  {
    id: "tpl-general",
    name: "General Matter",
    description: "A minimal checklist for any new engagement.",
    tasks: [
      "Run conflict check on client and counterparties",
      "Confirm engagement scope and fee arrangement",
      "Collect and organize matter documents",
      "Record key parties and deadlines",
      "Agree next steps with client",
    ],
  },
];

export function getMatterTemplate(id: string): MatterTemplate | undefined {
  return MATTER_TEMPLATES.find((t) => t.id === id);
}
