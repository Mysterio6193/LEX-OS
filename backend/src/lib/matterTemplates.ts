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
  {
    id: "tpl-writ-petition",
    name: "Writ Petition (Art. 226/32)",
    description:
      "Constitutional writ before a High Court (Art. 226) or the Supreme Court (Art. 32).",
    tasks: [
      "Run conflict check on petitioner and respondents",
      "Identify the fundamental/legal right infringed and the cause of action",
      "Confirm territorial jurisdiction and the correct High Court bench / Supreme Court",
      "Check availability and exhaustion of alternative remedies",
      "Draft the writ petition with grounds and prayer",
      "Prepare the synopsis and list of dates",
      "Annex impugned order and supporting documents (paper book)",
      "Prepare affidavit in support and vakalatnama",
      "Pay court fees and e-file / file before the registry",
      "Calendar the listing date and prepare for admission hearing",
    ],
  },
  {
    id: "tpl-bail-application",
    name: "Bail Application (BNSS/CrPC)",
    description:
      "Regular or anticipatory bail application in a criminal matter.",
    tasks: [
      "Run conflict check on the accused and complainant",
      "Confirm FIR number, sections charged, and custody status",
      "Determine bail type (regular u/s 480 BNSS / anticipatory u/s 482 BNSS) and forum",
      "Review case diary, remand papers, and grounds for arrest",
      "Draft the bail application with grounds and case law",
      "Prepare affidavit, vakalatnama, and antecedents details",
      "File the application and obtain the listing date",
      "Prepare submissions and proposed bail conditions / sureties",
    ],
  },
  {
    id: "tpl-nclt-ibc",
    name: "Insolvency – NCLT/IBC",
    description:
      "Corporate insolvency resolution application before the NCLT under the IBC, 2016.",
    tasks: [
      "Run conflict check on the applicant and corporate debtor",
      "Confirm the debt, default, and that it crosses the threshold (₹1 crore)",
      "Determine the applicant type (S.7 financial / S.9 operational creditor)",
      "For S.9 — issue and serve the demand notice in Form 3/4 and await 10-day response",
      "Compile records of default (information utility / bank statements / invoices)",
      "Draft the application in the prescribed Form (Form 1 / Form 5)",
      "Propose an Interim Resolution Professional (with written consent in Form 2)",
      "Pay the prescribed fee and file before the appropriate NCLT bench",
      "Calendar the listing and track admission/defect cure",
    ],
  },
  {
    id: "tpl-cheque-138",
    name: "Cheque Dishonour – S.138 NI Act",
    description:
      "Complaint for dishonour of cheque under Section 138 of the Negotiable Instruments Act.",
    tasks: [
      "Run conflict check on the complainant and accused/drawer",
      "Confirm the cheque, return memo, and reason for dishonour",
      "Send the statutory demand notice within 30 days of the return memo",
      "Await the 15-day payment period after the notice is served",
      "File the complaint within 30 days of the notice-period expiry (limitation)",
      "Confirm territorial jurisdiction (payee's bank branch location)",
      "Draft the complaint, list of witnesses, and documents",
      "Prepare the complainant's affidavit (S.145 evidence) and vakalatnama",
      "File before the Magistrate and obtain the next date",
    ],
  },
  {
    id: "tpl-arbitration",
    name: "Arbitration (A&C Act 1996)",
    description:
      "Arbitration proceeding under the Arbitration and Conciliation Act, 1996.",
    tasks: [
      "Run conflict check on the claimant and respondent",
      "Confirm the arbitration agreement / clause and seat & venue",
      "Issue the notice invoking arbitration (S.21)",
      "Agree on or apply for appointment of arbitrator(s) (S.11)",
      "Assess limitation and any interim-relief need (S.9 / S.17)",
      "Draft and file the statement of claim with documents",
      "Track the statement of defence and counterclaim",
      "Plan evidence, witness statements, and hearings",
      "Track timelines for the award (S.29A)",
    ],
  },
  {
    id: "tpl-consumer-complaint",
    name: "Consumer Complaint (CP Act 2019)",
    description:
      "Complaint before a Consumer Commission under the Consumer Protection Act, 2019.",
    tasks: [
      "Run conflict check on the complainant and opposite party",
      "Confirm 'consumer' status and the deficiency in service / defect in goods",
      "Determine pecuniary & territorial jurisdiction (District/State/National Commission)",
      "Check limitation (within 2 years of cause of action)",
      "Compile invoices, correspondence, and evidence of deficiency",
      "Draft the complaint with reliefs and affidavit",
      "Pay the prescribed fee and file before the Commission",
      "Calendar admission and prepare for the first hearing",
    ],
  },
  {
    id: "tpl-civil-suit",
    name: "Civil Suit (CPC)",
    description: "Civil suit for recovery / declaration / injunction under the CPC.",
    tasks: [
      "Run conflict check on the plaintiff and defendants",
      "Identify the cause of action, reliefs, and valuation for court fees",
      "Confirm jurisdiction (pecuniary, territorial, subject-matter)",
      "Check limitation under the Limitation Act, 1963",
      "Send a S.80 CPC notice where a government/public officer is a defendant",
      "Draft the plaint with cause title, pleadings, and prayer",
      "Prepare the list of documents, verification, and vakalatnama",
      "Pay ad valorem court fees and file before the appropriate court",
      "Track issuance of summons and the next date",
    ],
  },
];

export function getMatterTemplate(id: string): MatterTemplate | undefined {
  return MATTER_TEMPLATES.find((t) => t.id === id);
}
