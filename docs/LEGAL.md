# Terms of Use (summary)

By using tidal-dl-ru you confirm that:

1. You hold a valid subscription to any streaming service you download from.
2. You use downloads for personal backup only, not redistribution.
3. You accept that account bans or legal action by rights holders are your responsibility.

See [DISCLAIMER.md](../DISCLAIMER.md) for the full disclaimer.

## Privacy

- We store account credentials (hashed passwords), download quotas, and library metadata in the user database.
- JWT session tokens expire after 7 days.
- Media URLs use short-lived signed tokens (`mt=`), not long-lived JWTs in query strings.
- Payment data is processed by YooKassa; we do not store card numbers.

## Data retention

- Job files and signed download links expire per `TIDALDLRU_FILE_TTL` / `TIDALDLRU_JOB_TTL` (default 24h).
- Backups: see [ops/RUNBOOK.md](../ops/RUNBOOK.md).

For a public launch, replace this stub with lawyer-reviewed ToS and Privacy Policy in your jurisdiction.
