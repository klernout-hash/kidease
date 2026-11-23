drop table if exists payroll_correction_lines;
drop table if exists payroll_paid_days;
drop table if exists payroll_bank_reveals;
alter table payroll_employees drop column if exists td1_provincial_state;
alter table payroll_employees drop column if exists td1_federal_state;
