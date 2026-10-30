<?php
/* ==========================================================================
   CONNECT BARBER · API (padrão Criazzo: PHP puro + JSON em arquivo)
   --------------------------------------------------------------------------
   Sem banco de dados, sem Composer. Roda em hospedagem compartilhada
   (Hostinger, HostGator) com PHP 7.4 ou superior.
   Dados:   data/shops.json, data/bookings.json  (pasta bloqueada por .htaccess)
   Imagens: uploads/<id-da-barbearia>/...
   Rotas:   api.php?r=<rota>  (veja o switch no fim do arquivo)
   ========================================================================== */
declare(strict_types=1);
date_default_timezone_set('America/Sao_Paulo');

const DATA_DIR   = __DIR__ . '/data';
const UPLOAD_DIR = __DIR__ . '/uploads';
const UPLOAD_URL = 'uploads';
const CATEGORIES = ['Corte', 'Barba', 'Combo', 'Infantil', 'Sobrancelha', 'Tratamentos', 'Química'];
const STATUSES   = ['confirmado', 'concluido', 'cancelado', 'faltou'];
const MAX_IMAGE  = 3 * 1024 * 1024;
/* Barbearias de exemplo aparecem no mapa enquanto houver menos barbearias
   reais que este número. Use 0 para nunca mostrar exemplos. */
const EXEMPLOS_ATE = 5;

session_name('cbsess');
session_set_cookie_params(['lifetime' => 60 * 60 * 24 * 30, 'path' => '/', 'httponly' => true, 'samesite' => 'Lax', 'secure' => !empty($_SERVER['HTTPS'])]);
session_start();

header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');
header('Cache-Control: no-store');

function out(array $data, int $code = 200): void { http_response_code($code); echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES); exit; }
function fail(string $msg, int $code = 400): void { out(['error' => $msg], $code); }

/* só aceita chamadas do próprio site */
if (($_SERVER['HTTP_X_REQUESTED_WITH'] ?? '') !== 'connect') fail('Requisição inválida.', 403);

foreach ([DATA_DIR, UPLOAD_DIR] as $dir) if (!is_dir($dir)) @mkdir($dir, 0775, true);
$deny = "<IfModule mod_authz_core.c>\n  Require all denied\n</IfModule>\n<IfModule !mod_authz_core.c>\n  Deny from all\n</IfModule>\n";
if (!is_file(DATA_DIR . '/.htaccess')) @file_put_contents(DATA_DIR . '/.htaccess', $deny);
if (!is_file(DATA_DIR . '/index.html')) @file_put_contents(DATA_DIR . '/index.html', '');
if (!is_file(UPLOAD_DIR . '/.htaccess')) @file_put_contents(UPLOAD_DIR . '/.htaccess', "Options -Indexes\n<FilesMatch \"\\.(php|phtml|phar|pl|py|cgi|sh|htaccess)$\">\n  " . str_replace("\n", "\n  ", trim($deny)) . "\n</FilesMatch>\n");

/* ---------------------------------------------------------- arquivo JSON */
function store_path(string $name): string { return DATA_DIR . '/' . $name . '.json'; }
function load(string $name): array {
  $p = store_path($name);
  if (!is_file($p)) return [];
  $fh = fopen($p, 'r'); flock($fh, LOCK_SH);
  $raw = stream_get_contents($fh);
  flock($fh, LOCK_UN); fclose($fh);
  $d = json_decode($raw ?: '[]', true);
  return is_array($d) ? $d : [];
}
/* lê, altera e grava com trava exclusiva (sem perder gravações simultâneas) */
function update(string $name, callable $fn) {
  $fh = fopen(store_path($name), 'c+');
  if (!$fh) fail('Não foi possível gravar os dados.', 500);
  flock($fh, LOCK_EX);
  $d = json_decode(stream_get_contents($fh) ?: '[]', true);
  if (!is_array($d)) $d = [];
  try { $result = $fn($d); }
  catch (Throwable $e) { flock($fh, LOCK_UN); fclose($fh); throw $e; }
  ftruncate($fh, 0); rewind($fh);
  fwrite($fh, json_encode($d, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT));
  fflush($fh); flock($fh, LOCK_UN); fclose($fh);
  return $result;
}
class ApiError extends Exception {}

/* -------------------------------------------------------------- utilitários */
function body(): array { $j = json_decode(file_get_contents('php://input') ?: '[]', true); return is_array($j) ? $j : []; }
function str($v, int $max = 200): string { return mb_substr(trim(strip_tags((string)($v ?? ''))), 0, $max); }
function slugify(string $s): string {
  $t = function_exists('iconv') ? (@iconv('UTF-8', 'ASCII//TRANSLIT//IGNORE', $s) ?: $s) : $s;
  $t = strtolower(preg_replace('/[^a-zA-Z0-9]+/', '-', $t));
  return trim(substr($t, 0, 48), '-') ?: 'barbearia';
}
function uid(string $p = ''): string { return $p . bin2hex(random_bytes(6)); }
function code(): string { $a = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; $s = 'CB-'; for ($i = 0; $i < 5; $i++) $s .= $a[random_int(0, strlen($a) - 1)]; return $s; }
function tomin(string $t): int { [$h, $m] = array_map('intval', explode(':', $t) + [0, 0]); return $h * 60 + $m; }
function haversine(float $a1, float $o1, float $a2, float $o2): float {
  $dA = deg2rad($a2 - $a1); $dO = deg2rad($o2 - $o1);
  $s = sin($dA / 2) ** 2 + cos(deg2rad($a1)) * cos(deg2rad($a2)) * sin($dO / 2) ** 2;
  return 6371 * 2 * atan2(sqrt($s), sqrt(1 - $s));
}
function public_shop(array $s): array { unset($s['owner']); return $s; }
function find_shop(array $shops, string $key): ?array { foreach ($shops as $s) if ($s['id'] === $key || $s['slug'] === $key) return $s; return null; }
function public_booking(array $b): array { return array_intersect_key($b, array_flip(['id', 'code', 'shopId', 'shopName', 'shopSlug', 'services', 'total', 'duration', 'barberId', 'barberName', 'date', 'time', 'status', 'reviewed', 'createdAt'])); }
function owner_id(): string { $id = $_SESSION['shop'] ?? ''; if (!$id) fail('Entre no painel para continuar.', 401); return $id; }

/* horários livres em blocos de 30 min (mesma regra do app) */
function free_slots(array $shop, string $date, int $dur, array $busy, string $barberId): array {
  $days = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sab'];
  $k = $days[(int)date('w', strtotime($date . ' 12:00:00'))];
  $r = $shop['hours'][$k] ?? null;
  if (!$r) return [];
  [$o, $c] = explode('-', $r);
  $start = tomin($o); $end = tomin($c);
  $limit = $date === date('Y-m-d') ? ((int)date('H') * 60 + (int)date('i') + 20) : -1;
  $barbers = array_column($shop['barbers'] ?: [['id' => 'b0']], 'id');
  $pool = ($barberId && $barberId !== 'any') ? [$barberId] : $barbers;
  $outList = [];
  for ($t = $start; $t + $dur <= $end; $t += 30) {
    if ($t <= $limit) continue;
    $free = [];
    foreach ($pool as $bid) {
      $ok = true;
      foreach ($busy as $b) {
        if (($b['barberId'] ?? '') !== $bid) continue;
        $bs = tomin($b['time']); $be = $bs + (int)($b['duration'] ?? 30);
        if ($t < $be && $bs < $t + $dur) { $ok = false; break; }
      }
      if ($ok) $free[] = $bid;
    }
    if ($free) $outList[] = ['time' => sprintf('%02d:%02d', intdiv($t, 60), $t % 60), 'barbers' => $free];
  }
  return $outList;
}

/* ------------------------------------------------------------------ imagens */
function save_image($val, string $shopId, string $tag): string {
  if (!is_string($val) || $val === '') return '';
  if (strpos($val, 'data:image/svg+xml;charset=utf-8,%3Csvg') === 0 && strlen($val) < 4000) {                   // monograma gerado no app
    return preg_match('/<script|<foreign|\bon[a-z]+\s*=|href|url\(/i', rawurldecode($val)) ? '' : $val;
  }
  if (preg_match('#^(uploads/[a-z0-9]+/[\w\-]+\.(webp|jpg|png)|assets/img/[\w\-/]+\.(webp|png|jpg))$#', $val)) return $val; // já salva
  if (!preg_match('#^data:image/(webp|jpeg|png);base64,([A-Za-z0-9+/=]+)$#', $val, $m)) return '';
  $bin = base64_decode($m[2], true);
  if ($bin === false || strlen($bin) > MAX_IMAGE) throw new ApiError('Imagem muito grande (máximo 3 MB).');
  $info = @getimagesizefromstring($bin);
  $types = ['image/webp' => 'webp', 'image/jpeg' => 'jpg', 'image/png' => 'png'];
  if (!$info || !isset($types[$info['mime']])) throw new ApiError('Formato de imagem não aceito. Use JPG, PNG ou WebP.');
  $dir = UPLOAD_DIR . '/' . $shopId;
  if (!is_dir($dir)) mkdir($dir, 0775, true);
  $file = $tag . '-' . bin2hex(random_bytes(4)) . '.' . $types[$info['mime']];
  file_put_contents($dir . '/' . $file, $bin);
  return UPLOAD_URL . '/' . $shopId . '/' . $file;
}

/* ------------------------------------------------- validação da barbearia */
function clean_shop(array $in, string $id, ?array $prev, array $all): array {
  $name = str($in['name'] ?? '', 60);
  if (mb_strlen($name) < 2) throw new ApiError('Digite o nome da barbearia.');
  $a = is_array($in['address'] ?? null) ? $in['address'] : [];
  $addr = ['cep' => str($a['cep'] ?? '', 9), 'street' => str($a['street'] ?? '', 120), 'district' => str($a['district'] ?? '', 60), 'city' => str($a['city'] ?? '', 60), 'uf' => strtoupper(str($a['uf'] ?? '', 2))];
  if (!$addr['street'] || !$addr['city']) throw new ApiError('Preencha rua e cidade.');
  $lat = (float)($in['lat'] ?? 0); $lng = (float)($in['lng'] ?? 0);
  if ($lat < -90 || $lat > 90 || $lng < -180 || $lng > 180 || ($lat == 0 && $lng == 0)) throw new ApiError('Posicione a barbearia no mapa.');

  $services = [];
  foreach (array_slice(is_array($in['services'] ?? null) ? $in['services'] : [], 0, 40) as $i => $s) {
    $n = str($s['name'] ?? '', 60); if (!$n) continue;
    $services[] = ['id' => preg_replace('/[^\w\-]/', '', (string)($s['id'] ?? '')) ?: 's' . ($i + 1), 'name' => $n,
      'cat' => in_array($s['cat'] ?? '', CATEGORIES, true) ? $s['cat'] : 'Corte',
      'duration' => max(10, min(300, (int)($s['duration'] ?? 30))), 'price' => round(max(0, min(9999, (float)($s['price'] ?? 0))), 2)];
  }
  if (!$services) throw new ApiError('Cadastre pelo menos um serviço.');

  $hours = [];
  foreach (['seg', 'ter', 'qua', 'qui', 'sex', 'sab', 'dom'] as $d) {
    $v = $in['hours'][$d] ?? null;
    $hours[$d] = (is_string($v) && preg_match('/^([01]\d|2[0-3]):[0-5]\d-([01]\d|2[0-3]):[0-5]\d$/', $v) && tomin(explode('-', $v)[1]) > tomin(explode('-', $v)[0])) ? $v : null;
  }
  if (!array_filter($hours)) throw new ApiError('Abra pelo menos um dia da semana.');

  $barbers = [];
  foreach (array_slice(is_array($in['barbers'] ?? null) ? $in['barbers'] : [], 0, 20) as $i => $b) {
    $n = str($b['name'] ?? '', 40); if (!$n) continue;
    $barbers[] = ['id' => preg_replace('/[^\w\-]/', '', (string)($b['id'] ?? '')) ?: 'b' . ($i + 1), 'name' => $n, 'role' => str($b['role'] ?? '', 40)];
  }
  if (!$barbers) throw new ApiError('Adicione pelo menos um profissional.');

  $slug = slugify(str($in['slug'] ?? '', 60) ?: $name); $base = $slug; $n = 2;
  while (array_filter($all, function ($s) use ($slug, $id) { return $s['slug'] === $slug && $s['id'] !== $id; })) $slug = $base . '-' . $n++;

  $gallery = [];
  foreach (array_slice(is_array($in['gallery'] ?? null) ? $in['gallery'] : [], 0, 6) as $i => $g) { $u = save_image($g, $id, 'foto' . $i); if ($u) $gallery[] = $u; }
  $cover = save_image($in['cover'] ?? '', $id, 'capa') ?: ($gallery[0] ?? 'assets/img/capas/c5.webp');

  return [
    'id' => $id, 'slug' => $slug, 'name' => $name, 'tagline' => str($in['tagline'] ?? '', 80), 'about' => str($in['about'] ?? '', 600),
    'since' => preg_match('/^\d{4}$/', (string)($in['since'] ?? '')) ? (string)$in['since'] : '',
    'phone' => str($in['phone'] ?? '', 20), 'whatsapp' => str($in['whatsapp'] ?? '', 20), 'instagram' => preg_replace('/[^\w\.]/', '', str($in['instagram'] ?? '', 40)),
    'address' => $addr, 'lat' => $lat, 'lng' => $lng,
    'logo' => save_image($in['logo'] ?? '', $id, 'logo'), 'cover' => $cover, 'gallery' => $gallery ?: [$cover],
    'services' => $services, 'hours' => $hours, 'barbers' => $barbers,
    'amenities' => array_values(array_filter(array_map(function ($x) { return str($x, 30); }, array_slice(is_array($in['amenities'] ?? null) ? $in['amenities'] : [], 0, 12)))),
    'reviews' => $prev['reviews'] ?? [], 'createdAt' => $prev['createdAt'] ?? date('c'), 'updatedAt' => date('c'),
    'owner' => $prev['owner'] ?? null
  ];
}

/* ===================================================================== rotas */
$route = $_GET['r'] ?? '';
$isPost = $_SERVER['REQUEST_METHOD'] === 'POST';
$postOnly = ['book', 'my', 'cancel', 'review', 'register', 'login', 'logout', 'save', 'status'];
if (in_array($route, $postOnly, true) && !$isPost) fail('Use POST.', 405);

try {
  switch ($route) {

    case 'ping':
      out(['ok' => true, 'app' => 'connect', 'version' => 1, 'examples' => count(load('shops')) < EXEMPLOS_ATE]);

    /* lista pública; com lat/lng devolve só o que está a até 100 km */
    case 'shops':
      $lat = isset($_GET['lat']) ? (float)$_GET['lat'] : null; $lng = isset($_GET['lng']) ? (float)$_GET['lng'] : null;
      $list = [];
      foreach (load('shops') as $s) {
        if ($lat !== null && $lng !== null && haversine($lat, $lng, (float)$s['lat'], (float)$s['lng']) > 100) continue;
        $list[] = public_shop($s);
      }
      out(['shops' => $list]);

    case 'shop':
      $s = find_shop(load('shops'), str($_GET['slug'] ?? '', 80));
      if (!$s) fail('Barbearia não encontrada.', 404);
      out(['shop' => public_shop($s)]);

    case 'busy':
      $shopId = str($_GET['shop'] ?? '', 40); $date = (string)($_GET['date'] ?? '');
      if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $date)) fail('Data inválida.');
      $busy = [];
      foreach (load('bookings') as $b) if ($b['shopId'] === $shopId && $b['date'] === $date && $b['status'] !== 'cancelado') $busy[] = ['barberId' => $b['barberId'], 'time' => $b['time'], 'duration' => $b['duration']];
      out(['busy' => $busy]);

    /* agendamento: preço, duração e conflito são recalculados aqui */
    case 'book':
      $in = body();
      $shop = find_shop(load('shops'), str($in['shopId'] ?? '', 40));
      if (!$shop) fail('Barbearia não encontrada.', 404);
      $ids = array_map(function ($s) { return (string)($s['id'] ?? ''); }, is_array($in['services'] ?? null) ? $in['services'] : []);
      $chosen = array_values(array_filter($shop['services'], function ($s) use ($ids) { return in_array($s['id'], $ids, true); }));
      if (!$chosen) fail('Escolha pelo menos um serviço.');
      $total = array_sum(array_column($chosen, 'price')); $dur = array_sum(array_column($chosen, 'duration'));
      $date = (string)($in['date'] ?? ''); $time = (string)($in['time'] ?? '');
      if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $date) || !preg_match('/^\d{2}:\d{2}$/', $time)) fail('Data ou horário inválido.');
      if ($date < date('Y-m-d') || $date > date('Y-m-d', strtotime('+60 days'))) fail('Escolha uma data nos próximos 60 dias.');
      $name = str($in['name'] ?? '', 60); $phone = str($in['phone'] ?? '', 20);
      if (mb_strlen($name) < 2 || strlen(preg_replace('/\D/', '', $phone)) < 10) fail('Informe nome e WhatsApp com DDD.');
      $barberId = str($in['barberId'] ?? 'any', 40);
      $booking = update('bookings', function (array &$all) use ($shop, $chosen, $total, $dur, $date, $time, $name, $phone, $barberId, $in) {
        $busy = array_values(array_filter($all, function ($b) use ($shop, $date) { return $b['shopId'] === $shop['id'] && $b['date'] === $date && $b['status'] !== 'cancelado'; }));
        $slot = null;
        foreach (free_slots($shop, $date, (int)$dur, $busy, $barberId) as $s) if ($s['time'] === $time) { $slot = $s; break; }
        if (!$slot) throw new ApiError('Esse horário acabou de ser ocupado. Escolha outro.');
        $bid = $slot['barbers'][0];
        $barber = array_values(array_filter($shop['barbers'], function ($b) use ($bid) { return $b['id'] === $bid; }))[0] ?? null;
        $b = ['id' => uid('bk'), 'code' => code(), 'shopId' => $shop['id'], 'shopName' => $shop['name'], 'shopSlug' => $shop['slug'],
          'services' => array_map(function ($s) { return ['id' => $s['id'], 'name' => $s['name'], 'price' => $s['price'], 'duration' => $s['duration']]; }, $chosen),
          'total' => $total, 'duration' => $dur, 'barberId' => $bid, 'barberName' => $barber['name'] ?? '', 'date' => $date, 'time' => $time,
          'client' => ['name' => $name, 'phone' => $phone], 'notes' => str($in['notes'] ?? '', 280), 'status' => 'confirmado', 'reviewed' => false, 'createdAt' => date('c')];
        $all[] = $b;
        return $b;
      });
      out(['booking' => public_booking($booking)]);

    case 'my':
      $codes = array_slice(array_map('strval', is_array(body()['codes'] ?? null) ? body()['codes'] : []), 0, 30);
      $list = array_values(array_map('public_booking', array_filter(load('bookings'), function ($b) use ($codes) { return in_array($b['code'], $codes, true); })));
      usort($list, function ($a, $b) { return strcmp($b['date'] . $b['time'], $a['date'] . $a['time']); });
      out(['bookings' => $list]);

    case 'cancel':
      $c = str(body()['code'] ?? '', 12);
      update('bookings', function (array &$all) use ($c) {
        foreach ($all as &$b) if ($b['code'] === $c) {
          if ($b['status'] !== 'confirmado') throw new ApiError('Este agendamento não pode mais ser cancelado.');
          $b['status'] = 'cancelado'; $b['cancelledBy'] = 'cliente'; return true;
        }
        throw new ApiError('Agendamento não encontrado.');
      });
      out(['ok' => true]);

    /* só avalia quem tem o código de um atendimento que já aconteceu */
    case 'review':
      $in = body(); $c = str($in['code'] ?? '', 12); $stars = (int)($in['stars'] ?? 0);
      if ($stars < 1 || $stars > 5) fail('Escolha de 1 a 5 estrelas.');
      $bk = update('bookings', function (array &$all) use ($c) {
        foreach ($all as &$b) if ($b['code'] === $c) {
          if ($b['status'] === 'cancelado') throw new ApiError('Agendamento cancelado não pode ser avaliado.');
          if (!empty($b['reviewed'])) throw new ApiError('Este atendimento já foi avaliado.');
          if ($b['date'] > date('Y-m-d') || ($b['date'] === date('Y-m-d') && tomin($b['time']) > (int)date('H') * 60 + (int)date('i'))) throw new ApiError('Avalie depois do atendimento.');
          $b['reviewed'] = true; return $b;
        }
        throw new ApiError('Agendamento não encontrado.');
      });
      $parts = preg_split('/\s+/', trim($bk['client']['name'])); $who = $parts[0] . (isset($parts[1]) ? ' ' . mb_substr($parts[1], 0, 1) . '.' : '');
      update('shops', function (array &$all) use ($bk, $stars, $in, $who) {
        foreach ($all as &$s) if ($s['id'] === $bk['shopId']) { array_unshift($s['reviews'], ['name' => $who, 'stars' => $stars, 'text' => str($in['text'] ?? '', 400), 'date' => date('Y-m-d'), 'verified' => true]); $s['reviews'] = array_slice($s['reviews'], 0, 300); }
      });
      out(['ok' => true]);

    case 'register':
      $in = body(); $o = is_array($in['owner'] ?? null) ? $in['owner'] : [];
      $email = strtolower(str($o['email'] ?? '', 120)); $pass = (string)($o['password'] ?? '');
      if (!filter_var($email, FILTER_VALIDATE_EMAIL)) fail('Digite um e-mail válido.');
      if (strlen($pass) < 6) fail('A senha precisa de 6 caracteres ou mais.');
      $shop = update('shops', function (array &$all) use ($in, $o, $email, $pass) {
        foreach ($all as $s) if (($s['owner']['email'] ?? '') === $email) throw new ApiError('Já existe uma barbearia com esse e-mail. Entre com ele.');
        $id = uid('sh');
        $s = clean_shop(is_array($in['shop'] ?? null) ? $in['shop'] : [], $id, null, $all);
        $s['owner'] = ['name' => str($o['name'] ?? '', 60), 'email' => $email, 'hash' => password_hash($pass, PASSWORD_DEFAULT)];
        $all[] = $s;
        return $s;
      });
      session_regenerate_id(true); $_SESSION['shop'] = $shop['id'];
      out(['shop' => public_shop($shop)]);

    case 'login':
      $in = body(); $email = strtolower(str($in['email'] ?? '', 120));
      $tries = array_filter($_SESSION['tries'] ?? [], function ($t) { return $t > time() - 600; });
      if (count($tries) >= 6) fail('Muitas tentativas. Espere alguns minutos.', 429);
      foreach (load('shops') as $s) {
        if (($s['owner']['email'] ?? '') === $email && password_verify((string)($in['password'] ?? ''), $s['owner']['hash'] ?? '')) {
          session_regenerate_id(true); $_SESSION['shop'] = $s['id']; $_SESSION['tries'] = [];
          out(['shop' => public_shop($s)]);
        }
      }
      $tries[] = time(); $_SESSION['tries'] = $tries;
      fail('E-mail ou senha não conferem.', 401);

    case 'logout':
      $_SESSION = []; session_destroy();
      out(['ok' => true]);

    case 'me':
      if (empty($_SESSION['shop'])) out(['shop' => null]);
      $s = find_shop(load('shops'), owner_id());
      if (!$s) fail('Barbearia não encontrada.', 404);
      out(['shop' => public_shop($s)]);

    case 'save':
      $id = owner_id(); $in = body();
      $shop = update('shops', function (array &$all) use ($id, $in) {
        foreach ($all as &$s) if ($s['id'] === $id) { $s = clean_shop(is_array($in['shop'] ?? null) ? $in['shop'] : [], $id, $s, $all); return $s; }
        throw new ApiError('Barbearia não encontrada.');
      });
      out(['shop' => public_shop($shop)]);

    case 'owner-bookings':
      $id = owner_id();
      out(['bookings' => array_values(array_filter(load('bookings'), function ($b) use ($id) { return $b['shopId'] === $id; }))]);

    case 'status':
      $id = owner_id(); $in = body(); $bid = str($in['id'] ?? '', 40); $st = (string)($in['status'] ?? '');
      if (!in_array($st, STATUSES, true)) fail('Situação inválida.');
      update('bookings', function (array &$all) use ($id, $bid, $st) {
        foreach ($all as &$b) if ($b['id'] === $bid && $b['shopId'] === $id) { $b['status'] = $st; return true; }
        throw new ApiError('Agendamento não encontrado.');
      });
      out(['ok' => true]);

    default:
      fail('Rota desconhecida.', 404);
  }
} catch (ApiError $e) {
  fail($e->getMessage());
} catch (Throwable $e) {
  error_log('[connect] ' . $e->getMessage());
  fail('Erro interno. Tente de novo.', 500);
}
