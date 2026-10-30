# Connect Barber

Site de barbearia do sistema **Connect Barber** (multi-tenancy).

Etapa 1: reconstrução fiel do visual do site da Barbearia Corleone (Oswald + Inter, barra de barber pole vermelha/azul, fotos em tela cheia), com o logo e o banner oficiais da Connect Barber. A seção "Trabalhe Conosco" mantém o cromo da primeira versão. Próximas etapas: elementos interativos inspirados em outras barbearias e o painel multi-tenant.

## Como está organizado

```
index.html            página completa (HTML + CSS + JS em um arquivo, padrão Criazzo)
assets/img/
  banner.webp         banner oficial (logo horizontal)
  simbolo-dark.webp   símbolo em versão escura, para fundo claro (seção Agende)
  simbolo.webp        símbolo oficial (tesoura + bigode)
  favicon.png         ícone da aba
  fotos/              fotos de demonstração (Unsplash, licença livre para uso comercial)
```

## Multi-tenancy

Todo o conteúdo da barbearia fica no bloco `<script type="application/json" id="tenant">`, no fim do `index.html`:
nome, WhatsApp, Instagram, textos, serviços, unidades (endereço, telefone, horários), avaliações e fotos.

No sistema, o PHP vai injetar ali o JSON da barbearia certa (ex.: `data/tenants/<slug>.json`). O HTML não muda de uma barbearia para outra.

- `"demo": true` deixa os botões de agenda/app como demonstração e o WhatsApp abre sem número fixo. Em produção use `false`.
- `"photos"`, `"units[].photo"` e `"instagram.phone/collage"`: caminho ou URL das fotos da barbearia. As de demonstração estão em `assets/img/fotos/`.
- `"hours"`: texto do horário de cada unidade, como aparece no card.

## Seções

Barra de barber pole · cabeçalho fixo com menu mobile · hero com foto da fachada · faixa de promoção · Nossa Marca · letreiro contínuo · Barba & Cabelo · faixa "em movimento" · grade de serviços · Agende (online, app, WhatsApp/telefone) · Instagram (celular + colagem) · Trabalhe conosco · Unidades · Avaliações · Contato · rodapé · WhatsApp flutuante.

## Créditos das fotos

Fotos de demonstração do [Unsplash](https://unsplash.com) (Unsplash License). Substitua pelas fotos reais de cada barbearia.
