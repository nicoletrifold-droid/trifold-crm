-- Adiciona sienge_customer_id à tabela clientes (CRM) para vincular ao ERP Sienge
-- A tabela CRM 'clientes' é usada no admin para gestão de obras via clientes_obras_vinculos
ALTER TABLE clientes
  ADD COLUMN IF NOT EXISTS sienge_customer_id INTEGER;

COMMENT ON COLUMN clientes.sienge_customer_id IS
  'ID do cliente no Sienge ERP. Null = não vinculado. Usado pelo portal para extrato financeiro e boletos.';

-- Também adiciona nas tabelas de usuários portal para acesso na rota /portal/cliente
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS sienge_customer_id INTEGER,
  ADD COLUMN IF NOT EXISTS cpf VARCHAR(14);

COMMENT ON COLUMN users.sienge_customer_id IS
  'ID do cliente no Sienge ERP (espelho de clientes.sienge_customer_id). Usado para acesso direto no portal sem join.';

COMMENT ON COLUMN users.cpf IS
  'CPF do usuário portal. Usado para buscar e vincular com cliente Sienge ERP.';
