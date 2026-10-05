-- Registry pages parents and admin open. Several old URLs now 404.
-- A generic ?q= on those hosts is also a 404 or a junk path, so these are
-- the search or list pages themselves, with no extra query string.

update ca_jurisdictions set registry_url = 'https://maps.gov.bc.ca/ess/hm/ccf/', updated_at = now() where code = 'BC';
update ca_jurisdictions set registry_url = 'https://childcare.alberta.ca/childcaresearch/', updated_at = now() where code = 'AB';
update ca_jurisdictions set registry_url = 'https://www.saskatchewan.ca/residents/family-and-social-support/child-care/find-a-child-care-provider-in-my-community', updated_at = now() where code = 'SK';
update ca_jurisdictions set registry_url = 'https://www.earlyyears.edu.gov.on.ca/LCCWWeb/childcare/search.xhtml?lang=en', updated_at = now() where code = 'ON';
update ca_jurisdictions set registry_url = 'https://www.quebec.ca/en/family-and-support-for-individuals/childhood/childcare-centres', updated_at = now() where code = 'QC';
update ca_jurisdictions set registry_url = 'https://www.nbed.nb.ca/parentportal/en/Search/Info/', updated_at = now() where code = 'NB';
update ca_jurisdictions set registry_url = 'https://nsbr-online-services.novascotia.ca/DCSOnline/ECDS/loadSearchPage', updated_at = now() where code = 'NS';
update ca_jurisdictions set registry_url = 'https://www.childcare.gov.nl.ca/public/ccr/childcare/', updated_at = now() where code = 'NL';
update ca_jurisdictions set registry_url = 'https://yukon.ca/en/education-and-schools/early-childhood-learning-and-programs/find-child-care-yukoners', updated_at = now() where code = 'YT';
update ca_jurisdictions set registry_url = 'https://www.gov.nu.ca/en/education-and-schools/licensed-child-care-centres', updated_at = now() where code = 'NU';
