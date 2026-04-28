# Configuração do Webhook Resend

## Endpoint

```
POST https://<domínio>/api/webhook/resend
```

## Eventos Obrigatórios

O webhook registrado no painel do Resend (`resend.com/webhooks`) deve ter os seguintes eventos habilitados:

| Evento | Descrição | Atualiza |
|--------|-----------|----------|
| `email.delivered` | E-mail entregue ao servidor do destinatário | `email_status = 'delivered'` |
| `email.opened` | Destinatário abriu o e-mail | `email_status = 'opened'`, `is_valid_email = true` |
| `email.clicked` | Destinatário clicou em um link | `email_status = 'clicked'`, `is_valid_email = true` |
| `email.bounced` | E-mail rejeitado pelo servidor | `email_status = 'bounced'`, `is_valid_email = false` |

## Como verificar/configurar

1. Acessar `resend.com` → **Webhooks** no menu lateral
2. Selecionar o webhook do projeto (URL com `/api/webhook/resend`)
3. Verificar que os 4 eventos acima estão marcados
4. Se precisar criar: clicar em **Add Endpoint** e selecionar os eventos

## Variável de Ambiente

```bash
RESEND_WEBHOOK_SECRET=whsec_...
```

Obtida no painel do Resend ao criar/editar o webhook (campo **Signing Secret**).

Configure no Vercel em **Settings → Environment Variables**.

## Rastreamento no Banco

- `campaign_entries.email_status` — status atual do e-mail (campo único, reflete o último evento)
- `campaign_events` — log imutável de todos os eventos (canal `email`, tipos: `delivered`, `opened`, `clicked`, `bounced`)
- `campaign_events.metadata.click.link` — URL clicada (disponível em eventos `clicked`)
