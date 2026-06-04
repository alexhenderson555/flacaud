#!/usr/bin/env bash
# Remove stale Vite hashed assets left over from previous deploys.
#
# Keeps every bundle REACHABLE from index.html — not just the ones named in it.
# Vite code-splits: index.html references only the entry JS/CSS, while route and
# vendor chunks (react-*, hls-*, dash-*, …) are pulled in via dynamic import()
# and appear only as bare filenames *inside* other bundles. The old version kept
# just the index.html refs and deleted every dynamic chunk, so the entry bundle
# 404'd on first import() and the site rendered a blank page. We therefore walk
# the transitive closure: seed from index.html, then keep anything referenced by
# an already-kept JS bundle, until the set stops growing.
set -euo pipefail
DIST="${1:-/opt/tidal-dl-ru/frontend/dist}"
INDEX="$DIST/index.html"
ASSETS="$DIST/assets"

if [[ ! -f "$INDEX" ]] || [[ ! -d "$ASSETS" ]]; then
  echo "skip prune: missing $INDEX or $ASSETS"
  exit 0
fi

cd "$ASSETS"

# All asset files currently on disk (basenames; we cd'd into assets/).
all_assets=()
while IFS= read -r f; do
  [[ -n "$f" ]] && all_assets+=("$f")
done < <(ls -1)

if [[ ${#all_assets[@]} -eq 0 ]]; then
  echo "skip prune: no files in $ASSETS"
  exit 0
fi

# Seed the keep-set from filenames referenced directly in index.html.
declare -A keep=()
while IFS= read -r f; do
  [[ -n "$f" && -e "$f" ]] && keep["$f"]=1
done < <(grep -oE '/assets/[^"'\'' )]+' "$INDEX" | sed 's|^/assets/||' | sort -u)

# Transitive closure: a kept JS bundle may import other hashed chunks by bare
# filename. Re-scan kept JS files for any on-disk asset name until nothing new
# is added. Over-keeping is safe; under-keeping is what broke the site.
changed=1
while [[ $changed -eq 1 ]]; do
  changed=0
  for k in "${!keep[@]}"; do
    [[ "$k" == *.js && -f "$k" ]] || continue
    for a in "${all_assets[@]}"; do
      [[ -n "${keep[$a]:-}" ]] && continue
      if grep -qF -- "$a" "$k"; then
        keep["$a"]=1
        changed=1
      fi
    done
  done
done

# Safety floor: if the closure somehow collapsed to ~nothing while many assets
# exist, refuse to prune rather than risk nuking a live build.
if [[ ${#keep[@]} -lt 2 && ${#all_assets[@]} -gt 4 ]]; then
  echo "skip prune: keep-set suspiciously small (${#keep[@]}/${#all_assets[@]}) — leaving assets untouched"
  exit 0
fi

echo "Keeping ${#keep[@]} asset(s) reachable from index.html (incl. dynamic chunks)"
removed=0
for f in "${all_assets[@]}"; do
  [[ -e "$f" ]] || continue
  if [[ -z "${keep[$f]:-}" ]]; then
    rm -f "$f" && removed=$((removed + 1))
  fi
done
echo "Prune done. Removed $removed stale file(s); remaining: $(ls -1 | wc -l)"
