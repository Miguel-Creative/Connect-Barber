/* ==========================================================================
   CONNECT BARBER · núcleo da plataforma (padrão Criazzo, sem build)
   --------------------------------------------------------------------------
   Usado por index.html (clientes) e parceiro.html (barbearias).
   Dois modos, escolhidos sozinhos:
   · "api"  quando a página roda em um servidor PHP com api.php respondendo;
   · "demo" em qualquer outro lugar (arquivo local, GitHub Pages, prévia):
            barbearias de demonstração + dados salvos no navegador.
   ========================================================================== */
(function (global) {
  'use strict';

  /* ------------------------------------------------------------------ util */
  var LS = {
    get: function (k, d) { try { var v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (e) { return d; } },
    set: function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } },
    del: function (k) { try { localStorage.removeItem(k); } catch (e) {} }
  };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var slugify = function (s) { return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48); };
  var uid = function (p) { return (p || '') + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); };
  var code = function () { var a = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789', s = 'CB-'; for (var i = 0; i < 5; i++) s += a[Math.floor(Math.random() * a.length)]; return s; };
  var brl = function (v) { return 'R$ ' + Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 2 }); };
  var km = function (d) { return d == null ? '' : d < 1 ? Math.round(d * 1000 / 10) * 10 + ' m' : d.toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' km'; };
  var pad = function (n) { return (n < 10 ? '0' : '') + n; };
  var phoneDigits = function (p) { return String(p || '').replace(/\D/g, ''); };

  function haversine(a, b) {
    var R = 6371, dLat = (b.lat - a.lat) * Math.PI / 180, dLng = (b.lng - a.lng) * Math.PI / 180;
    var s = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return 2 * R * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
  }

  /* ------------------------------------------------------- dias e horários */
  var DAYS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sab'];
  var DAY_LABEL = { dom: 'Domingo', seg: 'Segunda', ter: 'Terça', qua: 'Quarta', qui: 'Quinta', sex: 'Sexta', sab: 'Sábado' };
  var DAY_SHORT = { dom: 'Dom', seg: 'Seg', ter: 'Ter', qua: 'Qua', qui: 'Qui', sex: 'Sex', sab: 'Sáb' };
  var WEEK = ['seg', 'ter', 'qua', 'qui', 'sex', 'sab', 'dom'];
  var toMin = function (t) { var p = String(t).split(':'); return (+p[0]) * 60 + (+p[1] || 0); };
  var fromMin = function (m) { return pad(Math.floor(m / 60)) + ':' + pad(m % 60); };
  var fmtH = function (t) { var p = String(t).split(':'); return (+p[0]) + 'h' + (p[1] && p[1] !== '00' ? p[1] : ''); };
  var range = function (r) { var p = String(r).split('-'); return [p[0].trim(), p[1].trim()]; };
  var isoDate = function (d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };
  var parseISO = function (s) { var p = s.split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); };
  var dayKey = function (d) { return DAYS[d.getDay()]; };
  var nowMin = function () { var n = new Date(); return n.getHours() * 60 + n.getMinutes(); };

  function openStatus(hours) {
    hours = hours || {};
    var n = new Date(), k = DAYS[n.getDay()], m = nowMin(), today = hours[k];
    if (today) {
      var r = range(today);
      if (m >= toMin(r[0]) && m < toMin(r[1])) return { open: true, text: 'Aberta · fecha às ' + fmtH(r[1]) };
      if (m < toMin(r[0])) return { open: false, text: 'Fechada · abre às ' + fmtH(r[0]) };
    }
    for (var i = 1; i <= 7; i++) {
      var kk = DAYS[(n.getDay() + i) % 7];
      if (hours[kk]) return { open: false, text: 'Fechada · abre ' + (i === 1 ? 'amanhã' : DAY_LABEL[kk].toLowerCase()) + ' às ' + fmtH(range(hours[kk])[0]) };
    }
    return { open: false, text: 'Fechada' };
  }

  /* horários livres: blocos de 30 min dentro do expediente, sem conflito */
  function freeSlots(shop, dateISO, duration, busy, barberId) {
    var d = parseISO(dateISO), r = (shop.hours || {})[dayKey(d)];
    if (!r) return [];
    var rr = range(r), start = toMin(rr[0]), end = toMin(rr[1]), out = [];
    var isToday = dateISO === isoDate(new Date()), limit = isToday ? nowMin() + 20 : -1;
    var barbers = (shop.barbers && shop.barbers.length ? shop.barbers : [{ id: 'b0' }]).map(function (b) { return b.id; });
    var pool = barberId && barberId !== 'any' ? [barberId] : barbers;
    for (var t = start; t + duration <= end; t += 30) {
      if (t <= limit) continue;
      var free = pool.filter(function (bid) {
        return !busy.some(function (b) {
          if (b.barberId !== bid) return false;
          var bs = toMin(b.time), be = bs + (b.duration || 30);
          return t < be && bs < t + duration;
        });
      });
      if (free.length) out.push({ time: fromMin(t), barbers: free });
    }
    return out;
  }

  function hoursText(h) {
    var groups = [], byKey = {};
    WEEK.forEach(function (d, i) { var k = (h || {})[d] || 'x'; if (!byKey[k]) { byKey[k] = { key: k, days: [] }; groups.push(byKey[k]); } byKey[k].days.push(i); });
    return groups.map(function (g) {
      var runs = [], cur = [g.days[0]];
      for (var i = 1; i < g.days.length; i++) { if (g.days[i] === cur[cur.length - 1] + 1) cur.push(g.days[i]); else { runs.push(cur); cur = [g.days[i]]; } }
      runs.push(cur);
      var parts = [];
      runs.forEach(function (r) { if (r.length >= 3) parts.push(DAY_SHORT[WEEK[r[0]]] + ' a ' + DAY_SHORT[WEEK[r[r.length - 1]]]); else r.forEach(function (x) { parts.push(DAY_SHORT[WEEK[x]]); }); });
      var days = parts.length > 1 ? parts.slice(0, -1).join(', ') + ' e ' + parts[parts.length - 1] : parts[0];
      if (g.key === 'x') return days + ' fechado';
      var r2 = range(g.key); return days + ' ' + fmtH(r2[0]) + ' às ' + fmtH(r2[1]);
    }).join(' · ');
  }

  /* ---------------------------------------------------- logo monograma SVG */
  function monogram(name, accent) {
    var words = String(name || 'CB').split(/\s+/).filter(function (w) { return w && !/^(de|do|da|dos|das|e|&|the|barbearia|barber|barbershop)$/i.test(w); });
    var ini = (words.length ? words : ['C', 'B']).slice(0, 2).map(function (w) { return w[0]; }).join('').toUpperCase();
    var c = accent || '#ED1B2E';
    var svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><circle cx="60" cy="60" r="57" fill="#0b0b0b" stroke="' + c + '" stroke-width="5"/>' +
      '<circle cx="60" cy="60" r="47" fill="none" stroke="#fff" stroke-opacity=".22"/>' +
      '<text x="60" y="74" text-anchor="middle" font-family="Oswald,Arial Narrow,Arial,sans-serif" font-size="40" font-weight="700" fill="#fff" letter-spacing="1">' + esc(ini) + '</text></svg>';
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  }

  /* ------------------------------------------- cidades (busca sem internet) */
  var CITIES = [
    ['Ampére', 'PR', -25.9150, -53.4710], ['Francisco Beltrão', 'PR', -26.0810, -53.0550], ['Pato Branco', 'PR', -26.2290, -52.6710],
    ['Cascavel', 'PR', -24.9555, -53.4552], ['Ponta Grossa', 'PR', -25.0950, -50.1620], ['Curitiba', 'PR', -25.4284, -49.2733],
    ['Londrina', 'PR', -23.3045, -51.1696], ['Maringá', 'PR', -23.4205, -51.9333], ['Foz do Iguaçu', 'PR', -25.5163, -54.5854],
    ['Florianópolis', 'SC', -27.5954, -48.5480], ['Joinville', 'SC', -26.3045, -48.8487], ['Itapema', 'SC', -27.0904, -48.6114],
    ['Balneário Camboriú', 'SC', -26.9926, -48.6352], ['Chapecó', 'SC', -27.1004, -52.6152], ['Porto Alegre', 'RS', -30.0346, -51.2177],
    ['Caxias do Sul', 'RS', -29.1678, -51.1794], ['São Paulo', 'SP', -23.5505, -46.6333], ['Campinas', 'SP', -22.9099, -47.0626],
    ['Santos', 'SP', -23.9608, -46.3336], ['Ribeirão Preto', 'SP', -21.1704, -47.8103], ['Franca', 'SP', -20.5386, -47.4009],
    ['Rio de Janeiro', 'RJ', -22.9068, -43.1729], ['Belo Horizonte', 'MG', -19.9167, -43.9345], ['Uberlândia', 'MG', -18.9186, -48.2772],
    ['Sete Lagoas', 'MG', -19.4658, -44.2467], ['Vitória', 'ES', -20.3155, -40.3128], ['Brasília', 'DF', -15.7939, -47.8828],
    ['Goiânia', 'GO', -16.6869, -49.2648], ['Cuiabá', 'MT', -15.6010, -56.0974], ['Sinop', 'MT', -11.8604, -55.5091],
    ['Campo Grande', 'MS', -20.4697, -54.6201], ['Salvador', 'BA', -12.9777, -38.5016], ['Recife', 'PE', -8.0476, -34.8770],
    ['Fortaleza', 'CE', -3.7319, -38.5267], ['Natal', 'RN', -5.7945, -35.2110], ['João Pessoa', 'PB', -7.1195, -34.8450],
    ['Maceió', 'AL', -9.6658, -35.7350], ['Aracaju', 'SE', -10.9472, -37.0731], ['Teresina', 'PI', -5.0892, -42.8019],
    ['São Luís', 'MA', -2.5307, -44.3068], ['Belém', 'PA', -1.4558, -48.4902], ['Manaus', 'AM', -3.1190, -60.0217],
    ['Porto Velho', 'RO', -8.7612, -63.9004], ['Palmas', 'TO', -10.2491, -48.3243], ['Boa Vista', 'RR', 2.8235, -60.6758],
    ['Macapá', 'AP', 0.0349, -51.0694], ['Rio Branco', 'AC', -9.9747, -67.8243]
  ];
  var norm = function (s) { return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim(); };
  function cityLookup(q) {
    var n = norm(q).replace(/\s*[-,\/]\s*[a-z]{2}$/, '');
    if (!n) return null;
    var hit = CITIES.filter(function (c) { return norm(c[0]) === n; })[0] || CITIES.filter(function (c) { return norm(c[0]).indexOf(n) === 0; })[0];
    return hit ? { lat: hit[2], lng: hit[3], label: hit[0] + ' · ' + hit[1], city: hit[0] } : null;
  }

  function withTimeout(p, ms) { return Promise.race([p, new Promise(function (_, rej) { setTimeout(function () { rej(new Error('timeout')); }, ms); })]); }

  /* CEP pelo ViaCEP (gratuito, sem chave) */
  function viaCep(cep) {
    var c = phoneDigits(cep);
    if (c.length !== 8) return Promise.reject(new Error('CEP precisa ter 8 números.'));
    return withTimeout(fetch('https://viacep.com.br/ws/' + c + '/json/').then(function (r) { return r.json(); }), 6000).then(function (j) {
      if (!j || j.erro) throw new Error('CEP não encontrado.');
      return { street: j.logradouro, district: j.bairro, city: j.localidade, uf: j.uf, cep: j.cep };
    });
  }

  /* endereço → coordenadas: Nominatim (OpenStreetMap); sem internet, lista de cidades */
  function geocode(q) {
    var local = cityLookup(q);
    return withTimeout(fetch('https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=br&accept-language=pt-BR&q=' + encodeURIComponent(q)).then(function (r) { return r.json(); }), 6000)
      .then(function (arr) {
        if (arr && arr[0]) {
          var name = String(arr[0].display_name || q).split(',').slice(0, 2).join(' ·');
          return { lat: +arr[0].lat, lng: +arr[0].lon, label: name, city: String(arr[0].display_name || q).split(',')[0] };
        }
        if (local) return local;
        throw new Error('Não encontramos esse endereço.');
      })
      .catch(function (e) { if (local) return local; throw e.message === 'timeout' || e instanceof TypeError ? new Error('Sem conexão com o serviço de mapas. Digite o nome de uma cidade.') : e; });
  }
  function reverseGeocode(lat, lng) {
    return withTimeout(fetch('https://nominatim.openstreetmap.org/reverse?format=json&zoom=14&accept-language=pt-BR&lat=' + lat + '&lon=' + lng).then(function (r) { return r.json(); }), 6000)
      .then(function (j) { var a = (j && j.address) || {}; return a.suburb || a.city_district || a.city || a.town || a.village || 'sua região'; })
      .catch(function () {
        var best = null, bd = 1e9;
        CITIES.forEach(function (c) { var d = haversine({ lat: lat, lng: lng }, { lat: c[2], lng: c[3] }); if (d < bd) { bd = d; best = c; } });
        return bd < 40 ? best[0] : 'sua região';
      });
  }
  function myPosition() {
    return new Promise(function (res, rej) {
      if (!navigator.geolocation) return rej(new Error('Este navegador não informa a localização. Digite sua cidade.'));
      navigator.geolocation.getCurrentPosition(function (p) { res({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy }); },
        function (e) { rej(new Error(e.code === 1 ? 'Localização bloqueada. Libere no cadeado da barra de endereço ou digite sua cidade.' : 'Não conseguimos sua localização agora. Digite sua cidade.')); },
        { enableHighAccuracy: true, timeout: 12000, maximumAge: 300000 });
    });
  }

  /* --------------------------------------------- barbearias de demonstração */
  var IMG = 'assets/img/';
  var CATALOG = {
    corte: ['Corte masculino', 'Corte', 40, 40], maquina: ['Corte na máquina', 'Corte', 30, 30], pezinho: ['Pezinho e acabamento', 'Corte', 15, 15],
    barba: ['Barba na navalha', 'Barba', 35, 30], barbo: ['Barboterapia com toalha quente', 'Barba', 55, 45], combo: ['Corte + barba', 'Combo', 70, 60],
    infantil: ['Corte infantil', 'Infantil', 35, 30], sobrancelha: ['Sobrancelha', 'Sobrancelha', 15, 15], hidra: ['Hidratação capilar', 'Tratamentos', 35, 30],
    pigm: ['Pigmentação de barba', 'Tratamentos', 45, 30], platinado: ['Platinado / luzes', 'Química', 150, 120], relax: ['Selagem / alinhamento', 'Química', 90, 60],
    dupla: ['Combo pai e filho', 'Combo', 95, 75]
  };
  function svc(keys, f) { return keys.map(function (k, i) { var c = CATALOG[k]; return { id: 's' + (i + 1), name: c[0], cat: c[1], price: Math.round(c[2] * f / 5) * 5, duration: c[3] }; }); }
  var H_STD = { seg: '09:00-20:00', ter: '09:00-20:00', qua: '09:00-20:00', qui: '09:00-20:00', sex: '09:00-20:00', sab: '08:00-18:00', dom: null };
  var H_LATE = { seg: null, ter: '10:00-21:00', qua: '10:00-21:00', qui: '10:00-21:00', sex: '10:00-22:00', sab: '09:00-19:00', dom: '10:00-14:00' };
  var H_MALL = { seg: '10:00-22:00', ter: '10:00-22:00', qua: '10:00-22:00', qui: '10:00-22:00', sex: '10:00-22:00', sab: '10:00-22:00', dom: '14:00-20:00' };
  var H_EARLY = { seg: '08:00-19:00', ter: '08:00-19:00', qua: '08:00-19:00', qui: '08:00-19:00', sex: '08:00-19:00', sab: '08:00-17:00', dom: null };
  var H_ALL = { seg: '08:00-22:00', ter: '08:00-22:00', qua: '08:00-22:00', qui: '08:00-22:00', sex: '08:00-22:00', sab: '08:00-22:00', dom: '09:00-18:00' };
  var REVIEW_POOL = [
    [5, 'Atendimento pontual e corte exatamente como pedi. Já marquei o próximo.'], [5, 'Toalha quente, navalha afiada e ambiente muito bom. Recomendo.'],
    [4, 'Corte muito bom. Só atrasou uns 10 minutos, mas avisaram pelo WhatsApp.'], [5, 'Melhor degradê da região. O barbeiro é caprichoso.'],
    [5, 'Agendei pelo celular em um minuto e fui atendido na hora marcada.'], [4, 'Preço justo e lugar limpo. Estacionamento facilita muito.'],
    [5, 'Levei meu filho e foram super pacientes com ele.'], [5, 'Barba ficou impecável. Virei cliente fixo.'], [3, 'Corte bom, mas o ambiente estava cheio e barulhento.'],
    [5, 'Café, conversa boa e corte de primeira. Vale cada centavo.']
  ];
  var NAMES = ['Rafael M.', 'Diego S.', 'Lucas A.', 'Bruno C.', 'Thiago R.', 'André L.', 'Felipe P.', 'Gustavo T.', 'Caio N.', 'Rodrigo F.', 'Vinícius O.', 'Marcelo B.'];
  function reviews(seed, n) { var out = []; for (var i = 0; i < n; i++) { var r = REVIEW_POOL[(seed * 3 + i * 7) % REVIEW_POOL.length]; out.push({ name: NAMES[(seed + i * 5) % NAMES.length], stars: r[0], text: r[1], date: isoDate(new Date(Date.now() - (i * 9 + seed) * 864e5)) }); } return out; }
  function team(names) { return names.map(function (n, i) { return { id: 'b' + (i + 1), name: n[0], role: n[1] }; }); }

  /* dx/dy em km a partir do centro do cliente */
  var SEED = [
    { id: 'demo-navalha', name: 'Navalha de Ouro', tagline: 'Barbearia clássica com toalha quente', dx: 0.6, dy: 0.4, district: 'Centro', street: 'Rua das Navalhas, 120', accent: '#ED1B2E', cover: 'capas/c1.webp', gallery: ['capas/c1.webp', 'fotos/u2.webp', 'fotos/ig2.webp', 'fotos/ig10.webp'], hours: H_STD, svc: [['corte', 'barba', 'combo', 'pezinho', 'sobrancelha', 'barbo'], 1.1], barbers: [['Matheus', 'Degradê e navalha'], ['Rafael', 'Barba clássica'], ['Júnior', 'Cortes infantis']], amen: ['Wi-Fi', 'Café', 'Cartão e Pix', 'Ar-condicionado'], rev: 14, since: 2016 },
    { id: 'demo-oldschool', name: 'Old School Barber Club', tagline: 'Rock, cerveja gelada e corte na tesoura', dx: -1.1, dy: 0.9, district: 'Jardins', street: 'Av. dos Barbeiros, 870', accent: '#0077B2', cover: 'capas/c2.webp', gallery: ['capas/c2.webp', 'fotos/u1.webp', 'fotos/ig7.webp', 'fotos/ig1.webp'], hours: H_LATE, svc: [['corte', 'maquina', 'barba', 'combo', 'pigm', 'platinado'], 1.25], barbers: [['Diego', 'Tesoura e pompadour'], ['Bruno', 'Platinado'], ['Leo', 'Barba']], amen: ['Cerveja', 'Videogame', 'Cartão e Pix'], rev: 22, since: 2014 },
    { id: 'demo-bigode', name: 'Bigode Grosso', tagline: 'Barba é coisa séria', dx: 1.8, dy: -0.7, district: 'Vila Nova', street: 'Rua do Bigode, 45', accent: '#ED1B2E', cover: 'capas/c4.webp', gallery: ['capas/c4.webp', 'fotos/barba.webp', 'fotos/ig4.webp', 'fotos/ig3.webp'], hours: H_EARLY, svc: [['barba', 'barbo', 'corte', 'combo', 'pigm'], 0.95], barbers: [['Thiago', 'Barboterapia'], ['Marcos', 'Corte clássico']], amen: ['Estacionamento', 'Café', 'Pix'], rev: 9, since: 2019 },
    { id: 'demo-fade', name: 'Fade Studio 33', tagline: 'Degradê, freestyle e desenho', dx: -0.4, dy: -1.3, district: 'Centro', street: 'Rua 33, 330', accent: '#0077B2', cover: 'capas/c3.webp', gallery: ['capas/c3.webp', 'fotos/ig5.webp', 'fotos/ig6.webp', 'fotos/ig8.webp'], hours: H_ALL, svc: [['maquina', 'corte', 'pezinho', 'sobrancelha', 'combo', 'platinado'], 0.9], barbers: [['Lucas', 'Freestyle'], ['Caio', 'Degradê navalhado'], ['Pedro', 'Desenhos']], amen: ['Wi-Fi', 'Som ao vivo às sextas', 'Cartão e Pix'], rev: 31, since: 2021 },
    { id: 'demo-dom', name: 'Dom Barbeiro', tagline: 'Atendimento só com hora marcada', dx: 2.6, dy: 1.6, district: 'Alto da Glória', street: 'Rua Dom Pedro, 1500', accent: '#ED1B2E', cover: 'capas/c6.webp', gallery: ['capas/c6.webp', 'fotos/marca.webp', 'fotos/ig11.webp', 'fotos/ig12.webp'], hours: H_STD, svc: [['corte', 'barba', 'combo', 'hidra', 'relax', 'sobrancelha'], 1.35], barbers: [['André', 'Visagismo'], ['Felipe', 'Barba'], ['Gustavo', 'Química']], amen: ['Estacionamento', 'Café', 'Bebidas', 'Ar-condicionado'], rev: 18, since: 2012 },
    { id: 'demo-pai', name: 'Barbearia Pai & Filho', tagline: 'Corte de pai, corte de filho', dx: -2.2, dy: -0.5, district: 'Bairro Jardim', street: 'Av. das Famílias, 210', accent: '#0077B2', cover: 'capas/c5.webp', gallery: ['capas/c5.webp', 'fotos/u4.webp', 'fotos/ig9.webp', 'fotos/ig4.webp'], hours: H_EARLY, svc: [['corte', 'infantil', 'dupla', 'barba', 'pezinho'], 0.85], barbers: [['Rodrigo', 'Infantil'], ['Vinícius', 'Corte social']], amen: ['Espaço kids', 'Estacionamento', 'Pix'], rev: 12, since: 2018 },
    { id: 'demo-vintage', name: 'Vintage Barbearia', tagline: 'Cadeiras de 1960 e cortes de agora', dx: 0.2, dy: 2.4, district: 'Centro Histórico', street: 'Rua XV, 88', accent: '#ED1B2E', cover: 'capas/rede.webp', gallery: ['capas/rede.webp', 'fotos/faixa.webp', 'fotos/ig12.webp', 'fotos/ig2.webp'], hours: H_LATE, svc: [['corte', 'barba', 'combo', 'barbo', 'sobrancelha'], 1.15], barbers: [['Marcelo', 'Navalha'], ['Otávio', 'Tesoura']], amen: ['Café', 'Whisky', 'Cartão e Pix'], rev: 16, since: 2010 },
    { id: 'demo-mall', name: 'Corte Fino Shopping', tagline: 'No shopping, sem fila', dx: 3.4, dy: -2.1, district: 'Shopping Central', street: 'Shopping Central, loja 212', accent: '#0077B2', cover: 'fotos/u2.webp', gallery: ['fotos/u2.webp', 'fotos/u3.webp', 'fotos/ig10.webp', 'fotos/ig11.webp'], hours: H_MALL, svc: [['corte', 'maquina', 'barba', 'combo', 'infantil', 'hidra'], 1.2], barbers: [['Eduardo', 'Corte social'], ['Samuel', 'Barba'], ['Jonas', 'Infantil']], amen: ['Estacionamento do shopping', 'Ar-condicionado', 'Cartão e Pix'], rev: 27, since: 2020 },
    { id: 'demo-negra', name: 'Barba Negra', tagline: 'Navalha, toalha quente e silêncio', dx: -3.1, dy: 2.2, district: 'São Cristóvão', street: 'Rua do Porto, 77', accent: '#ED1B2E', cover: 'capas/c8.webp', gallery: ['capas/c8.webp', 'fotos/ig2.webp', 'fotos/ig7.webp', 'fotos/barba.webp'], hours: H_STD, svc: [['barba', 'barbo', 'pigm', 'corte', 'combo'], 1.05], barbers: [['Henrique', 'Barba'], ['Igor', 'Corte']], amen: ['Café', 'Pix'], rev: 8, since: 2022 },
    { id: 'demo-rei', name: 'Rei da Navalha', tagline: 'Preço justo, corte caprichado', dx: 1.2, dy: -3.0, district: 'Industrial', street: 'Rua das Indústrias, 1020', accent: '#0077B2', cover: 'fotos/u1.webp', gallery: ['fotos/u1.webp', 'fotos/ig3.webp', 'fotos/ig5.webp', 'fotos/ig6.webp'], hours: H_EARLY, svc: [['corte', 'maquina', 'barba', 'combo', 'pezinho', 'infantil'], 0.75], barbers: [['Paulo', 'Corte social'], ['Wesley', 'Degradê']], amen: ['Estacionamento', 'Pix'], rev: 20, since: 2017 },
    { id: 'demo-urban', name: 'Urban Cuts', tagline: 'Estilo de rua, técnica de salão', dx: -1.6, dy: 3.3, district: 'Vila Esperança', street: 'Rua Grafite, 12', accent: '#ED1B2E', cover: 'fotos/u3.webp', gallery: ['fotos/u3.webp', 'fotos/ig8.webp', 'fotos/ig1.webp', 'fotos/ig6.webp'], hours: H_LATE, svc: [['maquina', 'corte', 'platinado', 'pigm', 'sobrancelha', 'combo'], 1.0], barbers: [['Kauã', 'Platinado'], ['Davi', 'Freestyle']], amen: ['Wi-Fi', 'Videogame', 'Cartão e Pix'], rev: 11, since: 2023 },
    { id: 'demo-tradicao', name: 'Tradição Barbearia', tagline: 'Três gerações de barbeiros', dx: 4.4, dy: 0.8, district: 'Bela Vista', street: 'Av. Brasil, 2400', accent: '#0077B2', cover: 'fotos/u4.webp', gallery: ['fotos/u4.webp', 'fotos/hero.webp', 'fotos/ig9.webp', 'fotos/ig4.webp'], hours: H_STD, svc: [['corte', 'barba', 'combo', 'infantil', 'sobrancelha', 'hidra'], 0.9], barbers: [['Seu Antônio', 'Corte clássico'], ['Fábio', 'Barba'], ['Renan', 'Degradê']], amen: ['Estacionamento', 'Café', 'Cartão e Pix'], rev: 25, since: 1998 }
  ];
  var DEFAULT_CENTER = { lat: -25.9150, lng: -53.4710, label: 'Ampére · PR', city: 'Ampére' };

  function buildDemo(s, i, center) {
    var lat = center.lat + s.dy / 110.574, lng = center.lng + s.dx / (111.32 * Math.cos(center.lat * Math.PI / 180));
    var rv = reviews(i + 1, Math.min(6, 3 + (s.rev % 4)));
    return {
      id: s.id, slug: slugify(s.name), demo: true, name: s.name, tagline: s.tagline,
      about: s.tagline + '. Na ' + s.name + ' você escolhe o profissional, o horário e já sabe quanto vai pagar antes de sair de casa.',
      logo: monogram(s.name, s.accent), cover: IMG + s.cover, gallery: s.gallery.map(function (g) { return IMG + g; }),
      address: { street: s.street, district: s.district, city: center.city || '', uf: '', cep: '' },
      lat: lat, lng: lng, phone: '(00) 0000-0000', whatsapp: '', instagram: '',
      hours: s.hours, services: svc(s.svc[0], s.svc[1]), barbers: team(s.barbers), amenities: s.amen,
      reviews: rv, reviewsCount: s.rev, since: s.since
    };
  }

  /* ------------------------------------------------------ rating e preços */
  function enrich(shop, center) {
    var rv = shop.reviews || [];
    var extra = LS.get('cb_reviews', {})[shop.id] || [];
    var all = extra.concat(rv);
    shop.reviewsAll = all;
    shop.rating = all.length ? Math.round(all.reduce(function (a, r) { return a + r.stars; }, 0) / all.length * 10) / 10 : 0;
    shop.reviewsCount = Math.max(all.length, shop.demo ? (shop.reviewsCount || 0) : all.length);
    shop.priceFrom = (shop.services || []).reduce(function (m, s) { return Math.min(m, +s.price || 1e9); }, 1e9);
    if (shop.priceFrom === 1e9) shop.priceFrom = 0;
    shop.cats = (shop.services || []).map(function (s) { return s.cat; }).filter(function (c, i, a) { return a.indexOf(c) === i; });
    shop.status = openStatus(shop.hours);
    shop.dist = center ? haversine(center, shop) : null;
    return shop;
  }

  /* ------------------------------------------------------------- modo/API */
  /* mode 'demo': tudo no navegador. mode 'api': api.php responde.
     Com a API, as barbearias de exemplo (ids demo-*) continuam locais enquanto
     o servidor pedir (examples: true), e o painel de demonstração também. */
  var state = { mode: 'demo', examples: true, center: LS.get('cb_loc', null) };
  function isLocalId(id) { return state.mode !== 'api' || /^demo-/.test(String(id || '')); }
  function ownerLocal() { return state.mode !== 'api' || LS.get('cb_session', null) === DEMO_LOGIN.shopId; }

  function api(route, body) {
    var opts = { method: body ? 'POST' : 'GET', headers: { 'X-Requested-With': 'connect' }, credentials: 'same-origin' };
    if (body) { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
    return fetch('api.php?r=' + route.replace('?', '&'), opts).then(function (r) {
      return r.json().catch(function () { throw new Error('Resposta inválida do servidor.'); }).then(function (j) {
        if (!r.ok || j.error) throw new Error(j.error || 'Erro ' + r.status);
        return j;
      });
    });
  }

  function init() {
    if (!/^https?:$/.test(location.protocol)) return Promise.resolve(state.mode);
    return withTimeout(fetch('api.php?r=ping', { cache: 'no-store', headers: { 'X-Requested-With': 'connect' } }).then(function (r) { return r.json(); }), 4000)
      .then(function (j) { if (j && j.ok && j.app === 'connect') { state.mode = 'api'; state.examples = !!j.examples; } return state.mode; })
      .catch(function () { return state.mode; });
  }

  function setCenter(c) { state.center = c; LS.set('cb_loc', c); }
  function getCenter() { return state.center; }

  /* ------------------------------------------------------- dados (demo) */
  function demoCenter() { return state.center || DEFAULT_CENTER; }
  function demoAll() {
    var c = demoCenter();
    var registered = LS.get('cb_shops', []);
    var ids = {}; registered.forEach(function (s) { ids[s.id] = 1; });
    var seeds = SEED.map(function (s, i) { return buildDemo(s, i, c); }).filter(function (s) { return !ids[s.id]; });
    if (state.mode === 'api') {
      if (!state.examples) return [];
      registered = registered.filter(function (s) { return isLocalId(s.id); });
    }
    return registered.map(function (s) { var o = JSON.parse(JSON.stringify(s)); delete o.owner; return o; }).concat(seeds);
  }
  function demoBookings() { return LS.get('cb_bookings', []); }

  /* --------------------------------------------------------- dados (API) */
  function listShops() {
    var c = state.center;
    var p = state.mode === 'api'
      ? api('shops' + (c ? '?lat=' + c.lat + '&lng=' + c.lng : '')).then(function (j) { return j.shops.concat(demoAll()); })
      : Promise.resolve(demoAll());
    return p.then(function (arr) { return arr.map(function (s) { return enrich(s, c); }); });
  }
  function getShop(slug) {
    var local = demoAll().filter(function (x) { return x.slug === slug || x.id === slug; })[0];
    if (state.mode === 'api' && !local) return api('shop?slug=' + encodeURIComponent(slug)).then(function (j) { return enrich(j.shop, state.center); });
    var s = local || demoAll().filter(function (x) { return x.slug === slug || x.id === slug; })[0];
    return s ? Promise.resolve(enrich(s, state.center)) : Promise.reject(new Error('Barbearia não encontrada.'));
  }
  function busy(shopId, dateISO) {
    if (!isLocalId(shopId)) return api('busy?shop=' + encodeURIComponent(shopId) + '&date=' + dateISO).then(function (j) { return j.busy; });
    return Promise.resolve(demoBookings().filter(function (b) { return b.shopId === shopId && b.date === dateISO && b.status !== 'cancelado'; })
      .map(function (b) { return { barberId: b.barberId, time: b.time, duration: b.duration }; }));
  }
  function book(p) {
    if (!isLocalId(p.shopId)) return api('book', p).then(function (j) { remember(j.booking.code); return j.booking; });
    return busy(p.shopId, p.date).then(function (bz) {
      return getShop(p.shopId).then(function (shop) {
        var free = freeSlots(shop, p.date, p.duration, bz, p.barberId).filter(function (s) { return s.time === p.time; })[0];
        if (!free) throw new Error('Esse horário acabou de ser ocupado. Escolha outro.');
        var bid = p.barberId && p.barberId !== 'any' ? p.barberId : free.barbers[0];
        var barber = (shop.barbers || []).filter(function (b) { return b.id === bid; })[0];
        var b = {
          id: uid('bk'), code: code(), shopId: shop.id, shopName: shop.name, shopSlug: shop.slug,
          services: p.services, total: p.total, duration: p.duration, barberId: bid, barberName: barber ? barber.name : '',
          date: p.date, time: p.time, client: { name: p.name, phone: p.phone }, notes: p.notes || '', status: 'confirmado', createdAt: new Date().toISOString()
        };
        var all = demoBookings(); all.push(b); LS.set('cb_bookings', all); remember(b.code);
        return b;
      });
    });
  }
  function remember(c) { var my = LS.get('cb_my', []); if (my.indexOf(c) < 0) my.unshift(c); LS.set('cb_my', my.slice(0, 30)); }
  function myBookings() {
    var codes = LS.get('cb_my', []);
    if (!codes.length) return Promise.resolve([]);
    var local = demoBookings().filter(function (b) { return codes.indexOf(b.code) >= 0; });
    var remote = codes.filter(function (c) { return !local.some(function (b) { return b.code === c; }); });
    var p = state.mode === 'api' && remote.length ? api('my', { codes: remote }).then(function (j) { return j.bookings; }) : Promise.resolve([]);
    return p.then(function (arr) { return local.concat(arr).sort(function (a, b) { return (b.date + b.time).localeCompare(a.date + a.time); }); });
  }
  function isLocalCode(c) { return state.mode !== 'api' || demoBookings().some(function (b) { return b.code === c; }); }
  function cancelMine(c) {
    if (!isLocalCode(c)) return api('cancel', { code: c });
    var all = demoBookings(); all.forEach(function (b) { if (b.code === c) b.status = 'cancelado'; }); LS.set('cb_bookings', all); return Promise.resolve({ ok: true });
  }
  function review(c, stars, text, name) {
    if (!isLocalCode(c)) return api('review', { code: c, stars: stars, text: text });
    var b = demoBookings().filter(function (x) { return x.code === c; })[0];
    if (!b) return Promise.reject(new Error('Agendamento não encontrado.'));
    var all = LS.get('cb_reviews', {}); (all[b.shopId] = all[b.shopId] || []).unshift({ name: name || b.client.name, stars: stars, text: text, date: isoDate(new Date()), verified: true });
    LS.set('cb_reviews', all);
    var bk = demoBookings(); bk.forEach(function (x) { if (x.code === c) x.reviewed = true; }); LS.set('cb_bookings', bk);
    return Promise.resolve({ ok: true });
  }

  /* -------------------------------------------------------- área do dono */
  function sha(s) {
    if (global.crypto && crypto.subtle && global.TextEncoder) {
      return crypto.subtle.digest('SHA-256', new TextEncoder().encode('cb:' + s)).then(function (b) { return Array.prototype.map.call(new Uint8Array(b), function (x) { return ('0' + x.toString(16)).slice(-2); }).join(''); });
    }
    var h = 0; for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return Promise.resolve('x' + h);
  }
  var DEMO_LOGIN = { email: 'demo@connectbarber.com.br', pass: 'connect123', shopId: 'demo-navalha' };

  function register(shop, owner) {
    if (state.mode === 'api') { LS.del('cb_session'); return api('register', { shop: shop, owner: owner }).then(function (j) { return j.shop; }); }
    var list = LS.get('cb_shops', []);
    if (list.some(function (s) { return s.owner && s.owner.email === owner.email.toLowerCase(); })) return Promise.reject(new Error('Já existe uma barbearia com esse e-mail. Entre com ele.'));
    return sha(owner.password).then(function (h) {
      shop.id = shop.id || uid('sh');
      shop.slug = uniqueSlug(shop.slug || slugify(shop.name), shop.id);
      shop.createdAt = new Date().toISOString();
      shop.owner = { name: owner.name, email: owner.email.toLowerCase(), hash: h };
      list.push(shop);
      if (!LS.set('cb_shops', list)) throw new Error('O navegador ficou sem espaço para as fotos. Use imagens menores.');
      LS.set('cb_session', shop.id);
      return strip(shop);
    });
  }
  function uniqueSlug(base, id) { var all = demoAll(), s = base || 'barbearia', n = 2; while (all.some(function (x) { return x.slug === s && x.id !== id; })) s = base + '-' + n++; return s; }
  function strip(s) { var o = JSON.parse(JSON.stringify(s)); delete o.owner; return o; }
  function login(email, pass) {
    email = String(email).trim().toLowerCase();
    if (email === DEMO_LOGIN.email && pass === DEMO_LOGIN.pass) return demoOwnerShop();
    if (state.mode === 'api') return api('login', { email: email, password: pass }).then(function (j) { LS.del('cb_session'); return j.shop; });
    return sha(pass).then(function (h) {
      var s = LS.get('cb_shops', []).filter(function (x) { return x.owner && x.owner.email === email; })[0];
      if (!s || s.owner.hash !== h) throw new Error('E-mail ou senha não conferem.');
      LS.set('cb_session', s.id); return strip(s);
    });
  }
  function demoOwnerShop() {
    var list = LS.get('cb_shops', []);
    var s = list.filter(function (x) { return x.id === DEMO_LOGIN.shopId; })[0];
    if (!s) {
      var base = buildDemo(SEED[0], 0, demoCenter());
      delete base.demo; base.reviewsCount = base.reviews.length;
      base.owner = { name: 'Conta de demonstração', email: DEMO_LOGIN.email, hash: 'demo' };
      base.createdAt = new Date().toISOString();
      list.push(base); LS.set('cb_shops', list); s = base;
    }
    LS.set('cb_session', s.id);
    return Promise.resolve(strip(s));
  }
  function session() {
    if (!ownerLocal()) return api('me').then(function (j) { return j.shop; }).catch(function () { return null; });
    var id = LS.get('cb_session', null);
    var s = id && LS.get('cb_shops', []).filter(function (x) { return x.id === id; })[0];
    return Promise.resolve(s ? strip(s) : null);
  }
  function logout() {
    var wasLocal = ownerLocal(); LS.del('cb_session');
    return state.mode === 'api' && !wasLocal ? api('logout', {}) : Promise.resolve();
  }
  function saveShop(shop) {
    if (!ownerLocal()) return api('save', { shop: shop }).then(function (j) { return j.shop; });
    var list = LS.get('cb_shops', []), id = LS.get('cb_session', null);
    var i = list.findIndex(function (x) { return x.id === id; });
    if (i < 0) return Promise.reject(new Error('Sessão expirada. Entre de novo.'));
    var owner = list[i].owner; shop.id = id; shop.slug = uniqueSlug(shop.slug || slugify(shop.name), id); shop.owner = owner; shop.createdAt = list[i].createdAt;
    list[i] = shop;
    if (!LS.set('cb_shops', list)) return Promise.reject(new Error('O navegador ficou sem espaço para as fotos. Use imagens menores.'));
    return Promise.resolve(strip(shop));
  }
  function ownerBookings() {
    if (!ownerLocal()) return api('owner-bookings').then(function (j) { return j.bookings; });
    var id = LS.get('cb_session', null);
    return Promise.resolve(demoBookings().filter(function (b) { return b.shopId === id; }));
  }
  function setStatus(id, status) {
    if (!ownerLocal()) return api('status', { id: id, status: status });
    var all = demoBookings(); all.forEach(function (b) { if (b.id === id) b.status = status; }); LS.set('cb_bookings', all); return Promise.resolve({ ok: true });
  }

  /* -------------------------------------------- imagem: reduz antes de salvar */
  function shrinkImage(file, maxW, maxH, quality) {
    return new Promise(function (res, rej) {
      if (!/^image\/(jpe?g|png|webp|gif)$/i.test(file.type)) return rej(new Error('Envie uma imagem JPG, PNG ou WebP.'));
      if (file.size > 12 * 1024 * 1024) return rej(new Error('Imagem muito grande (máximo 12 MB).'));
      var fr = new FileReader();
      fr.onload = function () {
        var img = new Image();
        img.onload = function () {
          var r = Math.min(1, maxW / img.width, maxH / img.height), w = Math.round(img.width * r), h = Math.round(img.height * r);
          var cv = document.createElement('canvas'); cv.width = w; cv.height = h;
          cv.getContext('2d').drawImage(img, 0, 0, w, h);
          var out = cv.toDataURL('image/webp', quality || 0.8);
          if (out.indexOf('data:image/webp') !== 0) out = cv.toDataURL('image/jpeg', quality || 0.8);
          res(out);
        };
        img.onerror = function () { rej(new Error('Não foi possível ler essa imagem.')); };
        img.src = fr.result;
      };
      fr.onerror = function () { rej(new Error('Não foi possível ler esse arquivo.')); };
      fr.readAsDataURL(file);
    });
  }

  /* ------------------------------------------------- mapa (Leaflet) helpers */
  var TILES = {
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>'
  };
  function makeMap(el, opts) {
    if (!global.L) { el.classList.add('map-off'); el.setAttribute('data-msg', 'Mapa indisponível sem internet.'); return null; }
    var map = L.map(el, Object.assign({ zoomControl: true, attributionControl: true, scrollWheelZoom: true, minZoom: 3 }, opts || {}));
    var errs = 0, layer = L.tileLayer(TILES.url, { maxZoom: 19, subdomains: 'abc', attribution: TILES.attribution, crossOrigin: true });
    layer.on('tileerror', function () { if (++errs > 3) el.classList.add('map-notiles'); });
    layer.on('tileload', function () { el.classList.remove('map-notiles'); });
    layer.addTo(map);
    map.attributionControl.setPrefix('');
    return map;
  }

  /* Leaflet CSS essencial embutido (folhas externas não são usadas) */
  function injectMapCss() {
    if (document.getElementById('cb-leaflet-css')) return;
    var css = '.leaflet-pane,.leaflet-tile,.leaflet-marker-icon,.leaflet-marker-shadow,.leaflet-tile-container,.leaflet-pane>svg,.leaflet-pane>canvas,.leaflet-zoom-box,.leaflet-image-layer,.leaflet-layer{position:absolute;left:0;top:0}' +
      '.leaflet-container{overflow:hidden;-webkit-tap-highlight-color:transparent;font:12px/1.4 Inter,sans-serif}' +
      '.leaflet-tile,.leaflet-marker-icon,.leaflet-marker-shadow{-webkit-user-select:none;user-select:none;-webkit-user-drag:none}' +
      '.leaflet-marker-icon,.leaflet-marker-shadow{display:block}' +
      '.leaflet-container .leaflet-overlay-pane svg{max-width:none!important;max-height:none!important}' +
      '.leaflet-container .leaflet-marker-pane img,.leaflet-container .leaflet-tile-pane img,.leaflet-container .leaflet-tile{max-width:none!important;max-height:none!important;width:auto;padding:0}' +
      '.leaflet-container.leaflet-touch-zoom{touch-action:pan-x pan-y}.leaflet-container.leaflet-touch-drag{touch-action:none;touch-action:pinch-zoom}.leaflet-container.leaflet-touch-drag.leaflet-touch-zoom{touch-action:none}' +
      '.leaflet-tile{filter:inherit;visibility:hidden}.leaflet-tile-loaded{visibility:inherit}' +
      '.leaflet-zoom-box{width:0;height:0;box-sizing:border-box;z-index:800}' +
      '.leaflet-pane{z-index:400}.leaflet-tile-pane{z-index:200}.leaflet-overlay-pane{z-index:400}.leaflet-shadow-pane{z-index:500}.leaflet-marker-pane{z-index:600}.leaflet-tooltip-pane{z-index:650}.leaflet-popup-pane{z-index:700}' +
      '.leaflet-map-pane canvas{z-index:100}.leaflet-map-pane svg{z-index:200}' +
      '.leaflet-control{position:relative;z-index:800;pointer-events:auto;float:left;clear:both}' +
      '.leaflet-top,.leaflet-bottom{position:absolute;z-index:1000;pointer-events:none}.leaflet-top{top:0}.leaflet-right{right:0}.leaflet-bottom{bottom:0}.leaflet-left{left:0}' +
      '.leaflet-right .leaflet-control{float:right}.leaflet-top .leaflet-control{margin-top:12px}.leaflet-bottom .leaflet-control{margin-bottom:0}.leaflet-left .leaflet-control{margin-left:12px}.leaflet-right .leaflet-control{margin-right:0}' +
      '.leaflet-zoom-animated{transform-origin:0 0}svg.leaflet-zoom-animated{will-change:transform}' +
      '.leaflet-zoom-anim .leaflet-zoom-animated{transition:transform .25s cubic-bezier(0,0,.25,1)}.leaflet-zoom-anim .leaflet-tile,.leaflet-pan-anim .leaflet-tile{transition:none}.leaflet-zoom-anim .leaflet-zoom-hide{visibility:hidden}' +
      '.leaflet-interactive{cursor:pointer}.leaflet-grab{cursor:grab}.leaflet-dragging .leaflet-grab,.leaflet-dragging .leaflet-grab .leaflet-interactive,.leaflet-dragging .leaflet-marker-draggable{cursor:grabbing}' +
      '.leaflet-marker-icon,.leaflet-marker-shadow,.leaflet-image-layer,.leaflet-pane>svg path,.leaflet-tile-container{pointer-events:none}' +
      '.leaflet-marker-icon.leaflet-interactive,.leaflet-pane>svg path.leaflet-interactive{pointer-events:auto}' +
      '.leaflet-bar a{display:block;width:36px;height:36px;line-height:34px;text-align:center;text-decoration:none;font:600 18px/34px Inter,sans-serif;background:#0b0b0b;color:#fff;border:1px solid rgba(255,255,255,.18)}' +
      '.leaflet-bar a+a{border-top:0}.leaflet-bar a:hover{background:#ED1B2E}.leaflet-bar a.leaflet-disabled{opacity:.4;cursor:default}' +
      '.leaflet-control-attribution{background:rgba(11,11,11,.75);color:#9a978f;padding:2px 8px;font-size:10px}.leaflet-control-attribution a{color:#d9d6d1}' +
      '.leaflet-div-icon{background:transparent;border:0}';
    var st = document.createElement('style'); st.id = 'cb-leaflet-css'; st.textContent = css; document.head.appendChild(st);
  }

  global.CB = {
    LS: LS, esc: esc, slugify: slugify, brl: brl, km: km, pad: pad, phoneDigits: phoneDigits, isoDate: isoDate, parseISO: parseISO,
    DAYS: DAYS, WEEK: WEEK, DAY_LABEL: DAY_LABEL, DAY_SHORT: DAY_SHORT, range: range, fmtH: fmtH, toMin: toMin, fromMin: fromMin,
    openStatus: openStatus, freeSlots: freeSlots, hoursText: hoursText, monogram: monogram, haversine: haversine, enrich: enrich,
    cityLookup: cityLookup, geocode: geocode, reverseGeocode: reverseGeocode, myPosition: myPosition, viaCep: viaCep,
    init: init, mode: function () { return state.mode; }, examples: function () { return state.mode !== 'api' || state.examples; }, ownerLocal: ownerLocal, setCenter: setCenter, getCenter: getCenter, DEFAULT_CENTER: DEFAULT_CENTER,
    listShops: listShops, getShop: getShop, busy: busy, book: book, myBookings: myBookings, cancelMine: cancelMine, review: review,
    register: register, login: login, demoLogin: DEMO_LOGIN, demoOwnerShop: demoOwnerShop, session: session, logout: logout, saveShop: saveShop,
    ownerBookings: ownerBookings, setStatus: setStatus, shrinkImage: shrinkImage, makeMap: makeMap, injectMapCss: injectMapCss, CATEGORIES: ['Corte', 'Barba', 'Combo', 'Infantil', 'Sobrancelha', 'Tratamentos', 'Química']
  };
})(window);
