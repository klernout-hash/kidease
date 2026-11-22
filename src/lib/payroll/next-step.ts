/** One next action for the home card. The progress bar has four steps. */

export type NextId = "fix_shift" | "approve_hours" | "run_pay" | "set_aside" | "send_government" | "done";

export type NextAction = {
  id: NextId;
  doneSteps: number;
  totalSteps: 4;
};

export function nextAction(input: {
  openShifts: number;
  unapproved: number;
  paySaved: boolean;
  owedCents: number;
  setAsideCents: number;
  sentCents: number;
}): NextAction {
  const hoursReady = input.openShifts === 0 && input.unapproved === 0;
  const setReady = input.paySaved && input.setAsideCents >= input.owedCents && input.owedCents >= 0;
  const sentReady = setReady && input.sentCents >= input.owedCents;
  const doneSteps = [hoursReady, input.paySaved, setReady, sentReady].filter(Boolean).length;
  if (input.openShifts > 0) return { id: "fix_shift", doneSteps, totalSteps: 4 };
  if (input.unapproved > 0) return { id: "approve_hours", doneSteps, totalSteps: 4 };
  if (!input.paySaved) return { id: "run_pay", doneSteps, totalSteps: 4 };
  if (input.setAsideCents < input.owedCents) return { id: "set_aside", doneSteps, totalSteps: 4 };
  if (input.sentCents < input.owedCents) return { id: "send_government", doneSteps, totalSteps: 4 };
  return { id: "done", doneSteps: 4, totalSteps: 4 };
}

export function paySentence(input: {
  locale: "en" | "fr";
  staffCount: number;
  netCents: number;
  governmentCents: number;
  dueLabel: string;
  money: (cents: number) => string;
}): string {
  const pay = input.money(input.netCents);
  const gov = input.money(input.governmentCents);
  if (input.locale === "fr") {
    return `Vous paierez ${input.staffCount} personnes ${pay}. Mettez ${gov} de côté pour le gouvernement d'ici le ${input.dueLabel}.`;
  }
  return `You'll pay ${input.staffCount} staff ${pay}. Set aside ${gov} for the government by ${input.dueLabel}.`;
}
