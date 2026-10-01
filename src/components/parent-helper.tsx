import { useState } from "react";
import { AI_FLAGS } from "@/lib/ai/flags";
import { parentHelperEventProps } from "@/lib/ai/parent-helper";
import { useAiFeatureFlag } from "@/lib/ai/use-ai-flag";
import { capturePostHogEvent } from "@/lib/posthog";
import { askParentHelper, estimateSubsidy } from "@/lib/server/parent-helper";
import { useCopy } from "@/lib/use-copy";
import { Button } from "@/components/ui/button";

export function ParentHelperPanel() {
  const on = useAiFeatureFlag(AI_FLAGS.parentHelper);
  const { t } = useCopy();
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [path, setPath] = useState<string | null>(null);
  const [subsidy, setSubsidy] = useState("");
  const [busy, setBusy] = useState(false);
  if (!on) return null;

  function ask() {
    const text = question.trim();
    if (!text || busy) return;
    setBusy(true);
    void askParentHelper({ data: { question: text } })
      .then((res) => {
        if ("error" in res) {
          setAnswer(t("parentHelperUnknown"));
          setPath(null);
          capturePostHogEvent("parent_helper_unknown", {});
          return;
        }
        setAnswer(res.answer);
        setPath(res.path);
        capturePostHogEvent(res.known ? "parent_helper_asked" : "parent_helper_unknown", parentHelperEventProps({ path: res.path || "" }));
      })
      .catch(() => {
        setAnswer(t("parentHelperUnknown"));
        setPath(null);
        capturePostHogEvent("parent_helper_unknown", {});
      })
      .finally(() => setBusy(false));
  }

  function estimate(province: "AB" | "CA" | "MB") {
    setBusy(true);
    void estimateSubsidy({ data: { province } })
      .then((res) => {
        if ("error" in res || !res.known) {
          setSubsidy(t("parentHelperSubsidyUnknown"));
          return;
        }
        setSubsidy(`${res.label} ${res.amount}`);
        capturePostHogEvent("parent_helper_subsidy", parentHelperEventProps({ path: res.path }));
      })
      .catch(() => setSubsidy(t("parentHelperSubsidyUnknown")))
      .finally(() => setBusy(false));
  }

  return (
    <section className="mt-8 rounded-xl bg-surface p-4 ring-1 ring-border" data-ke="parent-helper">
      <h2 className="font-display text-xl">{t("parentHelperTitle")}</h2>
      <p className="mt-1 text-sm text-muted">{t("parentHelperLead")}</p>
      <label className="mt-3 block text-sm font-medium">
        {t("parentHelperAsk")}
        <textarea
          className="mt-1 min-h-24 w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
        />
      </label>
      <Button type="button" className="mt-2 min-h-11" disabled={busy} onClick={ask}>
        {busy ? t("parentHelperWorking") : t("parentHelperAsk")}
      </Button>
      {answer ? (
        <p className="mt-3 text-sm" role="status">
          {answer}
          {path ? (
            <>
              {" "}
              <a href={path} className="font-medium text-primary">
                {t("parentHelperCite").replace("{path}", path)}
              </a>
            </>
          ) : null}
        </p>
      ) : null}
      <h3 className="mt-4 text-sm font-semibold">{t("parentHelperTour")}</h3>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
        {(["parentHelperQ1", "parentHelperQ2", "parentHelperQ3", "parentHelperQ4"] as const).map((key) => (
          <li key={key}>{t(key)}</li>
        ))}
      </ul>
      <h3 className="mt-4 text-sm font-semibold">{t("parentHelperSubsidy")}</h3>
      <div className="mt-2 flex flex-wrap gap-2">
        <Button type="button" variant="secondary" className="min-h-11" disabled={busy} onClick={() => estimate("AB")}>
          AB
        </Button>
        <Button type="button" variant="secondary" className="min-h-11" disabled={busy} onClick={() => estimate("CA")}>
          CA
        </Button>
        <Button type="button" variant="secondary" className="min-h-11" disabled={busy} onClick={() => estimate("MB")}>
          MB
        </Button>
      </div>
      {subsidy ? <p className="mt-2 text-sm">{subsidy}</p> : null}
    </section>
  );
}
