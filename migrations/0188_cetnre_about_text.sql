-- Fix the registry letter-swap inside listing prose.
-- Only the word Cetnre / Cetnres changes. The rest of the sentence stays.

update daycares
set
  description = regexp_replace(regexp_replace(description, '\yCetnres\y', 'Centres', 'g'), '\yCetnre\y', 'Centre', 'g'),
  description_fr = regexp_replace(regexp_replace(coalesce(description_fr, ''), '\yCetnres\y', 'Centres', 'g'), '\yCetnre\y', 'Centre', 'g'),
  tagline = regexp_replace(regexp_replace(coalesce(tagline, ''), '\yCetnres\y', 'Centres', 'g'), '\yCetnre\y', 'Centre', 'g'),
  tagline_fr = regexp_replace(regexp_replace(coalesce(tagline_fr, ''), '\yCetnres\y', 'Centres', 'g'), '\yCetnre\y', 'Centre', 'g'),
  name = regexp_replace(regexp_replace(name, '\yCetnres\y', 'Centres', 'g'), '\yCetnre\y', 'Centre', 'g'),
  name_fr = regexp_replace(regexp_replace(coalesce(name_fr, ''), '\yCetnres\y', 'Centres', 'g'), '\yCetnre\y', 'Centre', 'g')
where description ~ '\yCetnre'
   or coalesce(description_fr, '') ~ '\yCetnre'
   or coalesce(tagline, '') ~ '\yCetnre'
   or coalesce(tagline_fr, '') ~ '\yCetnre'
   or name ~ '\yCetnre'
   or coalesce(name_fr, '') ~ '\yCetnre';
