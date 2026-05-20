# Backlog — Tarefas Pendentes

Tarefas operacionais, configurações e ajustes pendentes que não requerem uma story completa.

---

## Pendente

### [OPS] Configurar env vars do Calendly no Vercel

**Adicionado em:** 2026-05-20
**Relacionado à:** Story 37-1 (Integração Calendly → Agenda)

Para ativar o sync automático de agendamentos do Calendly, configurar as seguintes variáveis de ambiente no painel do Vercel (Settings → Environment Variables → Production):

| Variável | Valor |
|----------|-------|
| `CALENDLY_PAT` | Token gerado em Calendly → Integrações → API & Webhooks → Personal Access Tokens |
| `CALENDLY_USER_URI` | `https://api.calendly.com/users/6f5ae058-0133-4f8a-971a-674f0e72b075` |

Após configurar, o cron `/api/cron/calendly-sync` rodará automaticamente a cada 30 minutos.

**Teste manual após configurar:**
```bash
curl -X GET https://crm.trifold.eng.br/api/cron/calendly-sync \
  -H "Authorization: Bearer {CRON_SECRET}"
```

---

## Concluído

_(nenhum item concluído ainda)_
