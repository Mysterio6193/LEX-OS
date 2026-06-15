/**
 * India agent-workflow library (v2 Phase 3).
 *
 * Codified, reusable legal processes that run through the Phase-1 agent
 * (planner → executor → verifier). Selecting a workflow seeds the agent's
 * plan deterministically from these steps (instead of an LLM planning pass),
 * so a firm's repeatable matters execute the same vetted way every time.
 * Steps reference existing tools; the executor (runLLMStream) carries them
 * out. Distinct from the tabular `workflows` table (column templates).
 */

export type AgentWorkflowStep = {
  intent: string;
  tool?: string | null;
};

export type AgentWorkflow = {
  id: string;
  name: string;
  description: string;
  /** Practice area / matter type label. */
  practice: string;
  steps: AgentWorkflowStep[];
};

export const AGENT_WORKFLOWS: AgentWorkflow[] = [
  {
    id: "wf-s138-kit",
    name: "Cheque Dishonour (S.138 NI Act) kit",
    description:
      "End-to-end preparation for a Section 138 NI Act complaint: conflicts, parties, limitation, notice, complaint draft.",
    practice: "Criminal / NI Act",
    steps: [
      { intent: "Run a conflict check on the complainant and the drawer/accused", tool: "check_conflicts" },
      { intent: "Record the parties (complainant, accused, banks) on the matter", tool: "save_party" },
      { intent: "Locate the cheque, return memo, and dishonour date in the matter documents", tool: "retrieve_context" },
      { intent: "Compute the limitation to file the complaint (30 days after the notice period)", tool: "compute_limitation" },
      { intent: "Save the filing deadline", tool: "save_deadline" },
      { intent: "Draft the statutory demand notice under S.138", tool: "generate_docx" },
      { intent: "Add the remaining filing steps to the matter checklist", tool: "save_task" },
    ],
  },
  {
    id: "wf-bail-bnss",
    name: "Bail Application (BNSS) kit",
    description:
      "Prepare a regular/anticipatory bail application: conflicts, FIR facts, precedents, draft, next hearing.",
    practice: "Criminal",
    steps: [
      { intent: "Run a conflict check on the accused and complainant", tool: "check_conflicts" },
      { intent: "Confirm the FIR number, sections charged, and custody status from the documents", tool: "retrieve_context" },
      { intent: "Research relevant bail precedents", tool: "indiankanoon_search_case_law" },
      { intent: "Draft the bail application with grounds and prayer", tool: "generate_docx" },
      { intent: "Record the next hearing date", tool: "save_hearing" },
      { intent: "Add antecedents/surety follow-ups to the checklist", tool: "save_task" },
    ],
  },
  {
    id: "wf-nclt-ibc",
    name: "Insolvency (NCLT/IBC) application",
    description:
      "Prepare a S.7/9 IBC application: conflicts, default/threshold, limitation, application draft.",
    practice: "Insolvency",
    steps: [
      { intent: "Run a conflict check on the applicant and corporate debtor", tool: "check_conflicts" },
      { intent: "Confirm the debt, date of default, and that it crosses the threshold, from the records", tool: "retrieve_context" },
      { intent: "Check limitation for the application", tool: "compute_limitation" },
      { intent: "Draft the application in the prescribed form with the records of default", tool: "generate_docx" },
      { intent: "Add IRP-consent and filing steps to the checklist", tool: "save_task" },
    ],
  },
  {
    id: "wf-writ-226",
    name: "Writ Petition (Art. 226/32)",
    description:
      "Prepare a constitutional writ: conflicts, right infringed and alternate-remedy check, precedents, petition + synopsis.",
    practice: "Constitutional",
    steps: [
      { intent: "Run a conflict check on the petitioner and respondents", tool: "check_conflicts" },
      { intent: "Identify the right infringed and whether an alternate remedy was exhausted, from the documents", tool: "retrieve_context" },
      { intent: "Research maintainability and merits precedents", tool: "indiankanoon_search_case_law" },
      { intent: "Draft the writ petition with grounds, prayer, and synopsis", tool: "generate_docx" },
      { intent: "Add paper-book and filing steps to the checklist", tool: "save_task" },
    ],
  },
  {
    id: "wf-consumer",
    name: "Consumer Complaint (CP Act 2019)",
    description:
      "Prepare a consumer complaint: conflicts, consumer status & deficiency, jurisdiction & limitation, complaint draft.",
    practice: "Consumer",
    steps: [
      { intent: "Run a conflict check on the complainant and opposite party", tool: "check_conflicts" },
      { intent: "Confirm consumer status and the deficiency/defect from the documents", tool: "retrieve_context" },
      { intent: "Check the limitation (2 years from cause of action)", tool: "compute_limitation" },
      { intent: "Draft the complaint with reliefs and affidavit", tool: "generate_docx" },
      { intent: "Add fee and filing steps to the checklist", tool: "save_task" },
    ],
  },
  {
    id: "wf-contract-diligence",
    name: "Contract review / diligence",
    description:
      "Review a contract against firm standards: extract key clauses, compare to precedents, flag risks, draft a note.",
    practice: "Transactional",
    steps: [
      { intent: "Retrieve the key clauses (liability, indemnity, termination, governing law) from the document", tool: "retrieve_context" },
      { intent: "Compare the clauses against the firm's standard positions and precedents", tool: "search_firm_knowledge" },
      { intent: "Record material risks/red flags to matter memory", tool: "save_memory" },
      { intent: "Draft a short diligence note with findings and recommendations", tool: "generate_docx" },
      { intent: "Add negotiation follow-ups to the checklist", tool: "save_task" },
    ],
  },
  {
    id: "wf-deep-research",
    name: "Deep Research memo",
    description:
      "Multi-step legal research into a structured, citation-guarded memo: issue → rule → authorities (with treatment) → application → conclusion.",
    practice: "Research",
    steps: [
      { intent: "Frame the precise legal issue(s) and jurisdiction from the request and matter context", tool: null },
      { intent: "Search Indian case law for the leading and most relevant authorities", tool: "indiankanoon_search_case_law" },
      { intent: "Verify the citations resolve to real judgments", tool: "indiankanoon_verify_citations" },
      { intent: "Read the leading authorities to extract verbatim holdings before citing", tool: "indiankanoon_read_case" },
      { intent: "Search the firm's own matters and precedents for prior treatment of the issue", tool: "search_firm_knowledge" },
      { intent: "Synthesise a structured research memo (Issue → Rule → Authorities with treatment → Application → Conclusion) with verified citations and a coverage-limits note", tool: "generate_docx" },
    ],
  },
];

export function getAgentWorkflow(id: string): AgentWorkflow | undefined {
  return AGENT_WORKFLOWS.find((w) => w.id === id);
}
