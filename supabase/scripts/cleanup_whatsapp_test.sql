-- Remove a configuração FALSA de WhatsApp usada no teste automatizado da conta demo.
delete from whatsapp_configs where phone_number_id = 'TEST_PHONE_ID';
delete from conversations where wa_id = '5511999990000';
delete from insights where title like 'Aprovação necessária: Ana Cliente%';
update agents set auto_reply = true where kind = 'support';
