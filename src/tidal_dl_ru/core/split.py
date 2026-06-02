import asyncio
import logging
from pathlib import Path

from pydantic import BaseModel

logger = logging.getLogger(__name__)

class SplitResult(BaseModel):
    vocals_path: str
    instrumental_path: str

async def split_audio_demucs(input_path: str, output_dir: str) -> SplitResult:
    """
    Uses Demucs CLI to split an audio file into vocals and instrumentals (MP3).
    """
    logger.info(f"Starting demucs on {input_path}")
    # demucs -d cpu --two-stems vocals --mp3 input_path -o output_dir
    process = await asyncio.create_subprocess_exec(
        "demucs",
        "-d", "cpu",
        "--two-stems", "vocals",
        "--mp3",
        input_path,
        "-o", output_dir,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE
    )
    stdout, stderr = await process.communicate()

    if process.returncode != 0:
        logger.error(f"Demucs failed with code {process.returncode}: {stderr.decode(errors='ignore')}")
        raise RuntimeError(f"Demucs failed: {stderr.decode(errors='ignore')}")

    # demucs puts files in output_dir/htdemucs/<track_name>/
    # track_name is input_path stem but can be mangled.
    # The safest way is to find the files in output_dir.
    out_path = Path(output_dir)
    vocals = list(out_path.rglob("vocals.mp3"))
    no_vocals = list(out_path.rglob("no_vocals.mp3"))

    if not vocals or not no_vocals:
        raise RuntimeError("Demucs finished but output files not found.")

    return SplitResult(
        vocals_path=str(vocals[0]),
        instrumental_path=str(no_vocals[0])
    )
