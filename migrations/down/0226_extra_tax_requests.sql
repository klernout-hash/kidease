drop table if exists payroll_extra_tax_requests;
alter table payroll_employees drop column if exists extra_tax_authority;
alter table payroll_employees drop column if exists extra_tax_cents;
