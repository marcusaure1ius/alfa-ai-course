# Домен и DNS для n8n

Проверено: 2026-07-14. Guide не зависит от конкретного регистратора: редактируйте записи у текущего authoritative DNS provider. Для панелей доступны официальные инструкции [Timeweb](https://timeweb.cloud/docs/domains/dns-records-management-other-registrars) и [Yandex Cloud DNS](https://yandex.cloud/ru/docs/dns/operations/resource-record-create).

## Результат

Поддомен вида `n8n.example.com` имеет одну корректную A-record на публичный IPv4 VPS. SSH по IP уже работает, а cloud firewall разрешает TCP 80/443. После propagation installer сможет получить TLS certificate через Caddy.

## 1. Определите, где менять DNS

На своём компьютере:

```bash
export BASE_DOMAIN="example.com"
export N8N_HOST="n8n.example.com"
export VPS_IP="203.0.113.10"
dig +short NS "$BASE_DOMAIN"
```

NS output указывает authoritative provider. Меняйте запись именно там. Не меняйте NS всего домена только ради одной A-record, если текущая панель уже позволяет ею управлять: ошибочная делегация может затронуть сайт и почту.

## 2. Создайте запись

| Поле | Значение |
|---|---|
| Name/Host | `n8n` или полный `n8n.example.com` — по правилам панели |
| Type | `A` |
| Value/Data | публичный IPv4 VPS |
| TTL | `300` на время настройки; позже можно увеличить |

У точного имени не должно одновременно быть конфликтующего `CNAME`, второго старого `A` или `AAAA`, ведущего не на этот VPS. Не создавайте wildcard и не публикуйте private RFC1918 address.

Если используете Yandex Cloud DNS: выберите публичную zone → «Создать запись» → `A` → TTL → IPv4. Если Timeweb управляет NS домена, откройте DNS records в его панели. Если NS принадлежат другому регистратору, запись создаётся там, а не в панели VPS.

## 3. Проверьте authoritative и обычный resolver

```bash
export AUTH_NS="$(dig +short NS "$BASE_DOMAIN" | head -n 1)"
test -n "$AUTH_NS"
dig +short "@$AUTH_NS" A "$N8N_HOST"
dig +short A "$N8N_HOST"
dig +short AAAA "$N8N_HOST"
```

Ожидаемый результат: authoritative и обычный A lookup возвращают только `$VPS_IP`; AAAA пуст, если вы не настраивали и не проверяли IPv6 end-to-end. Authoritative ответ верный, а обычный ещё старый — это propagation/cache, не причина повторно менять запись.

На VPS выполните проверку тем же resolver, который использует installer:

```bash
export N8N_HOST="n8n.example.com"
export VPS_IP="203.0.113.10"
resolved_ip="$(getent ahostsv4 "$N8N_HOST" | awk 'NR == 1 {print $1}')"
printf 'DNS=%s EXPECTED=%s\n' "$resolved_ip" "$VPS_IP"
test "$resolved_ip" = "$VPS_IP"
```

Ожидается `DNS=<VPS_IP> EXPECTED=<VPS_IP>` и exit code `0`.

## 4. Безопасно проверьте SSH и HTTPS

DNS не нужен для rescue-доступа: сначала убедитесь, что новая SSH-сессия по IP открывается. Не закрывайте существующую сессию до этой проверки.

После установки:

```bash
./scripts/doctor.sh
```

Doctor должен отдельно показать `OK` для `external.dns`, `external.https` и `external.certificate`. Проверка `curl -k`, отключение TLS verification или запись в local hosts file не считаются успехом.

## Диагностика без опасных действий

| Симптом | Проверка | Безопасное действие |
|---|---|---|
| `NXDOMAIN` | `dig +short NS "$BASE_DOMAIN"` | создать запись у authoritative provider |
| Authoritative верный, recursive старый | сравнить два `dig` выше | ждать не меньше TTL; не создавать дубли |
| Несколько A | проверить exact host | удалить только устаревшую запись после сверки IP |
| Есть неверный AAAA | `dig +short AAAA "$N8N_HOST"` | удалить/исправить AAAA, если IPv6 не настроен |
| SSH работает, HTTPS timeout | cloud firewall TCP 80/443, `sudo ss -ltnp` | исправить allow-rules; не открывать 5678/5432 |
| Certificate не выпускается | Caddy logs, A/AAAA, TCP 80/443 | исправить DNS/ports и повторить doctor; не отключать TLS |
| IP VPS изменился | сравнить dashboard и A-record | закрепить static/floating IP, затем обновить A |

DNS propagation не имеет гарантированного времени сверх поведения TTL и caches. Эта задача проверила команды и официальные provider paths, но не заявляет фактический public DNS или certificate без внешнего evidence.
