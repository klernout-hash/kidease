-- Optional 1-5 scores for the five parent review categories.
-- Missing keys on older rows use the overall star rating in the app.

alter table reviews add column if not exists dimensions text;
