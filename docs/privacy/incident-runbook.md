# Confidentiality incident runbook

Use this when someone reports a possible privacy incident: a wrong email, a public home address, a lost staff device, an account used by the wrong person, or a file that left KidEase.

This runbook does not send email or text by itself. It does not delete data. It does not change a feature flag.

## Who does what

- The person who finds it tells privacy@kidease.ca the same day.
- The privacy officer (named on the privacy policy) decides the next step.
- Do not post the details in a public channel, a pull request, or this folder.

## Steps

1. **Write down the facts.** Date found, what happened, which data, and who might be affected. Use only facts you can point to. If a count is unknown, write "not known yet".
2. **Stop it getting worse.** Examples: remove a public street address, revoke a session, turn off a broken export. Do not drop or rewrite database tables from this runbook. Do not run a delete-account job for someone else.
3. **Assess the risk of serious injury.** The privacy officer decides yes, no, or not decided. Serious injury includes humiliation, identity theft, or harm to a child. Record the decision in the private case notes.
4. **Tell people when the risk is real.**
   - If there is a risk of serious injury, tell the people affected and the Commission d'accès à l'information du Québec when Quebec law requires it.
   - Tell the Office of the Privacy Commissioner of Canada when PIPEDA requires it (a real risk of significant harm).
   - Say what happened, what data, what KidEase is doing, and how to reach privacy@kidease.ca. Do not promise a timeline that is not in the privacy policy.
5. **Update the register.** Add one row to `docs/privacy/incident-register.md` with the Law 25 fields. Do not paste child names, health notes, or message text into the git file.
6. **Fix the cause.** A code or config change goes through a normal pull request. Do not force-push `main`. Do not turn on production flags from the incident notes unless Kyle says so.

## What this is not

- It is not a list of past incidents. The register starts empty.
- It is not the privacy policy, and it is not the Delete account page.
- It does not claim a certification.
