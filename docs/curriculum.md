# Curriculum pack and Story Corner

`FEATURE_CURRICULUM_PACK` and `FEATURE_CURRICULUM_PACK_LIVE` default **off**. `FEATURE_STORY_CORNER` defaults **off**.

The learning desk follows the province on the daycare listing. Goal lines are KidEase wording. Each one links to the official framework. Full framework text is not stored. ASQ and other licensed tools are not included.

While the live switch is off, a publish is only written to `curriculum_reminder_log`. Parents do not see the story. A yearly review reminder is also log-only. It does not send email or SMS.

Child photos need a parent opt-in on the enrolment. The file is a private key. The page asks for a signed link. Sample activities have no photos of children.

New photo keys bind the centre, child, booking and story:
`family-docs/curriculum/{centre}/{child}/{booking}/{story}/{photo}.jpg`.
Uploads require a private story and its metadata at the same centre, an enrolled booking for that exact child belonging to the child's parent, and current photo consent. The metadata write rechecks those relationships, the same consent timestamp, and the uploader's current centre access. A failed or unmatched write reports failure and attempts to delete the uploaded object. A failed cleanup can leave an unbound private orphan that the reader will not sign. If the database committed but its acknowledgement was lost, the metadata may already contain the key; this is not a transaction across storage and the database, and the normal reader authorization still applies.

The reader requires that exact key in the story's photo list, matching story and metadata centres, a published private story, the bound booking's current enrolment and consent, and either that child's parent or staff at that centre. Draft stories cannot issue photo links. Legacy keys without booking and story provenance are blocked; this local change does not infer their provenance or migrate existing objects. A signed link already issued can remain usable for its 120-second lifetime after consent or access is revoked.

The photo picker lists only the selected child's saved stories and attaches to the explicitly chosen story, including the story just saved. These checks do not change feature flags or activate the pack.

Story Corner reads books from `data/story-corner/`. The importer downloads Global Digital Library CC BY files, checks the SHA-256, and does not keep a hotlink. CC BY-NC and ND items are skipped. CC BY-SA items are stored unchanged. Each book shows its credit line and a Creative Commons licence link.

StoryWeaver stays off until `STORYWEAVER_API_TOKEN` is set. This build still does not call StoryWeaver. When a book is stored, the credit names the title, author, illustrator, translator, publisher, and StoryWeaver, plus the CC BY 4.0 link. Read Along videos are NC-ND and are always skipped.

Unite for Literacy is a link out. It is not embedded.

Government totals on `/gov` are counts only, with small groups hidden. They do not include child names, photos, or room names.

Research notes and what is confirmed: `docs/curriculum/RESEARCH.md`.
