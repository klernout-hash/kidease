-- Store-review sample centres. Public catalogue counts ignore is_demo.
alter table daycares add column if not exists is_demo int not null default 0;

update daycares
set is_demo = 1,
    visibility = 'admin_only',
    is_test = 1
where slug = 'qa-reviewer-demo-centre'
   or id = 'qa-reviewer-demo';
