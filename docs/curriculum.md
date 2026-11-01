# Curriculum pack and Story Corner

`FEATURE_CURRICULUM_PACK` and `FEATURE_CURRICULUM_PACK_LIVE` default **off**. `FEATURE_STORY_CORNER` defaults **off**.

The learning desk follows the province on the daycare listing. Goal lines are KidEase wording. Each one links to the official framework. Full framework text is not stored. ASQ and other licensed tools are not included.

While the live switch is off, a publish is only written to `curriculum_reminder_log`. Parents do not see the story. A yearly review reminder is also log-only. It does not send email or SMS.

Child photos need a parent opt-in on the enrolment. The file is a private key. The page asks for a signed link. Sample activities have no photos of children.

Story Corner reads books from `data/story-corner/`. The importer downloads CC BY files, checks the SHA-256, and does not keep a hotlink. CC BY-NC and ND items are skipped. CC BY-SA items are stored unchanged.

Book Dash books show the four creators, a link to bookdash.org, the local Book Dash logo, the CC BY 4.0 link, and a change note when the file was changed. This pack does not change the files.

StoryWeaver stays off until `STORYWEAVER_API_TOKEN` is set. This build still does not call StoryWeaver. Read Along videos are NC-ND and are always skipped.

Unite for Literacy is a link out. It is not embedded.

Government totals on `/gov` are counts only, with small groups hidden. They do not include child names, photos, or room names.

Research notes and what is confirmed: `docs/curriculum/RESEARCH.md`.
