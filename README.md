# Connect Barber

Rede que conecta barbearias e clientes. O dono cadastra o salão (fotos, logo, serviços, preços, horários, equipe e posição no mapa). O cliente libera a localização, vê as barbearias perto dele no mapa, compara avaliações e preços e agenda num horário livre.

Padrão Criazzo: páginas HTML + PHP + arquivos JSON. Sem banco de dados, sem Composer, sem Node. Roda em hospedagem compartilhada (Hostinger, HostGator) com PHP 7.4 ou superior.

## Páginas

| Arquivo | Para quem | O que faz |
|---|---|---|
| `index.html` | Cliente | Pede a localização, mostra o mapa e a lista de barbearias próximas, filtros (aberto agora, melhor avaliadas, mais baratas, categoria), busca por nome, página da barbearia, agendamento em 4 passos, "Meus agendamentos" (cancelar e avaliar) |
| `parceiro.html` | Dono da barbearia | Cadastro em 7 etapas com prévia ao vivo, login, painel com agenda do dia e próximos, situação do atendimento (concluído, não veio, cancelado), avaliações e edição da página |
| `site-barbearia.html` | Modelo | Site individual de uma barbearia (o template inspirado na Corleone), para quem quiser um site próprio além da página na rede |
| `api.php` | Servidor | Guarda barbearias, agendamentos e imagens |

## Como publicar na hospedagem

1. Baixe o projeto (botão verde **Code** → **Download ZIP** no GitHub).
2. No gerenciador de arquivos da hospedagem, entre em `public_html` e envie o ZIP.
3. Clique com o botão direito no ZIP → **Extrair**.
4. Abra o seu domínio. Pronto: o site detecta o `api.php` sozinho e passa a salvar tudo no servidor.

As pastas `data/` (dados) e `uploads/` (fotos enviadas pelas barbearias) são criadas e protegidas automaticamente no primeiro acesso. Faça backup dessas duas pastas de vez em quando.

## Dois modos

- **Com servidor** (`api.php` respondendo): cadastros, agendamentos e avaliações ficam no servidor e valem para todo mundo.
- **Demonstração** (abrindo o HTML sem PHP, como na prévia do Claude): tudo fica salvo só no navegador de quem está testando.

### Barbearias de exemplo

Enquanto a rede tiver menos de 5 barbearias reais, o mapa mostra 12 barbearias fictícias ao redor do cliente, marcadas como demonstração (agendamentos nelas ficam só no navegador). Elas somem sozinhas quando a 5ª barbearia real se cadastrar. Para mudar esse número, edite `EXEMPLOS_ATE` no começo do `api.php` (0 = nunca mostrar).

### Painel de demonstração

`parceiro.html#demo` ou o login `demo@connectbarber.com.br` / `connect123` abre o painel da "Navalha de Ouro" (fica no navegador, não mexe nos dados reais).

## Regras do agendamento

- Horários em blocos de 30 minutos dentro do expediente de cada dia.
- A duração soma os serviços escolhidos; cada profissional tem a própria agenda. "Primeiro livre" pega quem estiver disponível.
- O servidor recalcula preço, duração e conflito na hora de gravar: dois clientes não conseguem o mesmo horário.
- O cliente recebe um código (ex.: `CB-K4J3E`), pode adicionar ao Google Agenda e chamar a barbearia no WhatsApp.
- Cancelamento pelo cliente só enquanto estiver confirmado. Avaliação só depois do horário marcado, uma vez por agendamento.

## Segurança

- Senhas com `password_hash`. Login com limite de tentativas.
- `data/` bloqueada para acesso pela web; `uploads/` não executa scripts.
- Imagens: só JPG, PNG ou WebP até 3 MB, conferidas pelo conteúdo do arquivo. O navegador já reduz as fotos antes de enviar.
- Todas as chamadas exigem o cabeçalho do próprio site.

## Mapas e endereço

- Mapa: Leaflet + OpenStreetMap (gratuito, sem chave). Para muito tráfego, troque o endereço dos mapas em `TILES` no `assets/js/connect.js` por um provedor com plano (MapTiler, Stadia, Mapbox).
- Busca de endereço: Nominatim (OpenStreetMap). Sem internet, usa uma lista interna de cidades.
- CEP: ViaCEP.
- A localização do cliente serve para buscar e ordenar as barbearias próximas. Ela não é gravada no servidor.

## Estrutura

```
index.html            app do cliente
parceiro.html         portal do dono
site-barbearia.html   modelo de site individual
api.php               API (JSON em arquivo)
assets/js/connect.js  núcleo compartilhado (dados, horários livres, mapa, modo demo/servidor)
assets/img/           banner, símbolo, favicon, fotos/ e capas/
data/                 shops.json e bookings.json (criados no servidor)
uploads/              fotos enviadas pelas barbearias
```

## Créditos das fotos

Fotos de barbearias de [Unsplash](https://unsplash.com) (licença Unsplash). Logo e banner: Connect Barber.
