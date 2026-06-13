/**
 * Indian limitation calculator (Limitation Act, 1963 + special statutes).
 *
 * Computes the last date for filing from a trigger (cause-of-action) date
 * for common Indian causes. Periods are added to the trigger date. This is
 * advisory: limitation can be affected by exclusions, acknowledgements,
 * condonation, court holidays, and the specific facts — the assistant must
 * tell the user to verify and never treat the output as a guarantee.
 */

export type LimitationPeriod = {
  key: string;
  label: string;
  /** Period added to the trigger date. */
  years?: number;
  months?: number;
  days?: number;
  /** Statutory basis. */
  basis: string;
  /** What the trigger date should be for this entry. */
  trigger: string;
  /** Whether delay is condonable, and any caveat. */
  note?: string;
};

export const LIMITATION_PERIODS: LimitationPeriod[] = [
  {
    key: "contract_money",
    label: "Suit for money / breach of contract",
    years: 3,
    basis: "Limitation Act 1963, Schedule Arts. 1–55 (general 3 years)",
    trigger: "the date the money fell due or the contract was breached",
  },
  {
    key: "recovery_promissory_note",
    label: "Suit on a promissory note / bond",
    years: 3,
    basis: "Limitation Act 1963, Arts. 34–35",
    trigger: "the date the instrument fell due",
  },
  {
    key: "immovable_possession",
    label: "Suit for possession of immovable property (title)",
    years: 12,
    basis: "Limitation Act 1963, Art. 65",
    trigger: "the date the defendant's possession became adverse",
  },
  {
    key: "mortgage_foreclosure",
    label: "Suit for foreclosure / recovery of mortgage money",
    years: 12,
    basis: "Limitation Act 1963, Arts. 62–63",
    trigger: "the date the mortgage money became due",
  },
  {
    key: "execution_decree",
    label: "Execution of a decree",
    years: 12,
    basis: "Limitation Act 1963, Art. 136",
    trigger: "the date the decree became enforceable",
  },
  {
    key: "defamation",
    label: "Suit for compensation for defamation",
    years: 1,
    basis: "Limitation Act 1963, Arts. 75–76",
    trigger: "the date the defamatory matter was published",
  },
  {
    key: "first_appeal_hc",
    label: "First appeal to a High Court (from a decree)",
    days: 90,
    basis: "Limitation Act 1963, Art. 116(a)",
    trigger: "the date of the decree or order",
    note: "Delay condonable u/s 5; subordinate-court appeals are 30 days (Art. 116(b)).",
  },
  {
    key: "appeal_subordinate",
    label: "Appeal to a subordinate court (from a decree)",
    days: 30,
    basis: "Limitation Act 1963, Art. 116(b)",
    trigger: "the date of the decree or order",
    note: "Delay condonable u/s 5.",
  },
  {
    key: "review",
    label: "Application for review of judgment",
    days: 30,
    basis: "Limitation Act 1963, Art. 124",
    trigger: "the date of the decree or order",
  },
  {
    key: "slp_supreme_court",
    label: "Special Leave Petition to the Supreme Court (against a HC judgment)",
    days: 90,
    basis: "Supreme Court Rules / Limitation Act Art. 133",
    trigger: "the date of the High Court judgment/order",
    note: "Against a refusal to grant a certificate the period differs; delay condonable.",
  },
  {
    key: "arbitration_s34",
    label: "Application to set aside an arbitral award (S.34)",
    months: 3,
    basis: "Arbitration & Conciliation Act 1996, S.34(3)",
    trigger: "the date the party received the signed award",
    note: "A further 30 days is condonable but not beyond; the 3 months is strict.",
  },
  {
    key: "cheque_138_complaint",
    label: "Complaint for cheque dishonour (S.138 NI Act)",
    days: 30,
    basis: "Negotiable Instruments Act 1881, S.142(1)(b)",
    trigger:
      "the date the 15-day payment period (after the demand notice was served) expired",
    note: "Delay condonable by the Magistrate on sufficient cause (proviso to S.142).",
  },
  {
    key: "consumer_complaint",
    label: "Consumer complaint",
    years: 2,
    basis: "Consumer Protection Act 2019, S.69",
    trigger: "the date the cause of action arose",
    note: "Delay condonable by the Commission for sufficient cause.",
  },
  {
    key: "recovery_under_contract_3yr",
    label: "Suit for compensation for breach of any contract (residuary)",
    years: 3,
    basis: "Limitation Act 1963, Art. 55",
    trigger: "the date the contract was broken",
  },
];

export function listLimitationKeys(): { key: string; label: string }[] {
  return LIMITATION_PERIODS.map((p) => ({ key: p.key, label: p.label }));
}

/** Validates an ISO YYYY-MM-DD date. */
function parseIsoDate(raw: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const d = new Date(`${raw}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  if (d.toISOString().slice(0, 10) !== raw) return null;
  return d;
}

function addPeriod(date: Date, p: LimitationPeriod): Date {
  const d = new Date(date.getTime());
  if (p.years) d.setUTCFullYear(d.getUTCFullYear() + p.years);
  if (p.months) d.setUTCMonth(d.getUTCMonth() + p.months);
  if (p.days) d.setUTCDate(d.getUTCDate() + p.days);
  return d;
}

function periodLabel(p: LimitationPeriod): string {
  if (p.years) return `${p.years} year${p.years > 1 ? "s" : ""}`;
  if (p.months) return `${p.months} month${p.months > 1 ? "s" : ""}`;
  if (p.days) return `${p.days} days`;
  return "—";
}

export type LimitationResult =
  | {
      ok: true;
      label: string;
      period: string;
      basis: string;
      trigger_date: string;
      due_date: string;
      days_remaining: number;
      note?: string;
      disclaimer: string;
    }
  | { ok: false; error: string; available_keys?: { key: string; label: string }[] };

export function computeLimitation(args: {
  triggerDate: string;
  key: string;
}): LimitationResult {
  const period = LIMITATION_PERIODS.find((p) => p.key === args.key);
  if (!period) {
    return {
      ok: false,
      error: `Unknown limitation type "${args.key}".`,
      available_keys: listLimitationKeys(),
    };
  }
  const trigger = parseIsoDate(String(args.triggerDate ?? "").trim());
  if (!trigger) {
    return {
      ok: false,
      error: "trigger_date must be a valid date in YYYY-MM-DD format.",
    };
  }
  const due = addPeriod(trigger, period);
  const dueIso = due.toISOString().slice(0, 10);
  const todayIso = new Date().toISOString().slice(0, 10);
  const daysRemaining = Math.round(
    (Date.parse(`${dueIso}T00:00:00Z`) - Date.parse(`${todayIso}T00:00:00Z`)) /
      86_400_000,
  );
  return {
    ok: true,
    label: period.label,
    period: periodLabel(period),
    basis: period.basis,
    trigger_date: trigger.toISOString().slice(0, 10),
    due_date: dueIso,
    days_remaining: daysRemaining,
    note: period.note,
    disclaimer:
      "Advisory only. Verify against the Limitation Act, applicable exclusions (S.12–15), acknowledgements (S.18), court holidays, and the specific facts. Not a substitute for the advocate's own computation.",
  };
}
