# Connect Barber

Site de barbearia do sistema **Connect Barber** (multi-tenancy).

Etapa 1: reconstrução visual a partir da estrutura do site da Barbearia Corleone, com a identidade Connect Barber (preto + cromo do logo oficial). Próximas etapas: elementos interativos inspirados em outras barbearias e o painel multi-tenant.

## Como está organizado

```
index.html            página completa (HTML + CSS + JS em um arquivo, padrão Criazzo)
assets/img/
  banner.webp         banner oficial (logo horizontal)
  simbolo.webp        símbolo oficial (tesoura + bigode)
  favicon.png         ícone da aba
```

## Multi-tenancy

Todo o conteúdo da barbearia fica no bloco `<script type="application/json" id="tenant">`, no fim do `index.html`:
nome, WhatsApp, Instagram, textos, serviços, unidades (endereço, telefone, horários), avaliações e fotos.

No sistema, o PHP vai injetar ali o JSON da barbearia certa (ex.: `data/tenants/<slug>.json`). O HTML não muda de uma barbearia para outra.

- `"demo": true` deixa os botões de agenda/app como demonstração e o WhatsApp abre sem número fixo. Em produção use `false`.
- `"photos"` e `"units[].photo"`: deixe vazio para usar a arte cromada, ou informe a URL da foto da barbearia.
- `"hours"`: horário por dia (`"10:00-21:00"` ou `null` para fechado). O card da unidade mostra "Aberto agora" pelo fuso de `"timezone"`.

## Seções

Barra de marca cromada · cabeçalho fixo com menu mobile · hero com brilho no logo · faixa de promoção · Nossa Marca (barber pole animado) · letreiro contínuo · Barba & Cabelo · faixa "em movimento" · grade de serviços · Agende (online, app, WhatsApp/telefone) · Instagram (mockup de celular) · Trabalhe conosco · Unidades com status de funcionamento · Avaliações · Contato · rodapé · WhatsApp flutuante.
