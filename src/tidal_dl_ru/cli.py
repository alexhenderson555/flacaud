from __future__ import annotations

import re
import time
import webbrowser
from pathlib import Path
from typing import Optional

import httpx
import typer
from rich.console import Console
from rich.progress import (
    BarColumn,
    DownloadColumn,
    Progress,
    SpinnerColumn,
    TextColumn,
    TimeRemainingColumn,
    TransferSpeedColumn,
)
from rich.table import Table

from tidal_dl_ru.config import DEFAULT_DOWNLOAD_DIR, ensure_dirs
from tidal_dl_ru.core.dj import analyze_and_tag
from tidal_dl_ru.core.lyrics import fetch_synced_lrc, write_sidecar
from tidal_dl_ru.core.models import Quality, Track
from tidal_dl_ru.core.router import all_providers, find_provider, get_provider_by_name
from tidal_dl_ru.providers.base import ProviderError
from tidal_dl_ru.providers.tidal import pool as tidal_pool
from tidal_dl_ru.providers.tidal.auth import (
    AuthError,
    PendingAuthorization,
    extract_code_from_url,
    pkce_exchange_code,
    pkce_login_url,
    poll_token,
    request_device_code,
    save_tokens,
)
from tidal_dl_ru.providers.tidal.models import TokenSet
from tidal_dl_ru.tagging import tag_file

app = typer.Typer(add_completion=False, no_args_is_help=True, help="Multi-source music downloader")
console = Console()

_INVALID_FN = re.compile(r'[<>:"/\\|?*\x00-\x1f]')


def _safe_name(s: str, max_len: int = 120) -> str:
    out = _INVALID_FN.sub("_", s).strip().rstrip(". ")
    return out[:max_len] or "_"


def _track_filename(track: Track) -> str:
    # Use " - " instead of ". " after track number to avoid Path treating
    # everything after the dot as a suffix (breaks .with_suffix()).
    return _safe_name(f"{track.track_number:02d} - {track.primary_artist} - {track.title}")


def _album_dir(track: Track) -> str:
    if not track.album:
        return _safe_name(f"_Singles ({track.provider})")
    artist = track.album_artist or track.primary_artist
    base = f"{artist} - {track.album}"
    if track.year:
        base = f"{base} ({track.year})"
    return _safe_name(base)


@app.command()
def providers() -> None:
    """List configured providers."""
    table = Table(title="Providers", header_style="bold cyan")
    table.add_column("Name")
    table.add_column("Display")
    table.add_column("Class")
    for p in all_providers():
        table.add_row(p.name, p.display_name, type(p).__name__)
    console.print(table)


def _run_tidal_device_flow() -> Optional[TokenSet]:
    """Run the full Tidal device flow with rich UI. None on timeout/error."""
    ensure_dirs()
    with httpx.Client(timeout=30.0) as http:
        device = request_device_code(http)
        url = (
            device.verification_uri_complete
            if device.verification_uri_complete.startswith("http")
            else f"https://{device.verification_uri_complete}"
        )
        console.print(
            f"\n[bold]Open in browser:[/bold] [link]{url}[/link]"
            f"\n[dim]or visit {device.verification_uri} and enter code "
            f"[bold]{device.user_code}[/bold][/dim]\n"
        )
        try:
            webbrowser.open(url)
        except Exception:
            pass
        deadline = time.time() + device.expires_in
        interval = max(2, device.interval)
        with console.status("[cyan]Waiting for approval…[/cyan]"):
            while time.time() < deadline:
                try:
                    return poll_token(http, device.device_code)
                except PendingAuthorization:
                    time.sleep(interval)
                    continue
                except AuthError as e:
                    console.print(f"[red]{e}[/red]")
                    return None
        console.print("[red]Device code expired before approval.[/red]")
        return None


def _run_tidal_pkce_flow() -> Optional[TokenSet]:
    """PKCE login: open browser → user logs in → paste redirect URL back."""
    ensure_dirs()
    url, verifier = pkce_login_url()
    console.print(
        f"\n[bold]Open this URL in your browser and log in:[/bold]\n"
        f"[link]{url}[/link]\n"
    )
    try:
        webbrowser.open(url)
    except Exception:
        pass
    console.print(
        "[dim]After login you'll be redirected to a page that may show an error — "
        "that's OK.\nCopy the [bold]full URL[/bold] from the address bar and paste it here.[/dim]\n"
    )
    redirect_input = typer.prompt("Paste redirect URL")
    try:
        code = extract_code_from_url(redirect_input)
    except AuthError as e:
        console.print(f"[red]{e}[/red]")
        return None
    with httpx.Client(timeout=30.0) as http:
        try:
            return pkce_exchange_code(http, code, verifier)
        except AuthError as e:
            console.print(f"[red]{e}[/red]")
            return None


@app.command()
def login(
    provider: str = typer.Option("tidal", "--provider", "-p", help="Provider to authenticate"),
    device_flow: bool = typer.Option(False, "--device-flow", help="Use device-code flow instead of PKCE"),
) -> None:
    """Log in to a provider (currently: tidal). Saves to local tokens.json."""
    if provider != "tidal":
        console.print(
            f"[yellow]Login flow for '{provider}' not implemented yet. "
            "Public URLs work without login.[/yellow]"
        )
        raise typer.Exit(0)
    if device_flow:
        tokens = _run_tidal_device_flow()
    else:
        tokens = _run_tidal_pkce_flow()
    if tokens is None:
        raise typer.Exit(1)
    save_tokens(tokens)
    console.print(
        f"[green]Logged in.[/green] user_id={tokens.user_id} country={tokens.country_code}"
    )


@app.command()
def search(
    query: str,
    provider: str = typer.Option("tidal", "--provider", "-p"),
    limit: int = typer.Option(10, "--limit", "-n"),
) -> None:
    """Search a provider's catalog."""
    p = get_provider_by_name(provider)
    if p is None:
        console.print(f"[red]Unknown provider: {provider}[/red]")
        raise typer.Exit(2)
    tracks = p.search(query, limit=limit)
    if not tracks:
        console.print("[yellow]No results.[/yellow]")
        return
    table = Table(title=f"{p.display_name} – tracks", header_style="bold cyan")
    table.add_column("ID")
    table.add_column("Artist")
    table.add_column("Title")
    table.add_column("Album")
    for t in tracks:
        table.add_row(t.provider_id, t.primary_artist, t.title, t.album or "")
    console.print(table)


@app.command()
def download(
    url: str = typer.Argument(..., help="Tidal track / album / playlist URL"),
    quality: Quality = typer.Option(Quality.LOSSLESS, "--quality", "-q", case_sensitive=False),
    out: Path = typer.Option(DEFAULT_DOWNLOAD_DIR, "--out", "-o"),
    lyrics: bool = typer.Option(True, "--lyrics/--no-lyrics", help="Fetch synced LRC lyrics"),
    karaoke: bool = typer.Option(False, "--karaoke", "-k", help="Translate lyrics to Russian (.ru.lrc)"),
    bpm: bool = typer.Option(False, "--bpm", help="Detect BPM & key, write DJ tags"),
) -> None:
    """Download a track / album / playlist from Tidal."""
    p = find_provider(url)
    if p is None:
        console.print(
            "[red]No Tidal URL matched.[/red] "
            "Paste a link from tidal.com (track, album, or playlist)."
        )
        raise typer.Exit(2)
    console.print(f"[cyan]Provider:[/cyan] {p.display_name}")

    try:
        tracks = p.expand(url)
    except ProviderError as e:
        console.print(f"[red]{e}[/red]")
        raise typer.Exit(1)

    if not tracks:
        console.print("[yellow]Nothing to download.[/yellow]")
        return

    console.print(f"[bold]{len(tracks)} track(s)[/bold] → {out}")
    out.mkdir(parents=True, exist_ok=True)

    http = httpx.Client(timeout=60.0, follow_redirects=True)
    ok = 0
    try:
        with Progress(
            SpinnerColumn(),
            TextColumn("{task.description}"),
            BarColumn(),
            DownloadColumn(),
            TransferSpeedColumn(),
            TimeRemainingColumn(),
            console=console,
            transient=False,
        ) as progress:
            for t in tracks:
                album_dir = out / _album_dir(t)
                base = album_dir / _track_filename(t)
                task = progress.add_task(f"[cyan]{t.title}", total=None)

                def cb(written: int, total: Optional[int], _task=task) -> None:
                    if total is not None:
                        progress.update(_task, completed=written, total=total)
                    else:
                        progress.update(_task, completed=written)

                try:
                    path = p.download(t, base, quality, on_progress=cb)
                except ProviderError as e:
                    progress.update(task, description=f"[yellow]⚠ {t.title} ({e})")
                    continue
                except Exception as e:  # noqa: BLE001 — surface unexpected provider errors
                    progress.update(task, description=f"[red]✗ {t.title} ({type(e).__name__}: {e})")
                    continue

                lrc = fetch_synced_lrc(t) if lyrics else None
                tag_file(path, t, http, lyrics=lrc)
                if lrc:
                    write_sidecar(lrc, path)

                # Karaoke: translate LRC to Russian.
                if karaoke and lrc:
                    import asyncio as _asyncio

                    from tidal_dl_ru.core.translate import translate_lrc_to_file
                    try:
                        _asyncio.run(translate_lrc_to_file(lrc, path))
                    except Exception:
                        pass  # best-effort

                # DJ analysis: BPM + key detection.
                dj_info = ""
                if bpm:
                    try:
                        result = analyze_and_tag(path)
                        parts = []
                        if result.get("bpm"):
                            parts.append(f"{result['bpm']}bpm")
                        if result.get("camelot"):
                            parts.append(result["camelot"])
                        dj_info = " " + " ".join(parts) if parts else ""
                    except Exception:
                        pass  # best-effort

                ok += 1
                extras = ""
                if lrc:
                    extras += " [lrc]"
                if karaoke and lrc:
                    extras += " [ru]"
                extras += dj_info
                progress.update(
                    task,
                    description=f"[green]✓ {t.title}" + extras,
                )
    finally:
        http.close()

    console.print(f"[green]Done.[/green] {ok}/{len(tracks)} saved.")


@app.command()
def analyze(
    path: Path = typer.Argument(..., help="Audio file or directory to analyze"),
    tag: bool = typer.Option(True, "--tag/--no-tag", help="Write BPM/key tags into files"),
    rekordbox: Optional[Path] = typer.Option(None, "--rekordbox", help="Export Rekordbox XML to this path"),
) -> None:
    """Analyze audio files: detect BPM and musical key."""
    from tidal_dl_ru.core.dj import (
        camelot_key,
        detect_bpm,
        detect_key,
        export_rekordbox_xml,
    )

    files: list[Path] = []
    if path.is_file():
        files = [path]
    elif path.is_dir():
        for ext in ("*.flac", "*.m4a", "*.mp4", "*.mp3", "*.wav"):
            files.extend(path.glob(ext))
    else:
        console.print(f"[red]Not found: {path}[/red]")
        raise typer.Exit(1)

    if not files:
        console.print("[yellow]No audio files found.[/yellow]")
        return

    table = Table(title="DJ Analysis", header_style="bold cyan")
    table.add_column("File")
    table.add_column("BPM")
    table.add_column("Key")
    table.add_column("Camelot")

    rb_tracks: list[dict] = []

    for f in sorted(files):
        bpm_val = detect_bpm(f)
        key_val = detect_key(f)

        if tag and (bpm_val is not None or key_val is not None):
            from tidal_dl_ru.core.dj import tag_bpm_key
            try:
                tag_bpm_key(f, bpm=bpm_val, key=key_val)
            except Exception:
                pass

        cam = camelot_key(key_val) if key_val else "-"
        table.add_row(
            f.name,
            str(bpm_val) if bpm_val else "-",
            key_val or "-",
            cam,
        )

        if rekordbox:
            rb_tracks.append({
                "path": str(f.resolve()),
                "title": f.stem,
                "artist": "",
                "album": "",
                "bpm": bpm_val,
                "key": cam if key_val else None,
            })

    console.print(table)

    if rekordbox and rb_tracks:
        export_rekordbox_xml(rb_tracks, rekordbox)
        console.print(f"[green]Rekordbox XML exported to {rekordbox}[/green]")


pool_app = typer.Typer(help="Manage the Tidal account pool")
app.add_typer(pool_app, name="pool")


@pool_app.command("add")
def pool_add(
    label: str = typer.Argument(..., help="Short unique label, e.g. 'family-eu-1'"),
    refresh_token: Optional[str] = typer.Option(
        None,
        "--refresh-token",
        help="Paste a refresh_token directly. If omitted, runs PKCE login.",
    ),
    device_flow: bool = typer.Option(False, "--device-flow", help="Use device-code flow instead of PKCE"),
    quota: int = typer.Option(100, "--quota", help="Daily download quota"),
) -> None:
    """Add a Tidal account to the pool (PKCE login or paste refresh_token)."""
    if refresh_token:
        acc = tidal_pool.add_account(
            label=label, refresh_token=refresh_token, daily_quota=quota
        )
    else:
        tokens = _run_tidal_device_flow() if device_flow else _run_tidal_pkce_flow()
        if tokens is None:
            raise typer.Exit(1)
        acc = tidal_pool.add_account(
            label=label,
            refresh_token=tokens.refresh_token,
            country_code=tokens.country_code,
            user_id=tokens.user_id,
            daily_quota=quota,
        )
    console.print(
        f"[green]Added account #{acc.id}[/green] label=[bold]{acc.label}[/bold] "
        f"country={acc.country_code} quota={acc.daily_quota}/day"
    )


@pool_app.command("list")
def pool_list() -> None:
    """List all accounts in the pool."""
    accounts = tidal_pool.list_accounts()
    if not accounts:
        console.print(
            "[dim]Pool is empty. Add an account with[/dim] [bold]pool add <label>[/bold]"
        )
        return
    table = Table(title="Tidal account pool", header_style="bold cyan")
    table.add_column("ID")
    table.add_column("Label")
    table.add_column("Status")
    table.add_column("Country")
    table.add_column("Today / Quota")
    table.add_column("Total")
    table.add_column("Last used")
    for a in accounts:
        status_color = {"active": "green", "banned": "red", "exhausted": "yellow"}.get(
            a.status, "white"
        )
        table.add_row(
            str(a.id),
            a.label,
            f"[{status_color}]{a.status}[/{status_color}]",
            a.country_code or "-",
            f"{a.downloads_today}/{a.daily_quota}",
            str(a.total_downloads),
            a.last_used_at.strftime("%Y-%m-%d %H:%M") if a.last_used_at else "-",
        )
    console.print(table)
    counts = tidal_pool.pool_size()
    console.print(
        f"[dim]Total: {counts['total']} — active: {counts['active']}, "
        f"banned: {counts['banned']}, exhausted: {counts.get('exhausted', 0)}[/dim]"
    )


@pool_app.command("remove")
def pool_remove(account_id: int) -> None:
    """Remove an account from the pool by ID."""
    if tidal_pool.remove_account(account_id):
        console.print(f"[green]Removed account #{account_id}[/green]")
    else:
        console.print(f"[red]No account #{account_id}[/red]")
        raise typer.Exit(1)


@pool_app.command("revive")
def pool_revive(account_id: int) -> None:
    """Move a banned/exhausted account back to active."""
    if tidal_pool.revive(account_id):
        console.print(f"[green]Revived account #{account_id}[/green]")
    else:
        console.print(f"[red]No account #{account_id}[/red]")
        raise typer.Exit(1)


@pool_app.command("reset-quotas")
def pool_reset_quotas() -> None:
    """Zero out downloads_today for every account."""
    n = tidal_pool.reset_daily_quotas()
    console.print(f"[green]Reset quotas on {n} account(s)[/green]")


@pool_app.command("import-login")
def pool_import_login(
    label: str = typer.Argument("default", help="Label for the imported account"),
) -> None:
    """Migrate the local tokens.json (from `login`) into the pool."""
    acc = tidal_pool.import_tokens_json(label)
    if acc is None:
        console.print("[yellow]No tokens.json found — run `login` first.[/yellow]")
        raise typer.Exit(1)
    console.print(f"[green]Imported as account #{acc.id}[/green] label={acc.label}")


if __name__ == "__main__":
    app()
